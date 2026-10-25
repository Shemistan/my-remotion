// Вход Semantic Director (Task 31): только слова, которые останутся в смонтированном ролике
// (`kept`/`clipped` по EDL), — id и текст. Время в секундах после монтажа с одним знаком — только
// ориентир модели («где в ролике»): обратно не принимается, ответ — только id слов.
import { type EditedTimeline, type TranscriptSegment, type TranscriptWord, mapWords } from "@ms/contracts";

export interface SemanticInputWord {
  id: string;
  text: string;
  /** Начало оставленной части слова в смонтированном ролике, с, один знак (ориентир). */
  edited_s: number;
}

export interface SemanticInput {
  words: SemanticInputWord[];
  segments: { id: string; word_ids: string[] }[];
  /** Слов, вырезанных монтажом целиком (в вход не попали). */
  removed: number;
}

/** id сегмента для оставленных слов вне сегментов транскрипта (не должно быть, но не теряем). */
export const REST_SEGMENT_ID = "seg_rest";

export function semanticInput(words: TranscriptWord[], segments: Pick<TranscriptSegment, "id" | "word_ids">[], tl: EditedTimeline): SemanticInput {
  const map = mapWords(tl, words);
  const out: SemanticInputWord[] = [];
  let removed = 0;
  for (const w of words) {
    const m = map[w.id]!;
    if (m.state === "removed") {
      removed++;
      continue;
    }
    out.push({ id: w.id, text: w.text, edited_s: Math.round((m.edited_start_us ?? 0) / 100_000) / 10 });
  }
  const visible = new Set(out.map((w) => w.id));
  const seen = new Set<string>();
  const segs: SemanticInput["segments"] = [];
  for (const s of segments) {
    const ids = s.word_ids.filter((x) => visible.has(x) && !seen.has(x));
    ids.forEach((x) => seen.add(x));
    if (ids.length > 0) segs.push({ id: s.id, word_ids: ids });
  }
  const rest = out.filter((w) => !seen.has(w.id)).map((w) => w.id);
  if (rest.length > 0) segs.push({ id: REST_SEGMENT_ID, word_ids: rest });
  return { words: out, segments: segs, removed };
}
