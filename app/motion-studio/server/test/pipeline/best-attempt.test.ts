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
const qaBy = (plan: Record<number, { overall: number; block?: boolean; notes?: boolean }>) =>
  async (frames: number[], spec: MotionSpec | undefined, n: number) => {
    const p = plan[n] ?? { overall: 7 };
    return {
      output: visualOutput(frames, spec, {
        gate: { visual: p.block ? "fail" : "pass", semantic: "pass", style: "pass" },
        issues: p.block ? [blocking()] : [],
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

  it("опубликованная оценка ≥ первой: попытка 1 blocking 8, попытка 2 чистая 6.5 → публикуется попытка 1 (warn)", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaBy({ 1: { overall: 8, block: true }, 2: { overall: 6.5 } }),
    });
    const { job, dir } = await runJob({ agents }, "off");
    expect(job.status).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(readFileSync(join(dir!, "src", "Scene.tsx"), "utf8")).toContain("// call 1");
    expect(qaOf(dir!).scores.overall).toBe(8);
    expect(qaOf(dir!).gate.visual).toBe("warn");
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
