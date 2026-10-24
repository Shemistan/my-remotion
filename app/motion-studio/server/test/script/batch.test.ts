// S5: пакет генерации сценария — Approval B, сцены и задачи `playground.generate` одной
// транзакцией, ключи идемпотентности `:s<styleRev>[:try-n][:regen-k]`, статус, отмена, рестарт.
// Обработчик задачи — фейк (публикует версию или падает), раннер и очередь — настоящие.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileProcessRegistry } from "@ms/core";
import { DEFAULT_READING, type Fps, type ProjectStyleBase, type ScriptPlanRevisionDoc, type ScriptRevisionDoc, type ScriptSceneItem, defaultSettings, quoteOf, readingFrames, tokenizeScript } from "@ms/contracts";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenesRepo from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { scriptPlans, scriptRevisions, scriptScenes, scripts } from "../../src/db/repos/script.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { recoverOnStart } from "../../src/jobs/recovery.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { sceneRel } from "../../src/scenes/store.js";
import { batchStatus, batchesForState, cancelBatch, recordPublishedFingerprint, startScriptBatch } from "../../src/script/batch.js";
import { SCRIPT_FILE, SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { scriptState } from "../../src/script/state.js";
import { removeStore } from "../db/helpers.js";
import { deferred, setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

const P = "p_batch";
const SHA = "a".repeat(64);
const F30: Fps = { num: 30, den: 1 };
const TEXT = "Карта хранит пары ключей. Ключ проходит через хэш. Слот выбирают старшие биты. Группа держит восемь слотов.";
const BASE: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 2, palette_overrides: { bg: "#101418" } };
const TERMINAL = new Set(["completed", "failed", "cancelled", "blocked"]);

let env: JobsEnv;
let repo: SceneRepo;
let store: ArtifactStore;
let runner: JobRunner | undefined;
let script: ScriptRevisionDoc;
let styleId: string;
/** Код ApiError вызова (или сообщение, если это не ApiError). */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return "не бросило";
}
const core = () => ({ db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) });

function items(): ScriptSceneItem[] {
  const techniques = ["hero-number", "split-versus", "timeline", "checklist"] as const;
  return techniques.map((technique, k) => {
    const start = `w_${String(k * 4 + 1).padStart(6, "0")}`;
    const end = `w_${String(k * 4 + 4).padStart(6, "0")}`;
    return {
      id: `ss_00${k + 1}`, status: "accepted", origin: "agent", start_word_id: start, end_word_id: end, quote: quoteOf(script, start, end), block_id: "b1",
      words: 4, at_s: k * 1.6, frames: readingFrames(4, DEFAULT_READING, F30), technique, pattern: "quantities", purpose: `назначение ${k + 1}`, idea: `идея ${k + 1}`,
      key_terms: [], data: [], importance: 2, anchor_ids: [],
    };
  });
}

function planDoc(revision: number, over: Partial<ScriptPlanRevisionDoc> = {}): ScriptPlanRevisionDoc {
  return {
    schema_version: 1, plan_id: "pln_b", revision, ...(revision > 1 ? { parent_revision: revision - 1 } : {}),
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: styleId, revision: 1, hash: SHA } },
    fps: F30, aspect: "16:9", reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    items: items(), skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 }, ...over,
  };
}

function publishPlan(doc: ScriptPlanRevisionDoc): void {
  const rel = `${artifactPaths(env.s.root, P).planRev("pln_b", doc.revision)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(doc));
  scriptPlans.insertRevision(env.db, { doc, rel_path: rel, sha256: SHA });
}

beforeEach(async () => {
  env = await setupDb("ms-script-batch-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  store = new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard });
  projects.create(env.db, { id: P, kind: "script", title: "Go map", settings: defaultSettings() });
  script = { schema_version: 1, script_id: "scr_1", revision: 1, ...tokenizeScript([{ title: "Блок 1", text: TEXT }]), author: "user" };
  scripts.create(env.db, { id: "scr_1", project_id: P });
  const rel = `${artifactPaths(env.s.root, P).scriptRev("scr_1", 1)}/${SCRIPT_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(script));
  scriptRevisions.insert(env.db, { script_id: "scr_1", revision: 1, rel_path: rel, sha256: SHA, hash: SHA });
  scripts.setCurrent(env.db, "scr_1", 1);
  styleId = (await saveProjectStyle({ db: env.db, store, root: env.s.root }, P, BASE, "user")).style_id;
  scriptPlans.create(env.db, { id: "pln_b", project_id: P });
  for (const r of [1, 2, 3]) publishPlan(planDoc(r));
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

type In = { sceneId: string; script: { item_id: string } };

/** Обработчик-фейк: сцена из `fail` — failed; иначе ждёт `hold` (если есть) и публикует версию. */
function fakeHandler(o: { fail?: Set<string>; hold?: Promise<void>; afterPublish?: Promise<void> } = {}) {
  return async (ctx: JobContext): Promise<HandlerResult> => {
    const input = ctx.job.input as In;
    if (o.fail?.has(input.script.item_id)) return { status: "failed", error: { code: "pipeline", message: "фейк: генерация не удалась" } };
    if (o.hold) {
      await Promise.race([o.hold, new Promise<void>((r) => ctx.signal.addEventListener("abort", () => r()))]);
      if (ctx.signal.aborted) return { status: "cancelled", error: { code: "cancelled", message: "отменено" } };
    }
    const draft = await makeDraft(env.s.root, { runId: ctx.job.id, attempt: ctx.attempt, sceneId: input.sceneId, projectId: P });
    const v = await repo.publish(draft, meta(input.sceneId), { jobId: ctx.job.id, attempt: ctx.attempt });
    recordPublishedFingerprint(env.db, input.sceneId, ctx.job.input); // как playground.generate после публикации
    if (o.afterPublish) await o.afterPublish;
    return { status: "completed", outputRefs: { version_id: v.versionId } };
  };
}

function startRunner(handler: ReturnType<typeof fakeHandler>, owner = "srv"): JobRunner {
  runner = new JobRunner({ db: env.db, root: env.s.root, owner, handlers: { "playground.generate": handler }, pollMs: 5, maxRunning: 2 });
  runner.start();
  return runner;
}

const jobsOf = (batchId: string) => batchStatus(env.db, env.s.root, batchId).items.map((x) => x.job!.id);
const runToIdle = (batchId: string) => until(() => jobsOf(batchId).every((id) => TERMINAL.has(jobs.get(env.db, id)!.status)), "пакет дошёл до конечных статусов", 20_000);
const sceneDirs = () => (existsSync(join(env.s.root, sceneRel(P, "x"), "..")) ? readdirSync(join(env.s.root, sceneRel(P, "x"), "..")) : []);

describe("startScriptBatch", () => {
  it("пакет: 4 сцены, одна падает; повтор ключа — тот же пакет; «Повторить» — только упавшая с :try-1; новый стиль — все сцены заново", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "k1" });
    expect(s.items.map((x) => x.item_id)).toEqual(["ss_001", "ss_002", "ss_003", "ss_004"]);
    expect(s.items.every((x) => x.status === "pending")).toBe(true);
    startRunner(fakeHandler({ fail: new Set(["ss_002"]) }));
    await runToIdle(s.id);
    expect(batchStatus(env.db, env.s.root, s.id).counts).toMatchObject({ total: 4, ready: 3, failed: 1, pending: 0, running: 0 });
    expect(scenesRepo.get(env.db, s.items[0]!.scene_id)!.title).toMatch(/^01 · Карта хранит пары ключей/);
    expect(scenesRepo.get(env.db, s.items[3]!.scene_id)!.title).toMatch(/^04 · /);

    // вход задачи: бриф, настройки сцены, script, answers skip; ключ — с ревизией стиля
    const j1 = jobs.get(env.db, s.items[0]!.job!.id)!;
    expect(j1.idempotency_key).toBe("script:pln_b@r3:ss_001:16:9:s1");
    const input = j1.input as { prompt: string; settings: { duration_frames: number; style_lock: unknown }; script: Record<string, unknown>; answers: string };
    expect(input.answers).toBe("skip");
    expect(input.prompt).toContain("Сцена 1 из 4 сценария «Go map»");
    expect(input.settings.duration_frames).toBe(items()[0]!.frames.total);
    expect(input.settings.style_lock).toEqual({ palette_overrides: { bg: "#101418" }, depth: 2 });
    expect(input.script).toMatchObject({ project_id: P, plan_id: "pln_b", plan_revision: 3, item_id: "ss_001", aspect: "16:9", style: BASE, lead_frames: 15, tail_frames: 30 });

    expect(startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "k1" }).id).toBe(s.id);
    expect(approvals.latestActive(env.db, P, "B")!.subject_ref).toBe("plan:pln_b@r3");

    const retry = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "k2" });
    expect(retry.items).toHaveLength(1);
    expect(retry.items[0]!.item_id).toBe("ss_002");
    expect(jobs.get(env.db, retry.items[0]!.job!.id)!.idempotency_key).toMatch(/:ss_002:16:9:s1:try-1$/);
    expect(retry.items[0]!.scene_id).toBe(s.items[1]!.scene_id); // та же сцена Playground
    await runToIdle(retry.id);
    // пакет k1 не потерял сцену: членство пакета — свои задачи
    expect(batchStatus(env.db, env.s.root, s.id).items).toHaveLength(4);

    await saveProjectStyle({ db: env.db, store, root: env.s.root }, P, { ...BASE, depth: 1 }, "user");
    const all = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "k4" });
    expect(all.items).toHaveLength(4);
    expect(jobs.get(env.db, all.items[0]!.job!.id)!.idempotency_key).toBe("script:pln_b@r3:ss_001:16:9:s2");
    expect(jobs.get(env.db, all.items[1]!.job!.id)!.idempotency_key).toBe("script:pln_b@r3:ss_002:16:9:s2:try-2");
    expect((jobs.get(env.db, all.items[0]!.job!.id)!.input as { settings: { style_lock: { depth: number } } }).settings.style_lock.depth).toBe(1);
    // B утверждена заново на ту же ревизию плана (стиль её отозвал)
    expect(approvals.latestActive(env.db, P, "B")).toMatchObject({ subject_ref: "plan:pln_b@r3", status: "valid" });

    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 2, idempotencyKey: "k3" }))).toBe("plan_outdated");
    // пакеты в состоянии проекта — новые первыми
    expect(batchesForState(env.db, env.s.root, P).map((b) => b.id)).toEqual([all.id, retry.id, s.id]);
    expect(scriptState(env.db, env.s.root, P).batches).toHaveLength(3);
  });

  it("готовые сцены по текущему плану не ставятся; regenerate — все выбранные с :regen-k; item_ids — только выбранные", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "a1" });
    startRunner(fakeHandler());
    await runToIdle(s.id);
    const none = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "a2" });
    expect(none.items).toEqual([]);
    expect(none.skipped?.map((x) => x.item_id)).toEqual(["ss_001", "ss_002", "ss_003", "ss_004"]);
    const regen = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "a3", itemIds: ["ss_003"], regenerate: true });
    expect(regen.items.map((x) => x.item_id)).toEqual(["ss_003"]);
    expect(jobs.get(env.db, regen.items[0]!.job!.id)!.idempotency_key).toBe("script:pln_b@r3:ss_003:16:9:s1:regen-1");
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "a4", itemIds: ["ss_999"] }))).toBe("unknown_item");
  });

  it("M6: повтор ключа с другими item_ids или regenerate — 422 idempotency_key_reused; тот же запрос — тот же пакет", () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1", itemIds: ["ss_001", "ss_002"] });
    expect(startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1", itemIds: ["ss_002", "ss_001"] }).id).toBe(s.id);
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1", itemIds: ["ss_001"] }))).toBe("idempotency_key_reused");
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1", itemIds: ["ss_001", "ss_002"], regenerate: true }))).toBe("idempotency_key_reused");
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1" }))).toBe("idempotency_key_reused");
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "q1", itemIds: ["ss_001", "ss_002"], aspect: "9:16" }))).toBe("idempotency_key_reused");
  });

  it("правка сцены плана (новая ревизия, другой отпечаток) — сцена ставится заново в ту же сцену Playground", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "m1" });
    startRunner(fakeHandler());
    await runToIdle(s.id);
    const changed = planDoc(4);
    changed.items[2] = { ...changed.items[2]!, idea: "новая идея" };
    publishPlan(changed);
    const b = startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "m2" });
    expect(b.items.map((x) => x.item_id)).toEqual(["ss_003"]);
    expect(b.items[0]!.scene_id).toBe(s.items[2]!.scene_id);
    expect(jobs.get(env.db, b.items[0]!.job!.id)!.idempotency_key).toBe("script:pln_b@r4:ss_003:16:9:s1");
  });

  it("I2: правка плана → пакет → отмена: старая версия сцены остаётся stale, отпечаток не сдвинут постановкой", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "f1" });
    startRunner(fakeHandler());
    await runToIdle(s.id);
    await runner!.stop({ abortRunning: true });
    const changed = planDoc(4);
    changed.items[2] = { ...changed.items[2]!, idea: "новая идея" };
    publishPlan(changed);
    const staleOf = () => scriptState(env.db, env.s.root, P).scenes.find((x) => x.item_id === "ss_003")!.stale;
    expect(staleOf()).toBe(true);
    const b = startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "f2" });
    expect(staleOf()).toBe(true); // задача поставлена, но версия ещё старая
    startRunner(fakeHandler({ hold: new Promise<void>(() => undefined) }));
    await until(() => batchStatus(env.db, env.s.root, b.id).counts.running === 1, "задача в работе", 5_000);
    // повтор пакета на тот же отпечаток — подхват идущей задачи, а не новая
    const again = startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "f3" });
    expect(again.items.map((x) => x.job!.id)).toEqual(b.items.map((x) => x.job!.id));
    await cancelBatch(core(), b.id);
    await runToIdle(b.id);
    expect(batchStatus(env.db, env.s.root, b.id).counts).toMatchObject({ cancelled: 1 });
    expect(staleOf()).toBe(true);
    // после отмены — сцена снова в пакете (не «готова»)
    const retry = startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "f4" });
    expect(retry.items.map((x) => x.item_id)).toEqual(["ss_003"]);
    await runner!.stop({ abortRunning: true });
    startRunner(fakeHandler());
    await runToIdle(retry.id);
    expect(staleOf()).toBe(false);
  });

  it("M7: новая ревизия плана сменила номер и сцену — название «NN · цитата» и brief.json существующей сцены обновлены; откат — brief прежний", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "t1" });
    startRunner(fakeHandler());
    await runToIdle(s.id);
    const sceneOf = (k: number) => s.items[k]!.scene_id;
    const brief = (k: number) => JSON.parse(readFileSync(join(env.s.root, sceneRel(P, sceneOf(k)), "brief.json"), "utf8")) as { prompt: string };
    // r4: ss_001 снята, ss_003 — новая идея → ss_002 стала «01», ss_003 — «02» и в пакете
    const changed = planDoc(4);
    changed.items[0] = { ...changed.items[0]!, status: "rejected" };
    changed.items[2] = { ...changed.items[2]!, idea: "новая идея" };
    publishPlan(changed);
    const blocked = planDoc(5, { items: changed.items, issues: [{ code: "adjacent_technique_repeat", severity: "blocking", message: "x" }] });
    publishPlan(blocked);
    const before = brief(2).prompt;
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 5, idempotencyKey: "t2" }))).toBe("blocking_issues");
    expect(brief(2).prompt).toBe(before);
    expect(scenesRepo.get(env.db, sceneOf(2))!.title).toMatch(/^03 · /);
    publishPlan(planDoc(6, { items: changed.items }));
    const b = startScriptBatch(core(), { projectId: P, revision: 6, idempotencyKey: "t3" });
    expect(b.items.map((x) => x.item_id)).toEqual(["ss_003"]);
    expect(scenesRepo.get(env.db, sceneOf(2))!.title).toMatch(/^02 · /);
    expect(scenesRepo.get(env.db, sceneOf(1))!.title).toMatch(/^01 · /); // готовая сцена — тоже новый номер
    expect(brief(2).prompt).toContain("Сцена 2 из 3");
    expect(brief(2).prompt).toContain("новая идея");
  });

  it("откат транзакции (план с blocking) — 422, каталогов брифов и строк новых сцен нет", () => {
    publishPlan(planDoc(4, { issues: [{ code: "adjacent_technique_repeat", severity: "blocking", message: "соседи одним приёмом" }] }));
    const before = sceneDirs().length;
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "r1" }))).toBe("blocking_issues");
    expect(sceneDirs()).toHaveLength(before);
    expect(scenesRepo.listByProject(env.db, P)).toHaveLength(0);
    expect(scriptScenes.listByPlan(env.db, "pln_b", "16:9")).toHaveLength(0);
    expect(approvals.latestActive(env.db, P, "B")).toBeUndefined();
  });

  it("текст новее плана — plan_outdated; нет принятых сцен — no_items", () => {
    publishPlan(planDoc(4, { inputs: { script: { id: "scr_1", revision: 2, hash: SHA }, style: { id: styleId, revision: 1, hash: SHA } } }));
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 4, idempotencyKey: "o1" }))).toBe("plan_outdated");
    publishPlan(planDoc(5, { items: items().map((x) => ({ ...x, status: "rejected" as const })) }));
    expect(codeOf(() => startScriptBatch(core(), { projectId: P, revision: 5, idempotencyKey: "o2" }))).toBe("no_items");
  });

  it("отмена: 2 running + 2 pending → все 4 cancelled, опубликованные раньше версии на месте", async () => {
    const first = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "c0" });
    startRunner(fakeHandler());
    await runToIdle(first.id);
    await runner!.stop({ abortRunning: true });
    const ready = first.items.map((x) => scenesRepo.get(env.db, x.scene_id)!.current_version_id);

    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "c1", regenerate: true });
    startRunner(fakeHandler({ hold: new Promise<void>(() => undefined) }));
    await until(() => batchStatus(env.db, env.s.root, s.id).counts.running === 2, "две задачи в работе", 5_000);
    expect(batchStatus(env.db, env.s.root, s.id).counts).toMatchObject({ running: 2, pending: 2 });
    await cancelBatch(core(), s.id);
    await runToIdle(s.id);
    expect(batchStatus(env.db, env.s.root, s.id).counts).toMatchObject({ total: 4, cancelled: 4 });
    expect(first.items.map((x) => scenesRepo.get(env.db, x.scene_id)!.current_version_id)).toEqual(ready);
    for (const x of first.items) expect(versions.listByScene(env.db, x.scene_id)).toHaveLength(1);
  });

  it("рестарт посреди пакета: recoverOnStart → все задачи доходят до конечного статуса, версий без дублей", async () => {
    const s = startScriptBatch(core(), { projectId: P, revision: 3, idempotencyKey: "z1" });
    // «сервер умер» после публикации версии, до finish: две задачи running с опубликованной версией
    const gate = deferred();
    const r1 = startRunner(fakeHandler({ afterPublish: gate.promise }), "srv-dead");
    const publishedCount = () => s.items.filter((x) => versions.listByScene(env.db, x.scene_id).length > 0).length;
    await until(() => publishedCount() === 2, "две версии опубликованы", 5_000);
    const dead = r1.stop({ abortRunning: false }); // таймер остановлен, обработчики «зависли» — как у убитого процесса
    runner = undefined;

    const registry = mergeRegistries(new SqliteProcessRegistry(env.db), fileProcessRegistry(env.s.root));
    const rep = await recoverOnStart({ db: env.db, repo, registry, cleanup: false });
    expect(rep.completed).toHaveLength(2);
    startRunner(fakeHandler(), "srv-new");
    await runToIdle(s.id);
    expect(batchStatus(env.db, env.s.root, s.id).counts).toMatchObject({ total: 4, ready: 4 });
    for (const x of s.items) expect(versions.listByScene(env.db, x.scene_id)).toHaveLength(1);
    // «мёртвая» попытка просыпается: её finish отсечён fencing, статусы не меняются
    gate.resolve();
    await dead;
    expect(batchStatus(env.db, env.s.root, s.id).counts).toMatchObject({ total: 4, ready: 4 });
  });
});
