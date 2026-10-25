// Отпечаток видеосцены плана (Task 37′, ADR 0009): по нему видно, что версия сцены сделана не
// по текущей сцене плана — всё, что идёт в бриф генерации: назначение, тип визуала, режим, зона
// и прямоугольник, границы по словам, длительность, ключевые слова с моментами от начала сцены,
// опорные фразы (слова), метафора, причина наложения на лицо, окно исходника (от него лицо и
// кадр под сценой), ревизия стиля проекта. Позиция сцены в ролике (`frames.start`,
// `edited`) не входит: правка монтажа до сцены сдвигает её, но не делает устаревшей. Статус и
// текст цитат (его считает код из слов) — не входят.
import type { ScenePlanItem } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";

export function videoItemFingerprint(item: ScenePlanItem, style: { id: string; revision: number } | null): string {
  const at = item.edited.start_us;
  return canonicalHash({
    purpose: item.purpose,
    visual_type: item.visual_type,
    composition_mode: item.composition_mode,
    zone: item.zone,
    rect: item.rect,
    start_word_id: item.start_word_id,
    end_word_id: item.end_word_id,
    duration_frames: item.frames.end - item.frames.start,
    // момент слова — от начала сцены (µs смонтированного ролика): сдвиг сцены его не меняет
    key_terms: item.key_terms.map((k) => ({ text: k.text, word_id: k.word_id, at_us: k.edited_at_us - at })),
    evidence: item.evidence.map((e) => ({ start_word_id: e.start_word_id, end_word_id: e.end_word_id })),
    metaphor: item.metaphor,
    // ревью Task 37′: причина наложения на лицо (face_ink → warning) и окно исходника (лицо, кадр под сценой)
    face_override: item.face_overlap.override_reason ?? null,
    source: { start_us: item.source.start_us, end_us: item.source.end_us },
    style: style ? { id: style.id, revision: style.revision } : null,
  });
}
