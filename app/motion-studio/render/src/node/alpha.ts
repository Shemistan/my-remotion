// Альфа кадров видео (проверка прозрачного экспорта ProRes 4444) системным ffmpeg: пиксель
// угла и покрытие кадра (S6).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type MotionSpec, type SceneFrames, phasesOf } from "@ms/contracts";
import { type FfmpegOptions, removeScratch, runFfmpeg, scratchDir } from "./ffmpeg.js";

/**
 * Альфа 0..255 пикселя `at` (по умолчанию (2, 2) — угол, где у прозрачной сцены нет
 * ничего) кадра `frame`: `ffmpeg -vf select=eq(n\,<frame>),crop=1:1:x:y -pix_fmt rgba` →
 * 4 байта RGBA в файл. Сырые байты вместо PNG: без декодера картинок в пакете render.
 * Кадра нет в файле — ошибка, а не 0. С `opts.run` ffmpeg идёт через реестр попытки и
 * отменяется `opts.signal` (ошибки — `FfmpegError`).
 */
export async function alphaAtCorner(movPath: string, frame: number, at: { x: number; y: number } = { x: 2, y: 2 }, opts: FfmpegOptions = {}): Promise<number> {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`alphaAtCorner: кадр ${frame} — не неотрицательное целое`);
  const dir = await scratchDir(opts, "alpha");
  try {
    const out = join(dir, "px.rgba");
    const args = [
      "-v", "error", "-nostdin", "-y", "-i", movPath,
      "-vf", `select=eq(n\\,${frame}),crop=1:1:${at.x}:${at.y}`,
      "-fps_mode", "passthrough", "-frames:v", "1",
      "-pix_fmt", "rgba", "-f", "rawvideo", out,
    ];
    try {
      await runFfmpeg(args, dir, opts);
    } catch (e) {
      (e as Error).message = `alphaAtCorner: ${movPath}: ${(e as Error).message}`;
      throw e;
    }
    const px = await readFile(out).catch(() => Buffer.alloc(0));
    if (px.length < 4) throw new Error(`alphaAtCorner: кадр ${frame} не найден в ${movPath}`);
    return px[3]!;
  } finally {
    await removeScratch(dir);
  }
}

/** Доля пикселей кадра: непрозрачные (α ≥ 0,5) и «дымка» (0 < α < 0,5), 0..1. */
export interface AlphaCoverage {
  /** Максимум по кадрам. */
  opaque: number;
  /** Максимум по кадрам. */
  haze: number;
  perFrame: { frame: number; opaque: number; haze: number }[];
}

/** Порог «непрозрачного» пикселя (Р17): α ≥ 0,5. */
const OPAQUE_ALPHA = 128;

/**
 * Покрытие альфой кадров `frames` (S6, Р17): один проход ffmpeg — `select` нужных кадров →
 * `format=rgba,alphaextract` (у кадра без альфы она 255) → сырые байты gray в полном
 * разрешении (M2: даунскейл усредняет тонкие штрихи текста с фоном, и строка текста
 * становится «дымкой», а кадр — «пустым»). «Непрозрачные» — пиксели с α ≥ 128, «дымка» —
 * 0 < α < 128; итог — максимум по кадрам.
 * Кадра нет в файле — ошибка. Читает и видео, и картинку (кадр 0).
 */
export async function alphaCoverage(movPath: string, frames: number[], opts: FfmpegOptions = {}): Promise<AlphaCoverage> {
  const want = [...new Set(frames)].sort((a, b) => a - b);
  if (want.length === 0) throw new RangeError("alphaCoverage: нет кадров");
  for (const f of want) if (!Number.isInteger(f) || f < 0) throw new RangeError(`alphaCoverage: кадр ${f} — не неотрицательное целое`);
  const dir = await scratchDir(opts, "coverage");
  try {
    const args = [
      "-v", "error", "-nostdin", "-y", "-i", movPath,
      "-vf", `select=${want.map((f) => `eq(n\\,${f})`).join("+")},format=rgba,alphaextract`,
      "-fps_mode", "passthrough", "-frames:v", String(want.length),
      "-pix_fmt", "gray", "-c:v", "rawvideo", "-f", "image2", join(dir, "f%03d.gray"),
    ];
    try {
      await runFfmpeg(args, dir, opts);
    } catch (e) {
      (e as Error).message = `alphaCoverage: ${movPath}: ${(e as Error).message}`;
      throw e;
    }
    // кадр — отдельный файл: недостающий кадр виден по числу файлов, а не по делению байтов
    const bufs = await Promise.all(want.map((_, k) => readFile(join(dir, `f${String(k + 1).padStart(3, "0")}.gray`)).catch(() => Buffer.alloc(0))));
    const missing = bufs.findIndex((b) => b.length === 0);
    if (missing >= 0) throw new Error(`alphaCoverage: кадр ${want[missing]} (из ${want.join(", ")}) не найден в ${movPath}`);
    const perFrame = want.map((frame, k) => {
      const buf = bufs[k]!;
      const size = buf.length;
      let opaque = 0;
      let haze = 0;
      for (let i = 0; i < size; i++) {
        const a = buf[i]!;
        if (a >= OPAQUE_ALPHA) opaque++;
        else if (a > 0) haze++;
      }
      return { frame, opaque: opaque / size, haze: haze / size };
    });
    return { opaque: Math.max(...perFrame.map((x) => x.opaque)), haze: Math.max(...perFrame.map((x) => x.haze)), perFrame };
  } finally {
    await removeScratch(dir);
  }
}

/** Речь длиннее — третий кадр проверки: конец окна речи (Р17), с. */
const LONG_SPEECH_S = 6;

/**
 * Кадры проверки наложения (S6, Р17), по возрастанию без повторов, в пределах сцены:
 * середина окна речи `lead + ⌊speech/2⌋`, начало финального hold (последней фазы hold по её
 * битам; нет hold — `duration − 1`) и при речи > 6 с — последний кадр речи `lead + speech − 1`.
 */
export function overlayFrames(spec: Pick<MotionSpec, "phases" | "beats" | "duration_frames" | "fps">, frames: SceneFrames): number[] {
  const last = spec.duration_frames - 1;
  const holdStarts = phasesOf(spec)
    .filter((p) => p.role === "hold")
    .flatMap((p) => {
      const own = spec.phases ? spec.beats.filter((b) => b.phase === p.id) : spec.beats.filter((b) => b.id === p.id);
      return own.length > 0 ? [Math.min(...own.map((b) => b.start_frame))] : [];
    });
  const out = [frames.lead + Math.floor(frames.speech / 2), holdStarts.length > 0 ? Math.max(...holdStarts) : last];
  if (frames.speech > (LONG_SPEECH_S * spec.fps.num) / spec.fps.den) out.push(frames.lead + frames.speech - 1);
  return [...new Set(out.map((f) => Math.max(0, Math.min(last, f))))].sort((a, b) => a - b);
}
