// Граф ffmpeg превью чернового монтажа (Task 28): по клипу таймлайна — `trim` видео по номерам
// кадров (источник — CFR-прокси, индекс кадра точен) и `atrim` звука по номерам сэмплов с
// короткими `afade` на склейках (без щелчков); в конце — `concat`.
//
// Масштаб: каждая ветка `[0:v]` получает все кадры входа, поэтому цена графа ∝ клипов × кадров
// входа (замер ffmpeg 7.1.1, M-серия: 200 клипов на 8 мин прокси — 55 с, 50 клипов на 2 мин —
// 3 с; 600 клипов на часовом ролике — десятки минут). Поэтому превью строится кусками по
// `PREVIEW_CHUNK_CLIPS` клипов: у куска свой вход с точным `-ss` (на ½ кадра раньше первого
// кадра, кратно 125 µs — целому числу сэмплов 48 кГц), номера кадров и сэмплов — от начала
// куска; куски склеиваются concat-демуксером без перекодирования видео (`previewChunks`).
import { type Fps, type TimelineClip, usToFrame, usToFrameCeil } from "@ms/contracts";

/** Клипов в одном куске превью. */
export const PREVIEW_CHUNK_CLIPS = 40;
/** Шаг начала входа куска, µs: 125 µs = 6 сэмплов 48 кГц (и 2 сэмпла 16 кГц). */
export const SEEK_GRID_US = 125;

const num = (x: number): string => String(Number(x.toFixed(6)));

export interface PreviewFilterOptions {
  /** Кадр входа, с которого считаются `start_frame`/`end_frame` (начало куска). */
  frameOffset?: number;
  /** Сэмпл входа, с которого считаются `start_sample`/`end_sample`. */
  sampleOffset?: number;
  /** Есть ли звук (`false` — только видео, `concat … a=0`). */
  audio?: boolean;
  /**
   * Конец звуковой дорожки входа, µs. Звук бывает короче видео: клипу, который заходит за конец
   * звука, недостающее добивается тишиной (`apad=whole_len`), иначе звук превью короче картинки.
   */
  audioEndUs?: number;
  /**
   * Кадров в прокси (`nb_frames`). Длительность исходника на 29,97 fps не кратна кадру: последний
   * «кадр» по длительности (899 при 30 с) в файле может отсутствовать — конец клипа по нему.
   */
  frameCount?: number;
}

/**
 * Кадры клипа `[start, end)` на `fps`: начало — кадр начала, конец — первый кадр не раньше конца,
 * но не дальше числа кадров прокси `frameCount` (если известно, ревью Task 28 M7).
 */
export function clipFrames(c: Pick<TimelineClip, "source_start_us" | "source_end_us">, fps: Fps, frameCount?: number): { start: number; end: number } {
  const start = usToFrame(c.source_start_us, fps);
  const end = usToFrameCeil(c.source_end_us, fps);
  return { start, end: frameCount === undefined ? end : Math.min(end, frameCount) };
}

const sampleAt = (us: number, sampleRate: number): number => Math.round((us * sampleRate) / 1e6);

/**
 * `filter_complex` превью: `[0:v]trim=start_frame=…:end_frame=…,setpts=PTS-STARTPTS[v<i>]`,
 * `[0:a]atrim=start_sample=…:end_sample=…,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=…,afade=t=out:st=…:d=…[a<i>]`,
 * финал `[v0][a0]…concat=n=<N>:v=1:a=1[v][a]`. Клип короче кадра (у конца исходника не на кадре)
 * пропускается. Склейка короче двух фейдов — фейд в половину клипа. Клип за концом звука
 * (`audioEndUs`) добивается тишиной до своей длины.
 */
export function buildPreviewFilter(clips: TimelineClip[], fps: Fps, sampleRate: number, fadeUs: number, o: PreviewFilterOptions = {}): string {
  const fo = o.frameOffset ?? 0;
  const so = o.sampleOffset ?? 0;
  const audio = o.audio ?? true;
  const chains: string[] = [];
  const pads: string[] = [];
  let n = 0;
  for (const c of clips) {
    const f = clipFrames(c, fps, o.frameCount);
    if (f.end <= f.start) continue;
    if (f.start < fo) throw new Error(`preview: клип ${c.idx} начинается раньше входа куска (кадр ${f.start} < ${fo})`);
    const i = n++;
    chains.push(`[0:v]trim=start_frame=${f.start - fo}:end_frame=${f.end - fo},setpts=PTS-STARTPTS[v${i}]`);
    if (audio) {
      const s = sampleAt(c.source_start_us, sampleRate) - so;
      const e = sampleAt(c.source_end_us, sampleRate) - so;
      const durS = (e - s) / sampleRate;
      const fade = Math.min(fadeUs / 1e6, durS / 2);
      const pad = o.audioEndUs !== undefined && c.source_end_us > o.audioEndUs ? `,apad=whole_len=${e - s}` : "";
      chains.push(`[0:a]atrim=start_sample=${s}:end_sample=${e},asetpts=PTS-STARTPTS${pad},afade=t=in:st=0:d=${num(fade)},afade=t=out:st=${num(durS - fade)}:d=${num(fade)}[a${i}]`);
      pads.push(`[v${i}][a${i}]`);
    } else {
      pads.push(`[v${i}]`);
    }
  }
  if (n === 0) throw new Error("preview: в таймлайне нет ни одного клипа длиной от кадра");
  return `${chains.join(";\n")};\n${pads.join("")}concat=n=${n}:v=1:a=${audio ? 1 : 0}${audio ? "[v][a]" : "[v]"}`;
}

/** Кусок превью: клипы и точка входа. */
export interface PreviewChunk {
  clips: TimelineClip[];
  /** `-ss` входа, µs: на ½ кадра раньше первого кадра куска, кратно `SEEK_GRID_US`. */
  seekUs: number;
  /** `-t` входа, µs: до конца последнего клипа с запасом в кадр. */
  readUs: number;
  /** Первый кадр, который видит граф куска (кадр после `-ss`). */
  frameOffset: number;
  /** Первый сэмпл после `-ss` (ffmpeg режет звук входа по `-ss` с округлением к ближайшему сэмплу). */
  sampleOffset: number;
  /** Кадров видео в куске (сумма клипов). */
  frames: number;
}

/**
 * Клипы (без пустых короче кадра) → куски по `size`. Вход куска начинается на ½ кадра раньше его
 * первого кадра: кадр `frameOffset` проходит точный `-ss` (его pts ≥ `seekUs`), предыдущий — нет.
 */
export function previewChunks(clips: TimelineClip[], fps: Fps, sampleRate: number, size = PREVIEW_CHUNK_CLIPS, frameCount?: number): PreviewChunk[] {
  const usable = clips.filter((c) => { const f = clipFrames(c, fps, frameCount); return f.end > f.start; });
  const frameUs = (1e6 * fps.den) / fps.num;
  const out: PreviewChunk[] = [];
  for (let i = 0; i < usable.length; i += size) {
    const part = usable.slice(i, i + size);
    const first = clipFrames(part[0]!, fps).start;
    const firstUs = (first * 1e6 * fps.den) / fps.num; // точное время кадра (не округлённое до µs)
    const seekUs = first === 0 ? 0 : Math.max(0, Math.floor((firstUs - frameUs / 2) / SEEK_GRID_US) * SEEK_GRID_US);
    const lastEnd = part[part.length - 1]!.source_end_us;
    out.push({
      clips: part, seekUs, readUs: Math.ceil(lastEnd - seekUs + frameUs),
      frameOffset: first, sampleOffset: Math.round((seekUs * sampleRate) / 1e6),
      frames: part.reduce((s, c) => { const f = clipFrames(c, fps, frameCount); return s + f.end - f.start; }, 0),
    });
  }
  return out;
}
