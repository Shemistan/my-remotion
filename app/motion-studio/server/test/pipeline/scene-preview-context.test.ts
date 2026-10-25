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
import * as scenes from "../../src/db/repos/scenes.js";
import { contextPreviewState } from "../../src/pipeline/scene-preview-context.js";
import { startVideoBatch } from "../../src/video-scenes/batch.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { P, TERMINAL, type VideoEnv, approveB, fakeVideoGenerate, nextRevision, seedVideoBatchProject, startRunner } from "../video-scenes/batch-helpers.js";

let env: JobsEnv;
let v: VideoEnv;
let runner: JobRunner | undefined;
let calls: TimelineRenderRequest[];
let audioReqs: Parameters<NonNullable<ScenePreviewContextDeps["editedAudio"]>>[0][];
let fail: string | undefined;

beforeEach(async () => {
  env = await setupDb("ms-ctx-preview-");
  v = await seedVideoBatchProject(env);
  const rel = "workspace/projects/p1/proxy/med_1/proxy.mov";
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), "proxy");
  media.setDerivative(env.db, "med_1", { kind: "proxy", rel_path: rel, sha256: "c".repeat(64), params: {} });
  calls = [];
  audioReqs = [];
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
    audioReqs.push(r);
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
    expect(out.rel_path).toBe(`workspace/projects/p1/context/${x.scene_id}/${out.version_id}@r1-p30/preview.mp4`);
    expect(existsSync(join(env.s.root, out.rel_path))).toBe(true);
    expect(JSON.parse(readFileSync(join(env.s.root, dirname(out.rel_path), "preview.json"), "utf8"))).toMatchObject({ range: want, scale: 0.5 });
    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.range).toEqual(want);
    expect(req.output).toMatchObject({ scale: 0.5, codec: "h264" });
    expect(req.props.duration_frames).toBe(total);
    expect(req.props.video.path).toBe(join(env.s.root, "workspace/projects/p1/proxy/med_1/proxy.mov"));
    expect(req.props.audio?.path).toMatch(/edited-audio\.wav$/);
    // звук — только окно превью
    expect(audioReqs.at(-1)!.window).toEqual({ startUs: Math.round((want[0] * 1e6) / 30), endUs: Math.round(((want[1] + 1) * 1e6) / 30) });
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

  it("ключ кэша — версия + ревизия плана + поля: сцену сдвинули в новой ревизии — превью устарело, перерисовка в свой каталог; другие поля — свой", async () => {
    const b = await readyScenes();
    const x = b.items[0]!;
    const o1 = (await preview(x.scene_id)).output_refs as ScenePreviewContextResult;
    const dir = (r: number, pad: number) => `workspace/projects/p1/context/${x.scene_id}/${o1.version_id}@r${r}-p${pad}/preview.mp4`;
    expect(o1.rel_path).toBe(dir(1, 30));
    expect(contextPreviewState(env.db, env.s.root, x.scene_id, o1.version_id)).toMatchObject({ rel_path: dir(1, 30), plan_revision: 1, pad_frames: 30, outdated: false });
    expect(videoScenesState(env.db, env.s.root, P).scenes[0]!.context_preview).toMatchObject({ rel_path: dir(1, 30), outdated: false });

    // r2: сцена сдвинута на 9 кадров (отпечаток тот же) — опубликованное превью устарело
    const shift = 300_000;
    await nextRevision(v, (items) => items.map((i) => ({
      ...i, edited: { start_us: i.edited.start_us + shift, end_us: i.edited.end_us + shift }, frames: { start: i.frames.start + 9, end: i.frames.end + 9 },
      key_terms: i.key_terms.map((k) => ({ ...k, edited_at_us: k.edited_at_us + shift })),
    })));
    approveB(env);
    expect(contextPreviewState(env.db, env.s.root, x.scene_id, o1.version_id)).toMatchObject({ rel_path: dir(1, 30), plan_revision: 1, outdated: true });
    expect(videoScenesState(env.db, env.s.root, P).scenes[0]!.context_preview).toMatchObject({ outdated: true });

    // перерисовка — новый каталог по r2, окно сдвинуто
    const o2 = (await preview(x.scene_id)).output_refs as ScenePreviewContextResult;
    expect(o2).toMatchObject({ reused: false, rel_path: dir(2, 30), plan: { revision: 2 } });
    expect(o2.range[0]).toBe(o1.range[0] + 9);
    expect(calls).toHaveLength(2);
    expect(contextPreviewState(env.db, env.s.root, x.scene_id, o1.version_id)).toMatchObject({ rel_path: dir(2, 30), plan_revision: 2, outdated: false });

    // другие поля — свой каталог, не опубликованное с полями 30
    const o3 = (await preview(x.scene_id, { padFrames: 10 })).output_refs as ScenePreviewContextResult;
    expect(o3).toMatchObject({ reused: false, rel_path: dir(2, 10), pad_frames: 10 });
    expect(calls).toHaveLength(3);
  });

  it("размещение — из генерации версии: план overlay → fullscreen, перегенерация в очереди — превью v1 рисуется как overlay", async () => {
    const b = await readyScenes();
    const x = b.items[0]!;
    const v1 = scenes.get(env.db, x.scene_id)!.current_version_id!;
    await nextRevision(v, (items) => items.map((i) => (i.id === x.item_id ? { ...i, composition_mode: "fullscreen" as const, zone: "full" as const } : i)));
    approveB(env);
    const core = { db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) };
    const regen = startVideoBatch(core, { projectId: P, revision: 2, idempotencyKey: "rg", itemIds: [x.item_id], regenerate: true });
    expect(jobs.get(env.db, regen.items[0]!.job!.id)!.status).toBe("pending");
    const j = await preview(x.scene_id, { versionId: v1 });
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    expect(calls[0]!.props.scenes[0]).toMatchObject({ transparent: true, z: 1 });
    expect((j.output_refs as ScenePreviewContextResult).warnings?.join(" ")).toMatch(/не по текущей сцене плана/);
  });
});
