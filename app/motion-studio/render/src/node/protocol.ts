// Типы обмена renderVersion ↔ worker. Только типы: worker импортирует их через
// `import type`, который стирается вместе с типами.

/** Этапы, которые идут внутри worker. */
export type WorkerStage = "bundle" | "still" | "media";

/**
 * Экспорт (Task 19): один `renderMedia` в `out` с настройками кодека. `h264` — MP4 с AAC
 * (`enforceAudioTrack`: тишина, если звука нет); `prores` — ProRes 4444 `.mov` с альфой
 * (`yuva444p10le`, кадры PNG).
 */
export type WorkerExport =
  | { out: string; codec: "h264"; crf: number; scale: number; audioCodec: "aac"; enforceAudioTrack: true }
  | { out: string; codec: "prores"; scale: number; proResProfile: "4444"; pixelFormat: "yuva444p10le"; imageFormat: "png" };

export interface WorkerJob {
  /**
   * `render` — стоп-кадры и превью; `export` — только `export` (стоп-кадров и превью нет).
   * Защита одна: обёртка Chrome без сети, asset-guard `/proxy`, TMPDIR попытки.
   */
  mode: "render" | "export";
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
  /** Только в режиме `export`. */
  export: WorkerExport | null;
  /**
   * Временной проход пробы (S15b) после превью: renderFrames каждого `every`-го кадра без
   * снимков (`imageFormat: "none"`), проба печатает `[motion-kit:sweep]`. Падение страницы —
   * `[sweep-retry]` и один повтор (S17b, `sweep.ts`); сбой прохода — строка `[sweep-error]` в
   * логах, превью и кадры остаются. Нет поля — прохода нет.
   */
  sweep?: { every: number; scale: number } | null;
  /**
   * timeoutInMilliseconds Remotion (delayRender, загрузка страниц) — чуть меньше внешнего
   * таймаута, чтобы зависшая сцена падала с понятной ошибкой до убийства группы.
   */
  timeoutMs: number;
  /** `concurrency` Remotion для renderMedia/renderFrames (Task 49a); нет — умолчание Remotion. */
  concurrency?: number;
}

export interface WorkerResult {
  ok: boolean;
  stills: string[];
  previewPath?: string;
  /** Файл экспорта (режим `export`). */
  exportPath?: string;
  browserLogs: string[];
  /** `timeout` — сработал таймаут delayRender внутри Remotion. */
  error?: { stage: WorkerStage | "timeout"; message: string };
}
