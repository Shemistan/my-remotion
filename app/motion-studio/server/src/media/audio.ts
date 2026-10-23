// Звук для ASR и waveform (Task 25): моно 16 кГц s16le, на шкале прокси — от начала файла
// (звук, начавшийся позже, добивается тишиной: `aresample=async=1:first_pts=0`).
import { open } from "node:fs/promises";
import { type FfmpegRunOptions, runFfmpeg } from "./ffmpeg.js";
import type { Demuxer } from "./probe.js";

export function audio16kArgs(input: string, out: string, demuxer: Demuxer): string[] {
  return [
    "-protocol_whitelist", "file", "-f", demuxer, "-i", `file:${input}`,
    "-vn", "-map", "0:a:0",
    "-af", "aresample=async=1:first_pts=0",
    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    "-map_metadata", "-1",
    "-n", out,
  ];
}

export async function extractAudio16k(input: string, out: string, demuxer: Demuxer, o: FfmpegRunOptions): Promise<void> {
  await runFfmpeg(audio16kArgs(input, out, demuxer), o);
}

/**
 * Длительность PCM wav по заголовку (как модуль `wave` Python у воркера ASR): байты чанка
 * `data` / `byteRate` чанка `fmt `. Размер `data` больше файла (запись не закрыта) — до конца.
 */
export async function wavDurationS(path: string): Promise<number> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(Math.min(size, 64 * 1024));
    await fh.read(head, 0, head.length, 0);
    if (head.length < 12 || head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") throw new Error(`не wav: ${path}`);
    let off = 12;
    let byteRate = 0;
    while (off + 8 <= head.length) {
      const id = head.toString("ascii", off, off + 4);
      const len = head.readUInt32LE(off + 4);
      if (id === "fmt " && off + 16 <= head.length) byteRate = head.readUInt32LE(off + 16);
      if (id === "data") {
        if (byteRate <= 0) throw new Error(`wav без fmt до data: ${path}`);
        return Math.min(len, size - (off + 8)) / byteRate;
      }
      off += 8 + len + (len % 2);
    }
    throw new Error(`в wav нет чанка data в первых 64 КиБ: ${path}`);
  } finally {
    await fh.close();
  }
}
