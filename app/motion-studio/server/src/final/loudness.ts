// Громкость финала (Task 44): интегральная громкость и true peak EBU R128 (`ebur128=peak=true`)
// финала против смонтированного звука. Звук не нормализуется — финал обязан звучать как
// edited-audio (±0,5 LU). Пик — true peak, не sample peak (fix 1): AAC на речи даёт перебор
// межсэмпловых пиков на доли дБ, и это не ошибка, пока финал не упирается в потолок (`verify.ts`).
import { type MediaCtx, ffmpegStderr, fileInput } from "./frames.js";

/** Нижняя граница уровней: тишина (`-inf`) в отчёте — конечное число. */
export const SILENCE_DB = -150;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const finite = (v: number): number => (Number.isFinite(v) ? Math.max(SILENCE_DB, v) : SILENCE_DB);

/** Сводка `ebur128`: `I: … LUFS` и `True peak: Peak: … dBFS` (dBTP). */
export function parseLoudness(stderr: string): { lufs: number; peak_db: number } {
  const i = /^\s*I:\s+(-?[\d.]+|-inf|nan)\s+LUFS/m.exec(stderr);
  const p = /True peak:\s*\n\s*Peak:\s+(-?[\d.]+|-inf|inf|nan)\s+dBFS/.exec(stderr);
  if (!i || !p) throw new Error("loudness: нет сводки ebur128 (I, true peak) в выводе ffmpeg");
  const num = (s: string) => (s === "-inf" || s === "nan" ? -Infinity : Number(s));
  return { lufs: round2(finite(num(i[1]!))), peak_db: round2(finite(num(p[1]!))) };
}

/** Громкость и true peak первой звуковой дорожки файла. */
export async function measureLoudness(path: string, o: MediaCtx = {}): Promise<{ lufs: number; peak_db: number }> {
  const err = await ffmpegStderr([...fileInput(path), "-map", "0:a:0", "-af", "ebur128=framelog=quiet:peak=true", "-f", "null", "-"], o);
  return parseLoudness(err);
}

/** Громкость финала против смонтированного звука: `delta_lu = final − source`. */
export async function loudnessDelta(final: string, editedAudio: string, o: MediaCtx = {}): Promise<{ source_lufs: number; final_lufs: number; delta_lu: number; final_peak_db: number; source_peak_db: number }> {
  const f = await measureLoudness(final, o);
  const s = await measureLoudness(editedAudio, o);
  return { source_lufs: s.lufs, final_lufs: f.lufs, delta_lu: round2(f.lufs - s.lufs), final_peak_db: f.peak_db, source_peak_db: s.peak_db };
}
