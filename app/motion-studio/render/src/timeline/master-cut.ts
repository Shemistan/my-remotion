// Вырезка master под кадры рендера (ревью Task 36, I3). Remotion при каждом renderStill/renderMedia
// заводит свой каталог загрузок в TMPDIR и качает `src` у `OffthreadVideo` целиком: стоп-кадр
// превью сцены в контексте тянул весь master (5 мин 1080p — гигабайт). Поэтому для короткого
// диапазона медиасервер отдаёт вырезку master: кадры, которые видны в рендере, плюс запас 1 с,
// перекодированные с кадровой точностью тем же CRF, что и master. Последовательности обрезаются
// по вырезке (trimBefore Remotion не бывает отрицательным). Длинный диапазон (финал) — весь master:
// перекодировать полролика дороже, чем скачать его один раз.
import type { Fps, SequenceSpec } from "@ms/contracts";

/** Запас вырезки с каждой стороны — секунда (как GOP master). */
export const CUT_MARGIN_S = 1;
/** Вырезка длиннее — весь master. */
export const CUT_MAX_S = 120;
/** Вырезка больше этой доли master — весь master. */
export const CUT_MAX_FRACTION = 0.5;
/** CRF вырезки — как у master (`MASTER_CRF`, server/src/media/master.ts). */
export const CUT_CRF = 12;

export type VideoPlan =
  /** Под кадрами нет видео — master не нужен. */
  | { kind: "none"; sequences: SequenceSpec[] }
  /** Весь master и исходные последовательности. */
  | { kind: "full" }
  /** Кадры master `[start, start + frames)` и последовательности по вырезке. */
  | { kind: "cut"; start: number; frames: number; sequences: SequenceSpec[] };

const second = (fps: Fps) => Math.max(1, Math.round(fps.num / fps.den));

/** Кадры master `[первый, последний]`, видимые в кадрах ролика `[a, b]`; `null` — видео нет. */
export function masterSpan(sequences: SequenceSpec[], a: number, b: number): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of sequences) {
    const f0 = Math.max(a, s.from);
    const f1 = Math.min(b, s.from + s.durationInFrames - 1);
    if (f0 > f1) continue;
    lo = Math.min(lo, s.startFrom + (f0 - s.from));
    hi = Math.max(hi, s.startFrom + (f1 - s.from));
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Последовательности, обрезанные по кадрам master `[start, end]`, с `startFrom` от начала вырезки. */
function clipSequences(sequences: SequenceSpec[], start: number, end: number): SequenceSpec[] {
  const out: SequenceSpec[] = [];
  for (const s of sequences) {
    const f0 = Math.max(s.from, s.from + (start - s.startFrom));
    const f1 = Math.min(s.from + s.durationInFrames - 1, s.from + (end - s.startFrom));
    if (f0 > f1) continue;
    out.push({ idx: s.idx, from: f0, durationInFrames: f1 - f0 + 1, startFrom: s.startFrom + (f0 - s.from) - start });
  }
  return out;
}

/** Видео для кадров ролика `[a, b]` при master из `masterFrames` кадров. */
export function planVideo(sequences: SequenceSpec[], a: number, b: number, fps: Fps, masterFrames: number): VideoPlan {
  const span = masterSpan(sequences, a, b);
  if (!span) return { kind: "none", sequences: [] };
  const margin = Math.round(CUT_MARGIN_S * second(fps));
  const start = Math.max(0, span[0] - margin);
  const end = Math.min(masterFrames - 1, span[1] + margin);
  const frames = end - start + 1;
  if (frames > CUT_MAX_S * (fps.num / fps.den) || frames > CUT_MAX_FRACTION * masterFrames) return { kind: "full" };
  return { kind: "cut", start, frames, sequences: clipSequences(sequences, start, end) };
}

/**
 * ffmpeg вырезки: точный seek входа (с декодированием) за полкадра до кадра `start` — кадр `start`
 * остаётся первым при любом округлении секунд; `setpts` от нуля; CFR на `fps`; x264 CRF 12, GOP 1 с;
 * ровно `frames` кадров; без звука. Цвет — теги кадров master (BT.709) проходят в x264.
 */
export function cutArgs(master: string, out: string, start: number, frames: number, fps: Fps): string[] {
  const rate = `${fps.num}/${fps.den}`;
  const seek = start > 0 ? ["-ss", (((start - 0.5) * fps.den) / fps.num).toFixed(6)] : [];
  return [
    "-hide_banner", "-v", "error", "-protocol_whitelist", "file", ...seek, "-f", "mov", "-i", `file:${master}`,
    "-map", "0:v:0", "-vf", "setpts=PTS-STARTPTS", "-fps_mode", "cfr", "-r", rate,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(CUT_CRF), "-g", String(second(fps)), "-pix_fmt", "yuv420p",
    "-an", "-frames:v", String(frames), "-movflags", "+faststart", "-map_metadata", "-1",
    "-n", out,
  ];
}
