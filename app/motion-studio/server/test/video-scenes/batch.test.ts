// Task 38-39: пакет видеосцен — набор обычных задач `playground.generate` со входом `video`
// (Р-V2): валидное B на текущую ревизию, ключи `video:<plan>@r<rev>:<item>:s<style>[:try-n][:regen-k]`,
// статус, повтор упавших, отмена, рестарт. Обработчик — фейк, раннер и очередь — настоящие.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileProcessRegistry } from "@ms/core";
import { type VideoSceneContext, VideoSceneContextSchema, videoSceneFrames } from "@ms/contracts";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenesRepo from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { videoScenes } from "../../src/db/repos/video.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { recoverOnStart } from "../../src/jobs/recovery.js";
import type { JobRunner } from "../../src/jobs/runner.js";
import { sceneRel } from "../../src/scenes/store.js";
import { cancelVideoBatch, startVideoBatch, videoBatchStatus, videoBatchesForState, videoSceneJobKey } from "../../src/video-scenes/batch.js";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import { STYLE_BASE } from "../analysis/plan-db-helpers.js";
import { removeStore } from "../db/helpers.js";
import { deferred, setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { P, TERMINAL, type VideoEnv, approveB, fakeVideoGenerate, nextRevision, seedVideoBatchProject, startRunner } from "./batch-helpers.js";

let env: JobsEnv;
let v: VideoEnv;
let runner: JobRunner | undefined;
const core = () => ({ db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) });
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return "не бросило";
}
const run = (o: Parameters<typeof fakeVideoGenerate>[1] = {}, owner = "srv") => {
  runner = startRunner(v, { "playground.generate": fakeVideoGenerate(v, o) }, owner);
  return runner;
};
const jobsOf = (batchId: string) => videoBatchStatus(env.db, env.s.root, batchId).items.map((x) => x.job!.id);
const runToIdle = (batchId: string) => until(() => jobsOf(batchId).every((id) => TERMINAL.has(jobs.get(env.db, id)!.status)), "пакет дошёл до конечных статусов", 20_000);
const rev = () => v.doc.revision;
const ids = () => v.doc.items.map((x) => x.id);

beforeEach(async () => {
  env = await setupDb("ms-video-batch-");
  v = await seedVideoBatchProject(env);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

describe("videoSceneJobKey", () => {
  it("video:<plan>@r<rev>:<item>:s<style>[:try-n][:regen-k]", () => {
    expect(videoSceneJobKey({ planId: "pln_1", revision: 2, itemId: "sp_001", styleRevision: 1 })).toBe("video:pln_1@r2:sp_001:s1");
    expect(videoSceneJobKey({ planId: "pln_1", revision: 2, itemId: "sp_001", styleRevision: 3, tryN: 1, regenK: 2 })).toBe("video:pln_1@r2:sp_001:s3:try-1:regen-2");
  });
});

describe("startVideoBatch", () => {
  it("4 сцены, одна падает → { total 4, ready 3, failed 1 }; вход задачи — video по плану; повтор ключа — тот же пакет; второй пакет — только упавшая с :try-1", async () => {
    const b = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "k1" });
    expect(b.items.map((x) => x.item_id)).toEqual(ids());
    expect(b.items.every((x) => x.status === "pending")).toBe(true);
    run({ fail: new Set([ids()[1]!]) });
    await runToIdle(b.id);
    expect(videoBatchStatus(env.db, env.s.root, b.id).counts).toEqual({ total: 4, pending: 0, running: 0, ready: 3, failed: 1, cancelled: 0, blocked: 0 });

    const item = v.doc.items[0]!;
    const j1 = jobs.get(env.db, b.items[0]!.job!.id)!;
    expect(j1.type).toBe("playground.generate");
    expect(j1.idempotency_key).toBe(`video:pln_1@r1:${item.id}:s1`);
    const input = j1.input as { prompt: string; settings: { duration_frames: number }; video: VideoSceneContext; video_fingerprint: string; answers: string };
    expect(input.answers).toBe("skip");
    expect(VideoSceneContextSchema.safeParse(input.video).success).toBe(true);
    expect(input.video).toMatchObject({ project_id: P, plan_id: "pln_1", plan_revision: 1, item_id: item.id });
    expect(input.settings.duration_frames).toBe(videoSceneFrames(item));
    expect(input.video_fingerprint).toBe(videoItemFingerprint(item, { id: v.doc.inputs.style.id, revision: 1 }));
    expect(input.prompt).toContain("Сцена 1 из 4");
    expect(scenesRepo.get(env.db, b.items[0]!.scene_id)!.title).toMatch(/^01 · /);
    expect(readFileSync(join(env.s.root, sceneRel(P, b.items[0]!.scene_id), "brief.json"), "utf8")).toContain("Сцена 1 из 4");

    expect(startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "k1" }).id).toBe(b.id);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "k1", regenerate: true }))).toBe("idempotency_key_reused");
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "k1", itemIds: [ids()[0]!] }))).toBe("idempotency_key_reused");

    const retry = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "k2" });
    expect(retry.items.map((x) => x.item_id)).toEqual([ids()[1]]);
    expect(retry.skipped?.map((x) => x.item_id)).toEqual([ids()[0], ids()[2], ids()[3]]);
    expect(jobs.get(env.db, retry.items[0]!.job!.id)!.idempotency_key).toBe(`video:pln_1@r1:${ids()[1]}:s1:try-1`);
    expect(retry.items[0]!.scene_id).toBe(b.items[1]!.scene_id);
    await runToIdle(retry.id);
    expect(videoBatchStatus(env.db, env.s.root, b.id).items).toHaveLength(4); // членство — свои задачи
    expect(videoBatchesForState(env.db, env.s.root, P).map((x) => x.id)).toEqual([retry.id, b.id]);
  });

  it("«Перегенерировать» — regenerate по одной сцене с :regen-k; item_ids неизвестной сцены — 422; ревизия не текущая — 409 plan_outdated", async () => {
    const b = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "a1" });
    run();
    await runToIdle(b.id);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "a2" }))).toBe("nothing_to_generate");
    const regen = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "a3", itemIds: [ids()[2]!], regenerate: true });
    expect(regen.items.map((x) => x.item_id)).toEqual([ids()[2]]);
    expect(jobs.get(env.db, regen.items[0]!.job!.id)!.idempotency_key).toBe(`video:pln_1@r1:${ids()[2]}:s1:regen-1`);
    await runToIdle(regen.id);
    expect(versions.listByScene(env.db, regen.items[0]!.scene_id)).toHaveLength(2);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "a4", itemIds: ["sp_999"] }))).toBe("unknown_item");
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev() + 1, idempotencyKey: "a5" }))).toBe("plan_outdated");
  });

  it("B устарело (новая ревизия без утверждения) или его нет → 409 approval_required; B пакет не ставит", async () => {
    await nextRevision(v, (items) => items);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "b1" }))).toBe("approval_required");
    expect(approvals.latestActive(env.db, P, "B")!.subject_ref).toBe("plan:pln_1@r1");
    approveB(env);
    expect(startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "b2" }).items).toHaveLength(4);
    // смена стиля отзывает B — снова approval_required
    await saveProjectStyle({ db: env.db, store: v.store, root: env.s.root }, P, { ...STYLE_BASE, depth: 2 }, "user");
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "b3" }))).toBe("approval_required");
  });

  it("проект не видео — 409 not_video_project; без принятых сцен — 422 no_items", async () => {
    const { create } = await import("../../src/db/repos/projects.js");
    create(env.db, { id: "p_s", kind: "script", title: "с" });
    expect(codeOf(() => startVideoBatch(core(), { projectId: "p_s", revision: 1, idempotencyKey: "c1" }))).toBe("not_video_project");
    await nextRevision(v, (items) => items.map((x) => ({ ...x, status: "rejected" as const })));
    approveB(env);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "c2" }))).toBe("no_items");
  });

  it("сдвиг сцены правкой EDL (тот же отпечаток) — сцена не stale и не ставится; смена зоны в плане — stale и в пакете", async () => {
    const b = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "s1" });
    run();
    await runToIdle(b.id);
    const shift = 300_000;
    const df = 9;
    await nextRevision(v, (items) => items.map((x) => ({
      ...x, edited: { start_us: x.edited.start_us + shift, end_us: x.edited.end_us + shift }, frames: { start: x.frames.start + df, end: x.frames.end + df },
      key_terms: x.key_terms.map((k) => ({ ...k, edited_at_us: k.edited_at_us + shift })),
    })));
    approveB(env);
    const staleOf = () => Object.fromEntries(videoScenesState(env.db, env.s.root, P).scenes.map((x) => [x.item_id, x.stale]));
    expect(Object.values(staleOf())).toEqual([false, false, false, false]);
    // всё готово — пустой пакет не создаётся: 409 nothing_to_generate со списком пропущенных
    const before = videoBatchesForState(env.db, env.s.root, P).length;
    let err: { status?: number; code?: string; extra?: { skipped?: unknown[] } } = {};
    try {
      startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "s2" });
    } catch (e) {
      err = e as typeof err;
    }
    expect(err).toMatchObject({ status: 409, code: "nothing_to_generate" });
    expect(err.extra?.skipped).toHaveLength(4);
    expect(videoBatchesForState(env.db, env.s.root, P)).toHaveLength(before);

    await nextRevision(v, (items) => items.map((x, k) => (k === 0 ? { ...x, zone: "right_third" as const } : x)));
    approveB(env);
    expect(staleOf()[ids()[0]!]).toBe(true);
    expect(staleOf()[ids()[1]!]).toBe(false);
    const again = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "s3" });
    expect(again.items.map((x) => x.item_id)).toEqual([ids()[0]]);
    expect(again.items[0]!.scene_id).toBe(b.items[0]!.scene_id);
    expect(jobs.get(env.db, again.items[0]!.job!.id)!.idempotency_key).toBe(`video:pln_1@r3:${ids()[0]}:s1`);
  });

  it("идущая задача на тот же отпечаток входит в пакет как есть; отмена: running/pending → cancelled, версии на месте", async () => {
    const first = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "x1", itemIds: [ids()[0]!] });
    run();
    await runToIdle(first.id);
    const ready = scenesRepo.get(env.db, first.items[0]!.scene_id)!.current_version_id;
    await runner!.stop({ abortRunning: true });
    const b = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "x2", regenerate: true });
    expect(b.items).toHaveLength(4);
    run({ hold: new Promise<void>(() => undefined) });
    await until(() => videoBatchStatus(env.db, env.s.root, b.id).counts.running === 2, "две задачи в работе", 5_000);
    const same = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "x3" });
    expect(same.items.map((x) => x.job!.id).sort()).toEqual(b.items.map((x) => x.job!.id).sort());
    const after = await cancelVideoBatch(core(), b.id);
    await runToIdle(b.id);
    expect(videoBatchStatus(env.db, env.s.root, b.id).counts).toMatchObject({ total: 4, cancelled: 4 });
    expect(after.id).toBe(b.id);
    expect(scenesRepo.get(env.db, first.items[0]!.scene_id)!.current_version_id).toBe(ready);
    expect(versions.listByScene(env.db, first.items[0]!.scene_id)).toHaveLength(1);
  });

  it("рестарт посреди пакета: recoverOnStart → все сцены готовы, версий без дублей", async () => {
    const b = startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "z1" });
    const gate = deferred();
    const r1 = run({ afterPublish: gate.promise }, "srv-dead");
    const published = () => b.items.filter((x) => versions.listByScene(env.db, x.scene_id).length > 0).length;
    await until(() => published() === 2, "две версии опубликованы", 5_000);
    const dead = r1.stop({ abortRunning: false });
    runner = undefined;
    const registry = mergeRegistries(new SqliteProcessRegistry(env.db), fileProcessRegistry(env.s.root));
    const rep = await recoverOnStart({ db: env.db, repo: v.repo, registry, cleanup: false });
    expect(rep.completed).toHaveLength(2);
    run({}, "srv-new");
    await runToIdle(b.id);
    expect(videoBatchStatus(env.db, env.s.root, b.id).counts).toMatchObject({ total: 4, ready: 4 });
    for (const x of b.items) expect(versions.listByScene(env.db, x.scene_id)).toHaveLength(1);
    gate.resolve();
    await dead;
  });

  it("Task 47: проект в корзине — project_deleted до брифов (каталог проекта не пересоздаётся)", () => {
    env.db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), P);
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "d1" }))).toBe("project_deleted");
    expect(scenesRepo.listByProject(env.db, P)).toEqual([]);
  });

  it("откат транзакции (B отозвали после брифов) — каталогов брифов и строк новых сцен нет", () => {
    // B нет — отказ до записи брифов
    approvals.revokeActive(env.db, P, "B");
    expect(codeOf(() => startVideoBatch(core(), { projectId: P, revision: rev(), idempotencyKey: "r1" }))).toBe("approval_required");
    expect(scenesRepo.listByProject(env.db, P)).toEqual([]);
    expect(videoScenes.listByPlan(env.db, "pln_1")).toEqual([]);
    const dir = join(env.s.root, sceneRel(P, "x"), "..");
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});
