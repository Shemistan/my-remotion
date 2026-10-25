// S10: вертикальные двойники 9:16 — для принятых сцен с готовой и не устаревшей 16:9-версией
// ставятся задачи `playground.generate` с `script.aspect = "9:16"` и `reference_version_id`;
// без готовой 16:9 — `skipped` с причиной. Approval B заново не берётся; план не `outdated`.
// Обработчик — фейк (публикует версию или падает), раннер и очередь — настоящие.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READING, type Fps, type Settings, type ProjectStyleBase, type ScriptPlanRevisionDoc, type ScriptRevisionDoc, type ScriptSceneItem, defaultSettings, quoteOf, readingFrames, tokenizeScript } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenesRepo from "../../src/db/repos/scenes.js";
import { scriptPlans, scriptRevisions, scriptScenes, scripts } from "../../src/db/repos/script.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { batchStatus, recordPublishedFingerprint, startScriptBatch, twinOutdated } from "../../src/script/batch.js";
import * as versionsRepo from "../../src/db/repos/versions.js";
import { scriptBatches } from "../../src/db/repos/script.js";
import { startReframe } from "../../src/script/reframe.js";
import { deleteIntent } from "../../src/projects/delete-intent.js";
import { deleteProject } from "../../src/projects/trash.js";
import { SCRIPT_FILE, SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { scriptState } from "../../src/script/state.js";
import { claimNext, finish } from "../../src/jobs/queue.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

const P = "p_reframe";
const SHA = "a".repeat(64);
const F30: Fps = { num: 30, den: 1 };
const TEXT = "Карта хранит пары ключей. Ключ проходит через хэш. Слот выбирают старшие биты.";
const BASE: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 2, palette_overrides: { bg: "#101418" } };
const TERMINAL = new Set(["completed", "failed", "cancelled", "blocked"]);

let env: JobsEnv;
let repo: SceneRepo;
let store: ArtifactStore;
let runner: JobRunner | undefined;
let fail = new Set<string>();
let script: ScriptRevisionDoc;
let styleId: string;
const core = () => ({ db: env.db, root: env.s.root, processes: fileProcessRegistry(env.s.root) });
async function codeOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return "не бросило";
}

function items(): ScriptSceneItem[] {
  const techniques = ["hero-number", "split-versus", "timeline"] as const;
  return techniques.map((technique, k) => {
    const start = `w_${String(k * 4 + 1).padStart(6, "0")}`;
    const end = `w_${String(k * 4 + 4).padStart(6, "0")}`;
    return {
      id: `ss_00${k + 1}`, status: "accepted", origin: "agent", start_word_id: start, end_word_id: end, quote: quoteOf(script, start, end), block_id: "b1",
      words: 4, at_s: k * 1.6, frames: readingFrames(4 + k, DEFAULT_READING, F30), technique, pattern: "quantities", purpose: `назначение ${k + 1}`, idea: `идея ${k + 1}`,
      key_terms: [], data: [], importance: 2, anchor_ids: [],
    };
  });
}

function planDoc(revision: number, over: Partial<ScriptPlanRevisionDoc> = {}): ScriptPlanRevisionDoc {
  return {
    schema_version: 1, plan_id: "pln_r", revision, ...(revision > 1 ? { parent_revision: revision - 1 } : {}),
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: styleId, revision: 1, hash: SHA } },
    fps: F30, aspect: "16:9", reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    items: items(), skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 }, ...over,
  };
}

function publishPlan(doc: ScriptPlanRevisionDoc): void {
  const rel = `${artifactPaths(env.s.root, P).planRev("pln_r", doc.revision)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(doc));
  scriptPlans.insertRevision(env.db, { doc, rel_path: rel, sha256: SHA });
}

beforeEach(async () => {
  env = await setupDb("ms-script-reframe-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  store = new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard });
  fail = new Set();
  projects.create(env.db, { id: P, kind: "script", title: "Go map", settings: defaultSettings() });
  script = { schema_version: 1, script_id: "scr_1", revision: 1, ...tokenizeScript([{ title: "Блок 1", text: TEXT }]), author: "user" };
  scripts.create(env.db, { id: "scr_1", project_id: P });
  const rel = `${artifactPaths(env.s.root, P).scriptRev("scr_1", 1)}/${SCRIPT_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(script));
  scriptRevisions.insert(env.db, { script_id: "scr_1", revision: 1, rel_path: rel, sha256: SHA, hash: SHA });
  scripts.setCurrent(env.db, "scr_1", 1);
  styleId = (await saveProjectStyle({ db: env.db, store, root: env.s.root }, P, BASE, "user")).style_id;
  scriptPlans.create(env.db, { id: "pln_r", project_id: P });
  publishPlan(planDoc(1));
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

type In = {
  sceneId: string;
  settings: { duration_frames: number; width: number; height: number; safe_area: unknown };
  script: { item_id: string; aspect: string; lead_frames: number; tail_frames: number; reference_version_id?: string };
};

/** Обработчик-фейк: `<item>@<aspect>` из `fail` — failed; иначе публикует версию. */
async function fakeHandler(ctx: JobContext): Promise<HandlerResult> {
  const input = ctx.job.input as In;
  if (fail.has(`${input.script.item_id}@${input.script.aspect}`)) return { status: "failed", error: { code: "pipeline", message: "фейк: генерация не удалась" } };
  const draft = await makeDraft(env.s.root, { runId: ctx.job.id, attempt: ctx.attempt, sceneId: input.sceneId, projectId: P });
  // манифест версии — с настройками задачи (длительность двойника сверяется с эталоном)
  const v = await repo.publish(draft, meta(input.sceneId, { settings: input.settings as unknown as Settings }), { jobId: ctx.job.id, attempt: ctx.attempt });
  recordPublishedFingerprint(env.db, input.sceneId, ctx.job.input);
  return { status: "completed", outputRefs: { version_id: v.versionId } };
}

async function runToIdle(batchId: string): Promise<void> {
  if (!runner) {
    runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": fakeHandler }, pollMs: 5, maxRunning: 2 });
    runner.start();
  }
  await until(() => batchStatus(env.db, env.s.root, batchId).items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "пакет дошёл до конечных статусов", 20_000);
}

const input = (jobId: string) => jobs.get(env.db, jobId)!.input as In;
const current16 = (itemId: string) => scenesRepo.get(env.db, scriptScenes.get(env.db, "pln_r", itemId, "16:9")!.scene_id)!.current_version_id!;

/** 16:9: ss_001 и ss_003 готовы, ss_002 упала. */
async function seed16x9() {
  fail.add("ss_002@16:9");
  const b = startScriptBatch(core(), { projectId: P, revision: 1, idempotencyKey: "g1" });
  await runToIdle(b.id);
  return b;
}

describe("startReframe", () => {
  it("двойники только у готовых 16:9: 1080×1920, длительность и запас эталона, safe area 0,06/0,15, reference_version_id; повтор ключа — тот же пакет", async () => {
    const g = await seed16x9();
    const approvalsBefore = approvals.list(env.db, P, "B").length;
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "r1" });
    expect(r.aspect).toBe("9:16");
    expect(r.items.map((i) => i.item_id)).toEqual(["ss_001", "ss_003"]);
    expect(r.skipped).toEqual([{ item_id: "ss_002", reason: "нет готовой версии 16:9" }]);
    for (const it of r.items) {
      const ref = input(g.items.find((x) => x.item_id === it.item_id)!.job!.id);
      const i = input(it.job!.id);
      expect(i.settings).toMatchObject({ width: 1080, height: 1920, aspect_ratio: "9:16", duration_frames: ref.settings.duration_frames });
      expect(i.settings.safe_area).toEqual({ x: 0.06, y: 0.15 });
      expect(i.script).toMatchObject({ aspect: "9:16", lead_frames: ref.script.lead_frames, tail_frames: ref.script.tail_frames, reference_version_id: current16(it.item_id) });
      expect(jobs.get(env.db, it.job!.id)!.idempotency_key).toBe(`script:pln_r@r1:${it.item_id}:9:16:s1`);
    }
    // двойник — своя сцена Playground и своя строка script_scenes
    expect(scriptScenes.get(env.db, "pln_r", "ss_001", "9:16")!.scene_id).not.toBe(scriptScenes.get(env.db, "pln_r", "ss_001", "16:9")!.scene_id);
    expect(approvals.list(env.db, P, "B")).toHaveLength(approvalsBefore); // Approval B заново не берётся
    expect((await startReframe(core(), { projectId: P, idempotencyKey: "r1" })).id).toBe(r.id);
    expect(await codeOf(() => startReframe(core(), { projectId: P, idempotencyKey: "r1", itemIds: ["ss_001"] }))).toBe("idempotency_key_reused");
    expect(await codeOf(() => startScriptBatch(core(), { projectId: P, revision: 1, idempotencyKey: "r1" }))).toBe("idempotency_key_reused");
  });

  it("готовые двойники не ставятся; упавший двойник — «Повторить» (item_ids) с :try-n; новая 16:9-версия — двойник заново", async () => {
    await seed16x9();
    fail.add("ss_003@9:16");
    const r1 = await startReframe(core(), { projectId: P, idempotencyKey: "r1" });
    await runToIdle(r1.id);
    expect(batchStatus(env.db, env.s.root, r1.id).items.map((x) => [x.item_id, x.status])).toEqual([["ss_001", "ready"], ["ss_003", "failed"]]);

    const again = await startReframe(core(), { projectId: P, idempotencyKey: "r2" });
    expect(again.items.map((x) => x.item_id)).toEqual(["ss_003"]);
    expect(again.skipped).toEqual(expect.arrayContaining([{ item_id: "ss_001", reason: "готовая версия по текущему плану" }]));
    expect(jobs.get(env.db, again.items[0]!.job!.id)!.idempotency_key).toBe("script:pln_r@r1:ss_003:9:16:s1:try-1");
    await runToIdle(again.id);
    expect(again.full).toBe(true);
    const retry = await startReframe(core(), { projectId: P, idempotencyKey: "r2b", itemIds: ["ss_003"] });
    expect(retry.full).toBe(false);
    expect(jobs.get(env.db, retry.items[0]!.job!.id)!.idempotency_key).toBe("script:pln_r@r1:ss_003:9:16:s1:try-2");

    // 16:9 ss_001 перегенерирована — у готового двойника эталон устарел: ставится заново
    const regen = startScriptBatch(core(), { projectId: P, revision: 1, idempotencyKey: "g2", itemIds: ["ss_001"], regenerate: true });
    await runToIdle(regen.id);
    const r3 = await startReframe(core(), { projectId: P, idempotencyKey: "r3", itemIds: ["ss_001"] });
    expect(r3.items.map((x) => x.item_id)).toEqual(["ss_001"]);
    expect(input(r3.items[0]!.job!.id).script.reference_version_id).toBe(current16("ss_001"));
  });

  it("устаревшая 16:9 (сцена плана изменилась) — skipped «версия 16:9 устарела»; неизвестная сцена — unknown_item; текст новее плана — plan_outdated", async () => {
    await seed16x9();
    publishPlan(planDoc(2, { items: items().map((x) => (x.id === "ss_003" ? { ...x, idea: "новая идея" } : x)) }));
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "s1" });
    expect(r.items.map((x) => x.item_id)).toEqual(["ss_001"]);
    expect(r.skipped).toEqual(expect.arrayContaining([{ item_id: "ss_003", reason: "версия 16:9 устарела" }]));
    expect(r.plan_revision).toBe(2);
    expect(await codeOf(() => startReframe(core(), { projectId: P, idempotencyKey: "s2", itemIds: ["ss_404"] }))).toBe("unknown_item");
    publishPlan(planDoc(3, { inputs: { script: { id: "scr_1", revision: 2, hash: SHA }, style: { id: styleId, revision: 1, hash: SHA } } }));
    expect(await codeOf(() => startReframe(core(), { projectId: P, idempotencyKey: "s3" }))).toBe("plan_outdated");
  });

  it("двойник в состоянии сценария: scenes[] с aspect 9:16 рядом с 16:9, пакет 9:16 в batches", async () => {
    await seed16x9();
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "st1" });
    await runToIdle(r.id);
    const st = scriptState(env.db, env.s.root, P);
    expect(st.scenes.filter((x) => x.aspect === "9:16").map((x) => [x.item_id, x.status, x.stale])).toEqual([["ss_001", "ready", false], ["ss_003", "ready", false]]);
    expect(st.batches[0]).toMatchObject({ id: r.id, aspect: "9:16" });
  });

  it("M4/M6: сцена-двойник названа « · 9:16»; длительность двойника = манифесту эталона 16:9", async () => {
    await seed16x9();
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "m1" });
    for (const it of r.items) {
      expect(scenesRepo.get(env.db, it.scene_id)!.title).toMatch(/ · 9:16$/);
      const refManifest = JSON.parse(readFileSync(join(env.s.root, versionsRepo.get(env.db, current16(it.item_id))!.path, "manifest.json"), "utf8")) as { settings: Settings };
      expect(input(it.job!.id).settings.duration_frames).toBe(refManifest.settings.duration_frames);
    }
    // 16:9 без суффикса
    expect(scenesRepo.get(env.db, scriptScenes.get(env.db, "pln_r", "ss_001", "16:9")!.scene_id)!.title).not.toMatch(/9:16/);
  });

  it("I2: нет действующего Approval B на текущую ревизию — reframe проверяет план и утверждает B; r2 с blocking — 422 blocking_issues", async () => {
    await seed16x9();
    publishPlan(planDoc(2, { issues: [{ code: "adjacent_technique_repeat", severity: "blocking", message: "соседи одним приёмом" }] }));
    expect(await codeOf(() => startReframe(core(), { projectId: P, idempotencyKey: "a1" }))).toBe("blocking_issues");
    expect(scriptBatches.listByProject(env.db, P).filter((b) => b.aspect === "9:16")).toHaveLength(0);
    publishPlan(planDoc(3));
    const before = approvals.list(env.db, P, "B").length;
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "a2" });
    expect(r.items.map((x) => x.item_id)).toEqual(["ss_001", "ss_003"]);
    expect(approvals.list(env.db, P, "B")).toHaveLength(before + 1);
    expect(scriptBatches.get(env.db, r.id)!.approval_id).toBe(approvals.list(env.db, P, "B").at(-1)!.id);
    // действующее B есть — новое не создаётся
    const again = await startReframe(core(), { projectId: P, idempotencyKey: "a3", itemIds: ["ss_001"] });
    expect(approvals.list(env.db, P, "B")).toHaveLength(before + 1);
    expect(scriptBatches.get(env.db, again.id)!.approval_id).toBe(scriptBatches.get(env.db, r.id)!.approval_id);
  });

  it("I3: двойник устарел, если его эталон — не текущая 16:9-версия: stale в состоянии, twinOutdated, reframe ставит заново", async () => {
    await seed16x9();
    const r = await startReframe(core(), { projectId: P, idempotencyKey: "t1" });
    await runToIdle(r.id);
    const twin = (id: string) => scenesRepo.get(env.db, scriptScenes.get(env.db, "pln_r", id, "9:16")!.scene_id)!.current_version_id;
    expect(twinOutdated(env.db, "pln_r", "ss_001", twin("ss_001"))).toBe(false);
    const regen = startScriptBatch(core(), { projectId: P, revision: 1, idempotencyKey: "g2", itemIds: ["ss_001"], regenerate: true });
    await runToIdle(regen.id);
    expect(twinOutdated(env.db, "pln_r", "ss_001", twin("ss_001"))).toBe(true);
    expect(twinOutdated(env.db, "pln_r", "ss_003", twin("ss_003"))).toBe(false);
    expect(twinOutdated(env.db, "pln_r", "ss_001", null)).toBe(false); // версии нет — не «устарела»
    const st = scriptState(env.db, env.s.root, P);
    expect(st.scenes.filter((x) => x.aspect === "9:16").map((x) => [x.item_id, x.stale])).toEqual([["ss_001", true], ["ss_003", false]]);
    const r2 = await startReframe(core(), { projectId: P, idempotencyKey: "t2" });
    expect(r2.items.map((x) => x.item_id)).toEqual(["ss_001"]);
  });

  it("I4: задача двойника ещё идёт на старом эталоне — reframe отменяет её и ставит новую со следующим :try-n", async () => {
    await seed16x9();
    await runner!.stop({ abortRunning: true });
    runner = undefined;
    const r1 = await startReframe(core(), { projectId: P, idempotencyKey: "i1", itemIds: ["ss_001"] });
    const old = r1.items[0]!.job!.id;
    expect(jobs.get(env.db, old)!.status).toBe("pending");
    // новая 16:9-версия ss_001 (задача генерации вне раннера)
    const scene16 = scriptScenes.get(env.db, "pln_r", "ss_001", "16:9")!.scene_id;
    const j = jobs.insert(env.db, { id: "job_regen16", type: "playground.generate", project_id: P, scene_id: scene16, input: {}, status: "pending", attempt: 0 });
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([j.id]) })!;
    const draft = await makeDraft(env.s.root, { runId: j.id, attempt: c.attempt, sceneId: scene16, projectId: P });
    const v = await repo.publish(draft, meta(scene16), { jobId: j.id, attempt: c.attempt });
    finish(env.db, j.id, c.attempt, { status: "completed", outputRefs: { version_id: v.versionId } });

    const r2 = await startReframe(core(), { projectId: P, idempotencyKey: "i2", itemIds: ["ss_001"] });
    expect(jobs.get(env.db, old)!.status).toBe("cancelled");
    const fresh = jobs.get(env.db, r2.items[0]!.job!.id)!;
    expect(fresh.id).not.toBe(old);
    expect(fresh.idempotency_key).toBe("script:pln_r@r1:ss_001:9:16:s1:try-1");
    expect(input(fresh.id).script.reference_version_id).toBe(v.versionId);
    expect(scriptScenes.get(env.db, "pln_r", "ss_001", "9:16")!.job_id).toBe(fresh.id);
  });

  it("Task 47: проект ушёл в корзину, пока reframe ждал отмену старого двойника — project_deleted, каталог проекта не пересоздан", async () => {
    await seed16x9();
    await runner!.stop({ abortRunning: true });
    runner = undefined;
    const old = (await startReframe(core(), { projectId: P, idempotencyKey: "d1", itemIds: ["ss_001"] })).items[0]!.job!.id;
    jobs.update(env.db, old, { status: "blocked" });
    const scene16 = scriptScenes.get(env.db, "pln_r", "ss_001", "16:9")!.scene_id;
    const j = jobs.insert(env.db, { id: "job_regen16d", type: "playground.generate", project_id: P, scene_id: scene16, input: {}, status: "pending", attempt: 0 });
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([j.id]) })!;
    const v = await repo.publish(await makeDraft(env.s.root, { runId: j.id, attempt: c.attempt, sceneId: scene16, projectId: P }), meta(scene16), { jobId: j.id, attempt: c.attempt });
    finish(env.db, j.id, c.attempt, { status: "completed", outputRefs: { version_id: v.versionId } });
    // пока cancelJob опрашивает реестр процессов «blocked»-задачи, человек удаляет проект
    const base = fileProcessRegistry(env.s.root);
    const processes = Object.assign(Object.create(base) as typeof base, {
      live: async (q: Parameters<typeof base.live>[0]) => {
        jobs.update(env.db, old, { status: "cancelled" });
        deleteProject({ db: env.db, root: env.s.root }, P, { token: deleteIntent(env.db, env.s.root, P).token, confirm_title: "Go map" });
        return base.live(q);
      },
    });
    expect(await codeOf(() => startReframe({ ...core(), processes }, { projectId: P, idempotencyKey: "d2", itemIds: ["ss_001"] }))).toBe("project_deleted");
    expect(existsSync(join(env.s.root, "workspace/projects", P))).toBe(false);
  });
});
