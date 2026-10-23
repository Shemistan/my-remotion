// Звук для ASR и waveform (Task 25): моно 16 кГц s16le, выровненный к нулю, как звук прокси.
import { type FfmpegRunOptions, runFfmpeg } from "./ffmpeg.js";

export function audio16kArgs(input: string, out: string): string[] {
  return [
    "-protocol_whitelist", "file", "-i", `file:${input}`,
    "-vn", "-map", "0:a:0",
    "-af", "aresample=async=1:first_pts=0",
    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    "-map_metadata", "-1",
    "-n", out,
  ];
}

export async function extractAudio16k(input: string, out: string, o: FfmpegRunOptions): Promise<void> {
  await runFfmpeg(audio16kArgs(input, out), o);
}
