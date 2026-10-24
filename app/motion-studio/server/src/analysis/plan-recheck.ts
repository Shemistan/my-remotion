// Перепроверка визуального плана на новой ревизии EDL (Task 32, `plan.recheck`, без LLM).
// Сцена размещается заново (`placeScene`: диапазон и цитаты — `checkHeardRange` на новом монтаже):
// не прошла → `stale(anchor_cut)` (вырезанное слово внутри сцены, которого нет в цитатах, сцену
// не портит — ревью Task 31 I1); длительность изменилась больше чем на 20 % → `stale(timing_changed)`
// с новыми временами; иначе — новые времена и кадры, статус прежний (`remapped`).
import { type EditedTimeline, type FootageAnalysis, type ScenePlanItem, type TranscriptSegment, type TranscriptWord, type VisualPlanRevisionDoc, mapWords } from "@ms/contracts";
import { type PlanningConfig, placeScene } from "./plan-build.js";
import { planChecks } from "./plan-checks.js";

/** Доля изменения длительности сцены, после которой она устаревает. */
export const TIMING_CHANGE_MAX = 0.2;

export type RecheckChange = "remapped" | "anchor_cut" | "timing_changed";

export interface RecheckOptions {
  /** Новая ревизия EDL (вход плана). */
  edl: VisualPlanRevisionDoc["inputs"]["edl"];
  /** Ревизия транскрипта слов `words`, если она новее входа плана. */
  transcript?: VisualPlanRevisionDoc["inputs"]["transcript"];
  segments?: TranscriptSegment[];
}

const dur = (x: Pick<ScenePlanItem, "edited">): number => x.edited.end_us - x.edited.start_us;

/**
 * Новая ревизия плана на таймлайне `newTl`. Отклонённые сцены не трогаются и в `changed` не входят.
 * Сцена, уже `stale`, прошедшая проверку, становится `proposed` (решение снова за человеком).
 */
export function recheckPlan(
  doc: VisualPlanRevisionDoc, newTl: EditedTimeline, words: TranscriptWord[], footage: FootageAnalysis, cfg: PlanningConfig, o: RecheckOptions,
): { doc: VisualPlanRevisionDoc; changed: { item_id: string; change: RecheckChange }[] } {
  const ctx = { words, tl: newTl, footage, cfg, wordMap: mapWords(newTl, words), ...(o.segments ? { segments: o.segments } : {}) };
  const changed: { item_id: string; change: RecheckChange }[] = [];
  const items = doc.items.map((x): ScenePlanItem => {
    if (x.status === "rejected") return x;
    const p = placeScene({
      start_word_id: x.start_word_id, end_word_id: x.end_word_id, zone: x.zone,
      key_terms: x.key_terms.map((k) => ({ text: k.text, word_id: k.word_id })),
      evidence: x.evidence.map((e) => ({ quote: e.quote, start_word_id: e.start_word_id, end_word_id: e.end_word_id })),
      ...(x.face_overlap.override_reason !== undefined ? { override_reason: x.face_overlap.override_reason } : {}),
    }, ctx);
    if (!p.ok) {
      changed.push({ item_id: x.id, change: "anchor_cut" });
      return { ...x, status: "stale", stale_reason: "anchor_cut" };
    }
    const moved: ScenePlanItem = { ...x, ...p.value };
    delete moved.stale_reason;
    if (Math.abs(dur(p.value) - dur(x)) > TIMING_CHANGE_MAX * dur(x)) {
      changed.push({ item_id: x.id, change: "timing_changed" });
      return { ...moved, status: "stale", stale_reason: "timing_changed" };
    }
    changed.push({ item_id: x.id, change: "remapped" });
    return { ...moved, status: x.status === "stale" ? "proposed" : x.status };
  });
  const base = { ...doc };
  delete base.ops;
  return {
    doc: {
      ...base, revision: doc.revision + 1, parent_revision: doc.revision,
      inputs: { ...doc.inputs, edl: o.edl, ...(o.transcript ? { transcript: o.transcript } : {}) },
      items, issues: planChecks(items, { editedDurationUs: newTl.duration_us, cfg, footage }),
    },
    changed,
  };
}
