// Вырезки Rough Cut Editor (Task 28): агент даёт только id слов и дословную цитату; код
// проверяет цитату (`verifyQuote`) и считает границы так же, как ручная вырезка `add_cut`
// (`cutForWords`, Task 27). Не прошедшее проверку отклоняется с кодом, а не «чинится».
import { type EditDecision, type Fps, type RoughCutAgentOutput, type TranscriptWord, verifyQuote } from "@ms/contracts";
import type { RoughcutConfig } from "../config.js";
import { cutForWords } from "./edl-ops.js";
import { EditError } from "./errors.js";

export type AgentCutRejection = "quote_mismatch" | "unknown_word" | "order" | "word_out_of_range" | "empty_cut";

export interface AgentCutOptions {
  id?: string;
  sourceDurationUs?: number;
}

/**
 * Решение агента → предложение вырезки `origin: "agent"`, `status: "proposed"` или
 * `{ rejected: <код> }`: цитата не совпала со словами диапазона (`quote_mismatch`), слова нет
 * (`unknown_word`), обратный порядок (`order`), слово за концом исходника, пусто после
 * выравнивания. Границы — `cutForWords` (длинная пауза после слов не забирается, ревью D2).
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
