// Task 38-39: состояние сцен видеопроекта — по принятой сцене плана: сцена, задача, текущая и
// утверждённая версии с номерами, C, stale, очередь ждущей правки; B ревизии; пакеты.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VideoScenesStateDtoSchema } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import * as jobs from "../../src/db/repos/jobs.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { JobRunner } from "../../src/jobs/runner.js";
import { approveScene } from "../../src/video-scenes/approval-c.js";
import { startVideoBatch } from "../../src/video-scenes/batch.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { P, TERMINAL, type VideoEnv, fakeVideoGenerate, nextRevision, seedVideoBatchProject, startRunner } from "./batch-helpers.js";

let env: JobsEnv;
let v: VideoEnv;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-video-state-");
  v = await seedVideoBatchProject(env);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  env.db.close();
  await removeStore(env.s);
});

describe("videoScenesState", () => {
  it("до пакета — сцены плана без сцен Playground; после — версии, C на одну, очередь ждущей правки; схема DTO", async () => {
    const s0 = videoScenesState(env.db, env.s.root, P);
    expect(VideoScenesStateDtoSchema.safeParse(s0).success).toBe(true);
    expect(s0.plan).toEqual({ id: "pln_1", revision: 1 });
    expect(s0.approval_b).toMatchObject({ state: "valid", ref: "plan:pln_1@r1" });
    expect(s0.scenes.map((x) => [x.status, x.scene_id, x.stale])).toEqual(Array(4).fill(["none", null, false]));
    expect(s0.scenes[2]!.placement).toMatchObject({ mode: "fullscreen", transparent: false });

    const core = { db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) };
    const b = startVideoBatch(core, { projectId: P, revision: 1, idempotencyKey: "k" });
    runner = startRunner(v, { "playground.generate": fakeVideoGenerate(v) });
    await until(() => b.items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "пакет", 10_000);
    await runner.stop({ abortRunning: true });
    runner = undefined;
    const first = b.items[0]!;
    approveScene(env.db, { sceneId: first.scene_id, versionId: first.version_id ?? videoScenesState(env.db, env.s.root, P).scenes[0]!.version_id! });
    // две правки первой сцены ждут (раннер остановлен): у второй — одна впереди
    enqueue(env.db, { type: "playground.edit", projectId: P, sceneId: first.scene_id, input: { sceneId: first.scene_id, n: 1 }, idempotencyKey: "e1" });
    const e2 = enqueue(env.db, { type: "playground.edit", projectId: P, sceneId: first.scene_id, input: { sceneId: first.scene_id, n: 2 }, idempotencyKey: "e2" }).job;

    const s1 = videoScenesState(env.db, env.s.root, P);
    expect(VideoScenesStateDtoSchema.safeParse(s1).success).toBe(true);
    const a = s1.scenes[0]!;
    expect(a).toMatchObject({ status: "ready", version_number: 1, approved_version_number: 1, approval: { state: "valid", version_number: 1 }, stale: false });
    expect(a.queue).toMatchObject({ ahead: 1 });
    expect(a.queue?.blocking_job_id).not.toBe(e2.id);
    expect(s1.scenes[1]).toMatchObject({ approval: { state: "missing" }, approved_version_id: null, queue: null });
    expect(s1.batches.map((x) => x.id)).toEqual([b.id]);

    // новая ревизия плана без B — approval_b stale; смена режима сцены — stale
    await nextRevision(v, (items) => items.map((x, k) => (k === 1 ? { ...x, composition_mode: "fullscreen" as const, zone: "full" as const } : x)));
    const s2 = videoScenesState(env.db, env.s.root, P);
    expect(s2.approval_b.state).toBe("stale");
    expect(s2.scenes.map((x) => x.stale)).toEqual([false, true, false, false]);
  });
});
