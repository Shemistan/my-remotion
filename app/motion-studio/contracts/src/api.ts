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

/** Кнопка Render: патч настроек; итог проверяется `SettingsSchema` после слияния. */
export const RenderBodySchema = z.object({ settings_patch: SettingsFieldsSchema.partial() }).strict();
export type RenderBody = z.infer<typeof RenderBodySchema>;

export const RestoreBodySchema = z.object({ versionId: Id }).strict();
export type RestoreBody = z.infer<typeof RestoreBodySchema>;

/** Ответ на уточнения Concept: ответы по индексу вопроса или пропуск (умолчания). */
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
