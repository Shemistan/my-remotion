// Проверки визуального плана (Task 32): лицо, пересечения, плотность, fullscreen, промежутки,
// длительность, ключевые слова вне сцены, зона, занятая руками в окнах времени сцены, план без сцен.
// Отклонённые сцены в проверки не входят.
import type { FootageAnalysis, PlanIssue, ScenePlanItem } from "@ms/contracts";
import type { PlanningConfig } from "./plan-build.js";
import { occupiedAt } from "./planner-input.js";
import { freeZones } from "./zones.js";

/** Режимы поверх кадра с автором: лицо и занятые зоны проверяются. */
const OVER_AUTHOR = new Set<ScenePlanItem["composition_mode"]>(["overlay", "callout", "pip"]);
const FULLSCREEN = new Set<ScenePlanItem["composition_mode"]>(["fullscreen", "split_screen"]);
/** Свободная доля зоны в окнах сцены ниже этой — `zone_occupied` (warning). */
export const ZONE_FREE_MIN = 0.85;

export interface PlanCheckContext {
  editedDurationUs: number;
  cfg: PlanningConfig;
  /** Анализ видеоряда: есть — проверяется занятость зоны по окнам времени сцены. */
  footage?: FootageAnalysis;
}

const s1 = (us: number): string => (us / 1e6).toFixed(1).replace(".", ",");
const pct = (x: number): string => `${Math.round(x * 100)} %`;
const dur = (x: ScenePlanItem): number => x.edited.end_us - x.edited.start_us;

export function planChecks(items: ScenePlanItem[], ctx: PlanCheckContext): PlanIssue[] {
  const { cfg } = ctx;
  const active = items.filter((x) => x.status !== "rejected");
  if (active.length === 0) return [{ code: "no_scenes", severity: "warning", message: "в плане нет сцен — ролик без графики" }];
  const out: PlanIssue[] = [];
  const add = (code: string, severity: PlanIssue["severity"], message: string, item_id?: string) =>
    out.push({ ...(item_id !== undefined ? { item_id } : {}), code, severity, message });

  for (const x of active) {
    let faceIssue = false;
    if (OVER_AUTHOR.has(x.composition_mode) && x.face_overlap.ratio > cfg.faceOverlapMax) {
      faceIssue = true;
      const why = x.face_overlap.override_reason;
      add("face_overlap", why ? "warning" : "blocking",
        why ? `графика закрывает ${pct(x.face_overlap.ratio)} лица — по причине «${why}»`
          : `графика (${x.zone}) закрывает ${pct(x.face_overlap.ratio)} лица автора — выберите другую зону или укажите причину`, x.id);
    }
    const d = dur(x);
    if (d < cfg.minSceneUs) add("too_short", "warning", `сцена ${s1(d)} с короче ${s1(cfg.minSceneUs)} с`, x.id);
    if (d > cfg.maxSceneUs) add("too_long", "warning", `сцена ${s1(d)} с длиннее ${s1(cfg.maxSceneUs)} с`, x.id);
    for (const k of x.key_terms) {
      if (k.edited_at_us < x.edited.start_us || k.edited_at_us >= x.edited.end_us) {
        add("key_term_outside", "blocking", `ключевое слово «${k.text}» звучит вне сцены (${s1(k.edited_at_us)} с)`, x.id);
      }
    }
    if (ctx.footage && !faceIssue && OVER_AUTHOR.has(x.composition_mode)) {
      const free = freeZones(occupiedAt(ctx.footage, x.source), [x.zone])[0]!.free_ratio;
      if (free < ZONE_FREE_MIN) add("zone_occupied", "warning", `зона ${x.zone} свободна на ${pct(free)} во время сцены (руки, предметы)`, x.id);
    }
  }

  const sorted = [...active].sort((a, b) => a.edited.start_us - b.edited.start_us || a.edited.end_us - b.edited.end_us);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.edited.start_us < prev.edited.end_us) {
      add("scene_overlap", "blocking", `сцена пересекается с ${prev.id}`, cur.id);
    } else if (cur.edited.start_us - prev.edited.end_us < cfg.minGapUs) {
      add("tight_gap", "warning", `промежуток после ${prev.id} — ${s1(cur.edited.start_us - prev.edited.end_us)} с (меньше ${s1(cfg.minGapUs)} с)`, cur.id);
    }
  }

  const total = Math.max(1, ctx.editedDurationUs);
  const cover = active.reduce((a, x) => a + dur(x), 0) / total;
  if (cover > cfg.maxCoverage) add("density", "blocking", `графика занимает ${pct(cover)} ролика — больше ${pct(cfg.maxCoverage)}`);
  const full = active.filter((x) => FULLSCREEN.has(x.composition_mode)).reduce((a, x) => a + dur(x), 0) / total;
  if (full > cfg.maxFullscreenCoverage) {
    add("fullscreen_heavy", "warning", `полноэкранные сцены и split — ${pct(full)} ролика, больше ${pct(cfg.maxFullscreenCoverage)}`);
  }
  return out;
}
