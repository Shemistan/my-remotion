// Кадр-композит видеосцены (Task 37′): стоп-кадр сцены с `transparent = true` поверх кадра
// исходника под сценой (ffmpeg `overlay`) — Visual QA видит графику на видео, как зритель.
// Кадр исходника растягивается до размера кадра сцены.
import { open } from "node:fs/promises";
import { type RunRef, runFfmpeg } from "../media/ffmpeg.js";

/** Размер PNG по заголовку IHDR (ширина, высота — байты 16–23). */
export async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const fh = await open(path, "r");
  try {
    const b = Buffer.alloc(24);
    await fh.read(b, 0, 24, 0);
    if (b.toString("latin1", 12, 16) !== "IHDR") throw new Error(`не PNG: ${path}`);
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } finally {
    await fh.close();
  }
}

/** `out` (PNG) — `alphaStill` поверх `contextFrame` размера `alphaStill`; существующий `out` перезаписывается. */
export async function composeOverContext(alphaStill: string, contextFrame: string, out: string, o: { run?: RunRef; signal: AbortSignal }): Promise<void> {
  const { width, height } = await pngSize(alphaStill);
  await runFfmpeg([
    "-protocol_whitelist", "file", "-i", `file:${contextFrame}`, "-i", `file:${alphaStill}`,
    "-filter_complex", `[0:v]scale=${width}:${height}:flags=bicubic,format=rgba[bg];[bg][1:v]overlay=0:0:format=auto,format=rgb24`,
    "-frames:v", "1", "-y", `file:${out}`,
  ], { ...(o.run ? { run: o.run } : {}), signal: o.signal, timeoutMs: 60_000 });
}
