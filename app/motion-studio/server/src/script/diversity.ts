// Разнообразие сценария: плана до генерации (`planDiversity`, S3) и пакета после (`packageDiversity`, S11).
// S1 — заглушка поставщика предупреждений карточек сцен для `scriptState`.
import { type PlanIssue, type SceneStructure, type ScriptPlanRevisionDoc, type ScriptSceneItem, TECHNIQUES, type Technique, structureOfRule } from "@ms/contracts";
import type { Db } from "../db/open.js";

/** Предупреждения разнообразия пакета по `scene_id` для `ScriptSceneDto.warnings` (S11 заменяет тело). */
export const warningsForState: (db: Db, root: string, projectId: string, plan: ScriptPlanRevisionDoc | null) => Record<string, PlanIssue[]> = () => ({});

// --- planDiversity (S3): разнообразие плана до генерации (спека §5.3)

/** Форма времени сцены: по `structure_rule`, без неё — типичная структура приёма. */
export function sceneStructure(item: Pick<ScriptSceneItem, "technique" | "structure_rule">): SceneStructure {
  return item.structure_rule ? structureOfRule(item.structure_rule) : TECHNIQUES.find((t) => t.slug === item.technique)!.structure;
}

/** Предельная доля `kinetic-quote` среди принятых сцен. */
export const KINETIC_MAX_SHARE = 0.2;
/** С этого числа принятых сцен — не меньше `MIN_VARIETY` разных приёмов. */
export const VARIETY_FROM = 6;
export const MIN_VARIETY = 4;

/**
 * Разнообразие принятых сцен плана: соседние — разные приёмы (`adjacent_technique_repeat`,
 * blocking, у поздней), один приём ≤ max(2, ⌈0,3·n⌉) (`technique_overuse`), `kinetic-quote`
 * ≤ 20 % (`kinetic_overuse`), при n ≥ 6 — ≥ 4 разных приёма (`low_variety`), соседние — разная
 * форма времени (`adjacent_structure_repeat`); всё, кроме первого, — warning.
 */
export function planDiversity(items: readonly ScriptSceneItem[]): ScriptPlanRevisionDoc["diversity"] & { issues: PlanIssue[] } {
  const acc = items.filter((x) => x.status === "accepted");
  const n = acc.length;
  const techniques: Partial<Record<Technique, number>> = {};
  for (const x of acc) techniques[x.technique] = (techniques[x.technique] ?? 0) + 1;
  const issues: PlanIssue[] = [];
  let adjacent = 0;
  acc.forEach((x, i) => {
    const prev = acc[i - 1];
    if (!prev) return;
    if (prev.technique === x.technique) {
      adjacent++;
      issues.push({ item_id: x.id, code: "adjacent_technique_repeat", severity: "blocking", message: `сцены ${prev.id} и ${x.id} подряд одним приёмом ${x.technique} — смените приём одной из них` });
    }
    const a = sceneStructure(prev);
    if (a === sceneStructure(x)) {
      issues.push({ item_id: x.id, code: "adjacent_structure_repeat", severity: "warning", message: `сцены ${prev.id} и ${x.id} подряд с одной формой времени ${a} — задайте другую structure_rule` });
    }
  });
  const limit = Math.max(2, Math.ceil(0.3 * n));
  for (const [t, c] of Object.entries(techniques) as [Technique, number][]) {
    if (c > limit) issues.push({ code: "technique_overuse", severity: "warning", message: `приём ${t} в ${c} сценах из ${n} (предел ${limit})` });
  }
  const share = n === 0 ? 0 : (techniques["kinetic-quote"] ?? 0) / n;
  if (share > KINETIC_MAX_SHARE) issues.push({ code: "kinetic_overuse", severity: "warning", message: `kinetic-quote — ${Math.round(share * 100)} % сцен (предел ${KINETIC_MAX_SHARE * 100} %)` });
  const variety = Object.keys(techniques).length;
  if (n >= VARIETY_FROM && variety < MIN_VARIETY) issues.push({ code: "low_variety", severity: "warning", message: `разных приёмов ${variety} на ${n} сцен (нужно не меньше ${MIN_VARIETY})` });
  return { techniques, adjacent_repeats: adjacent, kinetic_share: share, issues };
}
