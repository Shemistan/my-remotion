// Скачивание роликов проекта в папку: API (проверка папки, имена, выбор папки, Finder) и задача
// `project.download` (экспорт + копия со сверкой, без перезаписи и дублей, причины «не скачаны»).
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { type ProjectDownloadDeps, copyVerified, projectDownload } from "../../src/pipeline/project-download.js";
import type { ExportOneInput } from "../../src/pipeline/scene-export.js";
import { sha256, sha256File } from "../../src/scenes/hash.js";
import { newId } from "../../src/scenes/ids.js";
import { exportRel } from "../../src/scenes/store.js";
import { type Api, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

const child = vi.hoisted(() => ({
  execResult: { err: null as (Error & { killed?: boolean }) | null, stdout: "", stderr: "" },
  execCalls: [] as { cmd: string; args: string[] }[],
  spawned: [] as { cmd: string; args: string[] }[],
}));
vi.mock("node:child_process", async (orig) => {
  const real = await orig<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  return {
    ...real,
    execFile: (cmd: string, args: string[], o: unknown, cb: (e: unknown, out: string, err: string) => void) => {
      // владелец хранилища при загрузке: тесту настоящий `ps` не нужен
      if (cmd === "ps") {
        const lstart = "Thu Nov  5 10:00:00 2026";
        return void setImmediate(() => cb(null, args[1]!.startsWith("ppid") ? `1 ${lstart}` : lstart, ""));
      }
      if (cmd !== "osascript") return (real.execFile as (...a: unknown[]) => unknown)(cmd, args, o, cb);
      child.execCalls.push({ cmd, args });
      setImmediate(() => cb(child.execResult.err, child.execResult.stdout, child.execResult.stderr));
    },
    spawn: (cmd: string, args: string[]) => {
      if (cmd !== "open") return (real.spawn as (...a: unknown[]) => unknown)(cmd, args);
      child.spawned.push({ cmd, args });
      const c = new EventEmitter();
      setImmediate(() => c.emit("exit", 0));
      return c;
    },
  };
});

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });
const P = "prj_dl";

describe("скачивание роликов проекта", () => {
  let api: Api;
  let dest: string;
  beforeEach(async () => {
    api = await makeApi();
    dest = mkdtempSync(join(tmpdir(), "ms-download-"));
    child.execCalls.length = 0;
    child.spawned.length = 0;
    child.execResult = { err: null, stdout: "", stderr: "" };
  });
  afterEach(async () => {
    rmSync(dest, { recursive: true, force: true });
    await api.close();
  });

  const post = (body: unknown, k = "k1", project = P) => api.inj("POST", `/api/projects/${project}/downloads`, key(k), body);

  describe("API", () => {
    it("ставит задачу: только выбранные сцены, номер — позиция в проекте, версия — текущая", async () => {
      const a = await seedVersion(api, { projectId: P });
      const b = await seedVersion(api, { projectId: P });
      const res = await post({ scene_ids: [b.scene.id], formats: ["alpha", "mp4"], dest });
      expect(res.statusCode, res.body).toBe(202);
      const { job } = res.json();
      expect(job.type).toBe("project.download");
      expect(a.scene.id).not.toBe(b.scene.id);
      expect(jobs.get(api.core.db, job.id)!.input).toMatchObject({
        projectId: P,
        formats: ["mp4", "alpha"],
        items: [{ scene_id: b.scene.id, version_id: b.versionId, name: expect.stringMatching(/^02_[a-z0-9-]+$/) }],
      });
      // повтор того же ключа — та же задача
      const again = await post({ scene_ids: [b.scene.id], formats: ["mp4", "alpha"], dest });
      expect(again.statusCode).toBe(200);
      expect(again.json().job.id).toBe(job.id);
    });

    it("папка: нет такой, относительный путь, файл вместо папки, внутри хранилища — отказ", async () => {
      const { scene } = await seedVersion(api, { projectId: P });
      const body = (d: string) => ({ scene_ids: [scene.id], formats: ["mp4"], dest: d });
      const file = join(dest, "f.txt");
      writeFileSync(file, "x");
      const cases: [string, string][] = [
        [join(dest, "нет"), "dest_missing"],
        ["ролики/ssd", "dest_invalid"],
        [file, "dest_invalid"],
        [api.core.root, "dest_inside_store"],
        [join(api.core.root, "workspace"), "dest_inside_store"],
      ];
      for (const [d, error] of cases) {
        const res = await post(body(d), `k-${error}-${d.length}`);
        expect(res.statusCode, d).toBe(400);
        expect(res.json().error, d).toBe(error);
      }
    });

    it("чужая сцена — 404, сцена без готовой версии — 409, пустой выбор — 400", async () => {
      const { scene } = await seedVersion(api, { projectId: "other" });
      await seedVersion(api, { projectId: P });
      expect((await post({ scene_ids: [scene.id], formats: ["mp4"], dest })).statusCode).toBe(404);
      const draft = api.core.repo.createScene(P, { prompt: "черновик", settings: (await import("@ms/contracts")).defaultSettings() });
      const res = await post({ scene_ids: [draft.id], formats: ["mp4"], dest }, "k2");
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("scene_not_ready");
      expect((await post({ scene_ids: [], formats: ["mp4"], dest }, "k3")).statusCode).toBe(400);
    });

    it("выбор папки: путь без последнего слэша, отмена — null, сбой — 500 с подсказкой, чужой Origin — 403", async () => {
      child.execResult = { err: null, stdout: "/Volumes/External SSD/ролики/\n", stderr: "" };
      const ok = await api.inj("POST", "/api/system/pick-folder", okHeaders);
      expect(ok.json()).toEqual({ path: "/Volumes/External SSD/ролики" });
      expect(child.execCalls[0]!.cmd).toBe("osascript");

      child.execResult = { err: new Error("exit 1"), stdout: "", stderr: "execution error: User canceled. (-128)" };
      expect((await api.inj("POST", "/api/system/pick-folder", okHeaders)).json()).toEqual({ path: null });

      child.execResult = { err: new Error("exit 1"), stdout: "", stderr: "что-то другое" };
      const bad = await api.inj("POST", "/api/system/pick-folder", okHeaders);
      expect(bad.statusCode).toBe(500);
      expect(bad.json().error).toBe("pick_failed");

      const calls = child.execCalls.length;
      const foreign = await api.inj("POST", "/api/system/pick-folder", { ...okHeaders, origin: "https://evil.example" });
      expect(foreign.statusCode).toBe(403);
      expect(child.execCalls.length).toBe(calls);
    });

    it("Finder: путь из входа задачи; чужой тип задачи и отключённая папка — 404", async () => {
      const { scene } = await seedVersion(api, { projectId: P });
      const { job } = (await post({ scene_ids: [scene.id], formats: ["mp4"], dest })).json();
      const res = await api.inj("POST", `/api/project-downloads/${job.id}/reveal`, okHeaders);
      expect(res.statusCode, res.body).toBe(204);
      expect(child.spawned.at(-1)!.args).toContain((jobs.get(api.core.db, job.id)!.input as { dest: string }).dest);

      rmSync(dest, { recursive: true, force: true });
      expect((await api.inj("POST", `/api/project-downloads/${job.id}/reveal`, okHeaders)).statusCode).toBe(404);
      expect((await api.inj("POST", "/api/project-downloads/job_нет/reveal", okHeaders)).statusCode).toBe(404);
      expect((await api.inj("GET", `/api/jobs/${job.id}`, getHeaders)).statusCode).toBe(200);
    });
  });

  describe("задача project.download", () => {
    /** Экспорт как настоящий: закрытые от записи файл и манифест, строка exports. */
    function fakeExport(o: { fail?: (i: ExportOneInput) => string | undefined } = {}) {
      const calls: ExportOneInput[] = [];
      const fn = async (ctx: JobContext, _d: unknown, input: ExportOneInput): Promise<HandlerResult> => {
        calls.push(input);
        const msg = o.fail?.(input);
        if (msg) return { status: "failed", error: { code: "pipeline", stage: "export", message: msg } };
        const id = newId("exp");
        const ext = input.request.format === "prores4444" ? "mov" : "mp4";
        const dir = join(api.core.root, exportRel(P, id));
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `scene.${ext}`);
        writeFileSync(file, `video ${input.versionId} ${ext}`);
        const prores = ext === "mov";
        const ffprobe = { durationMs: 3000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: prores ? "prores" : "h264", ...(prores ? { pixFmt: "yuva444p12le", profile: "4444" } : { audioCodec: "aac" }) };
        writeFileSync(join(dir, "export-manifest.json"), JSON.stringify({ request: input.request, ffprobe }));
        chmodSync(file, 0o444);
        const hash = await sha256File(file);
        exportsRepo.insert(api.core.db, { id, version_id: input.versionId, job_id: ctx.job.id, format: input.request.format, path: `${exportRel(P, id)}/scene.${ext}`, sha256: hash });
        return { status: "completed", outputRefs: { export_id: id, sha256: hash, ffprobe } };
      };
      return { fn, calls };
    }

    function ctxOf(jobId: string, signal = new AbortController().signal): JobContext {
      const job = jobs.get(api.core.db, jobId)!;
      return {
        db: api.core.db, job, attempt: 1, signal,
        run: { root: api.core.root, runId: job.id, attempt: 1, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
        emit: () => undefined, progress: () => undefined, fenceOk: () => true,
        agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
      };
    }

    const deps = (exp: ReturnType<typeof fakeExport>): ProjectDownloadDeps => ({
      root: api.core.root,
      storage: async () => ({ ok: true }) as never,
      exporter: { repo: api.core.repo, deps: () => { throw new Error("не вызывается"); } },
      exportOne: exp.fn as ProjectDownloadDeps["exportOne"],
    });

    async function enqueue(formats: string[], k = "job1") {
      const { scene } = await seedVersion(api, { projectId: P });
      const res = await post({ scene_ids: [scene.id], formats, dest }, k);
      expect(res.statusCode, res.body).toBe(202);
      return res.json().job.id as string;
    }
    const refsOf = (r: HandlerResult) => (r as { outputRefs: { files: { name: string; format: string }[]; missing: { name: string; reason: string }[] } }).outputRefs;

    it("MP4 и MOV: копии в папке, записываемые, без .part; повтор не плодит дубли и не рендерит заново", async () => {
      const id = await enqueue(["mp4", "alpha"]);
      const exp = fakeExport();
      const r = await projectDownload(() => deps(exp))(ctxOf(id));
      expect(r.status, JSON.stringify(r)).toBe("completed");
      const names = readdirSync(dest).sort();
      expect(names).toHaveLength(2);
      expect(names[0]).toMatch(/^01_.+\.mp4$/);
      expect(names[1]).toMatch(/^01_.+_alpha\.mov$/);
      expect(statSync(join(dest, names[0]!)).mode & 0o200).toBe(0o200);
      expect(exp.calls.map((c) => c.request.format)).toEqual(["mp4", "prores4444"]);
      expect(exp.calls[1]!.request.overlay).toBe(true);

      const again = await projectDownload(() => deps(exp))(ctxOf(id));
      expect(again.status).toBe("completed");
      expect(readdirSync(dest).sort()).toEqual(names);
      expect(exp.calls).toHaveLength(2);
    });

    it("сбой экспорта одного формата — в «не скачаны», остальные скачаны", async () => {
      const id = await enqueue(["mp4", "alpha"]);
      const exp = fakeExport({ fail: (i) => (i.request.format === "prores4444" ? "overlay_empty: кадр пуст" : undefined) });
      const r = await projectDownload(() => deps(exp))(ctxOf(id));
      expect(r.status).toBe("completed");
      const refs = refsOf(r);
      expect(refs.files.map((f) => f.format)).toEqual(["mp4"]);
      expect(refs.missing).toHaveLength(1);
      expect(refs.missing[0]!.reason).toMatch(/экспорт не удался/);
    });

    it("ничего не скачано — задача упала, причина видна", async () => {
      const id = await enqueue(["mp4"]);
      const r = await projectDownload(() => deps(fakeExport({ fail: () => "рендер упал" })))(ctxOf(id));
      expect(r.status).toBe("failed");
      expect((r as { error: { message: string } }).error.message).toMatch(/ни один файл не скачан/);
    });

    it("папка исчезла (SSD отключили) — задача падает с понятной причиной", async () => {
      const id = await enqueue(["mp4"]);
      rmSync(dest, { recursive: true, force: true });
      const r = await projectDownload(() => deps(fakeExport()))(ctxOf(id));
      expect(r.status).toBe("failed");
      expect((r as { error: { message: string } }).error.message).toMatch(/недоступна/);
    });

    it("отмена до начала — cancelled, экспорт не запускается", async () => {
      const id = await enqueue(["mp4"]);
      const ac = new AbortController();
      ac.abort();
      const exp = fakeExport();
      const r = await projectDownload(() => deps(exp))(ctxOf(id, ac.signal));
      expect(r.status).toBe("cancelled");
      expect(exp.calls).toHaveLength(0);
    });
  });

  describe("copyVerified", () => {
    const seed = (text: string) => {
      const src = join(dest, "src");
      writeFileSync(src, text);
      const out = join(dest, "out");
      mkdirSync(out, { recursive: true });
      return { src, out, sha: sha256(text) };
    };

    it("чужой файл с тем же именем не перезаписывается: копия получает суффикс", async () => {
      const { src, out, sha } = seed("новое");
      writeFileSync(join(out, "01_a.mp4"), "чужое");
      expect(await copyVerified(src, sha, out, "01_a.mp4", "t")).toBe("01_a_2.mp4");
      expect(readFileSync(join(out, "01_a.mp4"), "utf8")).toBe("чужое");
      expect(readFileSync(join(out, "01_a_2.mp4"), "utf8")).toBe("новое");
    });

    it("контрольная сумма не совпала — ошибка, в папке ни файла, ни .part", async () => {
      const { src, out } = seed("новое");
      await expect(copyVerified(src, "0".repeat(64), out, "01_a.mp4", "t")).rejects.toThrow(/контрольная сумма/);
      expect(existsSync(join(out, "01_a.mp4"))).toBe(false);
      expect(readdirSync(out)).toEqual([]);
    });
  });
});
