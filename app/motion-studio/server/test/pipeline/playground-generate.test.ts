// Обработчик playground.generate на раннере задач: фейковые агенты и рендер (кадры — настоящие
// PNG для программного QA), настоящие static check, SceneRepo (fencing), studio.db и журнал.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type QAIssue, defaultSettings } from "@ms/contracts";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { claimNext, enqueue, fenceOk, provideInput, requestCancel } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { JobContext } from "../../src/jobs/types.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { type PlaygroundDeps, playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { stepInputHash } from "../../src/pipeline/checkpoints.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { readVersion } from "../../src/scenes/store.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { removeStore } from "../db/helpers.js";
import { GOOD_SCENE, conceptOutput, contractProps, directorOutput, fakeAgents, fakeKb, fakeRender, makeDeps, makeSkills, view, visualOutput } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-playground-gen-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const settings = defaultSettings();
const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

async function deps(over: Partial<GenerateDeps> = {}): Promise<GenerateDeps> {
  return makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
}

/** Сцена (brief.json + строка), задача, раннер с настоящим обработчиком; ждёт итога. */
async function runJob(over: Partial<GenerateDeps> = {}, input: Record<string, unknown> = {}) {
  const d = await deps(over);
  const scene = repo.createScene("playground", { prompt: "Рост пользователей", settings });
  const handler = playgroundGenerate({ deps: () => d, repo });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "Рост пользователей", settings, ...input }, idempotencyKey: `k-${scene.id}` }).job;
  runner.start();
  await until(() => TERMINAL.includes(jobs.get(env.db, j.id)!.status), "итог задачи", 20_000);
  return { job: jobs.get(env.db, j.id)!, scene, d };
}

const versionRows = (sceneId: string) => versions.listByScene(env.db, sceneId);
const count = (table: string, where = "1=1", ...args: unknown[]) => (env.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get(...args) as { n: number }).n;
const blockingQa = (frames: number[], code = "clipping"): Partial<{ output: ReturnType<typeof visualOutput> }> => ({
  output: visualOutput(frames, undefined, {
    gate: { visual: "fail", semantic: "pass", style: "pass" },
    issues: [{ code, severity: "blocking", frame: frames[0], area: "заголовок", description: "заголовок обрезан левым краем", fix_hint: "сдвинь заголовок внутрь safe area" }],
  }),
});

describe("playgroundGenerate: успех и журнал", () => {
  it("Concept → кандидаты → Director → Engineer → gate → QA → ready; журнал: agent_runs 4, render_jobs, qa_reports 1, component_tests для adapt, сообщение ассистента", async () => {
    const agents = fakeAgents({});
    const { job, scene } = await runJob({ agents });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
    const [v] = versionRows(scene.id);
    expect(v).toMatchObject({ status: "ready", number: 1, created_by_job_id: job.id });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBe(v!.id);
    expect(job.output_refs).toMatchObject({ version_id: v!.id, version_number: 1, qa: { technical: "pass" } });

    const dir = join(env.s.root, v!.path);
    const m = await readVersion(dir);
    expect(m.qa).toMatchObject({ technical: "pass", visual: "pass", semantic: "pass", style: "pass" });
    expect(m.job).toEqual({ id: job.id, attempt: 1 });
    // qa.json, style.json (resolveStyle от props.style), props.json по контракту с props.style из настроек
    const qa = JSON.parse(readFileSync(join(dir, "qa.json"), "utf8"));
    expect(qa.automated).toBe(true);
    const style = JSON.parse(readFileSync(join(dir, "style.json"), "utf8"));
    expect(style.grid.safe_area).toEqual(settings.safe_area);
    const props = JSON.parse(readFileSync(join(dir, "props.json"), "utf8"));
    expect(props.style).toMatchObject({ preset: settings.style_preset, intensity: settings.animation_intensity, transparent: false, safe_area: settings.safe_area });
    // Visual QA: время по часам в pipeline-log.json
    const log = JSON.parse(readFileSync(join(dir, "pipeline-log.json"), "utf8"));
    expect(log.visual_qa).toHaveLength(1);
    expect(typeof log.visual_qa[0].wall_ms).toBe("number");

    expect(count("agent_runs", "job_id = ?", job.id)).toBe(4);
    expect(env.db.prepare("SELECT role FROM agent_runs WHERE job_id = ? ORDER BY started_at, rowid").pluck().all(job.id)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
    expect(count("render_jobs", "job_id = ?", job.id)).toBeGreaterThanOrEqual(1);
    expect(env.db.prepare("SELECT version_id, attempt, technical, visual, report_path FROM qa_reports").all()).toEqual([
      { version_id: v!.id, attempt: 1, technical: "pass", visual: "pass", report_path: `${v!.path}/qa.json` },
    ]);
    // directorOutput: fake/line-chart со стратегией adapt
    expect(env.db.prepare("SELECT kb_id, result, version_id FROM component_tests").all()).toEqual([{ kb_id: "fake/line-chart", result: "rendered-ok", version_id: v!.id }]);
    const msgs = chat.list(env.db, scene.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "assistant", version_id: v!.id, job_id: job.id });
    expect(msgs[0]!.text).toContain("Версия 1 готова");
    expect(msgs[0]!.text).toContain("fake/line-chart");
    expect(msgs[0]!.text).toContain(conceptOutput().concept);
  });

  it("кандидаты Director — по ключам Concept (kb_queries ru/en и паттерны), а не только по запросу", async () => {
    const kb = fakeKb([view(), view({ id: "fake/beam", patterns: ["relationships"] })]);
    const agents = fakeAgents({ concept: async () => ({ output: conceptOutput({ kb_queries: { ru: ["импульс по связи"], en: ["animated beam"] }, patterns: ["relationships"] }) }) });
    const { job } = await runJob({ agents, kb });
    expect(job.status).toBe("completed");
    const queries = kb.searches.map((s) => (s as { query: string }).query);
    expect(queries).toEqual(expect.arrayContaining(["Рост пользователей", "импульс по связи", "animated beam"]));
    expect(kb.searches.some((s) => JSON.stringify((s as { filters?: unknown }).filters).includes("relationships"))).toBe(true);
    const director = agents.tasks.find((t) => t.role === "motion_director")!;
    expect(String(director.input)).toContain("fake/beam");
    expect(String(director.input)).toContain(conceptOutput().concept.slice(0, 10));
  });

  it("чекпоинт Director — logs/agent-runs/<jobId>/checkpoints/motion_director.json, путь — в output_refs.steps.director.path", async () => {
    const { job } = await runJob();
    const steps = (job.output_refs as { steps: Record<string, { path: string; input_hash: string }> }).steps;
    expect(steps.director!.path).toBe(join(env.s.root, "logs/agent-runs", job.id, "checkpoints", "motion_director.json"));
    expect(steps.concept!.path).toBe(join(env.s.root, "logs/agent-runs", job.id, "checkpoints", "concept.json"));
    expect(JSON.parse(readFileSync(steps.director!.path, "utf8")).input_hash).toBe(steps.director!.input_hash);
  });

  it("чекпоинт Director — принятый ответ (после проверки spec), ключ — вход первого раунда", async () => {
    let n = 0;
    const overlapping = () => {
      const o = directorOutput();
      o.spec.title = "раунд 1";
      o.spec.elements[0]!.layout = { x: 0, y: 0, w: 0.5, h: 0.5 };
      o.spec.elements[1]!.layout = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
      return o;
    };
    const agents = fakeAgents({ director: async () => (++n === 1 ? { output: overlapping() } : {}) });
    const { job } = await runJob({ agents });
    expect(job.status).toBe("completed");
    expect(n).toBe(2);
    const steps = (job.output_refs as { steps: Record<string, { path: string; input_hash: string }> }).steps;
    const saved = JSON.parse(readFileSync(steps.director!.path, "utf8"));
    expect(saved.output.spec.title).toBe("Рост пользователей");
    const first = agents.tasks.find((t) => t.role === "motion_director")!;
    expect(saved.input_hash).toBe(stepInputHash("motion_director", first.model, first.input));
    expect(steps.director!.input_hash).toBe(saved.input_hash);
  });
});

describe("playgroundGenerate: Visual QA видит камеру", () => {
  it("ключи камеры spec — в brief.json Visual QA и в чек-листе: зум — не скачок раскладки", async () => {
    const camera = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 179, scale: 1.06, x: 120, y: -40 }];
    const agents = fakeAgents({ director: async () => ({ output: { ...directorOutput(), spec: { ...directorOutput().spec, camera } } }) });
    const { job } = await runJob({ agents });
    expect(job.status).toBe("completed");
    const qa = agents.tasks.find((t) => t.role === "visual_qa")!;
    const brief = JSON.parse(readFileSync(join(qa.workdir, "brief.json"), "utf8"));
    expect(brief.prompt).toBe("Рост пользователей");
    expect(brief.camera.keys).toEqual(camera);
    expect(brief.camera.note).toMatch(/камер/);
    expect(readFileSync(join(qa.workdir, "checklist.md"), "utf8")).toMatch(/brief\.json.*camera[^]*не скачок раскладки/);
  });
});

describe("playgroundGenerate: неудачи по этапам", () => {
  it("Concept вернул невалидный ответ → failed, failure.stage concept; Director не вызван", async () => {
    const agents = fakeAgents({ concept: async () => ({ status: "failed", output: undefined, error: { kind: "schema", message: "structured_output не прошёл схему" } }) });
    const { job } = await runJob({ agents });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline", stage: "concept" });
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept"]);
  });

  it("QA blocking после 2 исправлений → failed, failure.stage qa; версия failed с qa.json, не current", async () => {
    const agents = fakeAgents({ visualQa: async (frames) => blockingQa(frames) });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ stage: "qa" });
    expect(agents.engineerCalls).toHaveLength(3);
    // замечание QA ушло Engineer подсказкой (кадр, область, что поменять)
    expect(agents.engineerCalls[1]!.input).toContain("clipping");
    expect(agents.engineerCalls[1]!.input).toContain("сдвинь заголовок внутрь safe area");
    const [v] = versionRows(scene.id);
    expect(v).toMatchObject({ status: "failed" });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBeNull();
    expect(existsSync(join(env.s.root, v!.path, "qa.json"))).toBe(true);
    expect((await readVersion(join(env.s.root, v!.path))).qa?.visual).toBe("fail");
    expect(env.db.prepare("SELECT kb_id, result FROM component_tests").all()).toEqual([{ kb_id: "fake/line-chart", result: "rendered-fail" }]);
  });

  it("технический gate 1 раз fail + QA 1 раз blocking → Engineer вызван 3 раза, версия ready", async () => {
    let typechecks = 0;
    const typecheck = async () => (++typechecks === 1 ? [{ file: "src/Scene.tsx", line: 3, message: "TS2322: тип" }] : []);
    const agents = fakeAgents({ visualQa: async (frames, _spec, n) => (n === 1 ? blockingQa(frames) : {}) });
    const { job, scene } = await runJob({ agents, typecheck });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(3);
    expect(agents.engineerCalls[1]!.input).toContain("TS2322");
    expect(agents.engineerCalls[2]!.input).toContain("clipping");
    expect(versionRows(scene.id)[0]).toMatchObject({ status: "ready" });
    expect(count("qa_reports")).toBe(1);
  });

  it("технический gate fail × 3 → Engineer 3 вызова, версия failed, не current", async () => {
    const typecheck = async () => [{ file: "src/Scene.tsx", line: 1, message: "TS2322" }];
    const agents = fakeAgents({});
    const { job, scene } = await runJob({ agents, typecheck });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ stage: "typecheck" });
    expect(agents.engineerCalls).toHaveLength(3);
    expect(agents.tasks.some((t) => t.role === "visual_qa")).toBe(false);
    expect(versionRows(scene.id)[0]).toMatchObject({ status: "failed" });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBeNull();
  });

  it("только warnings QA — исправления нет: Engineer 1 вызов, ready, warnings в qa.json", async () => {
    const warn: Omit<QAIssue, "source"> = { code: "rhythm", severity: "warning", frame: 30, area: "график", description: "акцент мог бы быть ярче", fix_hint: "усиль удар" };
    const agents = fakeAgents({ visualQa: async (frames) => ({ output: visualOutput(frames, undefined, { gate: { visual: "warn", semantic: "pass", style: "pass" }, issues: [warn] }) }) });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(1);
    const qa = JSON.parse(readFileSync(join(env.s.root, versionRows(scene.id)[0]!.path, "qa.json"), "utf8"));
    expect(qa.issues).toContainEqual(expect.objectContaining({ code: "rhythm", severity: "warning", source: "agent" }));
  });

  it("props.timing.duration_frames 180 при settings.duration_frames 240 → blocking props_settings_mismatch → исправление", async () => {
    const long = { ...settings, duration_frames: 240 };
    const out = directorOutput();
    out.spec = { ...out.spec, duration_frames: 240, beats: out.spec.beats.map((b) => (b.id === "b4" ? { ...b, end_frame: 240 } : b)) };
    const agents = fakeAgents({
      director: async () => ({ output: out }),
      engineer: async (task, n) => ({ files: { "src/Scene.tsx": GOOD_SCENE, "props.json": await contractProps(task.workdir, n === 1 ? { duration_frames: 180 } : {}) } }),
    });
    const { job } = await runJob({ agents }, { settings: long });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(agents.engineerCalls[1]!.input).toContain("props_settings_mismatch");
    expect(agents.engineerCalls[1]!.input).toContain("props.timing.duration_frames 180 ≠ settings.duration_frames 240");
  });

  it("Engineer использует kb_id вне knowledge-refs → blocking provenance → исправление", async () => {
    const agents = fakeAgents({
      engineer: async (task, n) => ({
        files: { "src/Scene.tsx": GOOD_SCENE, "props.json": await contractProps(task.workdir) },
        output: { files_written: ["src/Scene.tsx", "props.json"], kit_components_used: [], kb_ids_used: n === 1 ? ["magicui/animated-beam"] : ["fake/line-chart"], notes: "" },
      }),
    });
    const { job } = await runJob({ agents });
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(agents.engineerCalls[1]!.input).toContain("provenance");
    expect(agents.engineerCalls[1]!.input).toContain("magicui/animated-beam");
  });

  it("бюджет: Concept 0.5 + Director 2 + Engineer 2 + QA 0.6 = 5.1 → следующий вызов не делается, failure.stage budget", async () => {
    const agents = fakeAgents({ costs: { concept: 0.5, motion_director: 2, engineer: 2, visual_qa: 0.6 }, visualQa: async (frames) => blockingQa(frames) });
    const { job } = await runJob({ agents });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "budget", stage: "budget" });
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
    expect(job.error!.message).toContain("5.10");
  });

  it("бюджет кончился до Director: рабочий каталог Director не создаётся (run/agent-cwd пуст)", async () => {
    const agents = fakeAgents({ costs: { concept: 5 } });
    const { job } = await runJob({ agents });
    expect(job.error).toMatchObject({ stage: "budget" });
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept"]);
    const cwd = join(env.s.root, "run/agent-cwd");
    expect(existsSync(cwd) ? readdirSync(cwd) : []).toEqual([]);
  });

  // ruling P5: QA по реальным кадрам обязателен — без Visual QA версия не ready
  it("бюджет кончился до Visual QA: 0.5 + 2 + 2.6 = 5.1 → failed, stage budget; Visual QA не вызван; версия failed опубликована", async () => {
    const agents = fakeAgents({ costs: { concept: 0.5, motion_director: 2, engineer: 2.6 } });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "budget", stage: "budget" });
    expect(job.error!.message).toContain("Visual QA");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer"]);
    const [v, ...rest] = versionRows(scene.id);
    expect(rest).toEqual([]);
    expect(v).toMatchObject({ status: "failed" });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBeNull();
    // программные проверки прошли до бюджета — qa.json опубликован, семантика не проверена
    expect((await readVersion(join(env.s.root, v!.path))).qa?.semantic).toBe("not_checked");
  });

  it("Visual QA не дал оценки дважды → failed, stage qa; Engineer 1 вызов, версия failed", async () => {
    const agents = fakeAgents({ visualQa: async () => ({ status: "failed", output: undefined, error: { kind: "cli", message: "claude упал" } }) });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline", stage: "qa" });
    expect(job.error!.message).toContain("claude упал");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa", "visual_qa"]);
    expect(versionRows(scene.id)).toEqual([expect.objectContaining({ status: "failed" })]);
  });

  it("Visual QA сбой один раз, затем оценка → ready, повтор без исправления Engineer", async () => {
    const agents = fakeAgents({ visualQa: async (_f, _s, n) => (n === 1 ? { status: "timeout", output: undefined, error: { kind: "timeout", message: "долго" } } : {}) });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa", "visual_qa"]);
    expect(versionRows(scene.id)).toEqual([expect.objectContaining({ status: "ready" })]);
  });
});

describe("playgroundGenerate: уточнения", () => {
  it("Concept просит уточнение → awaiting_input, вопрос в чате; provideInput(skip) → pending → completed", async () => {
    const q = { question: "За какой период рост?", default_if_skipped: "три года" };
    const agents = fakeAgents({ concept: async (n) => (n === 1 ? { output: conceptOutput({ needs_clarification: [q] }) } : {}) });
    const { job, scene } = await runJob({ agents });
    expect(job.status).toBe("awaiting_input");
    expect(job.output_refs).toEqual({ questions: [q] });
    expect(chat.list(env.db, scene.id)).toEqual([expect.objectContaining({ role: "system", text: expect.stringContaining("За какой период рост?"), job_id: job.id })]);
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept"]);
    expect(provideInput(env.db, job.id, "skip").status).toBe("pending");
    await until(() => jobs.get(env.db, job.id)!.status === "completed", "completed", 20_000);
    const concepts = agents.tasks.filter((t) => t.role === "concept");
    expect(concepts).toHaveLength(2);
    expect(String(concepts[1]!.input)).toContain("Ответы пользователя");
    expect(versionRows(scene.id)).toHaveLength(1);
  });
});

describe("playgroundGenerate: попытки, fencing, отмена", () => {
  /** Контекст попытки без раннера: задача захвачена `claimNext`, семафоры свои. */
  function ctxOf(attempt: number, signal = new AbortController().signal): JobContext {
    const job = jobs.get(env.db, jobIdRef.id)!;
    return {
      db: env.db, job, attempt, signal,
      run: { root: env.s.root, runId: job.id, attempt, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
      emit: () => undefined, progress: () => undefined, fenceOk: () => fenceOk(env.db, job.id, attempt),
      agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
    };
  }
  const jobIdRef = { id: "" };
  async function enqueueOnly() {
    const scene = repo.createScene("playground", { prompt: "Рост", settings });
    const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "Рост", settings }, idempotencyKey: `k-${scene.id}` }).job;
    jobIdRef.id = j.id;
    return { scene, job: j };
  }

  it("чекпоинт: попытка прервана после Director → новая попытка: Concept и Director не вызываются, Engineer вызывается", async () => {
    const { scene } = await enqueueOnly();
    const ac = new AbortController();
    const agents1 = fakeAgents({ engineer: async () => (ac.abort(), { status: "cancelled" }) });
    const h1 = playgroundGenerate({ deps: () => ({ ...d1 }), repo });
    const d1 = await deps({ agents: agents1 });
    const c1 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const r1 = await h1(ctxOf(c1.attempt, ac.signal));
    // остановка, не отмена: итог не пишется, draft попытки в карантин «interrupted»
    expect(r1.status).toBe("failed");
    expect(JSON.parse(readFileSync(join(env.s.root, "workspace/drafts", `${jobIdRef.id}-a1`, ".quarantined"), "utf8")).reason).toMatch(/^interrupted/);
    // восстановление вернуло задачу в очередь
    jobs.update(env.db, jobIdRef.id, { status: "pending", lease_owner: null, lease_until: null });
    const agents2 = fakeAgents({});
    const d2 = await deps({ agents: agents2 });
    const c2 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    expect(c2.attempt).toBe(2);
    const r2 = await playgroundGenerate({ deps: () => d2, repo })(ctxOf(2));
    expect(r2.status).toBe("completed");
    expect(agents1.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer"]);
    expect(agents2.tasks.map((t) => t.role)).toEqual(["engineer", "visual_qa"]);
    expect(versionRows(scene.id)).toHaveLength(1);
  });

  it("устаревшая попытка (1) публикует после захвата попыткой 2 → fenced_out, версий 0, draft в карантине fenced_out (один раз)", async () => {
    const { scene } = await enqueueOnly();
    const c1 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    // во время Engineer попытки 1 задача захвачена заново (lease истёк, восстановление)
    const agents = fakeAgents({
      engineer: async (task) => {
        jobs.update(env.db, jobIdRef.id, { status: "pending" });
        claimNext(env.db, "srv-2", Date.now(), { running: 0, maxRunning: 2 });
        return { files: { "src/Scene.tsx": GOOD_SCENE, "props.json": await contractProps(task.workdir) } };
      },
    });
    const d = await deps({ agents });
    const ctx = ctxOf(c1.attempt);
    // fenceOk попытки 1 до публикации прячем: так проверяется отказ внутри SceneRepo.publish
    const r = await playgroundGenerate({ deps: () => d, repo })({ ...ctx, fenceOk: () => true });
    expect(r).toMatchObject({ status: "failed", error: { stage: "fenced_out" } });
    expect(versionRows(scene.id)).toHaveLength(0);
    const marker = JSON.parse(readFileSync(join(env.s.root, "workspace/drafts", `${jobIdRef.id}-a1`, ".quarantined"), "utf8"));
    expect(marker.reason).toMatch(/^fenced_out/);
    expect(jobs.get(env.db, jobIdRef.id)!.attempt).toBe(2);
    expect(count("agent_runs")).toBe(0); // журнал устаревшей попытки не пишется
  });

  it("устаревшая попытка без подмены fenceOk: отказ проверкой перед публикацией (generate.ts), версий 0, карантин fenced_out", async () => {
    const { scene } = await enqueueOnly();
    const c1 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const agents = fakeAgents({
      engineer: async (task) => {
        jobs.update(env.db, jobIdRef.id, { status: "pending" });
        claimNext(env.db, "srv-2", Date.now(), { running: 0, maxRunning: 2 });
        return { files: { "src/Scene.tsx": GOOD_SCENE, "props.json": await contractProps(task.workdir) } };
      },
    });
    const d = await deps({ agents });
    const r = await playgroundGenerate({ deps: () => d, repo })(ctxOf(c1.attempt));
    expect(r).toMatchObject({ status: "failed", error: { stage: "fenced_out" } });
    expect(versionRows(scene.id)).toHaveLength(0);
    const marker = JSON.parse(readFileSync(join(env.s.root, "workspace/drafts", `${jobIdRef.id}-a1`, ".quarantined"), "utf8"));
    // текст проверки generate.ts, а не отказа SceneRepo.publish («устарела»)
    expect(marker.reason).toMatch(/^fenced_out: попытка 1 .* больше не текущая/);
  });

  it("остановка (не отмена, не fencing) перед публикацией → карантин interrupted, cleanupDrafts его убирает", async () => {
    const { scene } = await enqueueOnly();
    const c1 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
    const ac = new AbortController();
    const d = await deps({ agents: fakeAgents({}) });
    const ctx = ctxOf(c1.attempt, ac.signal);
    // сигнал попытки прерван ровно перед публикацией: задача текущая, отмены нет
    const r = await playgroundGenerate({ deps: () => d, repo })({ ...ctx, progress: (_p, stage) => stage === "publish" && ac.abort() });
    expect(r).toMatchObject({ status: "failed", error: { stage: "interrupted", code: "interrupted" } });
    expect(versionRows(scene.id)).toHaveLength(0);
    const marker = JSON.parse(readFileSync(join(env.s.root, "workspace/drafts", `${jobIdRef.id}-a1`, ".quarantined"), "utf8"));
    expect(marker.reason).toMatch(/^interrupted:/);
    jobs.update(env.db, jobIdRef.id, { status: "failed", lease_owner: null, lease_until: null });
    expect((await repo.cleanupDrafts([])).removed).toHaveLength(1);
  });

  for (const role of ["concept", "motion_director"] as const) {
    it(`отмена во время ${role}: дальше агенты не зовутся, draft не создан, задача cancelled, рабочий каталог агента убран`, async () => {
      const { scene } = await enqueueOnly();
      const c1 = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 2 })!;
      const ac = new AbortController();
      const cancel = async () => {
        requestCancel(env.db, jobIdRef.id);
        ac.abort();
        return { status: "cancelled" as const, output: undefined };
      };
      const agents = fakeAgents(role === "concept" ? { concept: cancel } : { director: cancel });
      const d = await deps({ agents });
      const r = await playgroundGenerate({ deps: () => d, repo })(ctxOf(c1.attempt, ac.signal));
      expect(r).toMatchObject({ status: "cancelled", error: { stage: "cancelled" } });
      expect(agents.tasks.map((t) => t.role)).toEqual(role === "concept" ? ["concept"] : ["concept", "motion_director"]);
      expect(existsSync(join(env.s.root, "workspace/drafts")) ? readdirSync(join(env.s.root, "workspace/drafts")) : []).toEqual([]);
      expect(versionRows(scene.id)).toHaveLength(0);
      const cwd = join(env.s.root, "run/agent-cwd");
      expect(existsSync(cwd) ? readdirSync(cwd) : []).toEqual([]);
    });
  }

  it("отмена во время рендера: версия не публикуется, draft — карантин cancelled, задача cancelled", async () => {
    const d = await deps({
      render: fakeRender({
        png: true,
        onCall: async () => {
          requestCancel(env.db, jobIdRef.id);
          await until(() => false, "отмена", 300).catch(() => undefined);
          return undefined;
        },
      }).render,
    });
    const scene = repo.createScene("playground", { prompt: "Рост", settings });
    runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }) }, pollMs: 5, heartbeatMs: 20 });
    const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "Рост", settings }, idempotencyKey: "cancel" }).job;
    jobIdRef.id = j.id;
    runner.start();
    await until(() => jobs.get(env.db, j.id)!.status === "cancelled", "cancelled", 20_000);
    expect(versionRows(scene.id)).toHaveLength(0);
    const drafts = readdirSync(join(env.s.root, "workspace/drafts"));
    expect(drafts).toEqual([`${j.id}-a1`]);
    expect(JSON.parse(readFileSync(join(env.s.root, "workspace/drafts", drafts[0]!, ".quarantined"), "utf8")).reason).toMatch(/^cancelled/);
    // одноразовый карантин: cleanupDrafts уберёт
    expect((await repo.cleanupDrafts([])).removed).toHaveLength(1);
  });
});

describe("PlaygroundDeps", () => {
  it("тип зависимостей не требует подмены publish: её делает обработчик через SceneRepo", () => {
    const d: PlaygroundDeps = { deps: () => ({}) as never, repo };
    expect(typeof playgroundGenerate(d)).toBe("function");
  });
});
