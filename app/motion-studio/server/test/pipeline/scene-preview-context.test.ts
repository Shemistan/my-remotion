// Task 38-39: `scene.preview_context` — превью версии видеосцены поверх исходника с полями:
// окно [start − pad, end + pad) кадров таймлайна, одна сцена в композиции, прокси и звук по EDL,
// масштаб 0,5, публикация `context/<scene>/<version>/`; повтор — тот же каталог без рендера.
// Рендер диапазона и дорожка звука — фейки; раннер, очередь, публикация — настоящие.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileProcessRegistry } from "@ms/core";
import type { TimelineRenderRequest, TimelineRenderResult } from "@ms/render";
import { timelineFrames, videoSceneFrames } from "@ms/contracts";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { type ScenePreviewContextDeps, type ScenePreviewContextResult, scenePreviewContext } from "../../src/pipeline/scene-preview-context.js";
import { startVideoBatch } from "../../src/video-scenes/batch.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { P, TERMINAL, type VideoEnv, fakeVideoGenerate, seedVideoBatchProject, startRunner } from "../video-scenes/batch-helpers.js";

let env: JobsEnv;
let v: VideoEnv;
let runner: JobRunner | undefined;
let calls: TimelineRenderRequest[];
let fail: string | undefined;

beforeEach(async () => {
  env = await setupDb("ms-ctx-preview-");
  v = await seedVideoBatchProject(env);
  const rel = "workspace/projects/p1/proxy/med_1/proxy.mov";
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), "proxy");
  media.setDerivative(env.db, "med_1", { kind: "proxy", rel_path: rel, sha256: "c".repeat(64), params: {} });
  calls = [];
  fail = undefined;
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

async function render(req: TimelineRenderRequest): Promise<TimelineRenderResult> {
  calls.push(req);
  if (fail) return { ok: false, stills: [], browserLogs: [], allowedOrigins: [], error: { stage: "media", message: fail } };
  writeFileSync(req.output!.path, "mp4");
  const frames = req.range![1] - req.range![0] + 1;
  return {
    ok: true, stills: [], outPath: req.output!.path, browserLogs: [], allowedOrigins: [],
    probe: { codec: "h264", width: req.props.width / 2, height: req.props.height / 2, durationMs: Math.round((frames * 1000) / 30), fps: 30, hasAudio: true } as unknown as TimelineRenderResult["probe"],
  };
}

const deps = (): ScenePreviewContextDeps => ({
  svc: { root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), storageCheck: env.s.guard } as unknown as CoreServices,
  options: {}, exporter: {} as ScenePreviewContextDeps["exporter"],
  renderRange: render,
  editedAudio: async (r) => {
    writeFileSync(r.out, "wav");
    return { path: r.out, sha256: "e".repeat(64), samples: 1 };
  },
});

/** Пакет из всех сцен плана до готовых версий; раннер — генерация и превью в контексте. */
async function readyScenes() {
  const core = { db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) };
  const b = startVideoBatch(core, { projectId: P, revision: 1, idempotencyKey: "k" });
  runner = startRunner(v, { "playground.generate": fakeVideoGenerate(v) });
  await until(() => b.items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "пакет", 10_000);
  await runner.stop({ abortRunning: true });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv2", pollMs: 5, handlers: { "scene.preview_context": scenePreviewContext(deps) } });
  runner.start();
  return b;
}
let k = 0;
async function preview(sceneId: string, input: Record<string, unknown> = {}) {
  const j = enqueue(env.db, { type: "scene.preview_context", projectId: P, sceneId, input: { sceneId, ...input }, idempotencyKey: `ctx-${++k}` }).job;
  await until(() => TERMINAL.has(jobs.get(env.db, j.id)!.status), "превью", 10_000);
  return jobs.get(env.db, j.id)!;
}

describe("scene.preview_context", () => {
  it("окно сцены ± 30 кадров, одна сцена, прокси и звук, масштаб 0,5 → context/<scene>/<version>/preview.mp4; повтор — без рендера", async () => {
    const b = await readyScenes();
    const x = b.items[0]!;
    const item = v.doc.items.find((i) => i.id === x.item_id)!;
    const j = await preview(x.scene_id);
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    const out = j.output_refs as ScenePreviewContextResult;
    const total = timelineFrames(timelineFor(env.db, "edl_1", 1));
    const want: [number, number] = [Math.max(0, item.frames.start - 30), Math.min(total, item.frames.start + videoSceneFrames(item) + 30) - 1];
    expect(out).toMatchObject({ scene_id: x.scene_id, item_id: item.id, version_number: 1, range: want, pad_frames: 30, reused: false, edl: { id: "edl_1", revision: 1 } });
    expect(out.rel_path).toBe(`workspace/projects/p1/context/${x.scene_id}/${out.version_id}/preview.mp4`);
    expect(existsSync(join(env.s.root, out.rel_path))).toBe(true);
    expect(JSON.parse(readFileSync(join(env.s.root, dirname(out.rel_path), "preview.json"), "utf8"))).toMatchObject({ range: want, scale: 0.5 });
    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.range).toEqual(want);
    expect(req.output).toMatchObject({ scale: 0.5, codec: "h264" });
    expect(req.props.duration_frames).toBe(total);
    expect(req.props.video.path).toBe(join(env.s.root, "workspace/projects/p1/proxy/med_1/proxy.mov"));
    expect(req.props.audio?.path).toMatch(/edited-audio\.wav$/);
    expect(req.props.scenes).toEqual([expect.objectContaining({ key: "S0", start_frame: item.frames.start, duration_frames: videoSceneFrames(item), transparent: true, z: 1 })]);

    // повтор (другая задача, тот же каталог) — опубликованное превью, рендера нет
    const again = await preview(x.scene_id, { versionId: out.version_id });
    expect(again.status, JSON.stringify(again.error)).toBe("completed");
    expect(again.output_refs).toMatchObject({ reused: true, rel_path: out.rel_path, range: want });
    expect(calls).toHaveLength(1);
  });

  it("fullscreen — непрозрачная сцена (z 0); поля 0 — окно ровно сцены", async () => {
    const b = await readyScenes();
    const x = b.items.find((i) => v.doc.items.find((d) => d.id === i.item_id)!.composition_mode === "fullscreen")!;
    const item = v.doc.items.find((i) => i.id === x.item_id)!;
    const j = await preview(x.scene_id, { padFrames: 0 });
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    expect(calls[0]!.range).toEqual([item.frames.start, item.frames.start + videoSceneFrames(item) - 1]);
    expect(calls[0]!.props.scenes[0]).toMatchObject({ transparent: false, z: 0 });
  });

  it("сбой рендера — failed(pipeline/render), каталога нет; сцена не видео — failed(prepare)", async () => {
    const b = await readyScenes();
    fail = "worker упал";
    const j = await preview(b.items[1]!.scene_id);
    expect(j.status).toBe("failed");
    expect(j.error).toMatchObject({ code: "pipeline", stage: "render" });
    expect(j.error?.message).toMatch(/worker упал/);
    const bad = await preview("scn_1");
    expect(bad.status).toBe("failed");
    expect(bad.error).toMatchObject({ code: "pipeline", stage: "prepare" });
  });
});
