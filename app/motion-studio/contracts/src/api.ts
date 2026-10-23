// DTO Control API (Task 20): тела запросов и ответы; типы server — z.infer от них.
import { z } from "zod";
import { ChatMessageSchema } from "./chat.js";
import { JobSchema } from "./jobs.js";
import { VersionManifestSchema } from "./manifest.js";
import { QAReportSchema, QaGateSchema } from "./qa.js";
import { KnowledgeRefSchema } from "./selection.js";
import { SettingsFieldsSchema, SettingsSchema } from "./settings.js";
import { StyleBibleSchema } from "./style.js";

const Ts = z.string().datetime();
const Id = z.string().min(1);

/** Строка истории версий сцены; `palette` — разрешённая палитра StyleBible (H3). */
export const HistoryEntrySchema = z.object({
  version_id: Id,
  number: z.number().int().min(1),
  status: z.enum(["ready", "failed"]),
  parent_version_id: Id.nullable(),
  prompt: z.string(),
  palette: StyleBibleSchema.shape.palette,
  depth: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  duration_frames: z.number().int().positive(),
  qa: QaGateSchema.nullable(),
  created_at: Ts,
}).strict();
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/** Изменение JSON по пути JSON Pointer (RFC 6901); нет `before` — добавлено, нет `after` — удалено. */
export const JsonChangeSchema = z.object({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
}).strict();
export type JsonChange = z.infer<typeof JsonChangeSchema>;

export const VersionDiffSchema = z.object({
  settings: z.array(JsonChangeSchema),
  props: z.array(JsonChangeSchema),
  spec: z.array(JsonChangeSchema),
  files: z.array(z.object({
    path: z.string().min(1),
    status: z.enum(["added", "removed", "changed", "same"]),
    unified: z.string().optional(),
  }).strict()),
}).strict();
export type VersionDiff = z.infer<typeof VersionDiffSchema>;

/** Поиск KB (`GET /kb/search`) отдаёт не больше стольких лучших совпадений. */
export const KB_SEARCH_TOP = 30;

export const KbHitDtoSchema = z.object({
  id: Id,
  name: z.string(),
  kind: z.string(),
  patterns: z.array(z.string()),
  license: z.string(),
  license_class: KnowledgeRefSchema.shape.license_class,
  compatibility: z.string(),
  repository_url: z.string(),
  commit: z.string(),
  score: z.number(),
}).strict();
export type KbHitDto = z.infer<typeof KbHitDtoSchema>;

export const ProjectDtoSchema = z.object({
  id: Id,
  kind: z.enum(["playground", "video"]),
  title: z.string(),
  settings: SettingsSchema.nullable(),
  created_at: Ts,
  updated_at: Ts,
}).strict();
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const SceneDtoSchema = z.object({
  id: Id,
  project_id: Id,
  title: z.string(),
  current_version_id: Id.nullable(),
  approved_version_id: Id.nullable(),
  created_at: Ts,
}).strict();
export type SceneDto = z.infer<typeof SceneDtoSchema>;

/** `GET /versions/:id`: manifest и файлы версии; `render_env_mismatch` — рендер в другом окружении. */
export const VersionDtoSchema = z.object({
  manifest: VersionManifestSchema,
  spec: z.unknown().nullable(),
  props: z.unknown().nullable(),
  settings: SettingsSchema,
  qa: QAReportSchema.nullable(),
  knowledge_refs: z.array(KnowledgeRefSchema),
  render_env_mismatch: z.boolean(),
  /** Примитивы motion-kit, которые импортирует код версии (`src/**`), по алфавиту (Task 21). */
  kit_components: z.array(z.string()),
  /** Файлы версии из manifest, которые не удалось прочитать (остальное отдано как есть). */
  unreadable_files: z.array(z.string()),
  /** Время и стоимость генерации из `pipeline-log.json` версии; у версий без журнала — null. */
  generation: z.object({
    cost_usd: z.number().nonnegative().nullable(),
    wall_ms: z.number().nonnegative().nullable(),
  }).strict().nullable(),
}).strict();
export type VersionDto = z.infer<typeof VersionDtoSchema>;

export const JobDtoSchema = JobSchema;
export type JobDto = z.infer<typeof JobDtoSchema>;

/** Событие журнала задачи (`job_events`, SSE `event: job`); `id` монотонный. */
export const JobEventDtoSchema = z.object({
  id: z.number().int().positive(),
  job_id: Id,
  ts: Ts,
  level: z.enum(["debug", "info", "warn", "error"]),
  kind: z.string().min(1),
  message: z.string(),
  data: z.unknown().optional(),
}).strict();
export type JobEventDto = z.infer<typeof JobEventDtoSchema>;

export const ChatMessageDtoSchema = ChatMessageSchema;

export const CreateProjectBodySchema = z.object({ title: z.string().min(1), settings: SettingsSchema.optional() }).strict();
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const CreateSceneBodySchema = z.object({
  prompt: z.string().min(1),
  settings: SettingsSchema,
  allowRestricted: z.boolean().optional(),
}).strict();
export type CreateSceneBody = z.infer<typeof CreateSceneBodySchema>;

export const ChatBodySchema = z.object({ text: z.string().min(1), baseVersionId: Id.optional() }).strict();
export type ChatBody = z.infer<typeof ChatBodySchema>;

/**
 * Кнопка Render: патч настроек; итог проверяется `SettingsSchema` после слияния. `base_version_id` —
 * версия, относительно настроек которой UI посчитал патч (как `baseVersionId` у чата); без
 * него — текущая версия сцены.
 */
export const RenderBodySchema = z.object({ settings_patch: SettingsFieldsSchema.partial(), base_version_id: Id.optional() }).strict();
export type RenderBody = z.infer<typeof RenderBodySchema>;

export const RestoreBodySchema = z.object({ versionId: Id }).strict();
export type RestoreBody = z.infer<typeof RestoreBodySchema>;

/** Ответ на уточнения Concept: ответы с ключом — текстом вопроса (индекс тоже принимается) или пропуск (умолчания). */
export const JobInputBodySchema = z.union([
  z.object({ answers: z.record(z.string()) }).strict(),
  z.object({ skip: z.literal(true) }).strict(),
]);
export type JobInputBody = z.infer<typeof JobInputBodySchema>;

/** `GET /settings`: действующие настройки приложения (`$MS_DATA_DIR/config.json` + умолчания). */
export const AppSettingsDtoSchema = z.object({
  agents: z.record(z.object({ model: z.string().min(1), timeoutMs: z.number().int().positive(), maxBudgetUsd: z.number().positive() }).strict()),
  scene: z.object({ maxCostUsd: z.number().positive(), maxAutoFixes: z.number().int().min(0) }).strict(),
  limits: z.object({
    maxRunning: z.number().int().positive(),
    agentCalls: z.number().int().positive(),
    renders: z.number().int().positive(),
    exportTimeoutMs: z.number().int().positive(),
  }).strict(),
  defaults: SettingsSchema,
}).strict();
export type AppSettingsDto = z.infer<typeof AppSettingsDtoSchema>;

/** Доступность внешнего инструмента для `GET /health`: без запуска моделей и загрузок. */
export const CapabilitySchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  detail: z.string().optional(),
}).strict();
export type Capability = z.infer<typeof CapabilitySchema>;

export const HealthDtoSchema = z.object({
  storage: z.enum(["online", "storage_offline"]),
  /** Причина `storage_offline`. */
  storage_reason: z.string().optional(),
  claude: CapabilitySchema,
  chrome: CapabilitySchema,
  ffmpeg: CapabilitySchema,
  owner: z.object({ pid: z.number().int().positive(), kind: z.enum(["server", "cli"]) }).strict(),
  /** Задачи в очереди на момент старта (после восстановления): раннер возобновляет их сам (F9). */
  queued_at_start: z.object({ pending: z.number().int().min(0), running: z.number().int().min(0) }).strict(),
}).strict();
export type HealthDto = z.infer<typeof HealthDtoSchema>;

/** Строка `exports` (+ сцена версии); `path` — относительно корня хранилища. */
export const ExportDtoSchema = z.object({
  id: Id,
  version_id: Id,
  scene_id: Id,
  job_id: Id.nullable(),
  format: z.enum(["mp4", "prores4444"]),
  path: z.string().min(1),
  sha256: z.string(),
  created_at: Ts,
}).strict();
export type ExportDto = z.infer<typeof ExportDtoSchema>;

/** `GET /projects/:id`: сцены с текущей версией (строка истории) и последние экспорты проекта. */
export const ProjectDetailDtoSchema = z.object({
  project: ProjectDtoSchema,
  /** `latest_version` — последняя по номеру (в т. ч. failed): карточка сцены без готовой версии. */
  scenes: z.array(SceneDtoSchema.extend({ current_version: HistoryEntrySchema.nullable(), latest_version: HistoryEntrySchema.nullable() })),
  exports: z.array(ExportDtoSchema),
}).strict();
export type ProjectDetailDto = z.infer<typeof ProjectDetailDtoSchema>;

/** `GET /scenes/:id`: история версий и незавершённая задача сцены (последняя). */
export const SceneDetailDtoSchema = z.object({
  scene: SceneDtoSchema,
  versions: z.array(HistoryEntrySchema),
  active_job: JobSchema.nullable(),
}).strict();
export type SceneDetailDto = z.infer<typeof SceneDetailDtoSchema>;

/** Процесс попытки из реестра (`blocked`: UI показывает PID и команду). */
export const JobProcessDtoSchema = z.object({
  pid: z.number().int().positive(),
  pgid: z.number().int().positive(),
  attempt: z.number().int().nonnegative(),
  cmd: z.string(),
  started_at: z.string(),
  alive: z.boolean(),
}).strict();

export const JobDetailDtoSchema = z.object({
  job: JobSchema,
  events: z.array(JobEventDtoSchema),
  processes: z.array(JobProcessDtoSchema),
}).strict();
export type JobDetailDto = z.infer<typeof JobDetailDtoSchema>;

/** `GET /kb/:id`: запись KB (CapabilityView, поля — `02` §4.1) и карточка markdown. */
export const KbCardDtoSchema = z.object({
  capability: z.object({ id: Id, name: z.string(), kind: z.string(), license_class: KnowledgeRefSchema.shape.license_class }).passthrough(),
  card: z.string(),
}).strict();
export type KbCardDto = z.infer<typeof KbCardDtoSchema>;

/** Ответы POST, создающих задачи: 202 (новая) или 200 (повтор с тем же Idempotency-Key). */
export const CreatedSceneDtoSchema = z.object({ scene: SceneDtoSchema, job: JobSchema }).strict();
export const CreatedMessageDtoSchema = z.object({ message: ChatMessageSchema, job: JobSchema }).strict();
export const CreatedJobDtoSchema = z.object({ job: JobSchema }).strict();

/** Ошибка API: машинный код и сообщение (+ поля по коду: `issues`, `pids`, `cmds`). */
export const ApiErrorSchema = z.object({ error: z.string().min(1), message: z.string() }).passthrough();
export type ApiError = z.infer<typeof ApiErrorSchema>;
