// Отпечаток сцены плана сценария: по нему видно, что версия сцены сделана не по текущей сцене
// плана — всё, что идёт в бриф генерации: границы, приём, форма времени, паттерн, идея,
// назначение, кадры целиком (lead, speech, tail, total), термины, числа, ревизия стиля проекта.
// Статус и цитата (её считает код из границ) — не входят.
import type { ScriptSceneItem } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";

export function itemFingerprint(item: ScriptSceneItem, style: { id: string; revision: number } | null): string {
  return canonicalHash({
    start_word_id: item.start_word_id,
    end_word_id: item.end_word_id,
    technique: item.technique,
    structure_rule: item.structure_rule ?? null,
    pattern: item.pattern,
    idea: item.idea,
    purpose: item.purpose,
    frames: { lead: item.frames.lead, speech: item.frames.speech, tail: item.frames.tail, total: item.frames.total },
    key_terms: item.key_terms.map((k) => ({ text: k.text, word_id: k.word_id })),
    data: item.data.map((d) => ({ label: d.label, value: d.value, unit: d.unit ?? null, quote: d.quote })),
    style: style ? { id: style.id, revision: style.revision } : null,
  });
}
