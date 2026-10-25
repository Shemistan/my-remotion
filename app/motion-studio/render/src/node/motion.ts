// Энергия движения превью (S15b): яркость каждого N-го кадра на сетке пробы раскладки системным
// ffmpeg. Временной проход QA сравнивает соседние сэмплы под клетками содержимого (без фона).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type FfmpegOptions, removeScratch, runFfmpeg, scratchDir } from "./ffmpeg.js";

/**
 * Сэмплы яркости превью: кадры 0, every, 2·every, … → `select` → `scale w:h` (усреднение
 * area) → gray, сырые байты одним файлом (w·h байт на кадр). С `opts.run` ffmpeg идёт через
 * реестр попытки (ошибки — `FfmpegError`).
 */
export async function previewLuma(preview: string, o: { every: number; w: number; h: number } & FfmpegOptions): Promise<{ frames: number[]; luma: Uint8Array[] }> {
  const { every, w, h, ...opts } = o;
  if (!Number.isInteger(every) || every < 1) throw new RangeError(`previewLuma: шаг ${every} — не целое ≥ 1`);
  const dir = await scratchDir(opts, "luma");
  try {
    const out = join(dir, "luma.gray");
    const args = [
      "-v", "error", "-nostdin", "-y", "-i", preview,
      "-vf", `select=not(mod(n\\,${every})),scale=${w}:${h}:flags=area,format=gray`,
      "-fps_mode", "passthrough", "-f", "rawvideo", out,
    ];
    try {
      await runFfmpeg(args, dir, opts);
    } catch (e) {
      (e as Error).message = `previewLuma: ${preview}: ${(e as Error).message}`;
      throw e;
    }
    const buf = await readFile(out);
    const size = w * h;
    const n = Math.floor(buf.length / size);
    const luma = Array.from({ length: n }, (_, k) => new Uint8Array(buf.subarray(k * size, (k + 1) * size)));
    return { frames: luma.map((_, k) => k * every), luma };
  } finally {
    await removeScratch(dir);
  }
}
