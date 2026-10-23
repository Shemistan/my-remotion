// S5: попытки хранятся с оценкой, публикуется лучшая; после исчерпания исправлений — лучшая
// с qa.visual = warn вместо failed; второй дубль (revise | fresh) при overall < порога —
// параллельно с исправлениями первого. Обработчик playground.generate на раннере задач с
// фейковыми агентами и рендером (кадры — настоящие PNG для программного QA).
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MotionSpec, defaultSettings } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { AgentResult, AgentTask } from "../../src/agents/runtime.js";
import type { GenerateDeps, GenerateResult } from "../../src/pipeline/generate.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { readVersion } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { GOOD_SCENE, fakeAgents, fakeRender, makeDeps, makeSkills, scores, visualOutput } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-best-attempt-");
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

/** Сцена с меткой: по ней видно, чья попытка опубликована. */
const scene = (tag: string) => `${GOOD_SCENE}// ${tag}\n`;

async function runJob(over: Partial<GenerateDeps> = {}, mode?: "revise" | "fresh" | "off") {
  const d = await makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
  if (mode) d.config = { ...d.config, scene: { ...d.config.scene, secondTake: { ...d.config.scene.secondTake, mode } } };
  const sc = repo.createScene("playground", { prompt: "Рост пользователей", settings });
  let res: GenerateResult | undefined;
  const handler = playgroundGenerate({ deps: () => d, repo, onResult: (_j, r) => (res = r) });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5, agentCalls: 4, renders: 2 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: sc.id, input: { sceneId: sc.id, prompt: "Рост пользователей", settings }, idempotencyKey: `k-${sc.id}` }).job;
  runner.start();
  await until(() => TERMINAL.includes(jobs.get(env.db, j.id)!.status), "итог задачи", 25_000);
  const [v] = versions.listByScene(env.db, sc.id);
  const dir = v ? join(env.s.root, v.path) : undefined;
  return { job: jobs.get(env.db, j.id)!, v, dir, res: res! };
}

const blocking = (code = "clipping") => ({ code, severity: "blocking" as const, frame: 30, area: "заголовок", description: "заголовок обрезан", fix_hint: "сдвинь заголовок" });
/** Visual QA по вызову n: оценка overall и (по желанию) blocking. */
const qaBy = (plan: Record<number, { overall: number; block?: boolean; notes?: boolean; semantic?: boolean }>) =>
  async (frames: number[], spec: MotionSpec | undefined, n: number) => {
    const p = plan[n] ?? { overall: 7 };
    return {
      output: visualOutput(frames, spec, {
        gate: { visual: p.block ? "fail" : "pass", semantic: p.semantic ? "fail" : "pass", style: "pass" },
        issues: [...(p.block ? [blocking()] : []), ...(p.semantic ? [{ ...blocking("wrong_number"), description: "на кадре 12%, в запросе 21%" }] : [])],
        scores: scores(p.overall, { hold: p.overall - 1, entrance: p.overall - 0.5, legibility: p.overall + 1 }),
        score_notes: p.notes ? [{ axis: "hold", frame: frames.at(-1)!, note: "финал стоит" }, { axis: "entrance", frame: frames[0]!, note: "кадр 0 пуст" }] : [],
      }),
    };
  };
const log = (dir: string) => JSON.parse(readFileSync(join(dir, "pipeline-log.json"), "utf8"));
const qaOf = (dir: string) => JSON.parse(readFileSync(join(dir, "qa.json"), "utf8"));

describe("S5: лучшая попытка после исчерпания исправлений", () => {
  it("blocking × 3 → ready с лучшей по оценке попыткой (вызов 2), qa.visual warn, blocking → warning", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 7, block: true }, 2: { overall: 7.5, block: true }, 3: { overall: 6.5, block: true } }),
    });
    const { job, v, dir, res } = await runJob({ agents });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(3);
    expect(v).toMatchObject({ status: "ready" });
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 2");
    const qa = qaOf(dir!);
    expect(qa.gate).toMatchObject({ technical: "pass", visual: "warn" });
    expect(qa.scores.overall).toBe(7.5);
    expect(qa.issues.filter((i: { severity: string }) => i.severity === "blocking")).toEqual([]);
    expect(qa.issues).toContainEqual(expect.objectContaining({ code: "clipping", severity: "warning" }));
    expect((await readVersion(dir!)).qa).toMatchObject({ visual: "warn" });
    // каждая попытка — с оценкой; опубликована вторая
    expect(log(dir!).attempts.map((a: { n: number; overall: number; published: boolean }) => [a.n, a.overall, a.published])).toEqual([[1, 7, false], [2, 7.5, true], [3, 6.5, false]]);
    expect(res.attempts?.find((a) => a.published)?.n).toBe(2);
  });

  it("rulings 2026-10-23: попытка 1 blocking 8, попытка 2 чистая 6.5 → публикуется чистая попытка 2 (blocking не выигрывает оценкой)", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 8, block: true }, 2: { overall: 6.5 } }),
    });
    const { job, dir } = await runJob({ agents }, "off");
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 2");
    expect(qaOf(dir!).scores.overall).toBe(6.5);
    expect(qaOf(dir!).gate.visual).toBe("pass");
  });

  it("rulings 2026-10-23: semantic fail не переводится в warn — версия failed, даже когда исправления кончились", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 7, semantic: true }, 2: { overall: 7.5, semantic: true }, 3: { overall: 6, semantic: true } }),
    });
    const { job, v, dir } = await runJob({ agents }, "off");
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ stage: "qa" });
    expect(v).toMatchObject({ status: "failed" });
    const qa = qaOf(dir!);
    expect(qa.gate.semantic).toBe("fail");
    expect(qa.issues).toContainEqual(expect.objectContaining({ code: "wrong_number", severity: "blocking" }));
  });

  it("rulings 2026-10-23: среди попыток с blocking попытка только с visual blocking выигрывает у semantic fail с большей оценкой", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 8, semantic: true }, 2: { overall: 6, block: true }, 3: { overall: 7.5, semantic: true } }),
    });
    const { job, v, dir } = await runJob({ agents }, "off");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(v).toMatchObject({ status: "ready" });
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 2");
    expect(qaOf(dir!).gate).toMatchObject({ visual: "warn", semantic: "pass" });
  });

  it("равные оценки — чистая попытка выигрывает у blocking", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 7, block: true }, 2: { overall: 7 } }),
    });
    const { dir } = await runJob({ agents }, "off");
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 2");
    expect(qaOf(dir!).gate.visual).toBe("pass");
  });

  it("бюджет кончился после оценённой попытки → лучшая опубликована (warn), новых вызовов нет", async () => {
    const agents = fakeAgents({ costs: { concept: 0.5, motion_director: 2, engineer: 2, visual_qa: 0.6 }, visualQa: qaBy({ 1: { overall: 7, block: true } }) });
    const { job, v, dir } = await runJob({ agents });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
    expect(v).toMatchObject({ status: "ready" });
    expect(qaOf(dir!).gate.visual).toBe("warn");
    expect(qaOf(dir!).issues.find((i: { code: string }) => i.code === "clipping").description).toContain("бюджет");
  });

  it("технический gate не пройден ни разу → failed, как раньше (попыток с оценкой нет)", async () => {
    const typecheck = async () => [{ file: "src/Scene.tsx", line: 1, message: "TS2322" }];
    const { job } = await runJob({ typecheck, agents: fakeAgents({}) });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ stage: "typecheck" });
  });
});

describe("S5: missing_element против реестра раскладки", () => {
  it("Visual QA не нашёл заголовок, проба видит его текст в бите → warning, сцена ready с первого вызова", async () => {
    const probe = (frame: number) => `[log] [motion-kit:layout] ${JSON.stringify({ frame, height: 540, items: [{ id: "scene#0", role: "scene", text: "Рост", rect: { x: 100, y: 100, w: 200, h: 40 }, fontPx: 40, opacity: 1 }], ghosts: [], holds: [] })}`;
    const base = fakeRender({ png: true });
    const render = (async (req: Parameters<GenerateDeps["render"]>[0], sig?: AbortSignal) => {
      const r = await base.render(req, sig);
      return { ...r, browserLogs: req.stills.filter((f) => f < 40).map(probe) };
    }) as unknown as GenerateDeps["render"];
    const agents = fakeAgents({
      visualQa: async (frames, spec) => ({ output: visualOutput(frames, spec, { elements_seen: (spec?.elements ?? []).map((e) => ({ id: e.id, frame: frames[0], seen: e.id !== "title" })) }) }),
    });
    const { job, dir } = await runJob({ agents, render });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(1);
    expect(qaOf(dir!).issues).toContainEqual(expect.objectContaining({ code: "missing_element", severity: "warning", area: "title" }));
  });
});

describe("S5: второй дубль", () => {
  it("revise: первая попытка чистая, overall 5.5 < 6.5 → дубль дорабатывает её по трём слабым осям в своём каталоге; лучше — публикуется", async () => {
    const agents = fakeAgents({
      engineer: async (t, n) => ({ files: { "src/Scene.tsx": scene(n === 1 ? "take 1" : `take 2 from ${existsSync(join(t.workdir, "src", "Scene.tsx")) && readFileSync(join(t.workdir, "src", "Scene.tsx"), "utf8").includes("take 1") ? "take 1" : "?"}`) } }),
      visualQa: qaBy({ 1: { overall: 5.5, notes: true }, 2: { overall: 7 } }),
    });
    const { job, dir, res } = await runJob({ agents }, "revise");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    const [c1, c2] = agents.engineerCalls;
    expect(c2!.workdir).not.toBe(c1!.workdir);
    expect(relative(env.s.root, c2!.workdir)).toMatch(/^run\/tmp\/.+-a1\/take2$/);
    expect(c2!.input).toContain("Второй дубль");
    expect(c2!.input).toContain("hold");
    expect(c2!.input).toContain("финал стоит");
    // три слабейшие оси: hold 4.5, entrance 5, затем ось 5.5
    expect(c2!.input.indexOf("hold")).toBeLessThan(c2!.input.indexOf("entrance"));
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("take 2 from take 1");
    expect(qaOf(dir!).scores.overall).toBe(7);
    expect(res.attempts?.map((a) => [a.take, a.overall, a.published])).toEqual([[1, 5.5, false], [2, 7, true]]);
    // снимки попыток и каталог второго дубля после публикации убраны (хранилище на SSD не копит их)
    const runTmp = join(env.s.root, "run", "tmp", `${res.runId}-a1`);
    expect(existsSync(join(runTmp, "attempts"))).toBe(false);
    expect(existsSync(join(runTmp, "take2"))).toBe(false);
  });

  it("дубль хуже первой попытки → публикуется первая (оценка не падает)", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 6 }, 2: { overall: 5 } }),
    });
    const { job, dir } = await runJob({ agents }, "revise");
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 1");
  });

  it("overall ≥ 6.5 или режим off — второго дубля нет", async () => {
    const a1 = fakeAgents({ visualQa: qaBy({ 1: { overall: 6.5 } }) });
    await runJob({ agents: a1 }, "revise");
    expect(a1.engineerCalls).toHaveLength(1);
  });

  it("бюджет не позволяет (потрачено + цена первой попытки > лимита) — дубля нет", async () => {
    const agents = fakeAgents({ costs: { concept: 0.5, motion_director: 1.5, engineer: 1.5, visual_qa: 0.3 }, visualQa: qaBy({ 1: { overall: 5 } }) });
    const { job } = await runJob({ agents }, "revise");
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(1);
  });

  it("fresh: дубль с другим кадрированием (archetype) с нуля; выиграл — в версии его spec", async () => {
    const agents = fakeAgents({
      engineer: async (t, n) => ({ files: { "src/Scene.tsx": scene(n === 1 ? "take 1" : `fresh ${existsSync(join(t.workdir, "src", "Scene.tsx")) ? "dirty" : "clean"}`) } }),
      visualQa: qaBy({ 1: { overall: 5 }, 2: { overall: 6.5 } }),
    });
    const { job, dir } = await runJob({ agents }, "fresh");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const c2 = agents.engineerCalls[1]!;
    expect(c2.input).toContain("кадрирование");
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("fresh clean");
    const spec = JSON.parse(readFileSync(join(dir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.composition?.archetype).not.toBe("split");
  });

  it("параллельно: первая попытка blocking и 5.0 → дубль идёт, пока первый дубль исправляется", async () => {
    let take2Started = false;
    let overlapped = false;
    const agents = fakeAgents({
      engineer: async (t, n) => {
        if (t.workdir.endsWith("take2")) take2Started = true;
        else if (n > 1) {
          // исправление первого дубля ждёт старта второго (до 3 с): последовательный код его не дождётся
          for (let k = 0; k < 60 && !take2Started; k++) await new Promise((r) => setTimeout(r, 50));
          overlapped = take2Started;
        }
        return { files: { "src/Scene.tsx": scene(`call ${n}`) } };
      },
      visualQa: async (frames, spec, n) => qaBy({ 1: { overall: 5, block: true } })(frames, spec, n === 1 ? 1 : 99),
    });
    const { job } = await runJob({ agents }, "revise");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(overlapped).toBe(true);
  });
});

/** fakeAgents с доступом к сигналу вызова: `hook` перехватывает вызов (undefined — обычный ответ). */
function withSignal(
  base: ReturnType<typeof fakeAgents>,
  hook: (task: AgentTask<unknown>, sig: AbortSignal) => Promise<AgentResult<unknown> | undefined>,
): ReturnType<typeof fakeAgents> {
  return {
    ...base,
    run: (async (task: AgentTask<unknown>, schema: unknown, sig: AbortSignal) => {
      const r = await hook(task, sig);
      return r ?? base.run(task as AgentTask<never>, schema as never, sig);
    }) as ReturnType<typeof fakeAgents>["run"],
  };
}
const cancelledResult = (): AgentResult<unknown> => ({
  status: "cancelled", error: { kind: "cancelled", message: "отменено" }, usage: { model: "fake", inputTokens: 0, outputTokens: 0, costUsd: 0 },
  permissionDenials: [], stdoutPath: "", stderrPath: "", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
});
const isTake2 = (t: AgentTask<unknown>) => t.workdir.endsWith("take2") || t.workdir.endsWith("qa-t2");
const runTmpOf = (res: GenerateResult) => join(env.s.root, "run", "tmp", `${res.runId}-a1`);

describe("S5-fix: второй дубль — выбор, отмена, сбой, бюджет", () => {
  it("I1: дубль 2 с оценкой выше, но с blocking → публикуется чистая первая попытка", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 6 }, 2: { overall: 9, block: true }, 3: { overall: 9, block: true } }),
    });
    const { job, dir } = await runJob({ agents }, "revise");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 1");
    expect(qaOf(dir!).gate.visual).toBe("pass");
  });

  it("I5: исключение в дубле 1 отменяет дубль 2 (сигнал до агентного вызова) и задача ждёт его конца", async () => {
    let take2Aborted = false;
    let take2Running = false;
    let take2Done = false;
    const base = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 5, block: true } }),
    });
    const agents = withSignal(base, async (task, sig) => {
      if (task.role !== "engineer" || !isTake2(task)) return undefined;
      take2Running = true;
      // дубль 2 «работает», пока его не отменят (до 5 с)
      for (let k = 0; k < 100 && !sig.aborted; k++) await new Promise((r) => setTimeout(r, 50));
      take2Aborted = sig.aborted;
      take2Done = true;
      return cancelledResult();
    });
    // static check второго вызова первого дубля падает исключением (не нарушением)
    let checks = 0;
    const check = async (dir: string) => {
      if (!dir.endsWith("take2") && ++checks === 2) {
        for (let k = 0; k < 60 && !take2Running; k++) await new Promise((r) => setTimeout(r, 50));
        throw new Error("static check упал");
      }
      return [];
    };
    const { job, res } = await runJob({ agents, check }, "revise");
    expect(job.status).toBe("failed");
    expect(take2Running).toBe(true);
    expect(take2Aborted).toBe(true);
    // runFixLoop не вернулся раньше дубля 2: к итогу задачи он уже закончил
    expect(take2Done).toBe(true);
    // после отмены дубль 2 ничего не рендерил и не звал Visual QA
    expect(base.tasks.filter((t) => t.role === "visual_qa" && isTake2(t))).toHaveLength(0);
    expect(existsSync(join(runTmpOf(res), "attempts"))).toBe(false);
  });

  it("I5: жёсткий выход дубля 1 (рендер orphaned) отменяет дубль 2 до его рендера", async () => {
    let take2Aborted = false;
    const base = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 5, block: true } }),
    });
    let take2Engineer = false;
    const agents = withSignal(base, async (task, sig) => {
      if (task.role !== "engineer" || !isTake2(task)) return undefined;
      take2Engineer = true;
      for (let k = 0; k < 100 && !sig.aborted; k++) await new Promise((r) => setTimeout(r, 50));
      take2Aborted = sig.aborted;
      return cancelledResult();
    });
    const fr = fakeRender({ png: true });
    let draftRenders = 0;
    const render = fakeRender({
      png: true,
      onCall: async (req, sig) => {
        if (req.versionDir.endsWith("take2")) return undefined;
        if (++draftRenders === 2) {
          for (let k = 0; k < 60 && !take2Engineer; k++) await new Promise((r) => setTimeout(r, 50));
          return { ok: false, stills: [], browserLogs: [], error: { stage: "orphaned", message: "Chrome не исчез" } };
        }
        return fr.render(req, sig);
      },
    });
    const { job } = await runJob({ agents, render: render.render }, "revise");
    expect(job.status).not.toBe("completed");
    expect(take2Aborted).toBe(true);
    expect(render.calls.filter((r) => r.versionDir.endsWith("take2"))).toHaveLength(0);
  });

  it("I6: вызов Engineer дубля 2 отклонён (обрыв сети) — задача ready с годной попыткой дубля 1, каталог дубля 2 оставлен", async () => {
    const base = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 5 } }),
    });
    const agents = withSignal(base, async (task) => {
      if (task.role === "engineer" && isTake2(task)) throw new Error("socket hang up");
      return undefined;
    });
    const { job, v, dir, res } = await runJob({ agents }, "revise");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(v).toMatchObject({ status: "ready" });
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 1");
    expect(res.warnings.join("\n")).toMatch(/второй дубль/);
    // процесс дубля 2 не подтверждён мёртвым — его каталог не трогаем до разбора
    expect(existsSync(join(runTmpOf(res), "take2"))).toBe(true);
    expect(existsSync(join(runTmpOf(res), "attempts"))).toBe(false);
  });

  it("I7: общий бюджет двух дублей — резерв до вызова, лимит вызова не больше свободного остатка, итог ≤ лимита задачи", async () => {
    const costs = { concept: 0.5, motion_director: 1, engineer: 1.2, visual_qa: 0.3 };
    const base = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      // все попытки blocking и ниже порога: оба дубля хотят исправляться до конца
      visualQa: async (frames, spec, n) => qaBy({ [n]: { overall: 5, block: true } })(frames, spec, n),
    });
    const caps: number[] = [];
    let spent = 0;
    // как CLI: `--max-budget-usd` вызова режет его цену
    const agents = withSignal(base, async (task, sig) => {
      const r = await base.run(task as AgentTask<never>, undefined as never, sig);
      caps.push(task.limits.maxBudgetUsd);
      const cost = Math.min(costs[task.role as keyof typeof costs], task.limits.maxBudgetUsd);
      spent += cost;
      return { ...r, usage: { ...r.usage, costUsd: cost } } as AgentResult<unknown>;
    });
    const { job, res } = await runJob({ agents }, "revise");
    expect(TERMINAL).toContain(job.status);
    // второй дубль запускался: вызовов Engineer больше, чем у одного дубля без исправлений
    expect(base.tasks.some((t) => t.role === "engineer" && isTake2(t))).toBe(true);
    expect(spent).toBeLessThanOrEqual(5 + 1e-9);
    expect(res.costUsd).toBeLessThanOrEqual(5 + 1e-9);
    for (const c of caps) expect(c).toBeGreaterThan(0);
  });

  it("M2: cost_usd попытки — только её вызовы, без трат параллельного дубля", async () => {
    let take2Started = false;
    const agents = fakeAgents({
      costs: { engineer: 0.4, visual_qa: 0.1 },
      engineer: async (t, n) => {
        if (t.workdir.endsWith("take2")) take2Started = true;
        else if (n > 1) for (let k = 0; k < 60 && !take2Started; k++) await new Promise((r) => setTimeout(r, 50));
        return { files: { "src/Scene.tsx": scene(`call ${n}`) } };
      },
      visualQa: async (frames, spec, n) => qaBy({ 1: { overall: 5, block: true } })(frames, spec, n === 1 ? 1 : 99),
    });
    const { job, dir } = await runJob({ agents }, "revise");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const attempts = log(dir!).attempts as { cost_usd: number }[];
    expect(attempts.length).toBeGreaterThanOrEqual(3);
    for (const a of attempts) expect(a.cost_usd).toBeCloseTo(0.5, 6);
  });

  it("M1: отказ прав в исправлении (failed, процессы мертвы) — снимки попыток убраны", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({
        files: { "src/Scene.tsx": scene(`call ${n}`) },
        ...(n === 2 ? { permissionDenials: [{ tool_name: "Write", tool_input: { file_path: "src/Other.tsx" } }] } : {}),
      }),
      visualQa: qaBy({ 1: { overall: 7, block: true } }),
    });
    const { job, res } = await runJob({ agents }, "off");
    expect(job.status).toBe("failed");
    expect(existsSync(join(runTmpOf(res), "attempts"))).toBe(false);
  });
});

describe("S5: время по этапам", () => {
  it("stage_wall_ms: этапы и total в pipeline-log.json, результате и output_refs задачи", async () => {
    const { job, dir, res } = await runJob({ agents: fakeAgents({}) });
    const w = log(dir!).stage_wall_ms;
    for (const k of ["concept", "director", "engineer", "render", "qa", "total"]) expect(typeof w[k]).toBe("number");
    expect(w.total).toBeGreaterThanOrEqual(w.engineer);
    expect(res.stageWallMs?.total).toBe(w.total);
    expect((job.output_refs as { stage_wall_ms?: Record<string, number> }).stage_wall_ms?.total).toBe(w.total);
  });
});
