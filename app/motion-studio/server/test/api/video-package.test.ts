// Task 5L: API папки клипов видеопроекта: постановка `video.package` (Idempotency-Key), список и
// карточка папки, шпаргалка md/csv/txt, «Показать в Finder» (`open -R` без shell).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type VideoPackageManifest, VideoPackageDtoSchema } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { videoPackages } from "../../src/db/repos/video.js";
import { MANIFEST_FILE } from "../../src/pipeline/script-package.js";
import { CHEAT_FILES } from "../../src/script/cheatsheet.js";
import { videoCheatRows, videoCheatsheet } from "../../src/video-scenes/cheatsheet.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

const spawned: { cmd: string; args: string[] }[] = [];
vi.mock("node:child_process", async (orig) => {
  const real = await orig<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  return {
    ...real,
    spawn: (cmd: string, args: string[]) => {
      spawned.push({ cmd, args });
      const child = new EventEmitter();
      setImmediate(() => child.emit("exit", 0));
      return child;
    },
  };
});

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });
const SHA = "d".repeat(64);
const F30 = { num: 30, den: 1 };
const probe = { durationMs: 3100, width: 1920, height: 1080, fps: F30, codec: "h264", audioCodec: "aac" };

describe("API папки клипов видеопроекта", () => {
  let api: Api;
  let id: string;
  beforeEach(async () => {
    spawned.length = 0;
    api = await makeApi();
    id = (await api.inj("POST", "/api/projects", okHeaders, { title: "Протокол", kind: "video" })).json().id;
  });
  afterEach(() => api.close());

  function seed(pkgId: string): string {
    const rel = artifactPaths(api.s.root, id).package(pkgId);
    const dir = join(api.s.root, rel);
    mkdirSync(dir, { recursive: true });
    const m: VideoPackageManifest = {
      schema_version: 1, package_id: pkgId, project_id: id, project_title: "Протокол", name: "Протокол_клипы_2026-10-26", fps: F30,
      edl: { id: "edl_1", revision: 2 }, plan: { id: "pln_1", revision: 3 },
      scenes: [{
        n: 1, item_id: "sp_001", scene_id: "scn_1", version_id: "ver_1", version_number: 1, approved: true,
        source: { start_us: 1_000_000, end_us: 4_100_000 }, edited: { start_us: 1_000_000, end_us: 4_100_000 }, frames: { start: 30, end: 123 },
        quote: "Раз два", mode: "overlay", zone: "left_third", mp4: { file: "01_raz-dva.mp4", export_id: "exp_1", sha256: SHA, ffprobe: probe },
        alpha: { file: "01_raz-dva_alpha.mov", export_id: "exp_2", sha256: SHA, ffprobe: { ...probe, codec: "prores" } }, warnings: [], duration_frames: 93,
      }],
      missing: [{ item_id: "sp_002", quote: "Три", reason: "не утверждена (C)", n: 2 }],
      created_at: "2026-10-26T10:00:00.000Z",
    };
    writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(m));
    const rows = videoCheatRows(m);
    for (const f of ["md", "csv", "txt"] as const) writeFileSync(join(dir, CHEAT_FILES[f]), videoCheatsheet(rows, f, { project: "Протокол", fps: F30 }));
    videoPackages.insert(api.core.db, { id: pkgId, project_id: id, job_id: null, rel_path: rel, manifest_sha256: SHA, created_at: m.created_at });
    return dir;
  }

  it("POST /video/package: 202 задача (по умолчанию only_approved), повтор ключа — 200 та же, другой вход — 422; не видео — 409; нет проекта — 404", async () => {
    const r = await api.inj("POST", `/api/projects/${id}/video/package`, key("k1"), {});
    expect(r.statusCode).toBe(202);
    expect(r.json().job).toMatchObject({ type: "video.package", project_id: id, input: { projectId: id, only_approved: true } });
    const again = await api.inj("POST", `/api/projects/${id}/video/package`, key("k1"), {});
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(r.json().job.id);
    expect((await api.inj("POST", `/api/projects/${id}/video/package`, key("k1"), { only_approved: false })).statusCode).toBe(422);
    const all = await api.inj("POST", `/api/projects/${id}/video/package`, key("k2"), { only_approved: false });
    expect(all.json().job.input).toEqual({ projectId: id, only_approved: false });
    expect((await api.inj("POST", "/api/projects/playground/video/package", key("k3"), {})).json()).toMatchObject({ error: "not_video_project" });
    expect((await api.inj("POST", "/api/projects/nope/video/package", key("k4"), {})).statusCode).toBe(404);
  });

  it("список и карточка: DTO с манифестом; неизвестная — 404; нечитаемый манифест — 409, из списка выпадает", async () => {
    const dir = seed("pkg_1");
    const r = await api.inj("GET", "/api/video-packages/pkg_1");
    expect(r.statusCode).toBe(200);
    const dto = VideoPackageDtoSchema.parse(r.json());
    expect(dto).toMatchObject({ id: "pkg_1", abs_path: dir, display_name: "Протокол_клипы_2026-10-26" });
    expect(dto.manifest.scenes[0]!.alpha?.file).toBe("01_raz-dva_alpha.mov");
    expect((await api.inj("GET", `/api/projects/${id}/video-packages`)).json().map((p: { id: string }) => p.id)).toEqual(["pkg_1"]);
    expect((await api.inj("GET", "/api/video-packages/pkg_x")).statusCode).toBe(404);
    writeFileSync(join(dir, MANIFEST_FILE), "{не json");
    expect((await api.inj("GET", "/api/video-packages/pkg_1")).json()).toMatchObject({ error: "package_broken" });
    expect((await api.inj("GET", `/api/projects/${id}/video-packages`)).json()).toEqual([]);
  });

  it("шпаргалка: md — text/markdown; csv — BOM и attachment с русским именем; txt; неизвестная — 404", async () => {
    seed("pkg_1");
    const md = await api.inj("GET", "/api/video-packages/pkg_1/cheatsheet?format=md");
    expect(md.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(md.body).toMatch(/^# Шпаргалка: клипы ↔ ролик/);
    expect(md.body).toContain("| 01 | 00:00:01:00 | 00:00:04:03 |");
    const csv = await api.inj("GET", "/api/video-packages/pkg_1/cheatsheet?format=csv");
    expect(csv.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(decodeURIComponent(String(csv.headers["content-disposition"]).split("''")[1]!)).toBe("Протокол_клипы_2026-10-26_шпаргалка.csv");
    const txt = await api.inj("GET", "/api/video-packages/pkg_1/cheatsheet?format=txt");
    expect(txt.body.split("\n")[0]).toMatch(/^01 · ролик 00:00:01:00–00:00:04:03 · исходник/);
    expect((await api.inj("GET", "/api/video-packages/pkg_x/cheatsheet?format=csv")).statusCode).toBe(404);
  });

  it("reveal: open -R <папка> без shell, 204; неизвестная — 404", async () => {
    const dir = seed("pkg_1");
    const r = await api.inj("POST", "/api/video-packages/pkg_1/reveal", okHeaders);
    expect(r.statusCode).toBe(204);
    expect(spawned).toEqual([{ cmd: "open", args: ["-R", dir] }]);
    expect((await api.inj("POST", "/api/video-packages/pkg_x/reveal", okHeaders)).statusCode).toBe(404);
  });
});
