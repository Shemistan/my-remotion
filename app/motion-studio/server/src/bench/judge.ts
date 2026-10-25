// Судья bench (quality-strategy §3, шаг 1): рубрика `prompts/rubric-judge.md` по реальным
// кадрам превью. Вход судьи — отдельный каталог: brief.json, четыре контактных листа
// (раскладка motion-review-2) и полноразмерные кадры. Кода и spec там нет, а
// `--restricted` с единственным инструментом Read не выпускает агента за этот каталог.
// Вызов идёт через тот же ClaudeCodeRuntime, что и у пайплайна (роль visual_qa — роль
// со зрением и только Read; системный промпт — рубрика судьи, не промпт Visual QA).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveTool } from "@ms/core";
import { z } from "zod";
import { ClaudeCodeRuntime } from "../agents/claude-code.js";
import { PROMPTS_DIR } from "../agents/prompts.js";
import type { AgentResult, AgentRuntimeAdapter } from "../agents/runtime.js";
import { CRITERIA, type Criterion, type JudgeScores, sheetFrames } from "./metrics.js";
import type { ReferenceGrade } from "./reference.js";

const run = promisify(execFile);
/** ffmpeg судьи: `.deps/ffmpeg` (S19), иначе PATH. */
const ffmpegPath = () => resolveTool("ffmpeg")?.path ?? "ffmpeg";

const Score = z.number().min(1).max(10);
const CriterionSchema = z.object({
  score: Score,
  frames: z.array(z.number().int().min(0)).min(1),
  note: z.string().min(1),
});

export const JudgeOutputSchema = z.object({
  criteria: z.object({
    meaning: CriterionSchema,
    hierarchy: CriterionSchema,
    composition: CriterionSchema,
    entrance: CriterionSchema,
    choreography: CriterionSchema,
    hold: CriterionSchema,
    legibility: CriterionSchema,
    distinctiveness: CriterionSchema,
  }),
  closest_anchors: z.array(z.string()).max(3),
  overall: Score,
  top_defects: z.array(z.object({ frame: z.number().int().min(0), text: z.string().min(1) })).max(5),
  summary: z.string().min(1),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

/** Числа ответа судьи для агрегации. */
export function scoresOf(o: JudgeOutput): JudgeScores {
  return { overall: o.overall, criteria: Object.fromEntries(CRITERIA.map((c) => [c, o.criteria[c].score])) as Record<Criterion, number> };
}

/** Системный промпт судьи. */
export function loadJudgePrompt(dir: string = PROMPTS_DIR): Promise<string> {
  return readFile(join(dir, "rubric-judge.md"), "utf8");
}

/** Рантайм судьи: ClaudeCodeRuntime с рубрикой вместо промпта роли. */
export function judgeRuntime(opts: { bin: string; logRoot: string; systemPrompt: string }): AgentRuntimeAdapter {
  return new ClaudeCodeRuntime({ bin: opts.bin, logRoot: opts.logRoot, promptLoader: () => opts.systemPrompt });
}

export interface JudgeBrief {
  prompt: string;
  duration_frames: number;
  fps: number;
}

const FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
const TILE = { w: 640, h: 360 };

/** Все кадры входа судьи: кадры листов и кадр 4 (проверка «постера» в начале). */
export function judgeFrames(n: number): number[] {
  const s = sheetFrames(n);
  return [...new Set([...s.a, ...s.b, ...s.c, ...s.d, Math.min(4, n - 1)])].sort((a, b) => a - b);
}

/**
 * Каталог входа судьи из превью: `frames/<n>.png` (размер превью) и `sheets/sheet-{a..d}.png`
 * (2 × 3 кадра по 640 × 360, номер кадра в углу), плюс `brief.json`. Пересобирается целиком.
 */
export async function prepareJudgeInput(preview: string, dir: string, brief: JudgeBrief): Promise<void> {
  const n = brief.duration_frames;
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "frames"), { recursive: true });
  await mkdir(join(dir, "sheets"), { recursive: true });
  await writeFile(join(dir, "brief.json"), JSON.stringify(brief, null, 2) + "\n");

  const frames = judgeFrames(n);
  const select = frames.map((f) => `eq(n\\,${f})`).join("+");
  const tmp = join(dir, "frames", "_%03d.png");
  await run(ffmpegPath(), ["-v", "error", "-y", "-i", preview, "-vf", `select=${select}`, "-fps_mode", "vfr", tmp]);
  for (let i = 0; i < frames.length; i++) {
    const src = join(dir, "frames", `_${String(i + 1).padStart(3, "0")}.png`);
    if (!existsSync(src)) throw new Error(`bench: в превью нет кадра ${frames[i]} (${preview}: меньше ${n} кадров?)`);
    await rename(src, join(dir, "frames", `${frames[i]}.png`));
  }

  const s = sheetFrames(n);
  for (const [name, list] of Object.entries(s)) {
    const inputs = list.flatMap((f) => ["-i", join(dir, "frames", `${f}.png`)]);
    const label = existsSync(FONT) ? `,drawtext=fontfile='${FONT}':text='%LABEL%':x=12:y=10:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=6` : "";
    const tiles = list.map((f, i) => `[${i}:v]scale=${TILE.w}:${TILE.h},drawbox=x=0:y=0:w=iw:h=ih:color=gray@0.6:t=2${label.replace("%LABEL%", `кадр ${f}`)}[t${i}]`);
    const layout = "0_0|w0_0|0_h0|w0_h0|0_h0+h2|w0_h0+h2";
    const graph = `${tiles.join(";")};${list.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${list.length}:layout=${layout}`;
    await run(ffmpegPath(), ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-frames:v", "1", join(dir, "sheets", `sheet-${name}.png`)]);
  }
}

/** Текст задания судье: якоря шкалы (без якорей самой сцены) и что прочитать. */
export function judgeTaskText(anchors: readonly ReferenceGrade[], frames: readonly number[]): string {
  return [
    "Оцени сцену по рубрике системного промпта. Все файлы — в текущем каталоге:",
    "- `brief.json` — запрос пользователя;",
    "- `sheets/sheet-a.png`, `sheets/sheet-b.png`, `sheets/sheet-c.png`, `sheets/sheet-d.png` — контактные листы;",
    `- полноразмерные кадры: ${frames.map((f) => `\`frames/${f}.png\``).join(", ")}.`,
    "Открывай файлы инструментом Read. Оценивай только то, что видно на кадрах.",
    "",
    "## Якоря шкалы: сцены этого пайплайна, оценённые дизайнером",
    "",
    "Это другие сцены (или другие версии), не та, что перед тобой. Используй их как линейку.",
    "",
    ...anchors.map((a) => `- \`${a.id}\` — **${a.grade}**. ${a.anchor}`),
    "",
  ].join("\n");
}

export interface JudgeCall {
  agents: AgentRuntimeAdapter;
  /** Каталог из `prepareJudgeInput` — cwd агента. */
  dir: string;
  anchors: readonly ReferenceGrade[];
  durationFrames: number;
  model: string;
  /** Хранилище журналов и реестра процессов вызова. */
  runRef: { root: string; runId: string; attempt: number };
  signal: AbortSignal;
  timeoutMs?: number;
  maxBudgetUsd?: number;
}

export function runJudge(c: JudgeCall): Promise<AgentResult<JudgeOutput>> {
  const frames = judgeFrames(c.durationFrames);
  return c.agents.run(
    {
      role: "visual_qa",
      input: judgeTaskText(c.anchors, frames),
      inputRefs: [],
      workdir: c.dir,
      tools: ["Read"],
      model: c.model,
      limits: { timeoutMs: c.timeoutMs ?? 15 * 60_000, maxBudgetUsd: c.maxBudgetUsd ?? 5 },
      idempotencyKey: `${c.runRef.runId}-judge`,
      run: c.runRef,
    },
    JudgeOutputSchema,
    c.signal,
  );
}
