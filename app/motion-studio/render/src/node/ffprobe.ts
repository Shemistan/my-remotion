// Технический gate превью: системный ffprobe → ProbeResult → сверка с настройками.
import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import type { Fps, ProbeResult, Settings } from "@ms/contracts";

// Тип — из `@ms/contracts` (ProbeResultSchema); `audioCodec` и `pixFmt` нужны gate экспорта.
export type { ProbeResult };

export const FFPROBE_ARGS = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format"];
const FFPROBE_TIMEOUT_MS = 30_000;

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
  nb_frames?: string;
  pix_fmt?: string;
  profile?: string;
}

const ms = (seconds: number) => Math.round(seconds * 1_000_000) / 1000;
const positive = (x: unknown) => {
  const n = Number(x);
  return x !== undefined && x !== "N/A" && Number.isFinite(n) && n > 0 ? n : undefined;
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function parseRate(rate: string | undefined): Fps {
  const m = /^(\d+)\/(\d+)$/.exec(rate ?? "");
  const num = Number(m?.[1]);
  const den = Number(m?.[2]);
  if (!m || num <= 0 || den <= 0) throw new Error(`ffprobe: непонятная частота кадров ${JSON.stringify(rate)}`);
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Разбор JSON `ffprobe -show_streams -show_format`: первый видеопоток и первый звуковой.
 * `durationMs` — длительность видеопотока (`duration`, иначе `nb_frames / fps`, иначе
 * `format.duration`): `format.duration` — максимум по потокам, а AAC добивается до целого
 * кадра (1024 сэмпла) и удлиняет файл на 5–21 мс, что больше кадра 50/60 fps (F1).
 */
export function parseProbe(json: string): ProbeResult {
  const data = JSON.parse(json) as { streams?: RawStream[]; format?: { duration?: string } };
  const v = data.streams?.find((s) => s.codec_type === "video");
  if (!v || !v.codec_name || !v.width || !v.height) throw new Error("ffprobe: в файле нет видеопотока");
  const fps = parseRate(v.r_frame_rate);
  const frames = positive(v.nb_frames);
  const seconds = positive(v.duration) ?? (frames !== undefined ? (frames * fps.den) / fps.num : positive(data.format?.duration));
  if (seconds === undefined) throw new Error("ffprobe: длительность не определена");
  const audio = data.streams?.find((s) => s.codec_type === "audio" && s.codec_name);
  const audioSeconds = positive(audio?.duration);
  return {
    durationMs: ms(seconds),
    width: v.width,
    height: v.height,
    fps,
    codec: v.codec_name,
    ...(v.profile ? { profile: v.profile } : {}),
    ...(v.pix_fmt ? { pixFmt: v.pix_fmt } : {}),
    ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
    ...(audioSeconds !== undefined ? { audioDurationMs: ms(audioSeconds) } : {}),
  };
}

/** Ищет исполняемый файл в PATH; undefined — не найден. */
export async function findOnPath(name: string, path = process.env.PATH ?? ""): Promise<string | undefined> {
  const dirs = path.split(delimiter).filter((d) => isAbsolute(d));
  for (const dir of dirs) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // нет в этом каталоге
    }
  }
  return undefined;
}

/** Абсолютный путь системного ffprobe; бросает, если его нет (проверка до spawn). */
export async function ffprobeBin(): Promise<string> {
  const bin = await findOnPath("ffprobe");
  if (!bin) throw new Error("render: ffprobe не найден в PATH (brew install ffmpeg)");
  return bin;
}

/**
 * ffprobe файла вне реестра процессов — для разовых проверок (тесты, CLI). Рендер
 * зовёт ffprobe сам через `spawnTracked`, чтобы процесс попал в `run/processes/`.
 */
export async function ffprobe(path: string): Promise<ProbeResult> {
  const bin = await ffprobeBin();
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(bin, [...FFPROBE_ARGS, path], { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) reject(new Error(`ffprobe ${path}: ${errOut.trim() || err.message}`));
      else resolve(out);
    });
  });
  return parseProbe(stdout);
}

/**
 * Размер кадра H.264 у Remotion (validateEvenDimensionsWithCodec, renderer 4.0.537):
 * исходный размер уменьшается на 1, пока `Math.round(size * scale)` нечётен, и итог —
 * `Math.round(size * scale)`. Например, 1350 × 0.5 → 674, а не 675.
 */
export function h264Size(size: number, scale: number): number {
  let even = size;
  while (Math.round(even * scale) % 2 !== 0) even--;
  return Math.round(even * scale);
}

/**
 * Сверка превью с настройками сцены: длительность ± 1 кадр, размеры — как у Remotion для
 * H.264 (`h264Size`), fps как дробь, кодек h264. Пусто — gate пройден.
 */
export function probeGate(probe: ProbeResult, settings: Settings, scale: number): string[] {
  const problems: string[] = [];
  const width = h264Size(settings.width, scale);
  const height = h264Size(settings.height, scale);
  if (probe.width !== width) problems.push(`width ${probe.width}, ожидалось ${width}`);
  if (probe.height !== height) problems.push(`height ${probe.height}, ожидалось ${height}`);

  const { num, den } = settings.fps;
  if (probe.fps.num * den !== num * probe.fps.den) {
    problems.push(`fps ${probe.fps.num}/${probe.fps.den}, ожидалось ${num}/${den}`);
  }

  const frameMs = (1000 * den) / num;
  const expectedMs = settings.duration_frames * frameMs;
  // допуск 1 мкс на округление длительности в выводе ffprobe
  if (Math.abs(probe.durationMs - expectedMs) > frameMs + 0.001) {
    problems.push(`duration ${probe.durationMs} мс, ожидалось ${expectedMs.toFixed(3)} ± ${frameMs.toFixed(3)} мс`);
  }
  if (probe.codec !== "h264") problems.push(`codec ${probe.codec}, ожидался h264`);
  return problems;
}
