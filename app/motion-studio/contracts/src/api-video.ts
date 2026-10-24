// DTO Control API видеопроекта (Task 29, 33): тела запросов и ответы; типы server — z.infer от них.
import { z } from "zod";
import { ApprovalKindSchema, ApprovalSchema, ApprovalStaleReasonSchema } from "./approvals.js";
import { EdlOpSchema, EdlRevisionDocSchema } from "./edl.js";
import { FootageAnalysisSchema } from "./footage.js";
import { JobSchema } from "./jobs.js";
import { DerivativeKindSchema, MediaAssetSchema } from "./media.js";
import { PlanOpSchema, VisualPlanRevisionDocSchema } from "./plan.js";
import { ProjectStyleBaseSchema, ProjectStyleDocSchema } from "./project-style.js";
import { SemanticTimelineSchema } from "./semantic.js";
import { ProjectDtoSchema } from "./api.js";
import { EditedTimelineSchema } from "./timeline.js";
import { TranscriptOpSchema, TranscriptRevisionDocSchema } from "./transcript.js";

const Ts = z.string().datetime();
const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Us = z.number().int().nonnegative();

/** `POST /projects/:id/media/import`: путь только внутри `media.importRoots` (V2). */
export const ImportBodySchema = z.object({ path: z.string().min(1) }).strict();
export type ImportBody = z.infer<typeof ImportBodySchema>;

/** `GET /media/:id`: файлы производных отдаются по id, путей нет. */
export const MediaDtoSchema = z.object({
  asset: MediaAssetSchema,
  derivatives: z.array(z.object({ kind: DerivativeKindSchema, sha256: z.string(), params: z.record(z.unknown()) }).strict()),
  transcript_id: Id.nullable(),
}).strict();
export type MediaDto = z.infer<typeof MediaDtoSchema>;

/** Строка списка ревизий артефакта. */
export const RevisionEntrySchema = z.object({
  revision: Revision,
  parent_revision: Revision.nullable(),
  author: z.enum(["asr", "user", "agent", "detector"]),
  created_at: Ts,
}).strict();
export type RevisionEntry = z.infer<typeof RevisionEntrySchema>;

export const TranscriptDtoSchema = z.object({
  id: Id,
  current_revision: Revision,
  doc: TranscriptRevisionDocSchema,
}).strict();
export type TranscriptDto = z.infer<typeof TranscriptDtoSchema>;

/** Правка текста — новая ревизия от `base_revision` (иначе 409 `revision_conflict`). */
export const TranscriptRevisionBodySchema = z.object({
  base_revision: Revision,
  ops: z.array(TranscriptOpSchema).min(1),
}).strict();
export type TranscriptRevisionBody = z.infer<typeof TranscriptRevisionBodySchema>;

/** Положение слова в edited (`mapWords`). */
export const WordMappingSchema = z.union([
  z.object({ state: z.enum(["kept", "clipped"]), edited_start_us: Us, edited_end_us: Us }).strict(),
  z.object({ state: z.literal("removed") }).strict(),
]);

export const EdlDtoSchema = z.object({
  id: Id,
  current_revision: Revision,
  doc: EdlRevisionDocSchema,
  timeline: EditedTimelineSchema,
  word_map: z.record(WordMappingSchema),
  /** Превью этой ревизии опубликовано (`preview/<edl>/r<N>/preview.mp4`). */
  preview_ready: z.boolean(),
}).strict();
export type EdlDto = z.infer<typeof EdlDtoSchema>;

export const EdlRevisionBodySchema = z.object({
  base_revision: Revision,
  ops: z.array(EdlOpSchema).min(1),
}).strict();
export type EdlRevisionBody = z.infer<typeof EdlRevisionBodySchema>;

export const ApprovalDtoSchema = ApprovalSchema;
export type ApprovalDto = z.infer<typeof ApprovalDtoSchema>;

/** `GET /projects/:id/approvals`: состояние A и B — как `approvalState` (Task 24). */
export const ApprovalStateDtoSchema = z.object({
  state: z.enum(["missing", "valid", "stale"]),
  approval: ApprovalSchema.optional(),
  reason: ApprovalStaleReasonSchema.optional(),
}).strict();
export const ProjectApprovalsDtoSchema = z.object({ A: ApprovalStateDtoSchema, B: ApprovalStateDtoSchema }).strict();
export type ProjectApprovalsDto = z.infer<typeof ProjectApprovalsDtoSchema>;

export const ApprovalBodySchema = z.object({ kind: ApprovalKindSchema.extract(["A", "B"]) }).strict();
export type ApprovalBody = z.infer<typeof ApprovalBodySchema>;

export const FootageDtoSchema = z.object({ media_id: Id, analysis: FootageAnalysisSchema }).strict();
export type FootageDto = z.infer<typeof FootageDtoSchema>;

export const SemanticDtoSchema = z.object({ semantic: SemanticTimelineSchema }).strict();
export type SemanticDto = z.infer<typeof SemanticDtoSchema>;

/** `GET /plans/:id`: ревизия плана и свежесть её входов (EDL, транскрипт, стиль). */
export const PlanDtoSchema = z.object({
  id: Id,
  current_revision: Revision,
  doc: VisualPlanRevisionDocSchema,
  inputs_fresh: z.object({ edl: z.boolean(), transcript: z.boolean(), style: z.boolean() }).strict(),
}).strict();
export type PlanDto = z.infer<typeof PlanDtoSchema>;

export const PlanRevisionBodySchema = z.object({
  base_revision: Revision,
  ops: z.array(PlanOpSchema).min(1),
}).strict();
export type PlanRevisionBody = z.infer<typeof PlanRevisionBodySchema>;

export const ProjectStyleDtoSchema = z.object({
  current: ProjectStyleDocSchema,
  history: z.array(RevisionEntrySchema),
}).strict();
export type ProjectStyleDto = z.infer<typeof ProjectStyleDtoSchema>;

/** `PUT /projects/:id/style`. */
export const ProjectStyleBodySchema = z.object({ base: ProjectStyleBaseSchema }).strict();
export type ProjectStyleBody = z.infer<typeof ProjectStyleBodySchema>;

/** `POST /media/:id/transcribe`: язык, модель, подсказки (проверяет обработчик `asr.transcribe`). */
export const TranscribeBodySchema = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  model: z.string().min(1).max(100).optional(),
  hotwords: z.array(z.string().max(256)).max(200).optional(),
}).strict();
export type TranscribeBody = z.infer<typeof TranscribeBodySchema>;

/** `POST /projects/:id/roughcut/propose`: `useAgent: false` — только детекторы (без LLM). */
export const RoughcutProposeBodySchema = z.object({ useAgent: z.boolean().optional() }).strict();
export type RoughcutProposeBody = z.infer<typeof RoughcutProposeBodySchema>;

/** `GET /asr/capability`: доступность ASR без путей (подробности — в журнале сервера и `doctor`). */
export const AsrCapabilityDtoSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  model: z.string(),
  gpu_contention: z.boolean().optional(),
}).strict();
export type AsrCapabilityDto = z.infer<typeof AsrCapabilityDtoSchema>;

/** `GET /projects/:id/video`: всё, что нужно экрану Video Workspace, одним запросом. */
export const VideoProjectDtoSchema = z.object({
  project: ProjectDtoSchema,
  media: MediaDtoSchema.nullable(),
  transcript: z.object({ id: Id, current_revision: Revision }).strict().nullable(),
  edl: z.object({ id: Id, current_revision: Revision, preview_ready: z.boolean() }).strict().nullable(),
  approvals: ProjectApprovalsDtoSchema,
  /** Последняя задача проекта каждого типа (импорт, ASR, монтаж, превью). */
  jobs: z.array(JobSchema),
}).strict();
export type VideoProjectDto = z.infer<typeof VideoProjectDtoSchema>;
