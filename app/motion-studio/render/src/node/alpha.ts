// Альфа пикселя кадра видео (проверка прозрачного экспорта ProRes 4444) системным ffmpeg.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
