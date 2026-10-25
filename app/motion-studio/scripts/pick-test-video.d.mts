// Типы для юнит-теста `server/test/scripts/pick-test-video.test.ts` (скрипт — чистый .mjs).
export const DIR: string;
export const CANDIDATES: string[];
export const LONG_CANDIDATE: string;
export const CRITERIA: { minS: number; maxS: number; minSpeech: number; noiseDb: number; minSilenceS: number; minFace: number; minFaceArea: number; maxFaceGapS: number };
export const SEGMENT: { minS: number; maxS: number; marginS: number; maxMissS: number };
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
  face_ratio?: number;
  face_gap_s?: number;
}
/** Кадр вывода `vision-detect` (только нужные поля). */
export interface VisionOut {
  faces?: { x: number; y: number; w: number; h: number }[];
  error?: string;
}
export function silenceSeconds(stderr: string, durationS: number): number;
export function orientation(width: number, height: number, rotation?: number): "landscape" | "portrait" | "square";
export function hasFace(frame: VisionOut, minArea?: number): boolean;
export function faceShare(frames: VisionOut[], minArea?: number): number;
export function longestFaceGap(frames: VisionOut[], minArea?: number): number;
export function evaluate(probe: Ffprobe, silenceStderr: string | undefined, faceRatio?: number, faceGapS?: number): Evaluation;
export function pick<T extends { ok: boolean }>(evaluated: T[]): T | undefined;
export function findTalkingHead(samples: { t: number; face: boolean }[], cutsS: number[], durationS: number, o?: typeof SEGMENT): { start_s: number; end_s: number } | undefined;
export function parseCuts(stderr: string): number[];
export const RAW: { source: string; windowS: number; stepS: number; skipS: number; minSpeech: number; minPauses: number; maxSilenceS: number; pauseS: number; noiseDb: number; outDir: string };
export interface SpeechWindow { start_s: number; end_s: number; speech_ratio: number; pauses: number; longest_silence_s: number }
export function silenceIntervals(stderr: string, durationS: number): { start: number; end: number }[];
export function speechWindows(silences: { start: number; end: number }[], durationS: number, o?: { windowS: number; stepS: number; skipS: number; pauseS?: number }): SpeechWindow[];
export function pickSpeechWindow(windows: SpeechWindow[], o?: { minSpeech: number; minPauses: number; maxSilenceS: number }): SpeechWindow | undefined;
