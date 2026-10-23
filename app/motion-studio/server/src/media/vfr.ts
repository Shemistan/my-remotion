// VFR по pts видеопакетов (Task 25): разброс интервалов между соседними кадрами.

/** Порог: стандартное отклонение Δ / среднее Δ. */
export const VFR_CV = 0.02;

/**
 * `vfr`, если `std(Δ)/mean(Δ) > 0.02`. pts сортируются (пакеты идут в порядке декодирования,
 * B-кадры переставлены), повторы отбрасываются; меньше трёх кадров — не VFR.
 */
export function detectVfr(ptsUs: number[]): { vfr: boolean; meanDeltaUs: number; maxDeltaUs: number } {
  const pts = [...new Set(ptsUs)].sort((a, b) => a - b);
  if (pts.length < 3) return { vfr: false, meanDeltaUs: 0, maxDeltaUs: 0 };
  const d = pts.slice(1).map((p, i) => p - pts[i]!);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const std = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / d.length);
  return { vfr: mean > 0 && std / mean > VFR_CV, meanDeltaUs: mean, maxDeltaUs: Math.max(...d) };
}
