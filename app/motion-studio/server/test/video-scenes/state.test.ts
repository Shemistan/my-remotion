// Task 38-39: состояние сцен видеопроекта — по принятой сцене плана: сцена, задача, текущая и
// утверждённая версии с номерами, C, stale, очередь ждущей правки; B ревизии; пакеты.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VideoScenesStateDtoSchema } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import * as jobs from "../../src/db/repos/jobs.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { JobRunner } from "../../src/jobs/runner.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { approveScene, sceneApprovalState } from "../../src/video-scenes/approval-c.js";
import { startVideoBatch } from "../../src/video-scenes/batch.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { P, TERMINAL, type VideoEnv, approveB, fakeVideoGenerate, nextRevision, seedVideoBatchProject, startRunner } from "./batch-helpers.js";

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

  it("C устаревает при смене сцены в плане (plan_changed): отпечаток версии — от её генерации, у правки — от предка", async () => {
    const core = { db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) };
    const b = startVideoBatch(core, { projectId: P, revision: 1, idempotencyKey: "k" });
    runner = startRunner(v, { "playground.generate": fakeVideoGenerate(v) });
    await until(() => b.items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "пакет", 10_000);
    await runner.stop({ abortRunning: true });
    runner = undefined;
    const [a, c] = [b.items[0]!, b.items[1]!];
    const v1 = scenes.get(env.db, a.scene_id)!.current_version_id!;
    // правка v1 → v2 (задача правки, родитель v1): отпечаток генерации наследуется
    const edit = enqueue(env.db, { type: "playground.edit", projectId: P, sceneId: a.scene_id, input: { sceneId: a.scene_id }, idempotencyKey: "ed" }).job;
    const draft = await makeDraft(env.s.root, { runId: edit.id, attempt: 1, sceneId: a.scene_id, projectId: P, parentVersionId: v1 });
    env.db.prepare("UPDATE jobs SET status = 'running', attempt = 1 WHERE id = ?").run(edit.id);
    const v2 = (await v.repo.publish(draft, meta(a.scene_id, { parent_version_id: v1 }), { jobId: edit.id, attempt: 1 })).versionId;
    approveScene(env.db, { sceneId: a.scene_id, versionId: v2, root: env.s.root });
    approveScene(env.db, { sceneId: c.scene_id, versionId: scenes.get(env.db, c.scene_id)!.current_version_id!, root: env.s.root });
    expect(sceneApprovalState(env.db, a.scene_id, { root: env.s.root })).toMatchObject({ state: "valid", versionId: v2 });

    // r2: сменили зону первой сцены, B на r2 утверждено
    await nextRevision(v, (items) => items.map((x) => (x.id === a.item_id ? { ...x, zone: "top_band" as const } : x)));
    approveB(env);
    expect(sceneApprovalState(env.db, a.scene_id, { root: env.s.root })).toMatchObject({ state: "stale", reason: "plan_changed", versionId: v2 });
    expect(sceneApprovalState(env.db, c.scene_id, { root: env.s.root })).toMatchObject({ state: "valid" });
    const st = videoScenesState(env.db, env.s.root, P);
    expect(st.scenes.find((x) => x.item_id === a.item_id)).toMatchObject({ stale: true, approval: { state: "stale", reason: "plan_changed" } });
    expect(st.scenes.find((x) => x.item_id === c.item_id)).toMatchObject({ stale: false, approval: { state: "valid" } });
    // утвердить версию по старой сцене плана — 409 plan_changed
    expect(() => approveScene(env.db, { sceneId: a.scene_id, versionId: v2, root: env.s.root })).toThrow(expect.objectContaining({ status: 409, code: "plan_changed" }));

    // пакет на r2 ставит первую сцену на новый отпечаток → C в БД stale(plan_changed); C второй — цело
    const ca = approvals.latestActive(env.db, P, "C", `scene:${a.scene_id}`)!;
    const b2 = startVideoBatch(core, { projectId: P, revision: 2, idempotencyKey: "k2" });
    expect(b2.items.map((x) => x.item_id)).toEqual([a.item_id]);
    expect(approvals.get(env.db, ca.id)).toMatchObject({ status: "stale", stale_reason: "plan_changed" });
    expect(approvals.latestActive(env.db, P, "C", `scene:${c.scene_id}`)).toMatchObject({ status: "valid" });
  });

  it("стиля проекта нет — сцены не помечаются stale", async () => {
    const core = { db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) };
    const b = startVideoBatch(core, { projectId: P, revision: 1, idempotencyKey: "k" });
    runner = startRunner(v, { "playground.generate": fakeVideoGenerate(v) });
    await until(() => b.items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "пакет", 10_000);
    await runner.stop({ abortRunning: true });
    runner = undefined;
    env.db.prepare("UPDATE style_bibles SET current_revision = NULL WHERE project_id = ?").run(P);
    expect(videoScenesState(env.db, env.s.root, P).scenes.map((x) => x.stale)).toEqual([false, false, false, false]);
  });
});
