// DTO Control API Phase 4–6 (Task 35′): сцены видеопроекта, пакет и Approval C (38-39, 40),
// превью в контексте, папка клипов (5L), таймлайн и финал (42, 43, 45), жизненный цикл
// проекта и восстановление (47), диагностика (48), каталог ошибок (51). Следующие задачи
// добавляют только необязательные поля в конец схем (`// Task <id>:`).
import { z } from "zod";
import { ApprovalStaleReasonSchema } from "./approvals.js";
import { ScriptItemStatusSchema } from "./api-script.js";
import { FinalExportRequestSchema, FinalVerifyReportSchema } from "./final.js";
import { JobErrorCodeSchema } from "./failure.js";
import { JobSchema } from "./jobs.js";
import { QAIssueSchema } from "./qa.js";
import { VideoTimelineDocSchema, TimelineOpSchema } from "./timeline-render.js";
import { PlacementSchema, VideoPackageManifestSchema } from "./video-scene.js";

const Ts = z.string().datetime();
const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Count = z.number().int().nonnegative();

/** Статус видеосцены (как у сцены сценария): `none` — генерации не было. */
export const VideoSceneStatusSchema = ScriptItemStatusSchema;
export type VideoSceneStatus = z.infer<typeof VideoSceneStatusSchema>;

/** Approval C сцены: на версию (`scene:<id>@r<N>`), Р-V4. */
export const SceneApprovalDtoSchema = z.object({
  state: z.enum(["missing", "valid", "stale"]),
  approval_id: Id.optional(),
  version_id: Id.optional(),
  version_number: z.number().int().positive().optional(),
  reason: ApprovalStaleReasonSchema.optional(),
}).strict();
export type SceneApprovalDto = z.infer<typeof SceneApprovalDtoSchema>;

/** Сцена плана видеопроекта и её сцена Playground (`video_scenes`). */
export const VideoSceneDtoSchema = z.object({
  item_id: Id,
  scene_id: Id.nullable(),
  status: VideoSceneStatusSchema,
  job: JobSchema.nullable(),
  version_id: Id.nullable(),
  version_number: z.number().int().positive().nullable(),
  approval: SceneApprovalDtoSchema,
  /** Отпечаток сцены плана изменился после генерации — сцену нужно перегенерировать. */
  stale: z.boolean(),
  placement: PlacementSchema,
  frames: z.object({ start: Count, end: Count }).strict(),
  quote: z.string(),
  // Task 38-39: утверждённая версия (C), очередь последней задачи сцены, замечания QA текущей версии
  approved_version_id: Id.nullable().optional(),
  approved_version_number: z.number().int().positive().nullable().optional(),
  /** Задача сцены ждёт в очереди: перед ней `ahead` задач, держит замок `blocking_job_id`. */
  queue: z.object({ ahead: Count, blocking_job_id: Id.optional() }).strict().nullable().optional(),
  qa_warnings: z.array(QAIssueSchema).optional(),
  /** Ревью 38-39 (I2): последнее превью в контексте утверждённой (иначе текущей) версии; `outdated` — перерисовать. */
  context_preview: z.object({ version_id: Id, rel_path: z.string().min(1), plan_revision: Revision, pad_frames: Count, outdated: z.boolean() }).strict().nullable().optional(),
}).strict();
export type VideoSceneDto = z.infer<typeof VideoSceneDtoSchema>;

/** `POST /api/projects/:id/video/generate`: Approval B на ревизию `revision` + пакет. */
export const VideoGenerateBodySchema = z.object({
  revision: Revision,
  item_ids: z.array(Id).min(1).optional(),
  regenerate: z.boolean().optional(),
}).strict();
export type VideoGenerateBody = z.infer<typeof VideoGenerateBodySchema>;

/** Пакет генерации видеосцен (`video_batches`) — набор обычных задач (Р-V2). */
export const VideoBatchDtoSchema = z.object({
  id: Id,
  plan_revision: Revision,
  items: z.array(z.object({
    item_id: Id,
    scene_id: Id,
    job: JobSchema.nullable(),
    version_id: Id.nullable(),
    status: VideoSceneStatusSchema,
  }).strict()),
  counts: z.object({ total: Count, pending: Count, running: Count, ready: Count, failed: Count, cancelled: Count, blocked: Count }).strict(),
  /** Причина — код (`ready_version`, `not_accepted`); текст — словарь UI. */
  skipped: z.array(z.object({ item_id: Id, reason: z.string().min(1) }).strict()).optional(),
  // Task 40: пакет полный (без item_ids и regenerate) — готовые сцены вне пакета считаются готовыми
  full: z.boolean().optional(),
}).strict();
export type VideoBatchDto = z.infer<typeof VideoBatchDtoSchema>;

/** `POST /api/scenes/:id/approve`: утвердить версию сцены. */
export const ApproveSceneBodySchema = z.object({ version_id: Id }).strict();
export type ApproveSceneBody = z.infer<typeof ApproveSceneBodySchema>;

/** `POST /api/scenes/:id/preview-context`: превью версии поверх исходника с полями. */
export const PreviewContextBodySchema = z.object({ version_id: Id, pad_frames: Count.optional() }).strict();
export type PreviewContextBody = z.infer<typeof PreviewContextBodySchema>;

/** Папка клипов видеопроекта (`video_packages`, Phase 5-lite). */
export const VideoPackageDtoSchema = z.object({
  id: Id,
  rel_path: z.string().min(1),
  abs_path: z.string().min(1),
  display_name: z.string().min(1),
  manifest: VideoPackageManifestSchema,
  created_at: Ts,
}).strict();
export type VideoPackageDto = z.infer<typeof VideoPackageDtoSchema>;

/** `GET /api/projects/:id/video/scenes`: всё состояние сцен видеопроекта одним ответом. */
export const VideoScenesStateDtoSchema = z.object({
  project_id: Id,
  plan: z.object({ id: Id, revision: Revision }).strict().nullable(),
  /** Approval B текущей ревизии плана. */
  approval_b: z.object({ state: z.enum(["missing", "valid", "stale"]), ref: z.string().optional(), reason: ApprovalStaleReasonSchema.optional() }).strict(),
  scenes: z.array(VideoSceneDtoSchema),
  batches: z.array(VideoBatchDtoSchema),
  packages: z.array(VideoPackageDtoSchema),
}).strict();
export type VideoScenesStateDto = z.infer<typeof VideoScenesStateDtoSchema>;

/** Почему таймлайн устарел относительно текущих входов и C. */
export const TimelineStaleReasonSchema = z.enum(["edl_changed", "plan_changed", "style_changed", "version_changed", "approval_stale"]);
export type TimelineStaleReason = z.infer<typeof TimelineStaleReasonSchema>;

/** `GET /projects/:id/timeline`. */
export const TimelineDtoSchema = z.object({
  timeline_id: Id,
  revision: Revision,
  doc: VideoTimelineDocSchema,
  fresh: z.boolean(),
  reasons: z.array(TimelineStaleReasonSchema),
  /** Задача `timeline.build` / `timeline.preview` проекта (последняя), если есть. */
  job: JobSchema.nullable(),
  preview_ready: z.boolean(),
}).strict();
export type TimelineDto = z.infer<typeof TimelineDtoSchema>;

/** `POST /timelines/:id/revisions`. */
export const TimelineRevisionBodySchema = z.object({ base_revision: Revision, ops: z.array(TimelineOpSchema).min(1) }).strict();
export type TimelineRevisionBody = z.infer<typeof TimelineRevisionBodySchema>;

/** `POST /timelines/:id/final`: явное действие «Смонтировать и экспортировать» (F6). */
export const FinalExportBodySchema = z.object({ revision: Revision, request: FinalExportRequestSchema }).strict();
export type FinalExportBody = z.infer<typeof FinalExportBodySchema>;

/** Экспорт финала (`final_exports`). */
export const FinalExportDtoSchema = z.object({
  id: Id,
  timeline_id: Id,
  timeline_revision: Revision,
  request: FinalExportRequestSchema,
  status: z.enum(["ready", "failed_verification"]),
  verify: FinalVerifyReportSchema.nullable(),
  job: JobSchema.nullable(),
  created_at: Ts,
}).strict();
export type FinalExportDto = z.infer<typeof FinalExportDtoSchema>;

/** Архив и удаление проекта (Task 47). */
export const ProjectLifecycleDtoSchema = z.object({
  project_id: Id,
  archived_at: Ts.nullable(),
  deleted_at: Ts.nullable(),
  /** Не завершённые задачи проекта (в т. ч. сценарный пакет): удаление и архив — 409 `project_busy`. */
  active_jobs: Count,
}).strict();
export type ProjectLifecycleDto = z.infer<typeof ProjectLifecycleDtoSchema>;

/** Намерение удалить проект: что уйдёт в корзину; удаление — вторым запросом с `token`. */
export const DeleteIntentDtoSchema = z.object({
  project_id: Id,
  token: z.string().min(1),
  bytes: Count,
  files: Count,
  active_jobs: Count,
  expires_at: Ts,
  // Task 47: сводка «что будет удалено» для диалога подтверждения
  title: z.string().optional(),
  scenes: Count.optional(),
  versions: Count.optional(),
  exports: Count.optional(),
  /** Папки пакетов `packages/` (сценарий, Phase 5-lite). */
  packages: Count.optional(),
  /** id незавершённых задач (в т. ч. сценарного пакета): удаление — 409 `project_busy`. */
  active_job_ids: z.array(Id).optional(),
}).strict();
export type DeleteIntentDto = z.infer<typeof DeleteIntentDtoSchema>;

/** Центр восстановления после сбоя (Task 47): отчёт старта и задачи, требующие решения. */
export const RecoveryDtoSchema = z.object({
  boot: z.object({
    id: Id, created_at: Ts, crashed: z.boolean(), acknowledged_at: Ts.nullable(),
    // Task 47: итог восстановления для баннера (восстановлено / заблокировано / в карантине / не удалось)
    summary: z.object({ recovered: Count, blocked: Count, quarantined: Count, failed: Count }).strict().optional(),
    // S20: предупреждения старта — копия хранилища (`store_copied`), процесс другого живого сервера (`foreign_process`)
    warnings: z.array(z.object({ kind: z.string().min(1), message: z.string().min(1), job_id: Id.optional(), owner_pids: z.array(z.number().int().positive()).optional() }).strict()).optional(),
  }).strict().nullable(),
  interrupted: z.array(JobSchema),
  blocked: z.array(JobSchema),
  quarantined: z.array(z.object({
    rel_path: z.string().min(1), reason: z.string().min(1),
    // Task 47: попытка, размер и время карантина (журнал — по задаче)
    job_id: Id.nullable().optional(), attempt: z.number().int().nonnegative().nullable().optional(), bytes: Count.optional(), at: Ts.nullable().optional(),
  }).strict()),
}).strict();
export type RecoveryDto = z.infer<typeof RecoveryDtoSchema>;

/** `doctor` в UI (Task 48): строки проверок как у CLI (`CheckRow`). */
export const DoctorReportDtoSchema = z.object({
  ok: z.boolean(),
  rows: z.array(z.object({ name: z.string().min(1), ok: z.boolean(), status: z.string().min(1), detail: z.string() }).strict()),
  created_at: Ts,
}).strict();
export type DoctorReportDto = z.infer<typeof DoctorReportDtoSchema>;

/** Понятный вид ошибки задачи (каталог ошибок, Task 48/51): что случилось и что делать. */
export const ErrorViewDtoSchema = z.object({
  code: JobErrorCodeSchema,
  title: z.string().min(1),
  message: z.string(),
  hint: z.string().optional(),
  job_id: Id.optional(),
  stage: z.string().optional(),
}).strict();
export type ErrorViewDto = z.infer<typeof ErrorViewDtoSchema>;
