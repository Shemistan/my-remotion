// Контракт вывода воркера ASR ai-platform (Task 26, Review Focus 7): `asr_worker.py` пишет
// `{"language", "duration", "elapsed_s", "words": [{"w", "s", "e"}]}` (секунды, до мс).
// Нарушение — отказ `asr_contract_violation`, вывод не «чинится».
import type { TranscriptWord } from "@ms/contracts";
import { z } from "zod";

const Sec = z.number().finite().min(0);

export const AsrWorkerOutputSchema = z.object({
  language: z.string(),
  duration: Sec,
  elapsed_s: Sec,
  words: z.array(z.object({ w: z.string(), s: Sec, e: Sec }).strict().refine((x) => x.s <= x.e, { message: "s > e" })),
}).strict().superRefine((o, ctx) => {
  o.words.forEach((x, i) => {
    const prev = o.words[i - 1];
    if (prev && x.s < prev.s) ctx.addIssue({ code: "custom", path: ["words", i, "s"], message: `начало слова убывает: ${prev.s} → ${x.s}` });
  });
});
export type AsrWorkerOutput = z.infer<typeof AsrWorkerOutputSchema>;

/** Допуск длительности воркера против звука, который ему дали, с. */
export const DURATION_TOLERANCE_S = 0.1;
/** Слово может кончаться позже длительности на округление до мс, с. */
const EDGE_S = 0.005;
const HEAD = 2000;

/** Вывод воркера нарушает контракт; `head` — начало вывода для журнала задачи. */
export class AsrContractError extends Error {
  readonly code = "asr_contract_violation";
  constructor(message: string, readonly head: string) {
    super(`asr_contract_violation: ${message}`);
    this.name = "AsrContractError";
  }
}

/**
 * Разбор и проверка вывода: не пусто, JSON (NaN/Infinity Python — не JSON), схема (строго, без
 * лишних полей, времена конечные ≥ 0, `s ≤ e`, начала не убывают), длительность совпадает со
 * звуком (± 0,1 с), слова не выходят за длительность.
 */
export function parseAsrOutput(text: string, o: { audioDurationS: number }): AsrWorkerOutput {
  const head = text.slice(0, HEAD);
  if (text.trim() === "") throw new AsrContractError("пустой вывод воркера", head);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AsrContractError(`вывод воркера — не JSON: ${(e as Error).message}`, head);
  }
  const parsed = AsrWorkerOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "/"}: ${i.message}`).join("; ");
    throw new AsrContractError(`вывод воркера не по контракту: ${issues}`, head);
  }
  const out = parsed.data;
  if (Math.abs(out.duration - o.audioDurationS) > DURATION_TOLERANCE_S) {
    throw new AsrContractError(`длительность воркера ${out.duration} с расходится со звуком ${o.audioDurationS.toFixed(3)} с больше чем на ${DURATION_TOLERANCE_S} с`, head);
  }
  const bad = out.words.findIndex((w) => w.e > out.duration + EDGE_S);
  if (bad >= 0) {
    const w = out.words[bad]!;
    throw new AsrContractError(`слово ${bad + 1} «${w.w}» (${w.s}–${w.e} с) за пределами длительности ${out.duration} с`, head);
  }
  return out;
}

/**
 * Слова воркера → слова транскрипта: `w_000001…` по порядку, µs (`round(s·1e6)`),
 * `timing: "asr"`, `confidence: null` (V10); пустые после обрезки пробелов — отбрасываются.
 */
export function toTranscriptWords(out: AsrWorkerOutput): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const x of out.words) {
    const text = x.w.normalize("NFC").trim();
    if (text === "") continue;
    const start = Math.round(x.s * 1e6);
    const end = Math.max(start, Math.round(x.e * 1e6));
    words.push({ id: `w_${String(words.length + 1).padStart(6, "0")}`, text, start_us: start, end_us: end, timing: "asr", confidence: null });
  }
  return words;
}
