// Детектор слов-паразитов (Task 28): только отдельные токены-звуки «э», «э-э», «эм», «м-м»,
// «ам». Слова со смыслом («ну», «типа», «вот», «как бы») код не трогает — их уместность решает
// агент по контексту. Вырезка — слово с полем `fillerPadUs` с каждой стороны, но не дальше
// соседних слов.
import { type EditDecision, type Fps, type TranscriptWord, snapUsToFrame } from "@ms/contracts";
import type { RoughcutConfig } from "../config.js";

/** Звук-заполнитель: «э», «ээ», «э-э-э», «эм», «м», «мм», «м-м», «ам», «хм»; хвостовая пунктуация допустима. */
export const FILLER_RE = /^[«"(]*(э+(?:-э+)*|э+м+|м+(?:-м+)*|а+м+|хм+)[,.!?…»")]*$/iu;

export function isFiller(text: string): boolean {
  return FILLER_RE.test(text.trim().replace(/ё/gi, "е"));
}

export interface FillerOptions {
  sourceDurationUs?: number;
  idPrefix?: string;
}

/**
 * Паразиты → `reason: "filler"`, `confidence 0.85`, якорь — само слово. Вырезка
 * `[max(prev.end, w.start − pad), min(next.start, w.end + pad)]` по кадрам; у краёв записи —
 * не раньше 0 и не дальше конца исходника. Слово нулевой длины без места вокруг — пропуск.
 */
export function detectFillers(words: Pick<TranscriptWord, "id" | "text" | "start_us" | "end_us">[], cfg: Pick<RoughcutConfig, "fillerPadUs">, fps: Fps, o: FillerOptions = {}): EditDecision[] {
  const out: EditDecision[] = [];
  const prefix = o.idPrefix ?? "filler_";
  const max = o.sourceDurationUs ?? Number.MAX_SAFE_INTEGER;
  words.forEach((w, i) => {
    if (!isFiller(w.text)) return;
    const prev = words[i - 1];
    // «5 м», «5 мм» — метры и миллиметры, не мычание
    if (/^м+[,.!?…]*$/iu.test(w.text.trim()) && prev && /\d[,.]?$/u.test(prev.text.trim())) return;
    const next = words[i + 1];
    const rawStart = Math.max(prev ? Math.min(prev.end_us, w.start_us) : 0, w.start_us - cfg.fillerPadUs, 0);
    const rawEnd = Math.min(next ? Math.max(next.start_us, w.end_us) : max, w.end_us + cfg.fillerPadUs, max);
    const start = snapUsToFrame(rawStart, fps);
    const end = rawEnd >= max ? max : snapUsToFrame(rawEnd, fps);
    if (end <= start) return;
    out.push({
      id: `${prefix}${out.length + 1}`, reason: "filler", origin: "detector", status: "proposed",
      start_word_id: w.id, end_word_id: w.id, source_start_us: start, source_end_us: end, confidence: 0.85,
      explanation: `слово-паразит «${w.text.trim()}»`,
    });
  });
  return out;
}
