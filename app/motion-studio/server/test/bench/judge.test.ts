// Судья bench: вход из превью (кадры и листы), задание с якорями leave-one-scene-out,
// вызов рантайма только с Read в каталоге входа.
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { JudgeOutputSchema, judgeFrames, judgeTaskText, loadJudgePrompt, prepareJudgeInput, runJudge, scoresOf } from "../../src/bench/judge.js";
import { REFERENCE, anchorsFor } from "../../src/bench/reference.js";
import { loadPng } from "../../src/qa/image.js";
import { makeTmp, removeTmp } from "../qa/helpers.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

const crit = (score: number) => ({ score, frames: [0], note: "видно" });
const OUTPUT = {
  criteria: {
    meaning: crit(6), hierarchy: crit(5), composition: crit(5), entrance: crit(4),
    choreography: crit(5), hold: crit(3), legibility: crit(5), distinctiveness: crit(4),
  },
  closest_anchors: ["r2-test2"],
  overall: 5.5,
  top_defects: [{ frame: 0, text: "пустой кадр 0" }],
  summary: "итог",
};

describe("калибровочный набор", () => {
  it("12 оценок: 5 из R1 и 7 из R2; якоря сцены исключают обе её версии", () => {
    expect(REFERENCE.filter((r) => r.review === "R1")).toHaveLength(5);
    expect(REFERENCE.filter((r) => r.review === "R2")).toHaveLength(7);
    const a = anchorsFor("test1");
    expect(a).toHaveLength(10);
    expect(a.some((r) => r.scene === "test1")).toBe(false);
    expect(anchorsFor("bench-funnel")).toHaveLength(12);
  });
});

describe("judgeTaskText", () => {
  it("перечисляет якоря с оценками и файлы входа; чужих сцен не теряет, свою не показывает", () => {
    const t = judgeTaskText(anchorsFor("gen-cache"), judgeFrames(180));
    expect(t).toMatch(/`r1-test2` — \*\*4\.5\*\*/);
    expect(t).toMatch(/`r2-held-queue` — \*\*6\*\*/);
    expect(t).not.toMatch(/gen-cache/);
    expect(t).toMatch(/sheets\/sheet-d\.png/);
    expect(t).toMatch(/frames\/4\.png/);
  });
});

describe("JudgeOutputSchema", () => {
  it("принимает полный ответ; оценка вне 1–10 и критерий без кадров — нет", () => {
    expect(scoresOf(JudgeOutputSchema.parse(OUTPUT))).toEqual({
      overall: 5.5,
      criteria: { meaning: 6, hierarchy: 5, composition: 5, entrance: 4, choreography: 5, hold: 3, legibility: 5, distinctiveness: 4 },
    });
    expect(JudgeOutputSchema.safeParse({ ...OUTPUT, overall: 11 }).success).toBe(false);
    expect(JudgeOutputSchema.safeParse({ ...OUTPUT, criteria: { ...OUTPUT.criteria, hold: { score: 3, frames: [], note: "x" } } }).success).toBe(false);
  });
});

describe("рубрика", () => {
  it("промпт судьи называет планку, все критерии и якоря", async () => {
    const p = await loadJudgePrompt();
    expect(p).toMatch(/выпустил бы это в продуктовом explainer/);
    for (const c of Object.keys(OUTPUT.criteria)) expect(p).toContain(`\`${c}\``);
    expect(p).toMatch(/Якоря/);
  });
});

describe("prepareJudgeInput", () => {
  it("кадры листов и кадр 4 из превью; четыре листа 2 × 3 по 640 × 360; brief.json", async () => {
    const preview = join(tmp, "preview.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=480x270:rate=30:duration=6", "-pix_fmt", "yuv420p", preview]);
    const dir = join(tmp, "judge");
    await prepareJudgeInput(preview, dir, { prompt: "тест", duration_frames: 180, fps: 30 });
    const frames = (await readdir(join(dir, "frames"))).sort();
    expect(frames).toEqual(judgeFrames(180).map((f) => `${f}.png`).sort());
    expect(judgeFrames(180)).toHaveLength(25);
    expect((await readdir(join(dir, "sheets"))).sort()).toEqual(["sheet-a.png", "sheet-b.png", "sheet-c.png", "sheet-d.png"]);
    const sheet = await loadPng(join(dir, "sheets", "sheet-d.png"));
    expect([sheet.width, sheet.height]).toEqual([1280, 1080]);
    const f = await loadPng(join(dir, "frames", "179.png"));
    expect([f.width, f.height]).toEqual([480, 270]);
    expect(JSON.parse(await readFile(join(dir, "brief.json"), "utf8"))).toEqual({ prompt: "тест", duration_frames: 180, fps: 30 });
  });

  it("превью короче длительности — ошибка с номером кадра", async () => {
    const preview = join(tmp, "short.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=2", "-pix_fmt", "yuv420p", preview]);
    await expect(prepareJudgeInput(preview, join(tmp, "j"), { prompt: "т", duration_frames: 180, fps: 30 })).rejects.toThrow(/нет кадра/);
  });
});

describe("runJudge", () => {
  it("роль со зрением, только Read, cwd — каталог входа, модель из вызова", async () => {
    const tasks: AgentTask<unknown>[] = [];
    const agents: AgentRuntimeAdapter = {
      capabilities: async () => ({ available: true }),
      run: async <I, O>(task: AgentTask<I>) => {
        tasks.push(task as AgentTask<unknown>);
        return { status: "completed", output: OUTPUT as O, usage: { model: "opus", inputTokens: 1, outputTokens: 1, costUsd: 0.3 }, permissionDenials: [], stdoutPath: "", stderrPath: "", startedAt: "", finishedAt: "" } as AgentResult<O>;
      },
    };
    const r = await runJudge({ agents, dir: "/x/judge", anchors: anchorsFor("test2"), durationFrames: 180, model: "opus", runRef: { root: "/s", runId: "judge-test2-1", attempt: 1 }, signal: new AbortController().signal });
    expect(r.output?.overall).toBe(5.5);
    expect(tasks[0]).toMatchObject({ role: "visual_qa", tools: ["Read"], workdir: "/x/judge", model: "opus" });
    expect(String(tasks[0]!.input)).not.toMatch(/`r\d-test2`/);
  });
});
