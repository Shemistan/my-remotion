import { z } from "zod";
import { CompositionModeSchema } from "./concept.js";
import { NormRectSchema, ZoneSchema } from "./footage.js";
import { PatternSlugSchema } from "./patterns.js";
import { WordIdSchema } from "./transcript.js";

const Us = z.number().int().nonnegative();
const Frame = z.number().int().nonnegative();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Score = z.number().int().min(1).max(5);

const UsRangeSchema = z.object({ start_us: Us, end_us: Us }).strict()
  .refine((r) => r.start_us < r.end_us, { message: "пустой диапазон", path: ["end_us"] });
/** Диапазон цитаты: допускает нулевую длину (вставленное слово с интерполированным временем, Task 27). */
const QuoteRangeSchema = z.object({ start_us: Us, end_us: Us }).strict()
  .refine((r) => r.start_us <= r.end_us, { message: "start_us > end_us", path: ["end_us"] });

/** Режим запланированной сцены (`CompositionMode` из Concept): `none` — только у пропуска. */
export const PlannedCompositionModeSchema = CompositionModeSchema.exclude(["none"]);

export const ComplexitySchema = z.number().int().min(1).max(3);

/** Сцена плана (V1): якоря — id слов; время (edited/source µs, кадры `timeline_fps`) считает код. */
export const ScenePlanItemSchema = z.object({
  id: z.string().regex(/^sp_\d{3,}$/),
  status: z.enum(["proposed", "accepted", "rejected", "stale"]),
  stale_reason: z.enum(["anchor_cut", "timing_changed"]).optional(),
  origin: z.enum(["agent", "user"]),
  anchor_ids: z.array(z.string().min(1)),
  start_word_id: WordIdSchema,
  end_word_id: WordIdSchema,
  edited: UsRangeSchema,
  source: UsRangeSchema,
  frames: z.object({ start: Frame, end: Frame }).strict().refine((f) => f.start < f.end, { message: "пустой диапазон кадров", path: ["end"] }),
  segment_ids: z.array(z.string().min(1)),
  purpose: z.string().min(1),
  visual_type: PatternSlugSchema,
  composition_mode: PlannedCompositionModeSchema,
  zone: ZoneSchema,
  rect: NormRectSchema,
  key_terms: z.array(z.object({ text: z.string().min(1), word_id: WordIdSchema, edited_at_us: Us }).strict()),
  metaphor: z.string(),
  complexity: ComplexitySchema,
  usefulness: Score,
  effort: Score,
  visual_load: Score,
  evidence: z.array(z.object({
    quote: z.string().min(1),
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    edited: QuoteRangeSchema,
  }).strict()).min(1),
  face_overlap: z.object({ ratio: z.number().min(0).max(1), override_reason: z.string().min(1).optional() }).strict(),
  style_id: z.string().min(1),
}).strict().superRefine((s, ctx) => {
  if ((s.status === "stale") !== (s.stale_reason !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["stale_reason"], message: "stale_reason обязателен у stale и запрещён у остальных" });
  }
});
export type ScenePlanItem = z.infer<typeof ScenePlanItemSchema>;

export const PlanIssueSchema = z.object({
  item_id: z.string().min(1).optional(),
  code: z.string().min(1),
  severity: z.enum(["blocking", "warning"]),
  message: z.string(),
}).strict();
export type PlanIssue = z.infer<typeof PlanIssueSchema>;

/** Поля сцены, которые пользователь правит операцией `modify`; момент ключевого слова (`edited_at_us`) считает код. */
const ItemPatchSchema = z.object({
  composition_mode: PlannedCompositionModeSchema,
  zone: ZoneSchema,
  visual_type: PatternSlugSchema,
  purpose: z.string().min(1),
  key_terms: z.array(z.object({ text: z.string().min(1), word_id: WordIdSchema }).strict()),
  start_word_id: WordIdSchema,
  end_word_id: WordIdSchema,
  override_reason: z.string().min(1),
}).partial().strict();

export const PlanOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_status"), item_id: z.string().min(1), status: z.enum(["accepted", "rejected"]) }).strict(),
  z.object({ op: z.literal("modify"), item_id: z.string().min(1), patch: ItemPatchSchema }).strict(),
  z.object({
    op: z.literal("add"),
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    visual_type: PatternSlugSchema,
    composition_mode: PlannedCompositionModeSchema,
    zone: ZoneSchema,
    purpose: z.string().min(1),
  }).strict(),
]);
export type PlanOp = z.infer<typeof PlanOpSchema>;

/** Документ ревизии визуального плана `r<N>` (субъект Approval B); входы — с ревизиями и хешами. */
export const VisualPlanRevisionDocSchema = z.object({
  schema_version: z.literal(1),
  plan_id: z.string().min(1),
  revision: z.number().int().positive(),
  parent_revision: z.number().int().positive().optional(),
  inputs: z.object({
    edl: z.object({ id: z.string().min(1), revision: z.number().int().positive(), hash: Sha256 }).strict(),
    transcript: z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict(),
    semantic_id: z.string().min(1),
    footage_id: z.string().min(1),
    style: z.object({ id: z.string().min(1), revision: z.number().int().positive(), hash: Sha256 }).strict(),
  }).strict(),
  items: z.array(ScenePlanItemSchema),
  skipped: z.array(z.object({ anchor_ids: z.array(z.string().min(1)), reason: z.string().min(1) }).strict()),
  issues: z.array(PlanIssueSchema),
  ops: z.array(PlanOpSchema).optional(),
}).strict().superRefine((d, ctx) => {
  const ids = new Set<string>();
  d.items.forEach((x, i) => {
    if (ids.has(x.id)) ctx.addIssue({ code: "custom", path: ["items", i, "id"], message: `повтор id ${x.id}` });
    ids.add(x.id);
  });
});
export type VisualPlanRevisionDoc = z.infer<typeof VisualPlanRevisionDocSchema>;
