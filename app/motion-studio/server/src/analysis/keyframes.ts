// Ключевые кадры шотов (Task 30): моменты внутри шота, общий лимит на ролик и извлечение PNG
// из прокси (длинная сторона 640). Момент кадра (`us`) — единственное «время», которое потом
// видит Footage Analyst: он может сослаться только на кадр из списка (`frame_us`).
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type RunRef, runFfmpeg } from "../media/ffmpeg.js";

/** Кадров на ролик не больше (бюджет Vision и агента). */
export const MAX_KEYFRAMES_TOTAL = 120;
/** Минимум кадров на шот для вывода по лицу (ТЗ §4). */
export const MIN_SHOT_KEYFRAMES = 3;
/** Длинная сторона PNG ключевого кадра, px. */
export const KEYFRAME_LONG_SIDE = 640;

/** Равномерная выборка `q` элементов с сохранением первого и последнего; `q = 1` — средний. */
export function thin<T>(xs: readonly T[], q: number): T[] {
  const n = xs.length;
  if (q >= n) return [...xs];
  if (q <= 0) return [];
  if (q === 1) return [xs[Math.floor((n - 1) / 2)]!];
  const out: T[] = [];
  let last = -1;
  for (let j = 0; j < q; j++) {
    const i = Math.round((j * (n - 1)) / (q - 1));
    if (i !== last) out.push(xs[i]!);
    last = i;
  }
  return out;
}

/**
 * Моменты кадров шота: `start + everyUs/2 + k·everyUs < end`; меньше трёх — ¼, ½, ¾ шота;
 * больше `max` — равномерное прореживание. Целые µs по возрастанию.
 */
export function sampleKeyframes(shot: { start_us: number; end_us: number }, everyUs = 2_000_000, max = 30): number[] {
  const len = shot.end_us - shot.start_us;
  if (len <= 0) return [];
  let us: number[] = [];
  for (let t = shot.start_us + everyUs / 2; t < shot.end_us; t += everyUs) us.push(Math.round(t));
  if (us.length < MIN_SHOT_KEYFRAMES) us = [1, 2, 3].map((k) => Math.round(shot.start_us + (len * k) / 4));
  return thin([...new Set(us)], max);
}

/** Раздача `rest` мест пропорционально ёмкостям (наибольший остаток). */
function distribute(rest: number, cap: number[]): number[] {
  const total = cap.reduce((a, b) => a + b, 0);
  if (rest <= 0 || total <= 0) return cap.map(() => 0);
  const share = cap.map((c) => (rest * c) / total);
  const got = share.map((s, i) => Math.min(cap[i]!, Math.floor(s)));
  let left = rest - got.reduce((a, b) => a + b, 0);
  const order = share.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (got[i]! < cap[i]!) {
      got[i]! += 1;
      left--;
    }
  }
  return got;
}

/**
 * Общий лимит кадров на ролик (`max`, 120): сначала каждому шоту до трёх кадров, остаток —
 * пропорционально числу его кадров; не хватает даже на три — по одному кадру на шот; шотов
 * больше лимита — кадр получают равномерно выбранные шоты, у остальных кадров нет (их пометит
 * `mergeFootage`). Внутри шота — равномерное прореживание.
 */
export function budgetKeyframes(perShot: readonly number[][], max = MAX_KEYFRAMES_TOTAL): number[][] {
  const total = perShot.reduce((a, s) => a + s.length, 0);
  if (total <= max) return perShot.map((s) => [...s]);
  let quota = perShot.map((s) => Math.min(s.length, MIN_SHOT_KEYFRAMES));
  if (quota.reduce((a, b) => a + b, 0) > max) {
    const nonEmpty = perShot.map((s, i) => [s.length, i] as const).filter(([n]) => n > 0).map(([, i]) => i);
    if (nonEmpty.length > max) {
      const pick = new Set(thin(nonEmpty, max));
      return perShot.map((s, i) => (pick.has(i) ? thin(s, 1) : []));
    }
    quota = perShot.map((s) => Math.min(s.length, 1));
  }
  const rest = max - quota.reduce((a, b) => a + b, 0);
  const extra = distribute(rest, perShot.map((s, i) => s.length - quota[i]!));
  return perShot.map((s, i) => thin(s, quota[i]! + extra[i]!));
}

/** Относительный путь PNG кадра в draft/артефакте: по моменту, сортируется по времени. */
export function keyframeName(us: number): string {
  return `frames/${String(us).padStart(12, "0")}.png`;
}

/**
 * Аргументы ffmpeg для одного кадра. `-ss` стоит перед `-i`: при перекодировании ffmpeg ищет
 * точно (`-accurate_seek` по умолчанию: декод от ближайшего ключевого кадра с отбрасыванием до
 * момента) — тот же кадр, что `-ss` после `-i`, но без декода с начала ролика на каждый кадр
 * (120 кадров часового ролика). Совпадение кадров проверяет тест на реальном ffmpeg.
 */
export function keyframeArgs(proxy: string, us: number, outPng: string): string[] {
  const L = KEYFRAME_LONG_SIDE;
  return [
    "-protocol_whitelist", "file", "-ss", (us / 1e6).toFixed(6), "-f", "mov", "-i", `file:${proxy}`,
    "-an", "-sn", "-dn", "-frames:v", "1",
    "-vf", `scale='if(gte(iw,ih),${L},-2)':'if(gte(iw,ih),-2,${L})'`,
    "-n", `file:${outPng}`,
  ];
}

/**
 * PNG кадров `us` из прокси в `outDir/frames/`. Кадр, которого ffmpeg не выдал (момент за
 * последним кадром), пропускается: возвращаются только созданные (`us` и путь относительно
 * `outDir`).
 */
export async function extractKeyframes(
  proxy: string,
  us: readonly number[],
  outDir: string,
  o: { run?: RunRef; signal: AbortSignal; onFrame?: (done: number) => void },
): Promise<{ us: number; path: string }[]> {
  const out: { us: number; path: string }[] = [];
  let k = 0;
  await mkdir(join(outDir, "frames"), { recursive: true });
  for (const t of us) {
    const rel = keyframeName(t);
    const abs = join(outDir, rel);
    await runFfmpeg(keyframeArgs(proxy, t, abs), { ...(o.run ? { run: o.run } : {}), signal: o.signal, timeoutMs: 120_000 });
    if (existsSync(abs)) out.push({ us: t, path: rel });
    o.onFrame?.(++k);
  }
  return out;
}
