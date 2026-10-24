// Расписание входа FlowGraph без remotion и React: каскад узлов, задержка и прорисовка
// рёбер. Им пользуются FlowGraph (flowTiming) и планировщик на сервере (минимум setup графа:
// фаза не кончается, пока рёбра не дорисованы) — один расчёт, кадры совпадают.
import type { StyleBible } from "@ms/contracts";
import { frames } from "../style/frames.js";

/** Узлы входят каскадом в первые 45 % бита графа. */
export const NODE_SPAN = 0.45;
/** Разброс старта узла: до 0,4 шага каскада (random по id узла). */
export const NODE_JITTER = 0.4;

/** Шаг каскада узлов: не больше 2,5 stagger стиля и в пределах 45 % бита. */
export const nodeGap = (s: StyleBible, nodes: number, len: number) => Math.min(s.motion.stagger_frames * 2.5, (len * NODE_SPAN) / Math.max(1, nodes - 1));

/** Задержка прорисовки ребра после входа его узлов. */
export const edgeDelay = (s: StyleBible) => frames(s, 6);

/** Прорисовка ребра, кадры. */
export const edgeDrawLen = (s: StyleBible) => Math.max(1, Math.round(s.motion.enter_frames * 1.1));

/** Верхняя граница кадра (от старта бита графа длиной `len`), когда дорисованы все рёбра. */
export function graphReadyBy(s: StyleBible, nodes: number, len: number): number {
  const gap = nodeGap(s, nodes, len);
  return (Math.max(1, nodes) - 1) * gap + NODE_JITTER * gap + edgeDelay(s) + edgeDrawLen(s);
}

/**
 * Минимальная длина бита графа из `nodes` узлов, к концу которого все рёбра дорисованы
 * (узлы — каскадом, рёбра — после обоих концов). Планировщик держит setup графа не короче.
 */
export function graphSetupMin(s: StyleBible, nodes: number): number {
  let L = Math.ceil(edgeDelay(s) + edgeDrawLen(s));
  while (graphReadyBy(s, nodes, L) > L) L++;
  return L;
}
