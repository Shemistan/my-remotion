import { z } from "zod";
import { FpsSchema } from "./time.js";
import type { UsRange } from "./timeline.js";
import { WordIdSchema } from "./transcript.js";

const Us = z.number().int().nonnegative();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const CutReasonSchema = z.enum(["pause", "filler", "repeat", "false_start", "bad_take", "manual"]);
export type CutReason = z.infer<typeof CutReasonSchema>;

/** Решение чернового монтажа: вырезка `[source_start_us, source_end_us)`; слова — якорь, если есть. */
export const EditDecisionSchema = z.object({
  id: z.string().min(1),
  reason: CutReasonSchema,
  origin: z.enum(["detector", "agent", "user"]),
  status: z.enum(["proposed", "accepted", "rejected"]),
  start_word_id: WordIdSchema.optional(),
  end_word_id: WordIdSchema.optional(),
  source_start_us: Us,
  source_end_us: Us,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  agent_note: z.string().optional(),
}).strict().superRefine((d, ctx) => {
  if (d.source_start_us >= d.source_end_us) ctx.addIssue({ code: "custom", path: ["source_end_us"], message: "пустая вырезка" });
  if ((d.start_word_id === undefined) !== (d.end_word_id === undefined)) {
    ctx.addIssue({ code: "custom", path: ["end_word_id"], message: "start_word_id и end_word_id — оба или ни одного" });
  }
});
export type EditDecision = z.infer<typeof EditDecisionSchema>;

export const EdlOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_status"), decision_id: z.string().min(1), status: z.enum(["accepted", "rejected"]) }).strict(),
  z.object({ op: z.literal("add_cut"), start_word_id: WordIdSchema, end_word_id: WordIdSchema }).strict(),
  z.object({ op: z.literal("add_cut_range"), source_start_us: Us, source_end_us: Us }).strict(),
  z.object({ op: z.literal("remove"), decision_id: z.string().min(1) }).strict(),
]).superRefine((o, ctx) => {
  if (o.op === "add_cut_range" && o.source_start_us >= o.source_end_us) ctx.addIssue({ code: "custom", path: ["source_end_us"], message: "пустая вырезка" });
});
export type EdlOp = z.infer<typeof EdlOpSchema>;

/** Документ ревизии EDL `r<N>` (субъект Approval A). */
export const EdlRevisionDocSchema = z.object({
  schema_version: z.literal(1),
  edl_id: z.string().min(1),
  revision: z.number().int().positive(),
  parent_revision: z.number().int().positive().optional(),
  media_id: z.string().min(1),
  media_sha256: Sha256,
  transcript_id: z.string().min(1),
  timeline_fps: FpsSchema,
  decisions: z.array(EditDecisionSchema),
  ops: z.array(EdlOpSchema).optional(),
}).strict().superRefine((d, ctx) => {
  const ids = new Set<string>();
  d.decisions.forEach((x, i) => {
    if (ids.has(x.id)) ctx.addIssue({ code: "custom", path: ["decisions", i, "id"], message: `повтор id ${x.id}` });
    ids.add(x.id);
  });
});
export type EdlRevisionDoc = z.infer<typeof EdlRevisionDocSchema>;

/** Принятые вырезки по возрастанию — вход `buildTimeline`. */
export function acceptedCuts(doc: Pick<EdlRevisionDoc, "decisions">): UsRange[] {
  return doc.decisions
    .filter((d) => d.status === "accepted")
    .map((d) => ({ start_us: d.source_start_us, end_us: d.source_end_us }))
    .sort((a, b) => a.start_us - b.start_us || a.end_us - b.end_us);
}
