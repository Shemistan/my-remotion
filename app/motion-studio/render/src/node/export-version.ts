// Экспорт версии (P1-14): MP4 H.264/AAC или ProRes 4444 с альфой в полном разрешении.
// Тот же путь, что у рендера (renderJob): spawnTracked, обёртка Chrome без сети, asset-guard
// `/proxy`, TMPDIR попытки, renderId — экспорт защиту не ослабляет (ruling 17).
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  type ExportRequest, ExportRequestSchema, type ProbeResult, ScenePropsBaseSchema, type Settings, scaleContentFrames, scaleTiming, unscaledTimeKeys,
} from "@ms/contracts";
import { StorageError } from "@ms/core";
import { readProps } from "./entry.js";
import { exportDurationFrames, exportFps, exportGate, fpsFactor } from "./export-gate.js";
import { FfmpegError } from "./ffmpeg.js";
import { isOverlayUnsupported, overlayInputProps } from "./overlay-props.js";
import type { WorkerExport } from "./protocol.js";
import { type RenderDeps, type RenderStage, type RunRef, renderJob } from "./render-version.js";
import { type TempoCheck, listStills, tempoCheck } from "./tempo.js";

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
  | {
      ok: true;
      probe: ProbeResult;
      gate: string[];
      /** Сверка темпа при смене fps (`null` — fps версии или gate не пройден); решение — за вызывающим. */
      tempo: TempoCheck | null;
      /** Предупреждения для манифеста экспорта (`unscaledTimeKeys` при смене fps). */
      warnings: string[];
    }
  | { ok: false; error: { stage: ExportStage; message: string } };

/**
 * Этап сбоя экспорта: словарь рендера (`RenderStage`) и `unsupported` — экспорт в таком виде
 * невозможен до рендера (смена fps у props вне `ScenePropsBase` или без стоп-кадров версии).
 */
export type ExportStage = RenderStage | "unsupported";

/** Подмены для юнит-тестов: рендер и сверка темпа. */
export type ExportDeps = RenderDeps & { tempo?: typeof tempoCheck };

const EXT = { mp4: ".mp4", prores4444: ".mov" } as const;

/**
 * Props под fps экспорта (M11): у props по договору `ScenePropsBase` тайминги битов
 * (`scaleTiming`) и кадровые величины content (`isContentFrameKey`) умножаются на
 * новый fps / старый, чтобы сцена шла с той же скоростью в секундах. Кадровые токены
 * StyleBible пересчитывает сама сцена: `StyleProvider` берёт fps композиции в `resolveStyle`.
 * Props вне договора (срез, импорт) не меняются — `exportVersion` при смене fps такие отклоняет.
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
 * длительностью, props — `exportProps`; до рендера — отказ `unsupported`
 * (`fps_change_unsupported`), если props вне `ScenePropsBase` или у версии нет стоп-кадров;
 * после рендера и пройденного gate — сверка темпа `tempoCheck` в точно совпадающие моменты
 * (поле `tempo`: кадры в коде сцены не масштабируются, такой ролик идёт в другом темпе);
 * недостающие стоп-кадры версии дорендериваются в `.tempo-stills-*` рядом с `outPath` и
 * удаляются после сверки (вызывающий держит семафор рендеров). Бросает, как `renderVersion`, если
 * рендер невозможен в принципе (хранилище, Chrome, ffprobe), и при неверном расширении `outPath`.
 */
export async function exportVersion(req: ExportVersionRequest, signal?: AbortSignal, deps: ExportDeps = {}): Promise<ExportResult> {
  const request = ExportRequestSchema.parse(req.request);
  const ext = EXT[request.format];
  if (extname(req.outPath) !== ext) throw new Error(`exportVersion: файл ${request.format} должен иметь расширение ${ext}: ${req.outPath}`);
  if (signal?.aborted) return { ok: false, error: { stage: "aborted", message: "экспорт отменён до запуска worker" } };

  const factor = fpsFactor(req.settings, request);
  const fps = exportFps(req.settings, request);
  const fpsText = (f: { num: number; den: number }) => (f.den === 1 ? `${f.num}` : `${f.num}/${f.den}`);
  const unsupported = (why: string): ExportResult => ({
    ok: false,
    error: { stage: "unsupported", message: `fps_change_unsupported: ${why}; экспортируйте в исходном fps (${fpsText(req.settings.fps)}) или перегенерируйте сцену` },
  });
  let raw: Record<string, unknown>;
  try {
    raw = await readProps(req.versionDir);
  } catch (e) {
    if (e instanceof StorageError) throw e;
    return { ok: false, error: { stage: "bundle", message: (e as Error).message } };
  }
  // S6 (Р5): альфа из непрозрачной версии — перерендер с props.style.transparent = true
  // (Background не рисуется); у уже прозрачной версии overlay ничего не меняет
  const overlay = request.overlay === true && req.settings.transparent_export !== true;
  if (overlay) {
    const no = (code: string, why: string): ExportResult => ({ ok: false, error: { stage: "unsupported", message: `${code}: ${why}` } });
    if (request.format !== "prores4444") return no("overlay_mp4", "прозрачный фон хранит только ProRes 4444, H.264 альфу не хранит");
    if (isOverlayUnsupported(overlayInputProps(raw))) return no("overlay_unsupported", "props версии вне договора ScenePropsBase — фон сцены не отключить через props.style.transparent");
    if (factor !== 1) return no("overlay_unsupported", `прозрачная версия из непрозрачной — только в исходном fps (${fpsText(req.settings.fps)}): стоп-кадры версии с фоном темп не сверят`);
  }
  const warnings: string[] = [];
  if (factor !== 1) {
    // ruling 2026-10-23: темп при смене fps не угадываем — props по договору и сверка по стоп-кадрам
    if (!ScenePropsBaseSchema.safeParse(raw).success) return unsupported(`props версии вне договора ScenePropsBase — кадры сцены под ${fpsText(fps)} fps не пересчитать`);
    if ((await listStills(req.versionDir)).length === 0) return unsupported(`у версии нет стоп-кадров frames/ — темп в ${fpsText(fps)} fps не сверить`);
    const odd = unscaledTimeKeys((raw as { content: unknown }).content);
    if (odd.length > 0) warnings.push(`время под именами вне договора кадров не масштабировано под ${fpsText(fps)} fps: ${odd.join(", ")}`);
  }
  const scaled = exportProps(raw, factor);
  // overlay — только при factor 1 и props по договору (проверено выше): отказа здесь не бывает
  const transparent = overlay ? overlayInputProps(scaled) : scaled;
  if (isOverlayUnsupported(transparent)) return { ok: false, error: { stage: "unsupported", message: "overlay_unsupported: props версии вне договора ScenePropsBase" } };
  const inputProps = transparent;
  const settings: Settings = {
    ...req.settings, fps, duration_frames: exportDurationFrames(req.settings, request), ...(overlay ? { transparent_export: true } : {}),
  };

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
  const gate = exportGate(r.probe, request, req.settings);
  if (factor === 1 || gate.length > 0) return { ok: true, probe: r.probe, gate, tempo: null, warnings };
  // R1: стоп-кадры точно совпадающих моментов, которых у версии нет, — рендер версии в её fps
  // (бандл в кэше, без LLM) в каталог внутри draft; вызывающий держит семафор рендеров
  const extra: string[] = [];
  let orphanedStills = false;
  const renderStills = async (frames: number[]): Promise<string> => {
    const dir = await mkdtemp(join(dirname(req.outPath), ".tempo-stills-"));
    extra.push(dir);
    const s = await renderJob(
      { versionDir: req.versionDir, outDir: dir, settings: req.settings, cacheDir: req.cacheDir, stills: frames, preview: null, timeoutMs: req.timeoutMs, run: req.run },
      signal,
      deps,
    );
    if (!s.ok) {
      const e = s.error ?? { stage: "still" as const, message: "worker не снял кадры" };
      orphanedStills = e.stage === "orphaned";
      throw new StillsError(e.stage, `дорендер стоп-кадров ${frames.join(", ")}: ${e.stage}: ${e.message}`);
    }
    return dir;
  };
  try {
    const tempo = await (deps.tempo ?? tempoCheck)({
      exportPath: req.outPath,
      versionDir: req.versionDir,
      versionFps: req.settings.fps,
      exportFps: fps,
      versionFrames: req.settings.duration_frames,
      exportFrames: settings.duration_frames,
      width: req.settings.width,
      height: req.settings.height,
      scale: request.scale,
      opaque: request.format === "mp4",
      renderStills,
      run: req.run,
      ...(signal ? { signal } : {}),
    });
    return { ok: true, probe: r.probe, gate, tempo, warnings };
  } catch (e) {
    if (e instanceof StorageError) throw e;
    const message = `сверка темпа: ${(e as Error).message}`;
    if (e instanceof FfmpegError && e.kind !== "failed") return { ok: false, error: { stage: e.kind, message } };
    if (e instanceof StillsError && INTERRUPTED.has(e.stage)) return { ok: false, error: { stage: e.stage, message } };
    return { ok: false, error: { stage: "media", message } };
  } finally {
    // живые процессы дорендера пишут в свой каталог — его не трогаем, draft уйдёт в карантин
    if (!orphanedStills) for (const d of extra) await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Этапы рендера, которые и у дорендера стоп-кадров значат не «сбой», а прерывание или живые процессы. */
const INTERRUPTED: ReadonlySet<RenderStage> = new Set<RenderStage>(["orphaned", "aborted", "timeout"]);

class StillsError extends Error {
  constructor(readonly stage: RenderStage, message: string) {
    super(message);
  }
}
