// Режим удержания сцены (hold engine kit 0.5.0): из фазы hold spec, а у старой spec без
// `hold_mode` — по носителю итога. Один выбор для Engineer (engineer.md) и QA (порог frozen).
import { type HoldMode, type MotionSpec, phasesOf } from "./motion-spec.js";

/**
 * Режим финала: `hold_mode` фазы hold; нет — по носителю итога: схема с потоками
 * (`content.flows` у элемента graph) — `steady-flow`, график (chart) — `data-shimmer`,
 * остальное (схема без потоков, веха, число, вывод) — `now-pulse`.
 */
export function holdModeFor(spec: Pick<MotionSpec, "phases" | "beats" | "elements">): HoldMode {
  const own = spec.phases ? phasesOf(spec).find((p) => p.role === "hold")?.hold_mode : undefined;
  if (own) return own;
  const flows = spec.elements.some((e) => e.kind === "graph" && Array.isArray(e.content.flows) && e.content.flows.length > 0);
  if (flows) return "steady-flow";
  if (spec.elements.some((e) => e.kind === "chart")) return "data-shimmer";
  return "now-pulse";
}

/** `hold_mode` задан в spec явно (фаза hold с режимом), а не выбран по умолчанию. */
export function holdModeExplicit(spec: Pick<MotionSpec, "phases" | "beats">): boolean {
  return Boolean(spec.phases && phasesOf(spec).find((p) => p.role === "hold")?.hold_mode);
}
