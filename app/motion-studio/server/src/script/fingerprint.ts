// Отпечаток сцены плана сценария: по нему видно, что версия сцены сделана не по текущей сцене
// плана (границы, приём, паттерн, идея, назначение, длина, ревизия стиля проекта).
import type { ScriptSceneItem } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";

export function itemFingerprint(item: ScriptSceneItem, style: { id: string; revision: number } | null): string {
  return canonicalHash({
    start_word_id: item.start_word_id,
    end_word_id: item.end_word_id,
    technique: item.technique,
    pattern: item.pattern,
    idea: item.idea,
    purpose: item.purpose,
    total: item.frames.total,
    style: style ? { id: style.id, revision: style.revision } : null,
  });
}
