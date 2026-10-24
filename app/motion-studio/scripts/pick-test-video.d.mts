// Типы для юнит-теста `server/test/scripts/pick-test-video.test.ts` (скрипт — чистый .mjs).
export const DIR: string;
export const CANDIDATES: string[];
export const CRITERIA: { minS: number; maxS: number; minSpeech: number; noiseDb: number; minSilenceS: number };
export interface FfprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}
export interface Ffprobe {
  format?: { duration?: string | number };
  streams?: FfprobeStream[];
}
export interface Evaluation {
  ok: boolean;
  reasons: string[];
  duration_s: number;
  width?: number;
  height?: number;
  rotation: number;
  orientation?: "landscape" | "portrait" | "square";
  has_audio: boolean;
  speech_ratio: number;
}
export function silenceSeconds(stderr: string, durationS: number): number;
export function orientation(width: number, height: number, rotation?: number): "landscape" | "portrait" | "square";
export function evaluate(probe: Ffprobe, silenceStderr: string | undefined): Evaluation;
export function pick<T extends { ok: boolean }>(evaluated: T[]): T | undefined;
