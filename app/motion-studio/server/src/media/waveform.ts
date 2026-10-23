// Waveform для UI (Task 25): пары min/max на ведро 10 мс из audio16k (s16le моно 16 кГц).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fsyncWrite } from "../scenes/store.js";

export const WAVEFORM_BUCKET_MS = 10;

export interface WaveformIndex {
  bucket_ms: number;
  sample_rate: number;
  /** Число вёдер (в `waveform.bin` — 2·length байт: min, max). */
  length: number;
  file: "waveform.bin";
}

/** Пары min/max (Int8, масштаб `/256`) на ведро `bucketMs`; последнее ведро может быть неполным. */
export function peaksFromPcm(pcm: Int16Array, sampleRate: number, bucketMs: number): Int8Array {
  const per = Math.max(1, Math.round((sampleRate * bucketMs) / 1000));
  const n = Math.ceil(pcm.length / per);
  const out = new Int8Array(n * 2);
  const q = (v: number) => Math.max(-128, Math.min(127, Math.round(v / 256)));
  for (let b = 0; b < n; b++) {
    let min = 32767;
    let max = -32768;
    const end = Math.min(pcm.length, (b + 1) * per);
    for (let i = b * per; i < end; i++) {
      const v = pcm[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[2 * b] = q(min);
    out[2 * b + 1] = q(max);
  }
  return out;
}

/** PCM s16le из WAV: чанки RIFF разбираются по порядку (ffmpeg пишет и LIST). */
export function pcmFromWav(buf: Buffer): { pcm: Int16Array; sampleRate: number; channels: number } {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("waveform: не WAV");
  let off = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`waveform: WAV не s16 (${bits} бит)`);
      // ffmpeg в потоке пишет размер 0xFFFFFFFF — данные до конца файла
      if (size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      const samples = Math.floor(size / 2);
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i++) pcm[i] = buf.readInt16LE(body + 2 * i);
      return { pcm, sampleRate, channels };
    }
    off = body + size + (size % 2);
  }
  throw new Error("waveform: в WAV нет чанка data");
}

/** `waveform.bin` + `waveform.json` из `audio16k.wav` в каталоге `dir`. */
export async function writeWaveform(wavPath: string, dir: string): Promise<WaveformIndex> {
  const { pcm, sampleRate, channels } = pcmFromWav(await readFile(wavPath));
  if (channels !== 1) throw new Error(`waveform: ожидался моно, каналов ${channels}`);
  const peaks = peaksFromPcm(pcm, sampleRate, WAVEFORM_BUCKET_MS);
  const index: WaveformIndex = { bucket_ms: WAVEFORM_BUCKET_MS, sample_rate: sampleRate, length: peaks.length / 2, file: "waveform.bin" };
  await fsyncWrite(join(dir, "waveform.bin"), new Uint8Array(peaks.buffer, peaks.byteOffset, peaks.byteLength));
  await fsyncWrite(join(dir, "waveform.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
