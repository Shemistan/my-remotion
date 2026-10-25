// Типы обмена renderTimelineRange ↔ worker-timeline (Task 36). Только типы: worker импортирует их
// через `import type`, который стирается вместе с типами.
import type { SequenceSpec } from "@ms/contracts";
import type { WorkerStage } from "../node/protocol.js";
import type { TimelineRenderProps } from "./types.js";

/**
 * Видео одного вызова Remotion вместо master целиком (ревью I3): файл медиасервера `file`
 * (`video` — master, `cut<N>` — вырезка) и последовательности по нему.
 */
export interface TimelineVideoSource {
  file: string;
  sequences: SequenceSpec[];
}

/** Файл, который пишет worker таймлайна: MP4 H.264/AAC 48 кГц диапазона кадров. */
export interface TimelineWorkerOutput {
  out: string;
  crf: number;
  scale: number;
  audioBitrateKbps: number;
  x264Preset: "medium" | "veryfast";
  /** Кадры композиции `[первый, последний]` включительно (`frameRange` Remotion); `null` — весь ролик. */
  frameRange: [number, number] | null;
  /** Видео файла; без поля — master и `props.video.sequences`. */
  video?: TimelineVideoSource;
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
  /** Файлы медиасервера: `video` (master), если есть звук — `audio` (edited-audio.wav), вырезки master `cut<N>`. */
  media: { video: string; audio?: string; cuts?: Record<string, string> };
  composition: { width: number; height: number; fps: number; durationInFrames: number };
  /** `video` — как у `output.video`. */
  stills: { frame: number; out: string; video?: TimelineVideoSource }[];
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
  /** Байт, отданных медиасервером (сколько Remotion скачал в TMPDIR). */
  mediaBytes?: number;
  error?: { stage: WorkerStage | "timeout"; message: string };
}
