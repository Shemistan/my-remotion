// Обработчик scene.export (Task 19, P1-14): рендер экспорта в draft попытки → gate → под
// fencing rename в exports/<export-id>/ + export-manifest.json, read-only, строка exports.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExportRequest, ExportManifestSchema, type Settings, defaultSettings } from "@ms/contracts";
import type { ExportResult, ExportVersionRequest, exportVersion } from "@ms/render";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { claimNext, enqueue, fenceOk } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { JobContext } from "../../src/jobs/types.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { sceneExport } from "../../src/pipeline/scene-export.js";
import { sha256File } from "../../src/scenes/hash.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { QUARANTINE } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { fakeRender, makeDeps, makeSkills, okStatus } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
beforeEach(async () => {
  env = await setupDb("ms-scene-export-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
});
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});

const MP4: ExportRequest = { format: "mp4", crf: 18, scale: 1 };
const PRORES: ExportRequest = { format: "prores4444", crf: 18, scale: 1 };

/** Готовая версия: генерация на фейках через раннер. */
async function readyVersion(settings: Settings = defaultSettings()) {
  const d = await makeDeps(env.s.root, await makeSkills(env.s.tmp), { render: fakeRender({ png: true }).render });
  const runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", pollMs: 5, handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }) } });
  runner.start();
  try {
    const scene = repo.createScene("playground", { prompt: "p", settings });
    const id = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "p", settings }, idempotencyKey: `g-${scene.id}` }).job.id;
    await until(() => ["completed", "failed"].includes(jobs.get(env.db, id)!.status), "генерация", 20_000);
    const v = versions.listByScene(env.db, scene.id)[0]!;
    expect(v.status).toBe("ready");
    return v;
  } finally {
    await runner.stop({ abortRunning: true });
  }
}

/** Фейк exportVersion: пишет файл и отвечает probe под запрос (или `over`). */
function fakeExport(over: { result?: (req: ExportVersionRequest) => ExportResult | undefined; onCall?: (req: ExportVersionRequest) => void } = {}) {
  const calls: ExportVersionRequest[] = [];
  const fn = async (req: ExportVersionRequest): Promise<ExportResult> => {
    calls.push(req);
    over.onCall?.(req);
    const custom = over.result?.(req);
    if (custom) return custom;
    writeFileSync(req.outPath, `video ${req.request.format}`);
    const s = req.settings;
    const prores = req.request.format === "prores4444";
    return {
      ok: true,
      gate: [],
      probe: {
        durationMs: (s.duration_frames * 1000 * s.fps.den) / s.fps.num, width: s.width, height: s.height, fps: s.fps,
        codec: prores ? "prores" : "h264", ...(prores ? { pixFmt: "yuva444p10le" } : { audioCodec: "aac" }),
      },
    };
  };
  return { fn: fn as typeof exportVersion, calls };
}

let k = 0;
function enqueueExport(versionId: string, request: ExportRequest) {
  return enqueue(env.db, { type: "scene.export", projectId: "playground", versionId, input: { versionId, request }, idempotencyKey: `e${++k}` }).job;
}

/** Контекст попытки без раннера: задача захвачена `claimNext`. */
function ctxOf(jobId: string, attempt: number, signal = new AbortController().signal): JobContext {
  const job = jobs.get(env.db, jobId)!;
  return {
    db: env.db, job, attempt, signal,
    run: { root: env.s.root, runId: job.id, attempt, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
    emit: () => undefined, progress: () => undefined, fenceOk: () => fenceOk(env.db, job.id, attempt),
    agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
  };
}

function handler(exp: ReturnType<typeof fakeExport>, alpha: (p: string, f: number) => Promise<number> = async () => 0) {
  return sceneExport({ repo, deps: () => ({ storage: () => okStatus(env.s.root), export: exp.fn, alpha }) });
}

async function runExport(versionId: string, request: ExportRequest, exp = fakeExport(), alpha?: (p: string, f: number) => Promise<number>) {
  const job = enqueueExport(versionId, request);
  const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
  expect(c.job.id).toBe(job.id);
  const r = await handler(exp, alpha)(ctxOf(job.id, c.attempt));
  return { job, r, exp };
}

const exportsDir = () => join(env.s.root, "workspace/projects/playground/exports");
const listExports = () => (existsSync(exportsDir()) ? readdirSync(exportsDir()) : []);

describe("sceneExport", () => {
  it("mp4: файл и export-manifest в exports/<id>/, read-only, строка exports, outputRefs", async () => {
    const v = await readyVersion();
    const { job, r, exp } = await runExport(v.id, MP4);
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const refs = (r as { outputRefs: { export_id: string; path: string } }).outputRefs;
    const row = exportsRepo.get(env.db, refs.export_id)!;
    expect(row).toMatchObject({ version_id: v.id, job_id: job.id, format: "mp4", path: `workspace/projects/playground/exports/${refs.export_id}/scene.mp4` });
    const file = join(env.s.root, row.path);
    expect(row.sha256).toBe(await sha256File(file));
    const dir = join(exportsDir(), refs.export_id);
    expect(readdirSync(dir).sort()).toEqual(["export-manifest.json", "scene.mp4"]);
    const m = ExportManifestSchema.parse(JSON.parse(readFileSync(join(dir, "export-manifest.json"), "utf8")));
    expect(m).toMatchObject({ export_id: refs.export_id, version_id: v.id, version_manifest_sha256: v.manifest_sha256, format: "mp4", sha256: row.sha256, request: MP4 });
    expect(m.ffprobe).toMatchObject({ codec: "h264", audioCodec: "aac" });
    // chmod -R a-w
    for (const p of [dir, file, join(dir, "export-manifest.json")]) expect(statSync(p).mode & 0o222).toBe(0);
    // рендер — из каталога версии в draft попытки, таймаут по умолчанию 30 мин
    const call = exp.calls[0]!;
    expect(call.versionDir).toBe(join(env.s.root, v.path));
    expect(call.outPath).toBe(join(env.s.root, "workspace/drafts", `${job.id}-a1`, "scene.mp4"));
    expect(call.timeoutMs).toBe(1_800_000);
    expect(call.run).toMatchObject({ root: env.s.root, runId: job.id, attempt: 1 });
    expect(existsSync(join(env.s.root, "workspace/drafts", `${job.id}-a1`))).toBe(false);
  });

  it("fps 60: settings манифеста экспорта — 60 fps и та же длительность в секундах", async () => {
    const v = await readyVersion();
    const { r } = await runExport(v.id, { ...MP4, fps: 60 }, fakeExport({
      result: (req) => {
        writeFileSync(req.outPath, "v");
        return { ok: true, gate: [], probe: { durationMs: 6000, width: 1920, height: 1080, fps: { num: 60, den: 1 }, codec: "h264", audioCodec: "aac" } };
      },
    }));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const id = (r as { outputRefs: { export_id: string } }).outputRefs.export_id;
    const m = ExportManifestSchema.parse(JSON.parse(readFileSync(join(exportsDir(), id, "export-manifest.json"), "utf8")));
    expect(m.settings).toMatchObject({ fps: { num: 60, den: 1 }, duration_frames: 360 });
  });

  it("H4/Q4: prores при transparent_export false → failed, stage export, transparent_unsupported, экспорта нет", async () => {
    const v = await readyVersion();
    const { r, exp } = await runExport(v.id, PRORES);
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "export" } });
    expect((r as { error: { message: string } }).error.message).toMatch(/^transparent_unsupported: версия сделана с непрозрачным фоном; включите прозрачный экспорт до генерации/);
    expect(exp.calls).toHaveLength(0);
    expect(listExports()).toEqual([]);
    expect(exportsRepo.listByVersion(env.db, v.id)).toEqual([]);
  });

  it("prores при transparent_export true → .mov, альфа угла проверена на кадре 30", async () => {
    const v = await readyVersion({ ...defaultSettings(), transparent_export: true });
    const seen: [string, number][] = [];
    const { r } = await runExport(v.id, PRORES, fakeExport(), async (p, f) => (seen.push([p, f]), 0));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const row = exportsRepo.get(env.db, (r as { outputRefs: { export_id: string } }).outputRefs.export_id)!;
    expect(row.path).toMatch(/\/scene\.mov$/);
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toMatch(/drafts\/.+-a1\/scene\.mov$/);
    expect(seen[0]![1]).toBe(30);
  });

  it("prores: альфа угла ≠ 0 → failed, stage export, draft в карантине, экспорта нет", async () => {
    const v = await readyVersion({ ...defaultSettings(), transparent_export: true });
    const { job, r } = await runExport(v.id, PRORES, fakeExport(), async () => 255);
    expect(r).toMatchObject({ status: "failed", error: { stage: "export", message: expect.stringMatching(/альфа/) } });
    expect(listExports()).toEqual([]);
    expect(existsSync(join(env.s.root, "workspace/drafts", `${job.id}-a1`, QUARANTINE))).toBe(true);
  });

  it("gate не пуст → failed, stage export, сообщение с замечаниями, экспорта нет", async () => {
    const v = await readyVersion();
    const { r } = await runExport(v.id, MP4, fakeExport({ result: (req) => (writeFileSync(req.outPath, "v"), { ok: true, gate: ["audio нет дорожки, ожидалась дорожка aac"], probe: { durationMs: 6000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264" } }) }));
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "export", message: expect.stringMatching(/audio/) } });
    expect(listExports()).toEqual([]);
  });

  it("ошибка рендера → failed, stage export с этапом рендера в сообщении", async () => {
    const v = await readyVersion();
    const { r } = await runExport(v.id, MP4, fakeExport({ result: () => ({ ok: false, error: { stage: "media", message: "кодек упал" } }) }));
    expect(r).toMatchObject({ status: "failed", error: { stage: "export", message: expect.stringMatching(/media: кодек упал/) } });
  });

  it("orphaned → blocked(stale_process), draft в карантине stale_process", async () => {
    const v = await readyVersion();
    const { job, r } = await runExport(v.id, MP4, fakeExport({ result: () => ({ ok: false, error: { stage: "orphaned", message: "группа не исчезла" } }) }));
    expect(r).toMatchObject({ status: "blocked", error: { code: "stale_process", stage: "orphaned" } });
    expect(readFileSync(join(env.s.root, "workspace/drafts", `${job.id}-a1`, QUARANTINE), "utf8")).toMatch(/stale_process/);
    expect(listExports()).toEqual([]);
  });

  it("устаревшая попытка (задачу перехватила попытка 2) → fenced_out, exports/ пуст, строки нет", async () => {
    const v = await readyVersion();
    let jobId = "";
    const exp = fakeExport({ onCall: () => jobs.update(env.db, jobId, { attempt: 2 }) });
    const job = enqueueExport(v.id, MP4);
    jobId = job.id;
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const r = await handler(exp)(ctxOf(job.id, c.attempt));
    expect(r).toMatchObject({ status: "failed", error: { code: "fenced_out", stage: "fenced_out" } });
    expect(listExports()).toEqual([]);
    expect(exportsRepo.listByVersion(env.db, v.id)).toEqual([]);
    expect(readFileSync(join(env.s.root, "workspace/drafts", `${job.id}-a1`, QUARANTINE), "utf8")).toMatch(/fenced_out/);
  });

  it("отмена запрошена во время рендера → cancelled, экспорта нет", async () => {
    const v = await readyVersion();
    let jobId = "";
    const exp = fakeExport({ onCall: () => jobs.update(env.db, jobId, { cancel_requested: true }) });
    const job = enqueueExport(v.id, MP4);
    jobId = job.id;
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const r = await handler(exp)(ctxOf(job.id, c.attempt));
    expect(r.status).toBe("cancelled");
    expect(listExports()).toEqual([]);
  });

  it("версии нет или она не ready → failed (prepare)", async () => {
    const job = enqueue(env.db, { type: "scene.export", projectId: "playground", input: { versionId: "ver_нет", request: MP4 }, idempotencyKey: "nv" }).job;
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    expect(await handler(fakeExport())(ctxOf(job.id, c.attempt))).toMatchObject({ status: "failed", error: { stage: "prepare", message: expect.stringMatching(/версии ver_нет нет/) } });
    const v = await readyVersion();
    env.db.prepare("UPDATE scene_versions SET status = 'failed' WHERE id = ?").run(v.id);
    const { r } = await runExport(v.id, MP4);
    expect(r).toMatchObject({ status: "failed", error: { stage: "prepare", message: expect.stringMatching(/export_not_ready/) } });
  });

  it("хранилище недоступно → failed storage_unavailable", async () => {
    const v = await readyVersion();
    const job = enqueueExport(v.id, MP4);
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const exp = fakeExport();
    const h = sceneExport({ repo, deps: () => ({ storage: async () => ({ ok: false, reason: "not_found", detail: "SSD отключён" }), export: exp.fn, alpha: async () => 0 }) });
    const r = await h(ctxOf(job.id, c.attempt));
    expect(r).toMatchObject({ status: "failed", error: { code: "storage_unavailable" } });
    expect(exp.calls).toHaveLength(0);
  });

  it("повторный экспорт той же версии → второй каталог, та же версия", async () => {
    const v = await readyVersion();
    const a = await runExport(v.id, MP4);
    const b = await runExport(v.id, MP4);
    expect(a.r.status).toBe("completed");
    expect(b.r.status).toBe("completed");
    expect(listExports()).toHaveLength(2);
    expect(exportsRepo.listByVersion(env.db, v.id)).toHaveLength(2);
  });
});
