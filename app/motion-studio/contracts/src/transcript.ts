import { z } from "zod";

const Us = z.number().int().nonnegative();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** id слова: `w_000001`; вставленные пользователем — `w_000001.1`. */
export const WordIdSchema = z.string().regex(/^w_\d{6}(\.\d+)*$/);

/** Слово ASR (`05` §2): якорь сцен и вырезок. `confidence` воркер не отдаёт — всегда `null` (V10). */
export const TranscriptWordSchema = z.object({
  id: WordIdSchema,
  text: z.string(),
  start_us: Us,
  end_us: Us,
  timing: z.enum(["asr", "interpolated"]),
  confidence: z.null(),
}).strict().refine((w) => w.start_us <= w.end_us, { message: "start_us > end_us", path: ["end_us"] });
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TranscriptSegmentSchema = z.object({
  id: z.string().regex(/^seg_\d{4,}$/),
  word_ids: z.array(WordIdSchema),
  start_us: Us,
  end_us: Us,
}).strict();
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const TranscriptOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_text"), word_id: WordIdSchema, text: z.string() }).strict(),
  z.object({ op: z.literal("replace_span"), start_word_id: WordIdSchema, end_word_id: WordIdSchema, text: z.string() }).strict(),
]);
export type TranscriptOp = z.infer<typeof TranscriptOpSchema>;

/** Документ ревизии транскрипта `r<N>` (иммутабелен после публикации). */
export const TranscriptRevisionDocSchema = z.object({
  schema_version: z.literal(1),
  transcript_id: z.string().min(1),
  revision: z.number().int().positive(),
  parent_revision: z.number().int().positive().optional(),
  media_sha256: Sha256,
  language: z.string().min(1),
  author: z.enum(["asr", "user"]),
  asr: z.object({
    model: z.string().min(1),
    worker_sha256: Sha256,
    ai_platform_commit: z.string().min(1),
    elapsed_s: z.number().nonnegative(),
  }).strict().optional(),
  words: z.array(TranscriptWordSchema),
  segments: z.array(TranscriptSegmentSchema),
  removed_word_ids: z.array(WordIdSchema),
  ops: z.array(TranscriptOpSchema).optional(),
}).strict().superRefine((d, ctx) => {
  const ids = new Set<string>();
  d.words.forEach((w, i) => {
    if (ids.has(w.id)) ctx.addIssue({ code: "custom", path: ["words", i, "id"], message: `повтор id ${w.id}` });
    ids.add(w.id);
  });
  d.segments.forEach((s, i) => s.word_ids.forEach((id, j) => {
    if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["segments", i, "word_ids", j], message: `нет слова ${id}` });
  }));
  d.removed_word_ids.forEach((id, i) => {
    if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["removed_word_ids", i], message: `нет слова ${id}` });
  });
});
export type TranscriptRevisionDoc = z.infer<typeof TranscriptRevisionDocSchema>;

/** Токен для сравнения цитат: нижний регистр, `ё → е`, без пунктуации, пробелов и ударений. */
export function normalizeToken(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/ё/g, "е").replace(/[\p{P}\ś]/gu, "");
}

export type VerifyQuoteResult = { ok: true } | { ok: false; code: "quote_mismatch" | "unknown_word" | "order"; message: string };

/**
 * Дословна ли цитата для слов `[startWordId, endWordId]`: сравниваются нормализованные тексты
 * без разделителей («1 000 000» = «1000000»). Код не «чинит» цитату — несовпадение отклоняется.
 */
export function verifyQuote(words: Pick<TranscriptWord, "id" | "text">[], startWordId: string, endWordId: string, quote: string): VerifyQuoteResult {
  const si = words.findIndex((w) => w.id === startWordId);
  const ei = words.findIndex((w) => w.id === endWordId);
  if (si < 0 || ei < 0) return { ok: false, code: "unknown_word", message: `нет слова ${si < 0 ? startWordId : endWordId}` };
  if (si > ei) return { ok: false, code: "order", message: `слово ${startWordId} идёт после ${endWordId}` };
  const expected = words.slice(si, ei + 1).map((w) => normalizeToken(w.text)).join("");
  const got = normalizeToken(quote);
  if (got === "" || got !== expected) return { ok: false, code: "quote_mismatch", message: "цитата не совпадает со словами диапазона" };
  return { ok: true };
}
