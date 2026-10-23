// ffprobe исходника (Task 25): сводка `ProbeSummary` + pts первых 30 с видеопотока для VFR.
// Вход — только локальный файл: `-protocol_whitelist file` и префикс `file:`; контейнер
// после разбора — только видеоконтейнеры (не hls/concat/плейлисты, которые открывают другие пути).
import { extname } from "node:path";
import { type Fps, type ProbeSummary, ProbeSummarySchema, STANDARD_FPS, parseRational, snapFps } from "@ms/contracts";
import { type RunRef, runTool } from "./ffmpeg.js";
import { detectVfr } from "./vfr.js";

/** Файл не годится как исходник (битый, не видео, чужой контейнер, путь вне корней). */
export class MediaInvalidError extends Error {
  readonly code = "media_invalid";
  constructor(message: string) {
    super(`media_invalid: ${message}`);
    this.name = "MediaInvalidError";
  }
}

/** Демультиплексоры ffprobe, которые принимаются как исходник, и имя для `-f` ffmpeg. */
const CONTAINERS: { re: RegExp; demuxer: Demuxer }[] = [
  { re: /^mov,mp4,m4a,3gp,3g2,mj2$/, demuxer: "mov" },
  { re: /^matroska,webm$/, demuxer: "matroska" },
];

export type Demuxer = "mov" | "matroska";

/**
 * `-f` для ffmpeg по контейнеру из probe (ревью M1): входу задан демультиплексор, файл не
 * может «стать» плейлистом hls/concat и открыть другие пути. Чужой контейнер — `MediaInvalidError`.
 */
export function demuxerFor(container: string): Demuxer {
  const c = CONTAINERS.find((x) => x.re.test(container));
  if (!c) throw new MediaInvalidError(`контейнер ${JSON.stringify(container)} не поддерживается (mov/mp4/mkv/webm)`);
  return c.demuxer;
}

/** `-f` по расширению — для ffprobe до того, как известен контейнер. */
export function demuxerForExt(path: string): Demuxer {
  const e = extname(path).slice(1).toLowerCase();
  if (e === "mov" || e === "mp4" || e === "m4v") return "mov";
  if (e === "mkv" || e === "webm") return "matroska";
  throw new MediaInvalidError(`расширение не видео: ${path}`);
}

/** Точное совпадение со стандартом (округление pts до µs), доля. */
const EXACT = 0.005;
/** Стандарт «сверху» к рабочей частоте VFR — не дальше, доля. */
const ABOVE = 0.05;
const FALLBACK_FPS: Fps = { num: 30, den: 1 };
const isStandard = (f: Fps) => STANDARD_FPS.some((s) => s.num === f.num && s.den === f.den);

/** Средняя частота кадров близка к стандарту (фликер pts около номинала), доля от средней. */
const NEAR_MEAN = 0.02;

/**
 * `timeline_fps` VFR-исходника (ревью I2, N1; ревью Task 26, m3). Рабочая частота `work =
 * 1e6 / p10(Δpts)` (самые частые кадры), средняя `m = 1e6 / mean(Δpts)`.
 * 1. По средней: кандидаты — стандарты в допуске 2 % от `m`; стандарт, совпадающий с `work`
 *    (±0,5 %), остаётся кандидатом и на границе (2 % + 0,5 %) и выигрывает; иначе — ближайший к
 *    `m` (24 fps с дрожью pts: p10 даёт 25, средняя — 24). Выбор по средней годится, только если
 *    `work` не выше него больше чем на 5 % (дрожь); выше — в записи есть настоящие быстрые кадры
 *    (смесь 25 + 30), и таймлайн по средней их бы потерял.
 * 2. По `work`: стандарт, совпадающий с ней (±0,5 %), иначе ближайший сверху в пределах 5 %;
 *    иначе `snapFps(r_frame_rate)`, если это стандарт; в крайнем случае 30/1. Несокращённая
 *    дробь вида 41250/1501 таймлайну не годится.
 */
export function vfrTimelineFps(p10DeltaUs: number, rFrameRate: Fps, meanDeltaUs = 0): Fps {
  const val = (s: Fps) => s.num / s.den;
  const work = p10DeltaUs > 0 ? 1e6 / p10DeltaUs : undefined;
  const matchesWork = (s: Fps) => work !== undefined && Math.abs(val(s) - work) / val(s) <= EXACT;
  if (meanDeltaUs > 0) {
    const m = 1e6 / meanDeltaUs;
    const off = (s: Fps) => Math.abs(val(s) - m) / m;
    const byWork = STANDARD_FPS.filter((s) => matchesWork(s) && off(s) <= NEAR_MEAN + EXACT).sort((a, b) => Math.abs(val(a) - work!) - Math.abs(val(b) - work!));
    const near = STANDARD_FPS.filter((s) => off(s) <= NEAR_MEAN).sort((a, b) => off(a) - off(b));
    const pick = byWork[0] ?? near[0];
    if (pick && (work === undefined || work <= val(pick) * (1 + ABOVE))) return { ...pick };
  }
  if (work !== undefined) {
    const f = work;
    const exact = STANDARD_FPS.filter((s) => Math.abs(val(s) - f) / val(s) <= EXACT).sort((a, b) => Math.abs(val(a) - f) - Math.abs(val(b) - f))[0];
    if (exact) return { ...exact };
    const above = STANDARD_FPS.filter((s) => val(s) >= f && val(s) <= f * (1 + ABOVE)).sort((a, b) => val(a) - val(b))[0];
    if (above) return { ...above };
  }
  const r = snapFps(rFrameRate);
  return isStandard(r) ? r : { ...FALLBACK_FPS };
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  pix_fmt?: string;
  bits_per_raw_sample?: string;
  duration?: string;
  start_time?: string;
  time_base?: string;
  sample_rate?: string;
  channels?: number;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}
interface Raw {
  streams?: RawStream[];
  format?: { format_name?: string; duration?: string; size?: string; start_time?: string };
}

const us = (s: string | undefined): number | undefined => {
  // Number("") === 0: пустое значение — не ноль
  if (s === undefined || s.trim() === "" || s === "N/A") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : undefined;
};

/** pts (µs) из `-show_entries packet=pts_time -of csv=p=0`; пустые строки и `N/A` пропускаются. */
export function parsePtsCsv(stdout: string): number[] {
  return stdout.split("\n").map((l) => us(l.trim().split(",")[0])).filter((x): x is number => x !== undefined);
}

function rate(s: string | undefined): Fps | undefined {
  try {
    const f = parseRational(s ?? "");
    return f.num > 0 && f.den > 0 ? f : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Поворот — как в матрице отображения ffprobe (`rotation`, против часовой), приведённый к
 * 0/90/180/270; старые файлы — тег `rotate` (по часовой). `display_*` — размеры после поворота.
 */
function rotationOf(v: RawStream): 0 | 90 | 180 | 270 {
  const dm = v.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
  const deg = dm !== undefined ? dm : -Number(v.tags?.rotate ?? 0);
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/** Чистый разбор JSON `ffprobe -show_format -show_streams` и pts (µs) видеопакетов. */
export function parseProbe(json: unknown, ptsUs: number[]): ProbeSummary {
  const data = (json ?? {}) as Raw;
  const fmt = data.format;
  if (!fmt || !Array.isArray(data.streams)) throw new MediaInvalidError("ffprobe не описал файл");
  const container = fmt.format_name ?? "";
  demuxerFor(container);
  const v = data.streams.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg" && s.codec_name !== "png");
  if (!v || !v.codec_name || !v.width || !v.height) throw new MediaInvalidError("в файле нет видеопотока");
  const r = rate(v.r_frame_rate);
  const avg = rate(v.avg_frame_rate) ?? r;
  if (!r || !avg) throw new MediaInvalidError(`частота кадров не определена (${v.r_frame_rate}, ${v.avg_frame_rate})`);
  const a = data.streams.find((s) => s.codec_type === "audio" && s.codec_name);
  const sampleRate = Number(a?.sample_rate);
  const hasAudio = a !== undefined && sampleRate > 0;
  // Шкала таймлайна — от начала файла (ffmpeg по умолчанию вычитает его из pts входа);
  // длительность — до конца самого длинного потока (ревью I1: видео может начинаться позже звука).
  const start = us(fmt.start_time) ?? 0;
  const vStart = us(v.start_time);
  const aStart = hasAudio ? us(a.start_time) : undefined;
  const end = (st: number | undefined, dur: string | undefined) => {
    const d = us(dur);
    return d === undefined ? undefined : (st ?? start) + d;
  };
  const ends = [end(vStart, v.duration), hasAudio ? end(aStart, a.duration) : undefined].filter((x): x is number => x !== undefined);
  const duration = ends.length ? Math.max(...ends) - start : us(fmt.duration);
  if (duration === undefined || duration <= 0) throw new MediaInvalidError("длительность не определена");
  const rotation = rotationOf(v);
  const swap = rotation === 90 || rotation === 270;
  const bitDepth = Number(v.bits_per_raw_sample);
  const tb = rate(v.time_base);
  const vfr = detectVfr(ptsUs, tb ? { tickUs: (1e6 * tb.num) / tb.den } : {});
  const summary = {
    container,
    duration_us: duration,
    size_bytes: Number(fmt.size ?? 0) || 0,
    start_time_us: start,
    video: {
      codec: v.codec_name,
      width: v.width,
      height: v.height,
      display_width: swap ? v.height : v.width,
      display_height: swap ? v.width : v.height,
      rotation,
      r_frame_rate: r,
      avg_frame_rate: avg,
      pix_fmt: v.pix_fmt ?? "unknown",
      ...(Number.isInteger(bitDepth) && bitDepth > 0 ? { bit_depth: bitDepth } : {}),
      ...(vStart !== undefined ? { start_time_us: vStart } : {}),
    },
    ...(hasAudio
      ? { audio: { codec: a.codec_name!, sample_rate: sampleRate, channels: a.channels && a.channels > 0 ? a.channels : 1, ...(aStart !== undefined ? { start_time_us: aStart } : {}) } }
      : {}),
    vfr: vfr.vfr,
    timeline_fps: vfr.vfr ? vfrTimelineFps(vfr.p10DeltaUs, r, vfr.meanDeltaUs) : snapFps(avg),
  };
  const parsed = ProbeSummarySchema.safeParse(summary);
  if (!parsed.success) throw new MediaInvalidError(`сводка ffprobe не прошла схему: ${parsed.error.message}`);
  return parsed.data;
}

export interface ProbeOptions {
  run?: RunRef;
  signal?: AbortSignal;
}

/**
 * ffprobe JSON + pts первых 30 с видеопотока; сбой ffprobe — `MediaInvalidError`. Демультиплексор
 * задан по расширению (ревью M1): плейлист с расширением .mp4 не откроется как hls.
 */
export async function probeMedia(path: string, o: ProbeOptions = {}): Promise<ProbeSummary> {
  const input = `file:${path}`;
  const base = ["-v", "error", "-protocol_whitelist", "file", "-f", demuxerForExt(path)];
  const info = await runTool("ffprobe", [...base, "-print_format", "json", "-show_format", "-show_streams", input], { ...o, timeoutMs: 120_000 });
  if (info.code !== 0) throw new MediaInvalidError(`ffprobe: ${info.stderrTail.trim().split("\n").slice(-2).join("; ") || `код ${info.code}`}`);
  let json: unknown;
  try {
    json = JSON.parse(info.stdout);
  } catch {
    throw new MediaInvalidError("ffprobe вернул не JSON");
  }
  const pk = await runTool("ffprobe", [...base, "-read_intervals", "%+30", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", input], {
    ...o, timeoutMs: 120_000,
  });
  const pts = pk.code === 0 ? parsePtsCsv(pk.stdout) : [];
  return parseProbe(json, pts);
}
