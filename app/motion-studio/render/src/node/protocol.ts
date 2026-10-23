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
  /** chrome-wrapper.sh: пишет запись Chrome в реестр и закрывает ему сеть. */
  browserExecutable: string;
  /** Настоящий chrome-headless-shell, который exec-ает обёртка. */
  chrome: string;
  /** Попытка: обёртка пишет запись `<root>/run/processes/<runId>-a<attempt>-<pid>.json`. */
  run: {
    root: string;
    runId: string;
    attempt: number;
    /**
     * Ключ этого рендера (имя его `run/tmp/…`): обёртка вписывает его в `cmd` записи, и
     * уборка рендера трогает только свой Chrome — у двух дублей попытки (runId, attempt) общие.
     */
    renderId?: string;
  };
  inputProps: Record<string, unknown>;
  /** Подставляется поверх композиции из бандла. */
  composition: { width: number; height: number; fps: number; durationInFrames: number };
  stills: { frame: number; out: string }[];
  /** null — только стоп-кадры (без превью). */
  preview: { out: string; scale: number; crf: number } | null;
  /**
   * timeoutInMilliseconds Remotion (delayRender, загрузка страниц) — чуть меньше внешнего
   * таймаута, чтобы зависшая сцена падала с понятной ошибкой до убийства группы.
   */
  timeoutMs: number;
}

export interface WorkerResult {
  ok: boolean;
  stills: string[];
  previewPath?: string;
  browserLogs: string[];
  /** `timeout` — сработал таймаут delayRender внутри Remotion. */
  error?: { stage: WorkerStage | "timeout"; message: string };
}
