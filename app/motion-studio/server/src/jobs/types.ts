import type { ConceptOutput, Job, JobError, JobType } from "@ms/contracts";
import type { Db } from "../db/open.js";
import type { Permits } from "./semaphore.js";

/** Захват задачи: снимок строки после захвата и номер попытки (fencing-токен). */
export interface Claim {
  job: Job;
  attempt: number;
}

/** Занятость раннера для `claimNext`. */
export interface Busy {
  running: number;
  maxRunning: number;
}

/** Итог попытки; пишется только через `finish` (fencing). */
export type HandlerResult =
  | { status: "completed"; outputRefs: unknown }
  | { status: "failed" | "cancelled"; error: JobError }
  | { status: "awaiting_input"; questions: ConceptOutput["needs_clarification"] };

/**
 * Контекст попытки. `run` совместим с `AgentTask.run` и `RenderRequest.run` среза
 * (Task 13 добавит `registry`). Семафоры общие для всех задач раннера.
 */
export interface JobContext {
  db: Db;
  job: Job;
  attempt: number;
  signal: AbortSignal;
  run: { root: string; runId: string; attempt: number };
  emit(kind: string, message: string, data?: unknown): void;
  /** Прогресс 0..1 и этап; устаревшая попытка ничего не пишет. */
  progress(p: number, stage: string): void;
  fenceOk(): boolean;
  /**
   * Семафоры раннера (общие для всех задач) через обёртку попытки: места, не отданные
   * обработчиком, раннер возвращает после его завершения.
   */
  /** Агентные вызовы (2). */
  agents: Permits;
  /** Рендеры (1). */
  renders: Permits;
  /** Тяжёлые локальные модели, ASR (1, ruling V8). */
  heavy: Permits;
}

export type JobHandler = (ctx: JobContext) => Promise<HandlerResult>;

export type Handlers = Partial<Record<JobType, JobHandler>>;
