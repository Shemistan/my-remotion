export interface EtaSample { t: number; p: number }
const isSamples = (value: unknown): value is readonly EtaSample[] => Array.isArray(value);

/** По последним точкам прогресса возвращает оставшееся время в миллисекундах. */
export function etaFrom(samples: readonly EtaSample[]): number | undefined;
/** По времени старта возвращает оставшееся время в секундах. */
export function etaFrom(startedAt: string | number | Date | null | undefined, progress: number, now?: number): number | null;
export function etaFrom(startedAt: string | number | Date | null | undefined | readonly EtaSample[], progress?: number, now = Date.now()): number | null | undefined {
  if (isSamples(startedAt)) {
    const samples = startedAt.slice(-10).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
    if (samples.length < 3 || samples.at(-1)!.p <= samples[0]!.p) return undefined;
    const mt = samples.reduce((n, x) => n + x.t, 0) / samples.length;
    const mp = samples.reduce((n, x) => n + x.p, 0) / samples.length;
    const variance = samples.reduce((n, x) => n + (x.t - mt) ** 2, 0);
    const slope = variance > 0 ? samples.reduce((n, x) => n + (x.t - mt) * (x.p - mp), 0) / variance : 0;
    if (!Number.isFinite(slope) || slope <= 0) return undefined;
    return Math.max(0, Math.ceil((1 - samples.at(-1)!.p) / slope));
  }
  if (progress === undefined) return null;
  if (progress >= 1) return 0;
  if (progress <= 0 || !Number.isFinite(progress) || startedAt === null || startedAt === undefined) return null;
  const start = startedAt instanceof Date ? startedAt.getTime() : typeof startedAt === "number" ? startedAt : Date.parse(startedAt);
  const elapsed = now - start;
  if (!Number.isFinite(start) || !Number.isFinite(elapsed) || elapsed <= 0) return null;
  return Math.max(1, Math.ceil((elapsed / 1000) * ((1 - progress) / progress)));
}
