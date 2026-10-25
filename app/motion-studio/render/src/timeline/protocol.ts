// Типы обмена renderTimelineRange ↔ worker-timeline (Task 36). Только типы: worker импортирует их
// через `import type`, который стирается вместе с типами.
import type { WorkerStage } from "../node/protocol.js";
import type { TimelineRenderProps } from "./types.js";

/** Файл, который пишет worker таймлайна: MP4 H.264/AAC 48 кГц диапазона кадров. */
export interface TimelineWorkerOutput {
  out: string;
  crf: number;
  scale: number;
  audioBitrateKbps: number;
  x264Preset: "medium" | "veryfast";
  /** Кадры композиции `[первый, последний]` включительно (`frameRange` Remotion); `null` — весь ролик. */
  frameRange: [number, number] | null;
}

export interface TimelineWorkerJob {
  /** `<cacheDir>/entries/tl-<sha256>/index.tsx`. */
  entryPoint: string;
  /** `<cacheDir>/bundles/tl-<sha256>`. */
  bundleDir: string;
  rootDir: string;
  nodeModules: string;
  motionKitDir: string;
  browserExecutable: string;
  chrome: string;
  run: { root: string; runId: string; attempt: number; renderId?: string };
  /** inputProps без URL: `video.src` и `audio.src` worker ставит сам — URL своего медиасервера. */
  props: Omit<TimelineRenderProps, "video" | "audio"> & { video: Omit<TimelineRenderProps["video"], "src">; audio: boolean };
  /** Файлы медиасервера: `video` (master) и, если есть звук, `audio` (edited-audio.wav). */
  media: { video: string; audio?: string };
  composition: { width: number; height: number; fps: number; durationInFrames: number };
  stills: { frame: number; out: string }[];
  output: TimelineWorkerOutput | null;
  timeoutMs: number;
}

export interface TimelineWorkerResult {
  ok: boolean;
  stills: string[];
  outPath?: string;
  browserLogs: string[];
  /** Origin медиасервера и сервера бандла этого рендера — им сцена «ходит» законно (QA `network`). */
  allowedOrigins: string[];
  error?: { stage: WorkerStage | "timeout"; message: string };
}
