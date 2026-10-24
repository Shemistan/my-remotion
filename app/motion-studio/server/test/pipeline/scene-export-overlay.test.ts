// scene.export с `overlay` (S6, Р5/Р17): ProRes 4444 с альфой из непрозрачной версии,
// покрытие альфой по кадрам окна речи и hold, отдельные draft у exportOne с draftKey.
// Экспорт, альфа угла и покрытие подменены.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type ExportManifest, type ExportRequest, ExportManifestSchema, defaultSettings } from "@ms/contracts";
import type { AlphaCoverage, ExportResult, ExportVersionRequest, exportVersion } from "@ms/render";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { claimNext, enqueue, fenceOk } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { type SceneExportDeps, exportOne, sceneExport } from "../../src/pipeline/scene-export.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { fakeRender, makeDeps, makeSkills, okStatus } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
beforeEach(async () => {
  env = await setupDb("ms-export-overlay-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
});
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});

const OVERLAY: ExportRequest = { format: "prores4444", crf: 18, scale: 1, overlay: true };

/** Непрозрачная готовая версия (spec helpers: hold с кадра 150 из 180). */
async function readyVersion() {
  const d = await makeDeps(env.s.root, await makeSkills(env.s.tmp), { render: fakeRender({ png: true }).render });
  const runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", pollMs: 5, handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }) } });
  runner.start();
  try {
    const settings = defaultSettings();
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

const exportCalls: ExportVersionRequest[] = [];
const fakeExport = (async (req: ExportVersionRequest): Promise<ExportResult> => {
  exportCalls.push(req);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(req.outPath, `video ${req.request.format}`);
  const s = req.settings;
  return {
    ok: true, gate: [], tempo: null, warnings: [],
    probe: { durationMs: (s.duration_frames * 1000) / 30, width: s.width, height: s.height, fps: s.fps, codec: "prores", pixFmt: "yuva444p10le", profile: "4444" },
  };
}) as typeof exportVersion;

const coverageCalls: { path: string; frames: number[] }[] = [];
function deps(c: { opaque: number; haze: number } = { opaque: 0.31, haze: 0 }): SceneExportDeps {
  return {
    repo,
    deps: () => ({
      storage: () => okStatus(env.s.root),
      export: fakeExport,
      alpha: async () => 0,
      coverage: async (path: string, frames: number[]): Promise<AlphaCoverage> => {
        coverageCalls.push({ path, frames });
        return { ...c, perFrame: frames.map((frame) => ({ frame, ...c })) };
      },
    }),
  };
}

let k = 0;
function ctxFor(versionId: string, request: ExportRequest): JobContext {
  const job = enqueue(env.db, { type: "scene.export", projectId: "playground", versionId, input: { versionId, request }, idempotencyKey: `e${++k}` }).job;
  const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
  const row = jobs.get(env.db, job.id)!;
  return {
    db: env.db, job: row, attempt: c.attempt, signal: new AbortController().signal,
    run: { root: env.s.root, runId: row.id, attempt: c.attempt, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
    emit: () => undefined, progress: () => undefined, fenceOk: () => fenceOk(env.db, row.id, c.attempt),
    agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
  };
}
const run = (versionId: string, request: ExportRequest, d = deps()) => sceneExport(d)(ctxFor(versionId, request));

function manifestOf(r: HandlerResult): ExportManifest {
  const row = exportsRepo.get(env.db, (r as { outputRefs: { export_id: string } }).outputRefs.export_id)!;
  return ExportManifestSchema.parse(JSON.parse(readFileSync(join(env.s.root, row.path, "..", "export-manifest.json"), "utf8")));
}
const msg = (r: HandlerResult) => (r as { error?: { message: string } }).error?.message ?? "";

beforeEach(() => {
  exportCalls.length = 0;
  coverageCalls.length = 0;
});

it("непрозрачная версия + overlay → completed; покрытие по кадрам середины речи и hold — в манифест", async () => {
  const v = await readyVersion();
  const r = await run(v.id, OVERLAY);
  expect(r.status, msg(r)).toBe("completed");
  expect(exportCalls[0]!.request).toMatchObject({ format: "prores4444", overlay: true });
  // без окна речи (экспорт API): речь — до hold (150), середина 75
  expect(coverageCalls).toEqual([{ path: exportCalls[0]!.outPath, frames: [75, 150] }]);
  const m = manifestOf(r);
  expect(m.overlay).toEqual({ coverage: 0.31, haze: 0, frames: [75, 150] });
  expect(m.settings.transparent_export).toBe(true);
  expect(m.warnings).toBeUndefined();
});

it("exportOne с окном речи сцены сценария: кадры по SceneFrames", async () => {
  const v = await readyVersion();
  const ctx = ctxFor(v.id, OVERLAY);
  const r = await exportOne(ctx, deps(), { versionId: v.id, request: OVERLAY, frames: { lead: 15, speech: 120, tail: 45, total: 180 } });
  expect(r.status, msg(r)).toBe("completed");
  expect(coverageCalls[0]!.frames).toEqual([75, 150]);
  const r2 = await exportOne(ctx, deps(), { versionId: v.id, request: OVERLAY, draftKey: "2-alpha", frames: { lead: 15, speech: 200, tail: 0, total: 215 } });
  expect(r2.status, msg(r2)).toBe("completed");
  expect(coverageCalls[1]!.frames).toEqual([115, 150, 179]); // речь > 6 с: конец речи (в пределах сцены)
});

it("непрозрачно 97 % → failed overlay_opaque; пусто → overlay_empty; черновик в карантин", async () => {
  const v = await readyVersion();
  const opaque = await run(v.id, OVERLAY, deps({ opaque: 0.97, haze: 0 }));
  expect(opaque).toMatchObject({ status: "failed", error: { message: expect.stringMatching(/^overlay_opaque: /) } });
  const empty = await run(v.id, OVERLAY, deps({ opaque: 0.001, haze: 0 }));
  expect(empty).toMatchObject({ status: "failed", error: { message: expect.stringMatching(/^overlay_empty: /) } });
  expect(exportsRepo.listByVersion(env.db, v.id)).toEqual([]);
});

it("дымка на 80 % кадра → warning overlay_haze в манифесте и outputRefs", async () => {
  const v = await readyVersion();
  const r = await run(v.id, OVERLAY, deps({ opaque: 0.3, haze: 0.8 }));
  expect(r.status, msg(r)).toBe("completed");
  expect(manifestOf(r).warnings).toContainEqual(expect.stringMatching(/^overlay_haze: /));
  expect(manifestOf(r).overlay).toMatchObject({ coverage: 0.3, haze: 0.8 });
});

it("без overlay — как раньше: transparent_unsupported; overlay с mp4 → overlay_mp4", async () => {
  const v = await readyVersion();
  const r = await run(v.id, { format: "prores4444", crf: 18, scale: 1 });
  expect(r).toMatchObject({ status: "failed", error: { message: expect.stringMatching(/transparent_unsupported/) } });
  const mp4 = await run(v.id, { format: "mp4", crf: 18, scale: 1, overlay: true });
  expect(mp4).toMatchObject({ status: "failed", error: { message: expect.stringMatching(/^overlay_mp4: /) } });
  expect(exportCalls).toHaveLength(0);
});

it("exportOne: общий job, разные draftKey → разные draft и два экспорта", async () => {
  const v = await readyVersion();
  const ctx = ctxFor(v.id, OVERLAY);
  const d = deps();
  const one = (draftKey: string, request: ExportRequest) => exportOne(ctx, d, { versionId: v.id, request, draftKey });
  const rs = await Promise.all([one("1-mp4", { format: "mp4", crf: 18, scale: 1 }), one("1-alpha", OVERLAY)]);
  expect(rs.map((r) => r.status)).toEqual(["completed", "completed"]);
  const drafts = exportCalls.map((c) => c.outPath.split("/").at(-2));
  expect(new Set(drafts).size).toBe(2);
  expect(drafts.sort()).toEqual([`${ctx.job.id}-a${ctx.attempt}-1-alpha`, `${ctx.job.id}-a${ctx.attempt}-1-mp4`]);
  expect(exportsRepo.listByVersion(env.db, v.id).map((x) => x.format).sort()).toEqual(["mp4", "prores4444"]);
  expect(existsSync(join(env.s.root, "workspace/drafts")) ? readdirSync(join(env.s.root, "workspace/drafts")) : []).toEqual([]);
  await expect(exportOne(ctx, d, { versionId: v.id, request: OVERLAY, draftKey: "../x" })).resolves.toMatchObject({ status: "failed", error: { message: expect.stringMatching(/draftKey/) } });
});
