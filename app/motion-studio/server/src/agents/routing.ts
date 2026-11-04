// RoutingRuntime: для каждого вызова агента решает, кто его выполняет — Claude Code или Codex
// (спека 2026-11-04-codex-delegation-design.md §2). Предохранители качества:
//  1. visual_qa — всегда Claude (ALWAYS_CLAUDE в плане);
//  2. исправления engineer (seq ≥ 100) и повторные попытки задачи (attempt > 1) — Claude;
//  3. сбой Codex — тот же вызов сразу в Claude; у ролей с записью файлов черновик перед этим
//     восстанавливается из снимка, сделанного до Codex;
//  4. авто-пауза роли по статистике чистоты (DelegationState).
import { cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import { type DelegationPlan, type DelegationPolicy, type DelegationState, FIX_SEQ, FIX_TRACKED, pickCodex, planShares } from "./delegation.js";
import type { AgentResult, AgentRuntimeAdapter, AgentTask, Role } from "./runtime.js";

const WRITE_TOOLS = new Set(["Write", "Edit"]);
/** Сколько держать веса ролей из истории, прежде чем перечитать. */
const WEIGHTS_TTL_MS = 10 * 60_000;

export interface RoutingRuntimeOptions {
  claude: AgentRuntimeAdapter;
  codex: AgentRuntimeAdapter;
  state: DelegationState;
  policy: DelegationPolicy;
  /** Веса ролей (доли стоимости Claude, сумма 1): из `agent_runs` или встроенные. */
  weights: () => Record<Role, number>;
  now?: () => number;
}

/** Номер вызова роли из ключа идемпотентности `<runId>-a<attempt>-<role>-<seq>`. */
export function seqOf(task: AgentTask<unknown>): number {
  const m = /-(\d+)$/.exec(task.idempotencyKey);
  return m ? Number(m[1]) : 1;
}

export type Route = { runtime: "claude" | "codex"; why: string };

export class RoutingRuntime implements AgentRuntimeAdapter {
  private policy: DelegationPolicy;
  private cached?: { at: number; weights: Record<Role, number> };
  private readonly now: () => number;

  constructor(private readonly opts: RoutingRuntimeOptions) {
    this.policy = { ...opts.policy };
    this.now = opts.now ?? Date.now;
  }

  /** Новая политика из настроек — действует со следующего вызова, без перезапуска. */
  setPolicy(p: DelegationPolicy): void {
    this.policy = { ...p };
  }

  state(): DelegationState {
    return this.opts.state;
  }

  codexCapabilities(): Promise<{ available: boolean; version?: string; reason?: string }> {
    return this.opts.codex.capabilities();
  }

  getPolicy(): DelegationPolicy {
    return { ...this.policy };
  }

  weights(): Record<Role, number> {
    const t = this.now();
    if (!this.cached || t - this.cached.at > WEIGHTS_TTL_MS) this.cached = { at: t, weights: this.opts.weights() };
    return this.cached.weights;
  }

  plan(): DelegationPlan {
    return planShares(this.weights(), this.policy, this.opts.state.pausedRoles());
  }

  /** Решение для вызова (без запуска): для тестов и журнала. */
  route(task: AgentTask<unknown>): Route {
    const seq = seqOf(task);
    if (FIX_TRACKED.includes(task.role) && seq >= FIX_SEQ) return { runtime: "claude", why: "исправление" };
    if (task.run.attempt > 1) return { runtime: "claude", why: "повторная попытка" };
    const share = this.plan().shares[task.role];
    if (share <= 0) return { runtime: "claude", why: "роль не делегирована" };
    return pickCodex(`${task.run.runId}|${task.role}|${seq}`, share) ? { runtime: "codex", why: `доля ${Math.round(share * 100)} %` } : { runtime: "claude", why: "жребий" };
  }

  capabilities(): Promise<{ available: boolean; version?: string; reason?: string }> {
    return this.opts.claude.capabilities();
  }

  async run<I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>> {
    const { state } = this.opts;
    const seq = seqOf(task);
    const runKey = `${task.run.runId}-a${task.run.attempt}`;
    const fix = FIX_TRACKED.includes(task.role) && seq >= FIX_SEQ;
    if (fix) state.markFixed(task.role, runKey);
    const first = !fix && task.run.attempt === 1;
    const route = this.route(task);

    if (route.runtime === "claude") {
      const r = await this.opts.claude.run(task, schema, signal);
      if (first && r.status !== "cancelled") state.record(task.role, { runtime: "claude", run: runKey, clean: r.status === "completed" });
      return r;
    }

    // роль пишет файлы (engineer): снимок черновика до Codex — при сбое Claude начнёт с него
    const writes = task.tools.some((t) => WRITE_TOOLS.has(t));
    const snap = writes ? await snapshot(task.workdir) : undefined;
    try {
      const r = await this.opts.codex.run(task, schema, signal);
      if (r.status === "cancelled" || signal.aborted) return r;
      state.record(task.role, { runtime: "codex", run: runKey, clean: r.status === "completed" });
      if (r.status === "completed") return r;
      // процессы Codex не завершились — состояние неизвестно, повтор только после reap
      if (r.error?.kind === "orphaned") return r;
      // снимок не сделан — черновик мог быть изменён: сбой уходит в штатный цикл исправлений
      if (writes && !(snap && (await restore(snap, task.workdir)))) return r;
      // сразу перезапуск упавшего вызова в Claude
      return await this.opts.claude.run(task, schema, signal);
    } finally {
      if (snap) await rm(snap, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** Копия каталога рядом с ним (`<dir>.codex-snap-*`); сбой — `undefined`. */
async function snapshot(dir: string): Promise<string | undefined> {
  const to = `${dir}.codex-snap-${process.pid}-${Date.now()}`;
  try {
    await cp(dir, to, { recursive: true, preserveTimestamps: true });
    return to;
  } catch {
    await rm(to, { recursive: true, force: true }).catch(() => undefined);
    return undefined;
  }
}

/** Содержимое `dir` заменяется снимком; `false` — не удалось (черновик в неизвестном состоянии). */
async function restore(snap: string, dir: string): Promise<boolean> {
  try {
    for (const n of await readdir(dir)) await rm(join(dir, n), { recursive: true, force: true });
    await cp(snap, dir, { recursive: true, preserveTimestamps: true });
    return true;
  } catch {
    return false;
  }
}
