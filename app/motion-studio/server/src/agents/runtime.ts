// Контракт рантайма агентов (docs/architecture/04-agent-workflows.md §4–5).
// Реализации: ClaudeCodeRuntime (claude -p --restricted); замена на API/Agent SDK —
// второй адаптер с тем же интерфейсом.
import type { ZodType } from "zod";

export const ROLES = ["concept", "motion_director", "engineer", "visual_qa", "edit_planner"] as const;
export type Role = (typeof ROLES)[number];

/** Инструменты, которые вообще можно дать агенту. Bash и WebFetch — никогда. */
export const AGENT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

/** Алиас (`opus`) или полное имя модели (`claude-haiku-5-5`, `…[1m]`); проверяют config.json и buildClaudeArgs. */
export const MODEL_RE = /^[a-z0-9][a-z0-9.\-[\]]*$/i;

/** Верхняя граница `maxBudgetUsd` одного вызова в config.json. */
export const MAX_CALL_BUDGET_USD = 50;

export type Ref ={ kind: "file" | "version" | "kb" | "job"; id: string; path?: string };

export interface AgentTask<I> {
  role: Role;
  /** Строка уходит в промпт как есть, иначе — JSON. */
  input: I;
  inputRefs: Ref[];
  /** draft-каталог; для ролей без инструментов — пустой tmp. */
  workdir: string;
  tools: AgentTool[];
  model: string;
  limits: { timeoutMs: number; maxBudgetUsd: number };
  idempotencyKey: string;
  /** Корень хранилища и прогон для реестра `run/processes/` (ADR 0007). */
  run: { root: string; runId: string; attempt: number };
}

export type AgentErrorKind = "schema" | "cli" | "budget" | "timeout" | "denied" | "cancelled" | "orphaned";

export interface AgentUsage {
  /** Фактическая модель из `modelUsage` (самая дорогая в вызове). */
  model: string;
  /** Входные токены вместе с чтением и записью кэша. */
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AgentResult<O> {
  status: "completed" | "failed" | "cancelled" | "timeout";
  /** structured_output, прошедший Zod. */
  output?: O;
  /**
   * `orphaned` — группа процессов не исчезла после выхода (ADR 0007): попытку считать
   * незавершённой, повтор только после reapStale.
   */
  error?: { kind: AgentErrorKind; message: string };
  // `denied` рантайм сам не ставит: решает оркестратор по permissionDenials (rulings п. 14).
  usage: AgentUsage;
  /** Из CLI, как есть. */
  permissionDenials: unknown[];
  stdoutPath: string;
  stderrPath: string;
  startedAt: string;
  finishedAt: string;
  sessionId?: string;
}

export interface AgentRuntimeAdapter {
  run<I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>>;
  /** Короткая проверка вне прогона (doctor); в `run/processes/` не регистрируется. */
  capabilities(): Promise<{ available: boolean; version?: string; reason?: string }>;
}
