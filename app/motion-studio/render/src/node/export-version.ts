// Экспорт версии (P1-14): MP4 H.264/AAC или ProRes 4444 с альфой в полном разрешении.
// Тот же путь, что у рендера (renderJob): spawnTracked, обёртка Chrome без сети, asset-guard
// `/proxy`, TMPDIR попытки, renderId — экспорт защиту не ослабляет (ruling 17).
import { dirname, extname } from "node:path";
import {
  type ExportRequest, ExportRequestSchema, type ProbeResult, ScenePropsBaseSchema, type Settings, scaleContentFrames, scaleTiming,
} from "@ms/contracts";
import { StorageError } from "@ms/core";
import { readProps } from "./entry.js";
import { exportDurationFrames, exportFps, exportGate, fpsFactor } from "./export-gate.js";
import type { WorkerExport } from "./protocol.js";
import { type RenderDeps, type RenderStage, type RunRef, renderJob } from "./render-version.js";

/** Таймаут экспорта по умолчанию (`config.limits.exportTimeoutMs`), мс. */
export const EXPORT_TIMEOUT_MS = 1_800_000;

export interface ExportVersionRequest {
  versionDir: string;
  /** Настройки версии (`settings.json`). */
  settings: Settings;
  request: ExportRequest;
  cacheDir: string;
  /** Файл экспорта: `.mp4` для `mp4`, `.mov` для `prores4444`; каталог должен существовать. */
  outPath: string;
  timeoutMs: number;
  run: RunRef;
}

/**
 * `ok: false` — рендер не удался (словарь `RenderStage`; `orphaned` — процессы не исчезли,
 * stale_process). `ok: true` — файл записан; `gate` — замечания `exportGate` (пусто — pass):
 * решение о них принимает вызывающий, это не ошибка рендера (M10).
 */
export type ExportResult =
  | { ok: true; probe: ProbeResult; gate: string[] }
  | { ok: false; error: { stage: RenderStage; message: string } };

const EXT = { mp4: ".mp4", prores4444: ".mov" } as const;

/**
 * Props под fps экспорта (M11): у props по договору `ScenePropsBase` тайминги битов
 * (`scaleTiming`) и кадровые величины content (`isContentFrameKey`) умножаются на
 * новый fps / старый, чтобы сцена шла с той же скоростью в секундах. Кадровые токены
 * StyleBible пересчитывает сама сцена: `StyleProvider` берёт fps композиции в `resolveStyle`.
 * Props вне договора (срез, импорт) не меняются.
 */
export function exportProps(props: Record<string, unknown>, factor: number): Record<string, unknown> {
  if (factor === 1 || !ScenePropsBaseSchema.safeParse(props).success) return props;
  const base = props as { timing: { duration_frames: number; beats: { start_frame: number; end_frame: number }[] }; content: unknown };
  return { ...props, timing: scaleTiming(base.timing, factor), content: scaleContentFrames(base.content, factor).content };
}

function workerExport(request: ExportRequest, out: string): WorkerExport {
  return request.format === "prores4444"
    ? { out, codec: "prores", scale: request.scale, proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png" }
    : { out, codec: "h264", crf: request.crf, scale: request.scale, audioCodec: "aac", enforceAudioTrack: true };
}

/**
 * Экспорт версии в `outPath`. fps из запроса ≠ fps версии → композиция с новым fps и
 * длительностью, props — `exportProps`. Бросает, как `renderVersion`, если рендер
 * невозможен в принципе (хранилище, Chrome, ffprobe), и при неверном расширении `outPath`.
 */
export async function exportVersion(req: ExportVersionRequest, signal?: AbortSignal, deps: RenderDeps = {}): Promise<ExportResult> {
  const request = ExportRequestSchema.parse(req.request);
  const ext = EXT[request.format];
  if (extname(req.outPath) !== ext) throw new Error(`exportVersion: файл ${request.format} должен иметь расширение ${ext}: ${req.outPath}`);
  if (signal?.aborted) return { ok: false, error: { stage: "aborted", message: "экспорт отменён до запуска worker" } };

  const factor = fpsFactor(req.settings, request);
  let inputProps: Record<string, unknown>;
  try {
    inputProps = exportProps(await readProps(req.versionDir), factor);
  } catch (e) {
    if (e instanceof StorageError) throw e;
    return { ok: false, error: { stage: "bundle", message: (e as Error).message } };
  }
  const settings: Settings = { ...req.settings, fps: exportFps(req.settings, request), duration_frames: exportDurationFrames(req.settings, request) };

  const r = await renderJob(
    {
      versionDir: req.versionDir,
      outDir: dirname(req.outPath),
      settings,
      cacheDir: req.cacheDir,
      stills: [],
      preview: null,
      timeoutMs: req.timeoutMs,
      run: req.run,
      inputProps,
      export: workerExport(request, req.outPath),
    },
    signal,
    deps,
  );
  if (!r.ok || !r.probe) return { ok: false, error: r.error ?? { stage: "media", message: "worker не вернул файл экспорта" } };
  return { ok: true, probe: r.probe, gate: exportGate(r.probe, request, req.settings) };
}
