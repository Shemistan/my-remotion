// S7: API пакета экспорта (контракт C1, C7, C8, C11): постановка задачи script.package,
// пакет, шпаргалка md/csv/txt, «Показать в Finder» (`open -R` без shell).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_READING, type ScriptPackageManifest, ScriptPackageDtoSchema } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { scriptPackages } from "../../src/db/repos/script.js";
import { type CheatRow, CHEAT_FILES, cheatsheet } from "../../src/script/cheatsheet.js";
import { MANIFEST_FILE } from "../../src/pipeline/script-package.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

const spawned: { cmd: string; args: string[]; opts: unknown }[] = [];
vi.mock("node:child_process", async (orig) => {
  const real = await orig<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  return {
    ...real,
    spawn: (cmd: string, args: string[], opts: unknown) => {
      spawned.push({ cmd, args, opts });
      const child = new EventEmitter();
      setImmediate(() => child.emit("exit", 0));
      return child;
    },
  };
});

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });
const SHA = "b".repeat(64);
const probe = { durationMs: 3000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac" };

describe("API пакета экспорта", () => {
  let api: Api;
  let id: string;
  beforeEach(async () => {
    spawned.length = 0;
    api = await makeApi();
    id = (await api.inj("POST", "/api/projects", okHeaders, { title: "Go map", kind: "script" })).json().id;
  });
  afterEach(() => api.close());

  /** Опубликованный пакет: каталог с манифестом и шпаргалкой, строка script_packages. */
  function seedPackage(pkgId: string, name = "Go map_16x9_2026-10-24"): string {
    const rel = artifactPaths(api.s.root, id).package(pkgId);
    const dir = join(api.s.root, rel);
    mkdirSync(dir, { recursive: true });
    const m: ScriptPackageManifest = {
      schema_version: 1, package_id: pkgId, project_id: id, project_title: "Go map", name, aspect: "16:9",
      script: { id: "scr_1", revision: 1 }, plan: { id: "pln_1", revision: 2 }, reading: DEFAULT_READING,
      scenes: [{
        n: 2, item_id: "ss_002", scene_id: "scn_1", version_id: "ver_1", block_id: "b1", at_s: 3.2, quote: "Раз два", technique: "hero-number",
        frames: { lead: 15, speech: 30, tail: 45, total: 90 }, mp4: { file: "02_raz-dva.mp4", export_id: "exp_1", sha256: SHA, ffprobe: probe },
        alpha: null, warnings: [],
      }],
      missing: [{ item_id: "ss_001", quote: "Ноль", reason: "нет готовой версии" }, { item_id: "ss_002", reason: "альфа-версия невозможна: сцена закрывает кадр" }],
      created_at: "2026-10-24T18:00:00.000Z",
    };
    writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(m));
    const rows: CheatRow[] = [{
      n: 2, nn: "02", mp4: "02_raz-dva.mp4", alpha: null, block: "Блок 1", at_s: 3.2, quote: "Раз два", technique: "hero-number", total_s: 3, lead_s: 0.5, tail_s: 1.5, notes: [],
    }];
    for (const f of ["md", "csv", "txt"] as const) writeFileSync(join(dir, CHEAT_FILES[f]), cheatsheet(rows, f));
    scriptPackages.insert(api.core.db, { id: pkgId, project_id: id, job_id: null, aspect: "16:9", rel_path: rel, manifest_sha256: SHA, created_at: "2026-10-24T18:00:00.000Z" });
    return dir;
  }

  it("POST /script/package: 202 задача script.package, повтор ключа — 200 та же; не сценарный — 409; нет проекта — 404", async () => {
    const r = await api.inj("POST", `/api/projects/${id}/script/package`, key("k1"), { aspect: "16:9" });
    expect(r.statusCode).toBe(202);
    expect(r.json().job).toMatchObject({ type: "script.package", project_id: id, input: { projectId: id, aspect: "16:9" } });
    const again = await api.inj("POST", `/api/projects/${id}/script/package`, key("k1"), { aspect: "16:9" });
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(r.json().job.id);
    expect((await api.inj("POST", `/api/projects/${id}/script/package`, key("k1"), { aspect: "9:16" })).statusCode).toBe(422);
    expect((await api.inj("POST", "/api/projects/playground/script/package", key("k2"), { aspect: "16:9" })).json()).toMatchObject({ error: "not_script_project" });
    expect((await api.inj("POST", "/api/projects/nope/script/package", key("k3"), { aspect: "16:9" })).statusCode).toBe(404);
  });

  it("GET /script-packages/:id — DTO (alpha null), пакет в состоянии проекта; неизвестный — 404", async () => {
    const dir = seedPackage("pkg_1");
    const r = await api.inj("GET", "/api/script-packages/pkg_1");
    expect(r.statusCode).toBe(200);
    expect(ScriptPackageDtoSchema.parse(r.json())).toEqual({
      id: "pkg_1", aspect: "16:9", rel_path: artifactPaths(api.s.root, id).package("pkg_1"), abs_path: dir, display_name: "Go map_16x9_2026-10-24",
      files: [{ n: 2, item_id: "ss_002", mp4: "02_raz-dva.mp4", alpha: null, sha256: { mp4: SHA, alpha: null } }],
      missing: [{ item_id: "ss_001", reason: "нет готовой версии" }, { item_id: "ss_002", reason: "альфа-версия невозможна: сцена закрывает кадр" }],
      created_at: "2026-10-24T18:00:00.000Z",
    });
    expect((await api.inj("GET", `/api/projects/${id}/script`)).json().packages.map((p: { id: string }) => p.id)).toEqual(["pkg_1"]);
    const nf = await api.inj("GET", "/api/script-packages/pkg_x");
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toMatchObject({ error: "not_found" });
  });

  it("шпаргалка: md — text/markdown; csv — BOM, attachment; txt — attachment; неизвестный пакет — 404 JSON", async () => {
    seedPackage("pkg_1");
    const md = await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=md");
    expect(md.statusCode).toBe(200);
    expect(md.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(md.body).toMatch(/^## Блок 1/m);
    expect(md.headers["content-disposition"]).toBeUndefined();
    const dflt = await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet");
    expect(dflt.body).toBe(md.body);
    const csv = await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=csv");
    expect(csv.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(csv.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv.headers["content-disposition"]).toMatch(/^attachment; filename="cheatsheet\.csv"; filename\*=UTF-8''/);
    expect(decodeURIComponent(String(csv.headers["content-disposition"]).split("''")[1]!)).toBe("Go map_16x9_2026-10-24_шпаргалка.csv");
    const txt = await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=txt");
    expect(txt.body).toBe("02 · 0:03 · «Раз два» · 3,0 с (запас 0,5 / 1,5)\n");
    expect(txt.headers["content-disposition"]).toMatch(/^attachment;/);
    const nf = await api.inj("GET", "/api/script-packages/pkg_x/cheatsheet?format=csv");
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toMatchObject({ error: "not_found" });
  });

  it("Content-Disposition: filename* кодирует и ' ( ) * (RFC 5987 attr-char)", async () => {
    seedPackage("pkg_1", "Go (v2) l'map*_16x9_2026-10-24");
    const csv = await api.inj("GET", "/api/script-packages/pkg_1/cheatsheet?format=csv");
    const ext = String(csv.headers["content-disposition"]).split("filename*=UTF-8''")[1]!;
    expect(ext).not.toMatch(/['()*]/);
    expect(ext).toContain("%28v2%29%20l%27map%2A");
    expect(decodeURIComponent(ext)).toBe("Go (v2) l'map*_16x9_2026-10-24_шпаргалка.csv");
  });

  it("пакет с нечитаемым манифестом не пропадает молча: строка-заглушка с пометкой в состоянии и по id", async () => {
    const dir = seedPackage("pkg_1");
    writeFileSync(join(dir, MANIFEST_FILE), "{не json");
    const r = await api.inj("GET", "/api/script-packages/pkg_1");
    expect(r.statusCode).toBe(200);
    const dto = ScriptPackageDtoSchema.parse(r.json());
    expect(dto).toMatchObject({ id: "pkg_1", abs_path: dir, files: [], missing: [], created_at: "2026-10-24T18:00:00.000Z" });
    expect(dto.display_name).toMatch(/манифест не читается/);
    expect((await api.inj("GET", `/api/projects/${id}/script`)).json().packages).toEqual([r.json()]);
  });

  it("reveal: open -R <папка> без shell, 204 пустое; неизвестный или без папки — 404", async () => {
    const dir = seedPackage("pkg_1");
    const r = await api.inj("POST", "/api/script-packages/pkg_1/reveal", okHeaders);
    expect(r.statusCode).toBe(204);
    expect(r.body).toBe("");
    expect(spawned).toEqual([{ cmd: "open", args: ["-R", dir], opts: { stdio: "ignore" } }]);
    expect((await api.inj("POST", "/api/script-packages/pkg_x/reveal", okHeaders)).statusCode).toBe(404);
    const rel = artifactPaths(api.s.root, id).package("pkg_2");
    scriptPackages.insert(api.core.db, { id: "pkg_2", project_id: id, job_id: null, aspect: "16:9", rel_path: rel, manifest_sha256: SHA });
    // строка без каталога — 404
    expect((await api.inj("POST", "/api/script-packages/pkg_2/reveal", okHeaders)).statusCode).toBe(404);
    expect(spawned).toHaveLength(1);
  });
});
