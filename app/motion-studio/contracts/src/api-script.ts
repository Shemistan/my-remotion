// DTO Control API сценарного проекта (спека 2026-10-24-script-to-motion §7): тела запросов и
// ответы; типы server и web — z.infer от них.
import { z } from "zod";
import { ProjectDtoSchema } from "./api.js";
import { ApprovalStaleReasonSchema } from "./approvals.js";
import { JobSchema } from "./jobs.js";
import { Sha256Schema } from "./manifest.js";
import { PlanIssueSchema } from "./plan.js";
import { ProjectStyleDocSchema } from "./project-style.js";
import { QAIssueSchema } from "./qa.js";
import {
  AspectSchema,
  ReadingSettingsSchema,
  ScriptPlanOpSchema,
  ScriptPlanRevisionDocSchema,
  ScriptRevisionDocSchema,
} from "./script.js";

const Ts = z.string().datetime();
const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Count = z.number().int().nonnegative();

/** `PUT /projects/:id/script`: блоки как вставил человек; пустой текст блока — 400 `empty_block` (код). */
export const PutScriptBodySchema = z.object({
  base_revision: Revision.optional(),
  blocks: z.array(z.object({ title: z.string(), text: z.string() }).strict()).min(1),
}).strict();
export type PutScriptBody = z.infer<typeof PutScriptBodySchema>;

/** Ответ `PUT /projects/:id/script`: новая ревизия текста и скорость чтения (плана или по умолчанию). */
export const ScriptDtoSchema = z.object({
  script: ScriptRevisionDocSchema,
  reading: ReadingSettingsSchema,
}).strict();
export type ScriptDto = z.infer<typeof ScriptDtoSchema>;

/** `POST /projects/:id/script/plan`: скорость чтения — до плана; после — операция `set_reading`. */
export const ScriptPlanBodySchema = z.object({ useAgent: z.boolean().optional(), reading: ReadingSettingsSchema.optional() }).strict();
export type ScriptPlanBody = z.infer<typeof ScriptPlanBodySchema>;

/** `POST /projects/:id/script/plan/ops`. */
export const PlanOpsBodySchema = z.object({ base_revision: Revision, ops: z.array(ScriptPlanOpSchema).min(1) }).strict();
export type PlanOpsBody = z.infer<typeof PlanOpsBodySchema>;

/** Approval B текущей ревизии плана; `ref` — `plan:<id>@r<N>` утверждённой ревизии. */
export const ScriptApprovalSchema = z.object({
  state: z.enum(["missing", "valid", "stale"]),
  ref: z.string().optional(),
  reason: ApprovalStaleReasonSchema.optional(),
}).strict();
export type ScriptApproval = z.infer<typeof ScriptApprovalSchema>;

/** Ревизия плана сценария для UI (ответ `plan/ops`). */
export const ScriptPlanDtoSchema = z.object({
  plan_id: Id,
  doc: ScriptPlanRevisionDocSchema,
  approval: ScriptApprovalSchema,
}).strict();
export type ScriptPlanDto = z.infer<typeof ScriptPlanDtoSchema>;

/** `POST /projects/:id/script/generate`: Approval B на ревизию `revision` + пакет генерации. */
export const GenerateBodySchema = z.object({
  revision: Revision,
  item_ids: z.array(Id).min(1).optional(),
  regenerate: z.boolean().optional(),
  aspect: AspectSchema.optional(),
}).strict();
export type GenerateBody = z.infer<typeof GenerateBodySchema>;

/** `POST /projects/:id/script/reframe`: вертикальные двойники (все принятые или выбранные). */
export const ReframeBodySchema = z.object({ aspect: z.literal("9:16"), item_ids: z.array(Id).min(1).optional() }).strict();
export type ReframeBody = z.infer<typeof ReframeBodySchema>;

/** `POST /projects/:id/script/package`. */
export const PackageBodySchema = z.object({ aspect: AspectSchema }).strict();
export type PackageBody = z.infer<typeof PackageBodySchema>;

/** `GET /script-packages/:id/cheatsheet?format=`. */
export const CheatsheetQuerySchema = z.object({ format: z.enum(["md", "csv", "txt"]).default("md") }).strict();
export type CheatsheetQuery = z.infer<typeof CheatsheetQuerySchema>;

/**
 * Статус сцены плана (карточка сцены и пакет генерации): `none` — задачи генерации ещё не было;
 * `running` — задача идёт или ждёт ввода; `pending` — в очереди или ждёт утверждения.
 */
export const ScriptItemStatusSchema = z.enum(["none", "pending", "running", "ready", "failed", "cancelled", "blocked"]);
export type ScriptItemStatus = z.infer<typeof ScriptItemStatusSchema>;
/** Прежнее имя (S1) — алиас `ScriptItemStatusSchema`. */
export const ScriptBatchItemStatusSchema = ScriptItemStatusSchema;
export type ScriptBatchItemStatus = ScriptItemStatus;

/** Пакет генерации (`script_batches`) и его сцены. */
export const ScriptBatchDtoSchema = z.object({
  id: Id,
  aspect: AspectSchema,
  plan_revision: Revision,
  items: z.array(z.object({
    item_id: Id,
    scene_id: Id,
    job: JobSchema.nullable(),
    version_id: Id.nullable(),
    status: ScriptItemStatusSchema,
  }).strict()),
  counts: z.object({ total: Count, pending: Count, running: Count, ready: Count, failed: Count, cancelled: Count, blocked: Count }).strict(),
  /**
   * Полный пакет (S17a): запрос без `item_ids` и без `regenerate` — генерация всех принятых сцен
   * 16:9 или двойники всех. Готовые сцены в такой пакет не входят — UI досчитывает их по состоянию.
   */
  full: z.boolean().optional(),
  /** Сцены, не попавшие в пакет (9:16 без готовой 16:9-версии и т. п.), с причиной. */
  skipped: z.array(z.object({ item_id: Id, reason: z.string().min(1) }).strict()).optional(),
}).strict();
export type ScriptBatchDto = z.infer<typeof ScriptBatchDtoSchema>;

/** Сцена Playground для сцены плана и формата (`script_scenes`) с текущей версией. */
export const ScriptSceneDtoSchema = z.object({
  item_id: Id,
  aspect: AspectSchema,
  scene_id: Id,
  /** Текущая версия сцены (готовая или последняя); нет — null. */
  version_id: Id.nullable(),
  /** Последняя задача генерации сцены. */
  job: JobSchema.nullable(),
  status: ScriptItemStatusSchema,
  /** Замечания QA уровня warning текущей версии. */
  qa_warnings: z.array(QAIssueSchema),
  /** Итоговая оценка Visual QA текущей версии; у старых версий её нет. */
  qa_overall: z.number().min(1).max(10).nullable(),
  /** Предупреждения разнообразия пакета (`packageDiversity` → `warningsForState`). */
  warnings: z.array(PlanIssueSchema),
  /** Отпечаток сцены плана изменился после генерации: версия не по текущему плану. */
  stale: z.boolean(),
}).strict();
export type ScriptSceneDto = z.infer<typeof ScriptSceneDtoSchema>;

/** Пакет экспорта: папка, файлы сцен, не вошедшие сцены. */
export const ScriptPackageDtoSchema = z.object({
  id: Id,
  aspect: AspectSchema,
  rel_path: z.string().min(1),
  /** Абсолютный путь папки (подсказка человеку; «Показать в Finder» — по id). */
  abs_path: z.string().min(1),
  /** Имя для человека: `<проект>_16x9_<дата>` (каталог на диске — id). */
  display_name: z.string().min(1),
  files: z.array(z.object({
    n: z.number().int().positive(),
    item_id: Id,
    /** Имена файлов в папке. */
    mp4: z.string().min(1),
    // S7: альфа-версия невозможна (сцена закрывает кадр) или не удалась — null, сцена и в `missing` (C6)
    alpha: z.string().min(1).nullable(),
    sha256: z.object({ mp4: Sha256Schema, alpha: Sha256Schema.nullable() }).strict(),
  }).strict()),
  missing: z.array(z.object({ item_id: Id, reason: z.string().min(1) }).strict()),
  created_at: Ts,
}).strict();
export type ScriptPackageDto = z.infer<typeof ScriptPackageDtoSchema>;

/** `GET /projects/:id/script`: всё состояние сценарного проекта одним ответом. */
export const ScriptStateDtoSchema = z.object({
  project: ProjectDtoSchema,
  script: ScriptRevisionDocSchema.nullable(),
  /** Текущая ревизия плана с id и Approval B; плана нет — null. */
  plan: ScriptPlanDtoSchema.nullable(),
  /** Текст новее плана (`plan.doc.inputs.script.revision ≠ script.revision`). */
  plan_outdated: z.boolean(),
  style: ProjectStyleDocSchema.nullable(),
  approval: ScriptApprovalSchema,
  scenes: z.array(ScriptSceneDtoSchema),
  batches: z.array(ScriptBatchDtoSchema),
  packages: z.array(ScriptPackageDtoSchema),
  /**
   * Последняя задача дозаполнения сцен (`script.plan` с `fill`, S16a) текущего плана; не было — null.
   * Упала, отменена или `blocked`, а сцены ещё `fill: pending` — UI предлагает повтор (`POST plan/fill`).
   */
  fill_job: JobSchema.nullable(),
}).strict();
export type ScriptStateDto = z.infer<typeof ScriptStateDtoSchema>;
