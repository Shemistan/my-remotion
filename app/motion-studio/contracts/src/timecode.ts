import { type Fps, frameToUs } from "./time.js";

/** Стандартные частоты кадров: к ним приводится `avg_frame_rate` исходника. */
export const STANDARD_FPS: readonly Fps[] = [
  { num: 24000, den: 1001 }, { num: 24, den: 1 }, { num: 25, den: 1 }, { num: 30000, den: 1001 },
  { num: 30, den: 1 }, { num: 50, den: 1 }, { num: 60000, den: 1001 }, { num: 60, den: 1 },
];

const US_PER_S = 1_000_000n;
const SNAP_TOLERANCE = 0.01;

function checkFps(fps: Fps): void {
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw new RangeError(`fps должен быть дробью положительных целых: ${fps.num}/${fps.den}`);
  }
}

function checkUs(us: number): void {
  if (!Number.isSafeInteger(us) || us < 0) throw new RangeError(`us должно быть целым >= 0: ${us}`);
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reduce(fps: Fps): Fps {
  const g = gcd(fps.num, fps.den);
  return { num: fps.num / g, den: fps.den / g };
}

/** Кадры в `us` как точная дробь `n / d` (BigInt: без ошибок округления на длинных роликах). */
function frameRatio(us: number, fps: Fps): [bigint, bigint] {
  checkFps(fps);
  checkUs(us);
  return [BigInt(us) * BigInt(fps.num), BigInt(fps.den) * US_PER_S];
}

/** Ближайший стандарт в пределах 1 %, иначе сокращённая дробь. */
export function snapFps(avg: Fps): Fps {
  checkFps(avg);
  const v = avg.num / avg.den;
  let best: Fps | undefined;
  let bestDiff = Infinity;
  for (const s of STANDARD_FPS) {
    const sv = s.num / s.den;
    const diff = Math.abs(v - sv) / sv;
    if (diff <= SNAP_TOLERANCE && diff < bestDiff) [best, bestDiff] = [s, diff];
  }
  return best ? { ...best } : reduce(avg);
}

/** Ближайшая граница кадра: `frameToUs(round(us·num / (den·1e6)))`; половина кадра — вверх. */
export function snapUsToFrame(us: number, fps: Fps): number {
  const [n, d] = frameRatio(us, fps);
  return frameToUs(Number((2n * n + d) / (2n * d)), fps);
}

/**
 * Номер первого кадра, начало которого (`frameToUs`) не раньше `us` — округление вверх, двойственное
 * `usToFrame`: `usToFrameCeil(frameToUs(f)) === f` для любых fps (R10: `frameToUs` — ceil в µs).
 */
export function usToFrameCeil(us: number, fps: Fps): number {
  if (us === 0) return 0;
  const [n, d] = frameRatio(us - 1, fps);
  return Number(n / d) + 1;
}

/** `"30000/1001"` или `"25"` (формат ffprobe) → сокращённая дробь; `"0/0"` и мусор — RangeError. */
export function parseRational(s: string): Fps {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(s.trim());
  const num = m ? Number(m[1]) : NaN;
  const den = m?.[2] !== undefined ? Number(m[2]) : 1;
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || num <= 0 || den <= 0) {
    throw new RangeError(`не рациональная частота кадров: "${s}"`);
  }
  return reduce({ num, den });
}
