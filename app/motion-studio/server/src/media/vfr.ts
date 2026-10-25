// VFR по pts видеопакетов (Task 25): разброс интервалов между соседними кадрами.

/** Порог: стандартное отклонение Δ / среднее Δ. */
export const VFR_CV = 0.02;

export interface VfrInfo {
  vfr: boolean;
  meanDeltaUs: number;
  maxDeltaUs: number;
  /** 10-й перцентиль Δ — «рабочий» интервал кадров (самые частые кадры ролика), µs. */
  p10DeltaUs: number;
}

/**
 * `vfr`, если `std(Δ)/mean(Δ) > 0.02`. pts сортируются (пакеты идут в порядке декодирования,
 * B-кадры переставлены), повторы отбрасываются; меньше трёх кадров — не VFR. `tickUs` — шаг
 * таймбазы потока (ревью M8): отклонения `|Δ − mean| ≤ tickUs` — округление pts до тика, не
 * переменная частота (60 fps в таймбазе 1/1000 — интервалы 16/17 мс).
 */
export function detectVfr(ptsUs: number[], o: { tickUs?: number } = {}): VfrInfo {
  const pts = [...new Set(ptsUs)].sort((a, b) => a - b);
  if (pts.length < 3) return { vfr: false, meanDeltaUs: 0, maxDeltaUs: 0, p10DeltaUs: 0 };
  const d = pts.slice(1).map((p, i) => p - pts[i]!);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  // +1 µs: pts_time ffprobe печатает с точностью до микросекунды
  const tol = o.tickUs !== undefined && o.tickUs > 0 ? o.tickUs + 1 : 0;
  const dev = (x: number) => (Math.abs(x - mean) <= tol ? 0 : x - mean);
  const std = Math.sqrt(d.reduce((s, x) => s + dev(x) ** 2, 0) / d.length);
  const sorted = [...d].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(0.1 * (sorted.length - 1))]!;
  return { vfr: mean > 0 && std / mean > VFR_CV, meanDeltaUs: mean, maxDeltaUs: sorted.at(-1)!, p10DeltaUs: p10 };
}
