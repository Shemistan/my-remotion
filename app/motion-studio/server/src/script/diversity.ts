// Разнообразие сценария: плана до генерации (`planDiversity`, S3) и пакета после (`packageDiversity`, S11).
// `warningsForState` — поставщик предупреждений карточек сцен для `scriptState` (S1 → S11).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type MotionSpec, MotionSpecSchema, type PlanIssue, type SceneStructure, type ScriptPlanRevisionDoc, type ScriptSceneItem, TECHNIQUES, type Technique, holdModeFor, structureOf, structureOfRule } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as scenes from "../db/repos/scenes.js";
import { scriptScenes } from "../db/repos/script.js";
import * as versions from "../db/repos/versions.js";
import { uniformEntrance } from "../qa/spec-checks.js";
import { kitImports } from "../scenes/kit-imports.js";
import { currentScriptPlan } from "./read.js";

/**
 * Предупреждения разнообразия пакета по `scene_id` для `ScriptSceneDto.warnings` (S11):
 * `packageDiversity` по текущим ready-версиям 16:9 принятых сцен плана, в порядке плана.
 * Сцена без готовой версии — без проверки; нечитаемая версия — как без версии.
 */
export function warningsForState(db: Db, root: string, projectId: string, plan: ScriptPlanRevisionDoc | null): Record<string, PlanIssue[]> {
  if (!plan) return {};
  const cur = currentScriptPlan(db, root, projectId);
  if (!cur || cur.doc.revision !== plan.revision) return {};
  const rows = plan.items.filter((x) => x.status === "accepted").flatMap((item) => {
    const row = scriptScenes.get(db, cur.planId, item.id, "16:9");
    return row ? [{ item, sceneId: row.scene_id, ...readyVersion(db, root, row.scene_id) }] : [];
  });
  const d = packageDiversity(rows);
  return Object.fromEntries(rows.map((r) => [r.sceneId, d.per_item[r.item.id] ?? []]));
}

/** Готовая версия: spec и kit-компоненты кода; `spec: null` — версии нет или она не читается. */
interface ReadyVersion {
  spec: MotionSpec | null;
  kit: string[];
}

/**
 * Кэш прочитанных ready-версий по `version_id` (S11-fix M8): файлы готовой версии не меняются,
 * а `scriptState` зовёт `warningsForState` на каждый запрос состояния сценария.
 */
const readyCache = new Map<string, ReadyVersion>();
const READY_CACHE_MAX = 2000;

/** spec и kit-компоненты кода текущей ready-версии сцены; нет — spec null. */
function readyVersion(db: Db, root: string, sceneId: string): ReadyVersion {
  const id = scenes.get(db, sceneId)?.current_version_id;
  const v = id ? versions.get(db, id) : undefined;
  if (!v || v.status !== "ready" || v.broken_reason) return { spec: null, kit: [] };
  const hit = readyCache.get(v.id);
  if (hit) return hit;
  const dir = join(root, v.path);
  let out: ReadyVersion;
  try {
    const spec = MotionSpecSchema.parse(JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")));
    const kit = new Set<string>();
    for (const f of readdirSync(join(dir, "src"), { recursive: true, encoding: "utf8" })) {
      if (/\.(tsx|ts|jsx|js)$/.test(f)) for (const n of kitImports(readFileSync(join(dir, "src", f), "utf8"))) kit.add(n);
    }
    out = { spec, kit: [...kit].sort() };
  } catch {
    // нечитаемая версия не кэшируется: хранилище могло быть недоступно на миг
    return { spec: null, kit: [] };
  }
  if (readyCache.size >= READY_CACHE_MAX) readyCache.delete(readyCache.keys().next().value!);
  readyCache.set(v.id, out);
  return out;
}

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
      issues.push({ item_id: x.id, code: "adjacent_structure_repeat", severity: "warning", message: `сцены ${prev.id} и ${x.id} подряд с одной формой времени ${a} — задайте сцене другую форму времени` });
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

// --- packageDiversity (S11): разнообразие пакета после генерации (спека §12 п.2)

/** Ключевые компоненты kit всех приёмов в порядке таблицы приёмов. */
const KEY_COMPONENTS: readonly string[] = [...new Set(TECHNIQUES.flatMap((t) => t.kit as readonly string[]))];

/** Герой сцены по коду: ключевой компонент своего приёма, иначе первый ключевой компонент по таблице. */
function heroComponent(technique: Technique, kit: readonly string[]): string | undefined {
  const own = TECHNIQUES.find((t) => t.slug === technique)!.kit as readonly string[];
  return own.find((c) => kit.includes(c)) ?? KEY_COMPONENTS.find((c) => kit.includes(c));
}

/** Что за главный элемент у компонента kit — для сообщений человеку без имён kit (S11-fix M6). */
const KIT_RU: Record<string, string> = {
  AnimatedNumber: "счётчика числа", DataToken: "токена данных", BarChart: "столбиковой диаграммы", LineChart: "графика",
  AreaChart: "графика", ComparisonSplit: "сравнения «было/стало»", LatencyRace: "гонки скоростей", ProcessSteps: "шагов процесса",
  FlowGraph: "схемы потоков", PulseAlongPath: "импульса по пути", Card: "карточек", Highlight: "выделения",
  Timeline: "оси времени", CodeBlock: "блока кода", StatusChip: "отметок статуса", Callout: "выноски",
  KineticText: "кинетического текста", Emphasis: "акцента на словах",
};
const kitRu = (names: readonly string[]) => [...new Set(names.map((n) => KIT_RU[n] ?? "главного элемента"))].join(" или ");

/**
 * Разнообразие пакета по spec и коду версий (спека §12 п.2): приём реализован — в `kit` есть
 * ключевой компонент приёма (`technique_not_realized`); соседние готовые сцены не совпадают
 * разом по структуре, герою-компоненту и режиму удержания (`adjacent_scene_repeat`, у поздней).
 * Всё — warning. Сводка: структуры и kit готовых сцен, доля сцен с `uniform_entrance` вида fade
 * (по входам spec, `uniformEntrance`). Сцена без версии (`spec: null`) не проверяется и соседства не рвёт.
 */
export function packageDiversity(scenes: readonly { item: ScriptSceneItem; spec: MotionSpec | null; kit: string[] }[]): {
  per_item: Record<string, PlanIssue[]>;
  summary: { structures: Record<string, number>; kit: Record<string, number>; fade_share: number };
} {
  const per_item: Record<string, PlanIssue[]> = {};
  const structures: Record<string, number> = {};
  const kit: Record<string, number> = {};
  let ready = 0;
  let fades = 0;
  let prev: string | undefined;
  for (const s of scenes) {
    const issues: PlanIssue[] = [];
    per_item[s.item.id] = issues;
    if (!s.spec) continue;
    ready++;
    if (uniformEntrance(s.spec)?.kind === "fade") fades++;
    const structure = structureOf(s.spec);
    structures[structure] = (structures[structure] ?? 0) + 1;
    for (const c of s.kit) kit[c] = (kit[c] ?? 0) + 1;
    const t = TECHNIQUES.find((x) => x.slug === s.item.technique)!;
    if (!(t.kit as readonly string[]).some((c) => s.kit.includes(c))) {
      issues.push({ item_id: s.item.id, code: "technique_not_realized", severity: "warning", message: `приём «${t.ru}» не показан: в сцене нет ${kitRu(t.kit)} — похоже на «заголовок и плашку»; перегенерируйте` });
    }
    const hero = heroComponent(s.item.technique, s.kit) ?? "—";
    const hold = holdModeFor(s.spec);
    const form = `${structure}|${hero}|${hold}`;
    if (prev === form) {
      issues.push({ item_id: s.item.id, code: "adjacent_scene_repeat", severity: "warning", message: "повторяет предыдущую сцену: та же форма времени, тот же главный элемент и тот же режим финала — перегенерируйте одну из них" });
    }
    prev = form;
  }
  return { per_item, summary: { structures, kit, fade_share: ready === 0 ? 0 : fades / ready } };
}
