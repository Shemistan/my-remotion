// Настройки приложения: значения по умолчанию (Global Constraints плана) +
// переопределения из `$MS_DATA_DIR/config.json` + KB_ROOT/KB_SOURCE_ROOT из env.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MAX_CALL_BUDGET_USD, MODEL_RE, ROLES, type Role } from "./agents/runtime.js";

export interface AgentSettings {
  model: string;
  timeoutMs: number;
  maxBudgetUsd: number;
}

/**
 * Второй дубль (S5): первая оценённая попытка ниже `threshold` по `overall` и бюджет
 * позволяет — ещё один проход Engineer параллельно с исправлениями первого дубля.
 * `revise` — доработка лучшей попытки по трём слабым осям оценки с их кадрами;
 * `fresh` — новый дубль с другим кадрированием (archetype); `off` — без него.
 * `fixes` — исправлений технического gate и QA внутри второго дубля.
 */
export interface SecondTake {
  mode: "revise" | "fresh" | "off";
  threshold: number;
  fixes: number;
}
const SECOND_TAKE_MODES = ["revise", "fresh", "off"] as const;
const SecondTakeSchema = z.object({ mode: z.enum(SECOND_TAKE_MODES), threshold: z.number().min(1).max(10), fixes: z.number().int().min(0).max(3) }).partial().strict();
const SECOND_TAKE: SecondTake = { mode: "revise", threshold: 6.5, fixes: 1 };

export interface AppConfig {
  dataDir: string;
  claudeBin: string;
  agentRuntime: "claude-code";
  agents: Record<Role, AgentSettings>;
  scene: { maxCostUsd: number; maxAutoFixes: number; secondTake: SecondTake };
  kb: { root: string; sourceRoot: string };
}

const OPUS_ROLES: readonly Role[] = ["motion_director", "engineer"];
const AGENT_TIMEOUT_MS = 10 * 60_000;
const AGENT_BUDGET_USD = 2;

// Корень репозитория: server/src → ../../../..
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");
// Исходники KB лежат в main checkout; из worktree — это путь до `.claude/worktrees/`.
const MAIN_CHECKOUT = REPO_ROOT.split("/.claude/worktrees/")[0]!;

const AgentOverride = z
  .object({
    model: z.string().regex(MODEL_RE, "имя модели: латиница, цифры, . - [ ]"),
    timeoutMs: z.number().int().positive(),
    maxBudgetUsd: z.number().positive().max(MAX_CALL_BUDGET_USD),
  })
  .partial()
  .strict();

const FileSchema = z
  .object({
    claudeBin: z.string().min(1),
    agentRuntime: z.literal("claude-code"),
    agents: z.object(Object.fromEntries(ROLES.map((r) => [r, AgentOverride.optional()]))).strict(),
    scene: z.object({ maxCostUsd: z.number().positive(), maxAutoFixes: z.number().int().min(0), secondTake: SecondTakeSchema }).partial().strict(),
    kb: z.object({ root: z.string().min(1), sourceRoot: z.string().min(1) }).partial().strict(),
  })
  .partial()
  .strict();
type FileConfig = z.infer<typeof FileSchema>;

/** `fileJson` — разобранный `$MS_DATA_DIR/config.json` (см. `readConfigFile`). */
export function loadConfig(env: NodeJS.ProcessEnv, fileJson?: unknown): AppConfig {
  const dataDir = env.MS_DATA_DIR?.trim();
  if (!dataDir) throw new Error("config: MS_DATA_DIR не задан");
  const parsed = FileSchema.safeParse(fileJson ?? {});
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    throw new Error(`config: config.json не годится: ${where}`);
  }
  const file: FileConfig = parsed.data;
  const fileAgents = (file.agents ?? {}) as Partial<Record<Role, Partial<AgentSettings>>>;

  const agents = Object.fromEntries(
    ROLES.map((role) => {
      const base: AgentSettings = {
        model: OPUS_ROLES.includes(role) ? "opus" : "sonnet",
        timeoutMs: AGENT_TIMEOUT_MS,
        maxBudgetUsd: AGENT_BUDGET_USD,
      };
      return [role, { ...base, ...fileAgents[role] }];
    }),
  ) as Record<Role, AgentSettings>;

  return {
    dataDir,
    claudeBin: file.claudeBin ?? "claude",
    agentRuntime: "claude-code",
    agents,
    scene: {
      maxCostUsd: file.scene?.maxCostUsd ?? 5,
      maxAutoFixes: file.scene?.maxAutoFixes ?? 2,
      secondTake: { ...SECOND_TAKE, ...file.scene?.secondTake, ...secondTakeEnv(env) },
    },
    kb: {
      root: file.kb?.root ?? env.KB_ROOT ?? join(REPO_ROOT, "knowledge"),
      sourceRoot: file.kb?.sourceRoot ?? env.KB_SOURCE_ROOT ?? MAIN_CHECKOUT,
    },
  };
}

/** `MS_SECOND_TAKE=revise|fresh|off` — режим второго дубля поверх config.json (bench A/B). */
function secondTakeEnv(env: NodeJS.ProcessEnv): Partial<SecondTake> {
  const out: Partial<SecondTake> = {};
  const v = env.MS_SECOND_TAKE?.trim();
  if (v) {
    if (!(SECOND_TAKE_MODES as readonly string[]).includes(v)) throw new Error(`config: MS_SECOND_TAKE — одно из ${SECOND_TAKE_MODES.join(", ")}: ${v}`);
    out.mode = v as SecondTake["mode"];
  }
  // `MS_SECOND_TAKE_THRESHOLD` — порог overall (1–10) для A/B
  const t = env.MS_SECOND_TAKE_THRESHOLD?.trim();
  if (t) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1 || n > 10) throw new Error(`config: MS_SECOND_TAKE_THRESHOLD — число 1–10: ${t}`);
    out.threshold = n;
  }
  return out;
}

/** Читает `<dataDir>/config.json`; нет файла — `undefined`, битый JSON — ошибка. */
export async function readConfigFile(dataDir: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(join(dataDir, "config.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`config: config.json — не JSON: ${(e as Error).message}`, { cause: e });
  }
}
