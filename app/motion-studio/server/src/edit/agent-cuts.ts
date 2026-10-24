// Вырезки Rough Cut Editor (Task 28): агент даёт только id слов и дословную цитату; код
// проверяет цитату (`verifyQuote`) и считает границы так же, как ручная вырезка `add_cut`
// (`cutForWords`, Task 27). Не прошедшее проверку отклоняется с кодом, а не «чинится».
// Вырезка агента — оговорка, фальстарт или неудачный дубль: длинная (больше `AGENT_CUT_MAX_US`
// или `AGENT_CUT_MAX_WORDS` слов) или через несколько предложений — уже не правка, а смена
// содержания; такое отклоняется кодом `too_long` (ревью Task 28, M6).
import { type EditDecision, type Fps, type RoughCutAgentOutput, type TranscriptWord, verifyQuote } from "@ms/contracts";
import type { RoughcutConfig } from "../config.js";
import { ENDS_SENTENCE } from "./detect-repeats.js";
import { cutForWords } from "./edl-ops.js";
import { EditError } from "./errors.js";

export type AgentCutRejection = "quote_mismatch" | "unknown_word" | "order" | "word_out_of_range" | "empty_cut" | "too_long";

/** Вырезка агента длиннее — `too_long`. */
export const AGENT_CUT_MAX_US = 15_000_000;
/** Слов в вырезке агента больше — `too_long`. */
export const AGENT_CUT_MAX_WORDS = 40;
/** Концов предложения внутри вырезки (не считая последнего слова) от стольких — `too_long`. */
export const AGENT_CUT_MAX_SENTENCE_ENDS = 2;

export interface AgentCutOptions {
  id?: string;
  sourceDurationUs?: number;
}

/**
 * Решение агента → предложение вырезки `origin: "agent"`, `status: "proposed"` или
 * `{ rejected: <код> }`: цитата не совпала со словами диапазона (`quote_mismatch`), слова нет
 * (`unknown_word`), обратный порядок (`order`), слово за концом исходника, пусто после
 * выравнивания, слишком длинная (`too_long`: > 15 с, > 40 слов или ≥ 2 концов предложения внутри). Границы — `cutForWords` (длинная пауза после слов не забирается, ревью D2).
 */
export function agentDecisionToCut(
  d: RoughCutAgentOutput["decisions"][number], words: Pick<TranscriptWord, "id" | "text" | "start_us" | "end_us">[],
  cfg: Pick<RoughcutConfig, "keepBeforeWordUs" | "pauseMinUs">, fps: Fps, o: AgentCutOptions = {},
): EditDecision | { rejected: AgentCutRejection } {
  const q = verifyQuote(words, d.start_word_id, d.end_word_id, d.quote);
  if (!q.ok) return { rejected: q.code };
  try {
    const c = cutForWords(words, d.start_word_id, d.end_word_id, fps, {
      keepBeforeWordUs: cfg.keepBeforeWordUs, pauseMinUs: cfg.pauseMinUs, ...(o.sourceDurationUs !== undefined ? { sourceDurationUs: o.sourceDurationUs } : {}),
    });
    const i0 = words.findIndex((x) => x.id === d.start_word_id);
    const i1 = words.findIndex((x) => x.id === d.end_word_id);
    const ends = words.slice(i0, i1).filter((x) => ENDS_SENTENCE.test(x.text.trim())).length;
    if (i1 - i0 + 1 > AGENT_CUT_MAX_WORDS || c.source_end_us - c.source_start_us > AGENT_CUT_MAX_US || ends >= AGENT_CUT_MAX_SENTENCE_ENDS) return { rejected: "too_long" };
    return {
      id: o.id ?? "agent", reason: d.reason, origin: "agent", status: "proposed", ...c,
      confidence: d.confidence, explanation: `${d.explanation.trim()} — «${d.quote.trim()}»`,
    };
  } catch (e) {
    if (e instanceof EditError && (e.code === "unknown_word" || e.code === "order" || e.code === "word_out_of_range" || e.code === "empty_cut")) {
      return { rejected: e.code };
    }
    throw e;
  }
}
