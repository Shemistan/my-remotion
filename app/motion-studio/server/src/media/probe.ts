// ffprobe исходника (Task 25): сводка `ProbeSummary` + pts первых 30 с видеопотока для VFR.
// Вход — только локальный файл: `-protocol_whitelist file` и префикс `file:`; контейнер
// после разбора — только видеоконтейнеры (не hls/concat/плейлисты, которые открывают другие пути).
import { type Fps, type ProbeSummary, ProbeSummarySchema, parseRational, snapFps } from "@ms/contracts";
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

/** Демультиплексоры ffprobe, которые принимаются как исходник. */
const CONTAINERS = [/^mov,mp4,m4a,3gp,3g2,mj2$/, /^matroska,webm$/];

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
  const n = Number(s);
  return s === undefined || s === "N/A" || !Number.isFinite(n) ? undefined : Math.round(n * 1_000_000);
};

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
  if (!CONTAINERS.some((re) => re.test(container))) throw new MediaInvalidError(`контейнер ${JSON.stringify(container)} не поддерживается (mov/mp4/mkv/webm)`);
  const v = data.streams.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg" && s.codec_name !== "png");
  if (!v || !v.codec_name || !v.width || !v.height) throw new MediaInvalidError("в файле нет видеопотока");
  const r = rate(v.r_frame_rate);
  const avg = rate(v.avg_frame_rate) ?? r;
  if (!r || !avg) throw new MediaInvalidError(`частота кадров не определена (${v.r_frame_rate}, ${v.avg_frame_rate})`);
  const duration = us(v.duration) ?? us(fmt.duration);
  if (duration === undefined || duration <= 0) throw new MediaInvalidError("длительность не определена");
  const rotation = rotationOf(v);
  const swap = rotation === 90 || rotation === 270;
  const a = data.streams.find((s) => s.codec_type === "audio" && s.codec_name);
  const sampleRate = Number(a?.sample_rate);
  const bitDepth = Number(v.bits_per_raw_sample);
  const summary = {
    container,
    duration_us: duration,
    size_bytes: Number(fmt.size ?? 0) || 0,
    start_time_us: us(fmt.start_time) ?? 0,
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
    },
    ...(a && sampleRate > 0 ? { audio: { codec: a.codec_name!, sample_rate: sampleRate, channels: a.channels && a.channels > 0 ? a.channels : 1 } } : {}),
    vfr: detectVfr(ptsUs).vfr,
    timeline_fps: snapFps(avg),
  };
  const parsed = ProbeSummarySchema.safeParse(summary);
  if (!parsed.success) throw new MediaInvalidError(`сводка ffprobe не прошла схему: ${parsed.error.message}`);
  return parsed.data;
}

export interface ProbeOptions {
  run?: RunRef;
  signal?: AbortSignal;
}

/** ffprobe JSON + pts первых 30 с видеопотока; сбой ffprobe — `MediaInvalidError`. */
export async function probeMedia(path: string, o: ProbeOptions = {}): Promise<ProbeSummary> {
  const input = `file:${path}`;
  const base = ["-v", "error", "-protocol_whitelist", "file"];
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
  const pts = pk.code === 0 ? pk.stdout.split("\n").map((l) => us(l.trim().split(",")[0])).filter((x): x is number => x !== undefined) : [];
  return parseProbe(json, pts);
}
