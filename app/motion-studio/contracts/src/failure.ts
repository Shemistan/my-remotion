import { z } from "zod";

/**
 * Этап, на котором прогон пайплайна не удался: единый словарь для `GenerateResult.failure`,
 * `VersionManifest.failure.stage`, `failure.json` сцены и (через `failureToJobErrorCode`)
 * `JobError.code` задачи. Этапы рендера (`RenderStage` в `@ms/render`) — отдельный словарь
 * внутри этапа `render`; проверка превью ffprobe-гейтом здесь — `probe`, а сбой самого
 * ffprobe в рендере — `ffprobe`.
 */
export const FailureStageSchema = z.enum([
  /** Хранилище недоступно или пропало (ADR 0006). */
  "storage",
  /** Подготовка draft: spec/settings/refs/кэш. */
  "prepare",
  "director",
  "engineer",
  /** Static check кода сцены и границы draft (запись вне src/ и props.json). */
  "static",
  "typecheck",
  "render",
  /** Превью не прошло ffprobe-гейт (`probeGate`). */
  "probe",
  "budget",
  /** Процесс агента или рендера не исчез (ADR 0007, stale_process): draft в карантине. */
  "orphaned",
  /** Отмена вызывающим (Ctrl-C в CLI, отмена задачи). */
  "cancelled",
  /** Публикация не удалась при доступном хранилище: draft в карантине. */
  "publish",
  /** Попытка прервана рестартом сервера (восстановление, Task 13). */
  "interrupted",
  /** Устаревшая попытка пыталась записать результат (fencing `jobs.attempt`, Task 11). */
  "fenced_out",
  /** Агент Concept (идея, паттерны, уточнения). */
  "concept",
  /** Агент Edit Planner (план правки). */
  "edit_planner",
  /** Блокирующее замечание QA (технический gate или Visual QA). */
  "qa",
  /** Экспорт версии (в т. ч. `transparent_unsupported`). */
  "export",
  /** Воркер ASR упал, не уложился в таймаут или замолчал (Task 26) — ASR установлен. */
  "transcribe",
]);
export type FailureStage = z.infer<typeof FailureStageSchema>;

/** Коды `JobError.code`: Phase 1 (Task 11) и Phase 2–3 (Task 23; без этапа пайплайна). */
export const JobErrorCodeSchema = z.enum([
  "interrupted", "stale_process", "storage_unavailable", "fenced_out", "budget", "cancelled", "pipeline",
  "approval_required", "asr_unavailable", "asr_contract_changed", "asr_contract_violation", "asr_failed", "low_space", "media_invalid", "media_exists", "no_audio",
]);
export type JobErrorCode = z.infer<typeof JobErrorCodeSchema>;

const STAGE_TO_CODE: Record<FailureStage, JobErrorCode> = {
  storage: "storage_unavailable",
  prepare: "pipeline",
  director: "pipeline",
  engineer: "pipeline",
  static: "pipeline",
  typecheck: "pipeline",
  render: "pipeline",
  probe: "pipeline",
  budget: "budget",
  orphaned: "stale_process",
  cancelled: "cancelled",
  publish: "pipeline",
  interrupted: "interrupted",
  fenced_out: "fenced_out",
  concept: "pipeline",
  edit_planner: "pipeline",
  qa: "pipeline",
  export: "pipeline",
  transcribe: "asr_failed",
};

/** Код ошибки задачи по этапу неудачи пайплайна. */
export function failureToJobErrorCode(stage: FailureStage): JobErrorCode {
  return STAGE_TO_CODE[stage];
}
