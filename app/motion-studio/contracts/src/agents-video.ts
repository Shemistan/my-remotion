import { z } from "zod";
import { AuthorPositionSchema, CameraMotionSchema, NormRectSchema, ZoneSchema } from "./footage.js";
import { PatternSlugSchema } from "./patterns.js";
import { CompositionModeSchema } from "./concept.js";
import { ComplexitySchema } from "./plan.js";
import { IntensitySchema, StylePresetSchema } from "./settings.js";
import { checkSemantic, semanticFields } from "./semantic.js";
import { WordIdSchema } from "./transcript.js";

// Выходы ролей Phase 2–3. LLM не выдаёт времени: только id слов и дословные цитаты;
// µs, кадры и проверки считает код (`verifyQuote`, `rangeFromWords`). Исключение — `frame_us`
// у Footage: момент ключевого кадра, который агенту дали на входе, а не новое время.

const Confidence = z.number().min(0).max(1);
const Score = z.number().int().min(1).max(5);

/** Предел длины `explanation` и `why` Rough Cut Editor, символов: объяснение — строка в списке вырезок. */
export const ROUGH_CUT_TEXT_MAX = 300;

/** Rough Cut Editor: смысловые вырезки по словам и вердикты по предложениям детекторов. */
export const RoughCutAgentOutputSchema = z.object({
  decisions: z.array(z.object({
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    reason: z.enum(["false_start", "bad_take", "filler", "repeat"]),
    confidence: Confidence,
    explanation: z.string().min(1).max(ROUGH_CUT_TEXT_MAX),
    quote: z.string().min(1),
  }).strict()),
  reviews: z.array(z.object({
    decision_id: z.string().min(1),
    verdict: z.enum(["keep_cut", "drop_cut"]),
    why: z.string().min(1).max(ROUGH_CUT_TEXT_MAX),
  }).strict()),
}).strict();
export type RoughCutAgentOutput = z.infer<typeof RoughCutAgentOutputSchema>;

/** Footage Analyst: наблюдения по шотам; лицо и безопасные зоны — не его (детектор Vision). */
export const FootageAgentOutputSchema = z.object({
  shots: z.array(z.object({
    shot_id: z.string().min(1),
    author_position: AuthorPositionSchema,
    motion: CameraMotionSchema,
    gestures: z.enum(["low", "medium", "high"]),
    objects: z.array(z.object({
      label: z.string().min(1),
      frame_us: z.number().int().nonnegative(),
      rect: NormRectSchema.optional(),
      important: z.boolean(),
    }).strict()),
    background: z.string(),
    notes: z.string(),
    uncertainty: z.array(z.string()),
  }).strict()),
}).strict();
export type FootageAgentOutput = z.infer<typeof FootageAgentOutputSchema>;

/** Semantic Director: `SemanticTimeline` без `id`, `transcript_ref`, `edl_ref` (их ставит код). */
export const SemanticAgentOutputSchema = z.object(semanticFields).strict().superRefine(checkSemantic);
export type SemanticAgentOutput = z.infer<typeof SemanticAgentOutputSchema>;

/** Visual Planner (с частью Art Director): стиль проекта и возможности для сцен. */
export const VisualPlannerOutputSchema = z.object({
  style: z.object({
    preset: StylePresetSchema,
    palette_overrides: z.record(z.string()).optional(),
    font: z.string().min(1).optional(),
    intensity: IntensitySchema,
    depth: z.number().int().min(0).max(3),
    rationale: z.string().min(1),
  }).strict(),
  opportunities: z.array(z.object({
    id: z.string().min(1),
    anchor_ids: z.array(z.string().min(1)),
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    decision: z.enum(["plan", "skip"]),
    skip_reason: z.string().min(1).optional(),
    purpose: z.string(),
    visual_type: PatternSlugSchema,
    composition_mode: CompositionModeSchema,
    zone: ZoneSchema,
    key_terms: z.array(z.object({ text: z.string().min(1), word_id: WordIdSchema }).strict()),
    metaphor: z.string(),
    complexity: ComplexitySchema,
    usefulness: Score,
    effort: Score,
    visual_load: Score,
    evidence: z.array(z.object({ quote: z.string().min(1), start_word_id: WordIdSchema, end_word_id: WordIdSchema }).strict()),
    face_override_reason: z.string().min(1).optional(),
  }).strict()),
}).strict().superRefine((o, ctx) => {
  o.opportunities.forEach((op, i) => {
    if (op.decision === "plan") {
      if (op.composition_mode === "none") ctx.addIssue({ code: "custom", path: ["opportunities", i, "composition_mode"], message: "у сцены plan режим не none" });
      if (op.evidence.length === 0) ctx.addIssue({ code: "custom", path: ["opportunities", i, "evidence"], message: "у сцены plan нужна цитата-обоснование" });
    } else if (op.skip_reason === undefined) {
      ctx.addIssue({ code: "custom", path: ["opportunities", i, "skip_reason"], message: "у пропуска нужна причина" });
    }
  });
});
export type VisualPlannerOutput = z.infer<typeof VisualPlannerOutputSchema>;
