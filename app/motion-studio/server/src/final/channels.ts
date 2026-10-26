// Каналы звука финала (Task 43, fix 1). Remotion сводит дорожку в стерео (`-ac 2`), поэтому число
// каналов финала — 2 при любом исходнике, а содержимое сверяется по смыслу:
// - моно-исходник: L ≈ R (разница RMS < 1 дБ, корреляция > 0,99) — моно продублировано, не потеряно
//   в одном канале и не сдвинуто;
// - стерео: каналы финала попарно с `edited-audio.wav` (L↔L, R↔R, корреляция > 0,99 при общем сдвиге
//   в пределах ±100 мс — его меряет проверка синхронности) — каналы не перепутаны и не сведены в моно;
// - 5.1 и больше: даунмикс Remotion в стерео — явная пометка в отчёте, попарная сверка не применима.
// Звук декодируется в PCM f32 8 кГц (каналы как есть) во временный каталог проверки.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FinalVerifyReport } from "@ms/contracts";
import { type MediaCtx, ffmpegStderr, fileInput } from "./frames.js";

export const CHANNELS_RATE = 8_000;
export const CHANNELS_MAX_RMS_DIFF_DB = 1;
export const CHANNELS_MIN_CORR = 0.99;
/** Ниже — тишина: корреляция не определена, канал не сверяется. */
export const CHANNELS_SILENCE_DB = -60;
const MAX_LAG_S = 0.1;
const LAG_WINDOW_S = 10;

export type ChannelsReport = NonNullable<FinalVerifyReport["channels"]>;

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** RMS сигнала, дБFS (тишина — −150). */
export function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let k = 0; k < x.length; k++) s += x[k]! * x[k]!;
  const rms = Math.sqrt(s / Math.max(1, x.length));
  return rms > 0 ? Math.max(-150, 20 * Math.log10(rms)) : -150;
}

/** Корреляция Пирсона `a[k]` и `b[k + lag]` на общем отрезке; нет дисперсии — `NaN`. */
export function correlation(a: Float32Array, b: Float32Array, lag = 0, limit = Infinity): number {
  const from = Math.max(0, -lag);
  const to = Math.min(a.length, b.length - lag, from + limit);
  const n = to - from;
  if (n <= 1) return NaN;
  let sa = 0, sb = 0;
  for (let k = from; k < to; k++) {
    sa += a[k]!;
    sb += b[k + lag]!;
  }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let k = from; k < to; k++) {
    const x = a[k]! - ma, y = b[k + lag]! - mb;
    cov += x * y;
    va += x * x;
    vb += y * y;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
}

/** Сдвиг `b` относительно `a` (сэмплы, |lag| ≤ maxLag) с наибольшей корреляцией на первых `window` сэмплах. */
export function bestLag(a: Float32Array, b: Float32Array, maxLag: number, window: number): number {
  let best = 0, bestCorr = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const c = correlation(a, b, lag, window);
    if (c > bestCorr) {
      bestCorr = c;
      best = lag;
    }
  }
  return best;
}

/** Каналы из чередующегося PCM. */
export function deinterleave(pcm: Float32Array, channels: number): Float32Array[] {
  const n = Math.floor(pcm.length / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let k = 0; k < n; k++) for (let c = 0; c < channels; c++) out[c]![k] = pcm[k * channels + c]!;
  return out;
}

/** Первая звуковая дорожка → каналы PCM f32 `CHANNELS_RATE` (без сведения каналов). */
export async function decodeChannels(path: string, channels: number, out: string, o: MediaCtx = {}): Promise<Float32Array[]> {
  await ffmpegStderr(["-v", "error", ...fileInput(path), "-map", "0:a:0", "-ar", String(CHANNELS_RATE), "-ac", String(channels), "-f", "f32le", "-y", `file:${out}`], o);
  const buf = await readFile(out);
  return deinterleave(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)), channels);
}

/** Моно-исходник: каналы финала L и R — одно и то же. */
export function judgeMono(l: Float32Array, r: Float32Array): ChannelsReport {
  const dl = rmsDb(l), dr = rmsDb(r);
  const base = { source_channels: 1, final_channels: 2, mode: "mono" as const, rms_diff_db: round3(Math.abs(dl - dr)) };
  if (dl < CHANNELS_SILENCE_DB && dr < CHANNELS_SILENCE_DB) return { ...base, ok: true, message: "оба канала — тишина: сверять нечего" };
  const corr = correlation(l, r);
  const ok = base.rms_diff_db < CHANNELS_MAX_RMS_DIFF_DB && corr > CHANNELS_MIN_CORR;
  return {
    ...base, corr: Number.isNaN(corr) ? 0 : round3(corr), ok,
    message: ok ? "моно исходника продублировано в L и R" : `моно исходника не в обоих каналах поровну: разница RMS ${base.rms_diff_db} дБ, корреляция L/R ${Number.isNaN(corr) ? "—" : round3(corr)}`,
  };
}

/** Стерео-исходник: каналы финала попарно с каналами смонтированного звука (общий сдвиг ±100 мс). */
export function judgeStereo(fin: Float32Array[], src: Float32Array[]): ChannelsReport {
  const mix = (ch: Float32Array[]) => {
    const m = new Float32Array(Math.min(ch[0]!.length, ch[1]!.length));
    for (let k = 0; k < m.length; k++) m[k] = ch[0]![k]! + ch[1]![k]!;
    return m;
  };
  const lag = bestLag(src.length > 1 ? mix(src) : src[0]!, mix(fin), Math.round(MAX_LAG_S * CHANNELS_RATE), LAG_WINDOW_S * CHANNELS_RATE);
  const pair = (c: number) => (rmsDb(src[c]!) < CHANNELS_SILENCE_DB && rmsDb(fin[c]!) < CHANNELS_SILENCE_DB ? 1 : correlation(src[c]!, fin[c]!, lag));
  const cl = pair(0), cr = pair(1);
  const ok = cl > CHANNELS_MIN_CORR && cr > CHANNELS_MIN_CORR;
  const fmt = (v: number) => (Number.isNaN(v) ? 0 : round3(v));
  return {
    source_channels: 2, final_channels: 2, mode: "stereo", corr_left: fmt(cl), corr_right: fmt(cr), lag_ms: round3((lag * 1000) / CHANNELS_RATE), ok,
    message: ok ? "каналы финала совпадают с каналами смонтированного звука попарно" : `каналы финала не совпадают с исходными попарно: L ${fmt(cl)}, R ${fmt(cr)} (порог ${CHANNELS_MIN_CORR})`,
  };
}

/** Сверка каналов финала с исходником (`sourceChannels` — каналы `edited-audio.wav`). */
export async function checkChannels(i: { finalPath: string; editedAudio: string; sourceChannels: number; finalChannels: number; workDir: string }, o: MediaCtx = {}): Promise<ChannelsReport> {
  const { sourceChannels: sc, finalChannels: fc } = i;
  if (sc > 2) {
    return { source_channels: sc, final_channels: fc, mode: "downmix", ok: fc === 2, message: `${sc} каналов исходника сведены Remotion в стерео (даунмикс -ac 2); попарная сверка не применима` };
  }
  if (fc !== 2) return { source_channels: sc, final_channels: fc, mode: sc === 1 ? "mono" : "stereo", ok: fc === sc, message: `в финале ${fc} канал(ов), исходник — ${sc}` };
  const fin = await decodeChannels(i.finalPath, 2, join(i.workDir, "channels-final.f32"), o);
  if (sc === 1) return judgeMono(fin[0]!, fin[1]!);
  const src = await decodeChannels(i.editedAudio, 2, join(i.workDir, "channels-source.f32"), o);
  return judgeStereo(fin, src);
}
