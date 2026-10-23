// Альфа пикселя кадра видео (проверка прозрачного экспорта ProRes 4444) системным ffmpeg.
import { execFile } from "node:child_process";
import { findOnPath } from "./ffprobe.js";

const FFMPEG_TIMEOUT_MS = 60_000;

async function ffmpegBin(): Promise<string> {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("render: ffmpeg не найден в PATH (brew install ffmpeg)");
  return bin;
}

/**
 * Альфа 0..255 пикселя `at` (по умолчанию (2, 2) — угол, где у прозрачной сцены нет
 * ничего) кадра `frame`: `ffmpeg -vf select=eq(n\,<frame>),crop=1:1:x:y -pix_fmt rgba` →
 * 4 байта RGBA. Сырые байты вместо PNG: без декодера картинок в пакете render.
 * Кадра нет в файле — ошибка, а не 0.
 */
export async function alphaAtCorner(movPath: string, frame: number, at: { x: number; y: number } = { x: 2, y: 2 }): Promise<number> {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`alphaAtCorner: кадр ${frame} — не неотрицательное целое`);
  const bin = await ffmpegBin();
  const args = [
    "-v", "error", "-nostdin", "-i", movPath,
    "-vf", `select=eq(n\\,${frame}),crop=1:1:${at.x}:${at.y}`,
    "-fps_mode", "passthrough", "-frames:v", "1",
    "-pix_fmt", "rgba", "-f", "rawvideo", "-",
  ];
  const out = await new Promise<Buffer>((resolve, reject) => {
    execFile(bin, args, { encoding: "buffer", timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`alphaAtCorner: ffmpeg ${movPath}: ${stderr.toString("utf8").trim() || err.message}`));
      else resolve(stdout);
    });
  });
  if (out.length < 4) throw new Error(`alphaAtCorner: кадр ${frame} не найден в ${movPath}`);
  return out[3]!;
}
