// Громкость финала (Task 44): интегральная громкость EBU R128 (`ebur128`) и пиковый уровень
// (`astats`) финала против смонтированного звука. Звук не нормализуется — финал обязан звучать
// как edited-audio (±0,5 LU, пик не выше на 0,1 дБ).
import { type MediaCtx, ffmpegStderr, fileInput } from "./frames.js";

/** Нижняя граница уровней: тишина (`-inf`) в отчёте — конечное число. */
export const SILENCE_DB = -150;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const finite = (v: number): number => (Number.isFinite(v) ? Math.max(SILENCE_DB, v) : SILENCE_DB);

/** Сводки `ebur128` (`I: … LUFS`) и `astats` (`Peak level dB`, общий по каналам). */
export function parseLoudness(stderr: string): { lufs: number; peak_db: number } {
  const i = /^\s*I:\s+(-?[\d.]+|-inf|nan)\s+LUFS/m.exec(stderr);
  const p = /Overall[\s\S]*?Peak level dB:\s*(-?[\d.]+|-inf|inf)/.exec(stderr);
  if (!i || !p) throw new Error("loudness: нет сводки ebur128/astats в выводе ffmpeg");
  const num = (s: string) => (s === "-inf" || s === "nan" ? -Infinity : Number(s));
  return { lufs: round2(finite(num(i[1]!))), peak_db: round2(finite(num(p[1]!))) };
}

/** Громкость и пик первой звуковой дорожки файла. */
export async function measureLoudness(path: string, o: MediaCtx = {}): Promise<{ lufs: number; peak_db: number }> {
  const err = await ffmpegStderr([
    ...fileInput(path), "-map", "0:a:0", "-af", "ebur128=framelog=quiet,astats=measure_perchannel=none:measure_overall=Peak_level", "-f", "null", "-",
  ], o);
  return parseLoudness(err);
}

/** Громкость финала против смонтированного звука: `delta_lu = final − source`. */
export async function loudnessDelta(final: string, editedAudio: string, o: MediaCtx = {}): Promise<{ source_lufs: number; final_lufs: number; delta_lu: number; final_peak_db: number; source_peak_db: number }> {
  const f = await measureLoudness(final, o);
  const s = await measureLoudness(editedAudio, o);
  return { source_lufs: s.lufs, final_lufs: f.lufs, delta_lu: round2(f.lufs - s.lufs), final_peak_db: f.peak_db, source_peak_db: s.peak_db };
}
