// Диагностика (Task 48): каталог ошибок и DTO журналов, трассировки и архива. Общий модуль
// сервера и UI (`@ms/contracts/diagnostics`): каталог — ключи словаря UI (`t()`), сервер их не
// переводит. В `index.ts` не экспортируется — реестр Task 35′.
import { z } from "zod";
import { JobEventDtoSchema } from "./api.js";
import { type JobErrorCode, JobErrorCodeSchema } from "./failure.js";
import { JobSchema } from "./jobs.js";

const Ts = z.string().datetime();
const Id = z.string().min(1);

/** Действия карточки ошибки (`ErrorCard`). */
export const ERROR_ACTIONS = ["retry", "open_logs", "open_settings", "wait_storage", "kill_process", "reapprove", "rebuild_timeline"] as const;
export type ErrorAction = (typeof ERROR_ACTIONS)[number];

export interface ErrorCatalogEntry {
  /** Ключ словаря UI: что случилось. */
  title: string;
  /** Ключ словаря UI: что делать (у ошибок API — не у всех, текст `errors.*` уже объясняет). */
  hint?: string;
  actions: readonly ErrorAction[];
}

const job = (code: JobErrorCode, actions: readonly ErrorAction[]): ErrorCatalogEntry => ({
  title: `job.errorCode.${code}`,
  hint: `diagnostics.hint.${code}`,
  actions,
});

/** Коды `JobErrorCodeSchema`: заголовок `job.errorCode.*`, подсказка `diagnostics.hint.*`. */
export const JOB_ERROR_CATALOG: Record<JobErrorCode, ErrorCatalogEntry> = {
  interrupted: job("interrupted", ["retry"]),
  stale_process: job("stale_process", ["kill_process", "retry"]),
  storage_unavailable: job("storage_unavailable", ["wait_storage", "retry"]),
  fenced_out: job("fenced_out", ["open_logs"]),
  budget: job("budget", ["open_settings", "retry"]),
  cancelled: job("cancelled", ["retry"]),
  pipeline: job("pipeline", ["retry", "open_logs"]),
  approval_required: job("approval_required", ["reapprove"]),
  asr_unavailable: job("asr_unavailable", ["open_settings", "open_logs"]),
  asr_contract_changed: job("asr_contract_changed", ["open_logs"]),
  asr_contract_violation: job("asr_contract_violation", ["retry", "open_logs"]),
  asr_failed: job("asr_failed", ["retry", "open_logs"]),
  low_space: job("low_space", ["wait_storage", "retry"]),
  media_invalid: job("media_invalid", ["open_logs"]),
  media_exists: job("media_exists", []),
  no_audio: job("no_audio", []),
  plan_exists: job("plan_exists", []),
  semantic_skipped: job("semantic_skipped", []),
  package_empty: job("package_empty", []),
  timeline_stale: job("timeline_stale", ["rebuild_timeline"]),
  scene_not_ready: job("scene_not_ready", ["retry"]),
  version_failed: job("version_failed", ["retry", "open_logs"]),
  verify_failed: job("verify_failed", ["retry", "open_logs"]),
  stalled: job("stalled", ["retry", "open_logs"]),
  project_busy: job("project_busy", ["retry"]),
};

/** Ошибки API без особых действий: заголовок — `errors.<код>`. */
const API_PLAIN = [
  "anchor_in_cut", "approval_unsupported", "bad_range", "blocking_issues", "confirm_mismatch", "edl_not_found", "empty_block",
  "empty_cut", "empty_ops", "empty_patch", "empty_range", "export_not_ready", "footage_missing", "fst_err_ctp_body_too_large", "generic",
  "idempotency_key_reused", "import_in_progress", "intent_expired", "invalid_text", "invalid_title", "item_stale",
  "items_unresolved", "job_not_awaiting_input", "job_not_retryable", "length_required", "media_exists", "media_invalid",
  "media_not_found", "no_change", "no_current_version", "no_edl", "no_items", "no_media", "no_plan", "no_script", "no_style",
  "no_transcript", "no_versions", "not_found", "not_implemented", "not_script_project", "not_video_project", "nothing_to_fill",
  "order", "overlap", "overlay_mp4", "overlay_unsupported", "plan_exists", "plan_not_found", "project_archived", "project_deleted",
  "project_protected", "proposed_left", "purge_retry_forbidden", "quarantine_not_found", "quote_mismatch", "restore_conflict",
  "script_too_long", "semantic_missing", "span_too_large", "style_contrast", "style_invalid", "too_many_ops", "transcript_not_found",
  "trash_not_found", "trash_purging", "unknown_decision", "unknown_item", "unknown_word", "upload_aborted",
  "upload_length_mismatch", "upload_too_large", "validation", "version_not_ready", "word_out_of_range",
] as const;

/** Ошибки API с действием. */
const API_ACTIONS: Record<string, readonly ErrorAction[]> = {
  approval_required: ["reapprove"],
  plan_outdated: ["reapprove"],
  forbidden_origin: ["open_logs"],
  internal: ["open_logs"],
  network: ["retry"],
  low_space: ["wait_storage"],
  storage_offline: ["wait_storage"],
  process_alive: ["kill_process"],
  stale_process_alive: ["kill_process"],
  project_busy: ["retry"],
  resource_busy: ["retry"],
  revision_conflict: ["retry"],
  version_broken: ["open_logs"],
};

/** Коды ошибок Control API (`{ error: <код> }`) и клиента (`network`): ключ `errors.<код>`. */
export const API_ERROR_CATALOG: Record<string, ErrorCatalogEntry> = Object.fromEntries([
  ...API_PLAIN.map((c) => [c, { title: `errors.${c}`, actions: [] }] as const),
  ...Object.entries(API_ACTIONS).map(([c, actions]) => [c, { title: `errors.${c}`, actions }] as const),
]);

/**
 * Каталог ошибок: каждый код `JobErrorCodeSchema` и каждый код API из словарей UI. Коды,
 * совпадающие у задачи и API (`low_space`, `project_busy`…), — у задачи свой заголовок и
 * подсказка (`explainError` различает их по `kind`).
 */
export const ERROR_CATALOG: Record<string, ErrorCatalogEntry> = { ...API_ERROR_CATALOG, ...JOB_ERROR_CATALOG };

/** Понятный вид ошибки: ключи словаря, действия, исходное сообщение (технические подробности). */
export interface ErrorView {
  kind: "job" | "api";
  code: string;
  title: string;
  hint?: string;
  actions: readonly ErrorAction[];
  message: string;
  stage?: string;
  /** Код не из каталога: показывать общий заголовок с исходным сообщением. */
  unknown: boolean;
}

const UNKNOWN: ErrorCatalogEntry = { title: "errors.generic", actions: ["open_logs"] };

/**
 * Ошибка задачи (`{ code, message, stage? }`) или API (`{ error, message }`) → вид для карточки.
 * Код задачи ищется сначала в каталоге задач, код API — в каталоге API.
 */
export function explainError(e: { code: string; message?: string; stage?: string } | { error: string; message?: string }): ErrorView {
  const kind = "code" in e ? "job" : "api";
  const code = "code" in e ? e.code : e.error;
  const entry = kind === "job"
    ? (JOB_ERROR_CATALOG as Record<string, ErrorCatalogEntry>)[code] ?? API_ERROR_CATALOG[code]
    : API_ERROR_CATALOG[code] ?? (JOB_ERROR_CATALOG as Record<string, ErrorCatalogEntry>)[code];
  const e2 = entry ?? UNKNOWN;
  return {
    kind,
    code,
    title: e2.title,
    ...(e2.hint ? { hint: e2.hint } : {}),
    actions: e2.actions,
    message: e.message ?? "",
    ...("stage" in e && e.stage ? { stage: e.stage } : {}),
    unknown: entry === undefined,
  };
}

/** Проверка, что коды задач покрыты (для тестов и `satisfies`). */
export const JOB_ERROR_CODES: readonly JobErrorCode[] = JobErrorCodeSchema.options;

// ---- журнал сервера ----

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export const LogLevelSchema = z.enum(LOG_LEVELS);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/** Запись журнала `logs/server-YYYY-MM-DD.jsonl`: корреляционные поля — необязательные. */
export const LogEntrySchema = z.object({
  ts: Ts,
  level: LogLevelSchema,
  msg: z.string(),
  project_id: Id.optional(),
  scene_id: Id.optional(),
  version_id: Id.optional(),
  job_id: Id.optional(),
  attempt: z.number().int().nonnegative().optional(),
  agent_run_id: Id.optional(),
  render_job_id: Id.optional(),
  kind: z.string().optional(),
  data: z.unknown().optional(),
}).strict();
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LOGS_MAX_LIMIT = 1000;

export const LogsQuerySchema = z.object({
  level: LogLevelSchema.optional(),
  jobId: Id.max(200).optional(),
  projectId: Id.max(200).optional(),
  since: Ts.optional(),
  limit: z.coerce.number().int().min(1).max(LOGS_MAX_LIMIT).optional(),
}).strict();
export type LogsQuery = z.infer<typeof LogsQuerySchema>;

// ---- трассировка задачи ----

export const AgentRunDtoSchema = z.object({
  id: Id,
  job_id: Id,
  role: z.string(),
  model: z.string(),
  status: z.string(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  cost_usd: z.number().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
}).strict();
export type AgentRunDto = z.infer<typeof AgentRunDtoSchema>;

export const RenderJobDtoSchema = z.object({
  id: Id,
  job_id: Id,
  version_id: z.string().nullable(),
  kind: z.string(),
  codec: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  frames: z.number().nullable(),
  duration_ms: z.number().nullable(),
}).strict();
export type RenderJobDto = z.infer<typeof RenderJobDtoSchema>;

/** `GET /api/jobs/:id/trace`: проект → сцена → версия → задача → запуски агентов → рендеры (ТЗ §12). */
export const JobTraceDtoSchema = z.object({
  project: z.object({ id: Id, kind: z.string(), title: z.string() }).strict(),
  scene: z.object({ id: Id, title: z.string() }).strict().optional(),
  version: z.object({ id: Id, number: z.number().int(), status: z.string() }).strict().optional(),
  job: JobSchema,
  children: z.array(JobSchema),
  agentRuns: z.array(AgentRunDtoSchema),
  renderJobs: z.array(RenderJobDtoSchema),
  events: z.array(JobEventDtoSchema),
  /** Стоимость задачи и дочерних по журналу агентов (все попытки); `unknown` — вызовы без цены. */
  cost: z.object({ usd: z.number().nonnegative(), runs: z.number().int().nonnegative(), unknown: z.number().int().nonnegative() }).strict(),
}).strict();
export type JobTraceDto = z.infer<typeof JobTraceDtoSchema>;

// ---- архив диагностики ----

export const BundleBodySchema = z.object({ includePrompts: z.boolean().default(false) }).strict();
export type BundleBody = z.infer<typeof BundleBodySchema>;

export const BUNDLE_NAME_RE = /^diag-\d{8}T\d{6}(-\d+)?\.zip$/;

export const BundleDtoSchema = z.object({
  name: z.string().regex(BUNDLE_NAME_RE),
  status: z.enum(["building", "ready", "failed"]),
  bytes: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  created_at: Ts,
}).strict();
export type BundleDto = z.infer<typeof BundleDtoSchema>;

// ---- затраты (Task 49a) ----

/**
 * Фильтр сводки затрат: проект, сцена, начало периода (ISO), задачи (пакет генерации). Стоимость —
 * расчётная по данным CLI (`agent_runs.cost_usd`), справочно: не счёт подписки, гейта нет (Р-V7).
 */
export interface CostFilter {
  projectId?: string;
  sceneId?: string;
  /** Все задачи этих сцен (пакет генерации: сцены пакета, все их генерации и правки). */
  sceneIds?: string[];
  since?: string;
  jobIds?: string[];
}

/** Id в строке запроса: 200 × ~30 символов — далеко от предела заголовка Node (16 КиБ). */
export const COST_MAX_JOB_IDS = 200;

/**
 * `GET /api/costs`: `?projectId&sceneId&batchId&days|since&jobIds=a,b` (до `COST_MAX_JOB_IDS` id).
 * `batchId` — пакет генерации сценария: сумма всех задач его сцен, состав считает сервер.
 */
export const CostQuerySchema = z.object({
  projectId: Id.max(200).optional(),
  sceneId: Id.max(200).optional(),
  batchId: Id.max(200).optional(),
  /** Последние N дней (7/30 в UI); `since` — точное начало. */
  days: z.coerce.number().int().min(1).max(3650).optional(),
  since: Ts.optional(),
  jobIds: z.string().min(1).max(10_000).optional(),
}).strict();
export type CostQuery = z.infer<typeof CostQuerySchema>;

const Usd = z.number().nonnegative();

export const CostSummaryDtoSchema = z.object({
  totalUsd: Usd,
  byRole: z.record(z.string(), Usd),
  byModel: z.record(z.string(), Usd),
  byScene: z.array(z.object({ sceneId: Id, usd: Usd }).strict()),
  /** Вызовов агентов. */
  calls: z.number().int().nonnegative(),
  /** Вызовов без цены: сумма — нижняя граница. */
  unknown: z.number().int().nonnegative(),
}).strict();
export type CostSummaryDto = z.infer<typeof CostSummaryDtoSchema>;

// ---- уборка кэша (Task 49a) ----

/** `POST /api/cache/gc`: задача `cache.gc` (`Idempotency-Key`); `maxBytes` — вместо `cache.maxBytes`. */
export const CacheGcBodySchema = z.object({ maxBytes: z.number().int().min(0).optional() }).strict();
export type CacheGcBody = z.infer<typeof CacheGcBodySchema>;
