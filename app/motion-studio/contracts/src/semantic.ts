import { z } from "zod";
import { WordIdSchema } from "./transcript.js";

export const AnchorKindSchema = z.enum(["thesis", "number", "concept", "entity", "contrast", "sequence", "cause_effect", "emphasis"]);
export type AnchorKind = z.infer<typeof AnchorKindSchema>;

export const ClaimTypeSchema = z.enum(["fact", "assumption", "opinion"]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

const Ref = z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict();

/** Поля смысловой разметки без идентичности документа — они же выход Semantic Director. */
export const semanticFields = {
  chapters: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string(),
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
  }).strict()),
  anchors: z.array(z.object({
    id: z.string().min(1),
    kind: AnchorKindSchema,
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    quote: z.string().min(1),
    claim_type: ClaimTypeSchema,
    importance: z.number().int().min(1).max(3),
    emphasis_word_ids: z.array(WordIdSchema),
    uncertainty: z.string().optional(),
  }).strict()),
  entities: z.array(z.object({
    name: z.string().min(1),
    kind: z.string().min(1),
    mention_word_ids: z.array(WordIdSchema),
  }).strict()),
  numbers: z.array(z.object({
    value: z.number(),
    unit: z.string().optional(),
    start_word_id: WordIdSchema,
    end_word_id: WordIdSchema,
    quote: z.string().min(1),
    claim_type: ClaimTypeSchema,
  }).strict()),
  causal: z.array(z.object({ cause_anchor_id: z.string().min(1), effect_anchor_id: z.string().min(1) }).strict()),
  disputed: z.array(z.object({ start_word_id: WordIdSchema, end_word_id: WordIdSchema, why: z.string().min(1) }).strict()),
};

type SemanticFields = { anchors: { id: string }[]; causal: { cause_anchor_id: string; effect_anchor_id: string }[] };

/** id якорей уникальны; `causal` ссылается только на существующие якоря. */
export function checkSemantic(d: SemanticFields, ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  d.anchors.forEach((a, i) => {
    if (ids.has(a.id)) ctx.addIssue({ code: "custom", path: ["anchors", i, "id"], message: `повтор id ${a.id}` });
    ids.add(a.id);
  });
  d.causal.forEach((c, i) => {
    for (const k of ["cause_anchor_id", "effect_anchor_id"] as const) {
      if (!ids.has(c[k])) ctx.addIssue({ code: "custom", path: ["causal", i, k], message: `нет якоря ${c[k]}` });
    }
  });
}

/** Смысловая разметка (ТЗ §4 Semantic Director): всё — на id слов, без времени. */
export const SemanticTimelineSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().min(1),
  transcript_ref: Ref,
  edl_ref: Ref,
  ...semanticFields,
}).strict().superRefine(checkSemantic);
export type SemanticTimeline = z.infer<typeof SemanticTimelineSchema>;
