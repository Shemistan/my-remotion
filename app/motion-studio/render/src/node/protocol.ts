// Типы обмена renderVersion ↔ worker. Только типы: worker импортирует их через
// `import type`, который стирается вместе с типами.

/** Этапы, которые идут внутри worker. */
export type WorkerStage = "bundle" | "still" | "media";

export interface WorkerJob {
  /** `<cacheDir>/entries/<contentKey>/index.tsx`. */
  entryPoint: string;
  /** `<cacheDir>/bundles/<contentKey>`; есть `index.html` — бандл берётся из кэша. */
  bundleDir: string;
  /** Корень Remotion для бандлера (`public/` рядом с ним копируется в бандл). */
  rootDir: string;
  /** `node_modules` workspaces — откуда бандлер берёт react и remotion. */
  nodeModules: string;
  /** Цель алиаса `@ms/motion-kit`. */
  motionKitDir: string;
  browserExecutable: string;
  inputProps: Record<string, unknown>;
  /** Подставляется поверх композиции из бандла. */
  composition: { width: number; height: number; fps: number; durationInFrames: number };
  stills: { frame: number; out: string }[];
  preview: { out: string; scale: number; crf: number };
  /** timeoutInMilliseconds для delayRender и загрузки страниц Remotion. */
  timeoutMs: number;
}

export interface WorkerResult {
  ok: boolean;
  stills: string[];
  previewPath?: string;
  browserLogs: string[];
  error?: { stage: WorkerStage; message: string };
}
