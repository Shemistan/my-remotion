// Рендер версии в отслеживаемом дочернем процессе (worker.ts через spawnTracked).
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Settings } from "@ms/contracts";
import { type ProcessRegistry, StorageError, fileProcessRegistry, safeMkdir, spawnTracked } from "@ms/core";
import { CHROME_WRAPPER, findRenderBrowser } from "./browser.js";
import { markCacheUse } from "./cache-use.js";
import { currentRenderConcurrency } from "./concurrency.js";
import { APP_NODE_MODULES, MOTION_KIT_DIR, mkdirOne, readProps, writeEntry } from "./entry.js";
import { FFPROBE_ARGS, type ProbeResult, ffprobeBin, parseProbe } from "./ffprobe.js";
import { reapByMarker, settleBrowserRecords } from "./processes.js";
import type { WorkerExport, WorkerJob, WorkerResult, WorkerStage } from "./protocol.js";

export interface RenderRequest {
  versionDir: string;
  settings: Settings;
  cacheDir: string;
  stills: number[];
  /**
   * Превью H.264; `null` — только стоп-кадры (проба раскладки, например кадра hold базы при
   * правке «сохрани композицию»): без превью и ffprobe, `ok` — кадры сняты.
   */
  preview: { scale: number; crf: number } | null;
  timeoutMs: number;
  /**
   * Контекст прогона (ADR 0007): хранилище, попытка и реестр процессов. Без `registry` —
   * файловый `run/processes/` (только CLI и тесты); сервер передаёт `SqliteProcessRegistry`.
   */
  run: { root: string; runId: string; attempt: number; registry?: ProcessRegistry };
  /**
   * Куда писать `frames/<n>.png` и `preview.mp4` (каталог должен существовать). По
   * умолчанию — `versionDir`; отдельный каталог позволяет перерендерить опубликованную
   * read-only версию без копирования исходников.
   */
  outDir?: string;
  /**
   * Props вместо `props.json` версии: экспорт в другом fps и проверка наложения сцены
   * сценария (S6: кадр с `style.transparent = true` без правки draft).
   */
  inputProps?: Record<string, unknown>;
  /**
   * Временной проход пробы после превью (S15b, сцена сценария): каждый `every`-й кадр, строки
   * `[motion-kit:sweep]` — в `browserLogs`. Только с превью.
   */
  sweep?: { every: number; scale: number };
  /** Параллельность Remotion (Task 49a); нет — `currentRenderConcurrency()` (config `render.concurrency`). */
  concurrency?: number;
}

/**
 * Этап, на котором рендер не удался:
 * - `bundle` / `still` / `media` — внутри worker (сборка, стоп-кадры, превью); сюда же
 *   ошибки исходников версии (нет `src/Scene.tsx`, битый `props.json`) и кадры вне сцены;
 * - `ffprobe` — ffprobe превью не отработал или не разобран (не путать с этапом
 *   пайплайна `probe` — превью не прошло `probeGate`);
 * - `timeout` — не уложились в `timeoutMs`, группа процессов убита;
 * - `aborted` — сработал `signal` вызывающего, группа убита;
 * - `timeout` также ставит worker, если сработал (чуть более короткий) таймаут delayRender;
 * - `orphaned` — группа процессов (worker, ffprobe или Chrome) не исчезла и после SIGKILL:
 *   попытка НЕ завершена; записи в реестре оставлены (их добьёт reapAttempt),
 *   Chrome без записи найдёт reapStrayRenderers; `run/tmp/…` попытки переименован в
 *   `*.quarantined`. Это не обычная ошибка рендера: повторять попытку нельзя, пока
 *   процессы живы (ADR 0007, `stale_process`).
 */
export type RenderStage = WorkerStage | "ffprobe" | "timeout" | "aborted" | "orphaned";

/** Контекст прогона рендера (M10): хранилище, попытка, реестр процессов. */
export type RunRef = RenderRequest["run"];

/** Внутренний запрос: рендер версии или экспорт (`export` — режим export worker, Task 19). */
export interface RenderJobRequest extends RenderRequest {
  export?: WorkerExport;
}

export interface RenderResult {
  ok: boolean;
  stills: string[];
  previewPath?: string;
  /** Файл экспорта (режим export). */
  exportPath?: string;
  probe?: ProbeResult;
  browserLogs: string[];
  /**
   * Task 36: origin, к которым рендер ходит законно (медиасервер и сервер бандла рендера
   * таймлайна, `renderTimelineRange`); QA `network` их строки не считает сетью сцены. Рендер
   * версии поле не ставит.
   */
  allowedOrigins?: string[];
  error?: { stage: RenderStage; message: string };
}

/** Подмены для юнит-тестов. */
export interface RenderDeps {
  spawn?: typeof spawnTracked;
  browserPath?: () => Promise<string>;
  ffprobeBin?: () => Promise<string>;
  /** ffmpeg вырезок master (рендер таймлайна, ревью Task 36 I3). */
  ffmpegBin?: () => Promise<string>;
  /** Пауза SIGTERM → SIGKILL группе worker при таймауте/отмене, мс (5000). */
  killGraceMs?: number;
}

export const WORKER_PATH = fileURLToPath(new URL("./worker.ts", import.meta.url));
// worker.ts исполняется встроенным стиранием типов Node 22.18+ (без tsx и сборки)
export const NODE_ARGS = ["--disable-warning=ExperimentalWarning"];
const STAGE_PREFIX = "@@ms:stage ";
const LOG_PREFIX = "@@ms:log ";
const WORKER_STAGES: readonly string[] = ["bundle", "still", "media"] satisfies WorkerStage[];
// стоп-кадры и временной проход (S15b: ~1 строка на 6 кадров, до 60 с при 30 fps)
const MAX_LOGS = 2000;
const STDERR_TAIL = 4000;
const STRAY_WAIT_MS = 5000;

export interface WorkerOutput {
  stage?: WorkerStage;
  logs: string[];
  result?: WorkerResult;
}

export function parseWorkerOutput(stdout: string): WorkerOutput {
  const out: WorkerOutput = { logs: [] };
  const lines = stdout.split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    if (line.startsWith(STAGE_PREFIX)) {
      const s = line.slice(STAGE_PREFIX.length).trim();
      if (WORKER_STAGES.includes(s)) out.stage = s as WorkerStage;
    } else if (line.startsWith(LOG_PREFIX) && out.logs.length < MAX_LOGS) {
      const raw = line.slice(LOG_PREFIX.length);
      try {
        out.logs.push(String(JSON.parse(raw)));
      } catch {
        out.logs.push(raw);
      }
    }
  }
  const last = lines.at(-1);
  if (last && !last.startsWith("@@ms:")) {
    try {
      const r = JSON.parse(last) as WorkerResult;
      if (typeof r === "object" && r !== null && typeof r.ok === "boolean") out.result = r;
    } catch {
      // последняя строка — не результат: worker упал
    }
  }
  return out;
}

const tail = (s: string) => (s.length > STDERR_TAIL ? "…" + s.slice(-STDERR_TAIL) : s).trim();

/** Таймаут Remotion внутри worker — чуть меньше внешнего (на 10%, но не меньше 2 с). */
export function innerTimeoutMs(outer: number): number {
  return Math.max(Math.floor(outer / 2), outer - Math.max(2000, Math.round(outer * 0.1)));
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Недоделки убитых worker: `bundles/<key>.tmp-<pid>` и `.preview-<pid>.tmp.mp4` /
 * `.export-<pid>.tmp.<ext>` в каталоге вывода (`outDir`: версия у рендера, draft у экспорта —
 * worker пишет временный файл рядом с итоговым). Удаляем только те, чей pid мёртв, —
 * параллельный рендер того же содержимого не трогаем.
 */
async function removeLeftovers(outDir: string, bundlesDir: string): Promise<void> {
  const dead = (name: string, re: RegExp) => {
    const m = re.exec(name);
    return m !== null && !pidAlive(Number(m[1]));
  };
  for (const n of await readdir(bundlesDir)) {
    if (dead(n, /^[0-9a-f]{64}\.tmp-(\d+)$/)) await rm(join(bundlesDir, n), { recursive: true, force: true });
  }
  for (const n of await readdir(outDir)) {
    if (dead(n, /^\.(?:preview|export)-(\d+)\.tmp\.(?:mp4|mov)$/)) await rm(join(outDir, n), { force: true });
  }
}

export function childEnv(tmpdir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TMPDIR: tmpdir, LANG: process.env.LANG ?? "en_US.UTF-8" };
  if (process.env.PATH !== undefined) env.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) env.HOME = process.env.HOME;
  return env;
}

/**
 * Рендер версии: бандл (кэш по contentKey) → стоп-кадры `<outDir>/frames/<n>.png` →
 * превью `<outDir>/preview.mp4` (H.264) → ffprobe; `outDir` по умолчанию — `versionDir`
 * (версия тогда только читается). Всё тяжёлое — в worker под
 * `spawnTracked`; ffprobe тоже отслеживается. Chrome запускается через
 * chrome-wrapper.sh: он сам пишет запись в `run/processes/` (Chrome в своей группе) и
 * закрывает браузеру сеть. Таймаут и `signal` убивают группы. Gate по настройкам
 * (`probeGate`) вызывающий применяет сам к `probe`.
 *
 * Временные файлы Remotion и профиль Chrome — в `run/tmp/<runId>-a<attempt>-*` хранилища
 * (TMPDIR дочернего процесса), не на системном диске; каталог удаляется в конце, а при
 * `orphaned` переименовывается в `*.quarantined`.
 *
 * Бросает (а не возвращает ok:false), если рендер невозможен в принципе: хранилище
 * недоступно (StorageError), нет Chrome Headless Shell или ffprobe, Node без стирания
 * типов. `versionDir`, `cacheDir` и `outDir` (если задан) должны существовать.
 */
export async function renderVersion(req: RenderRequest, signal?: AbortSignal, deps: RenderDeps = {}): Promise<RenderResult> {
  return renderJob(req, signal, deps);
}

/**
 * Общая часть рендера и экспорта: одна и та же изоляция (spawnTracked, обёртка Chrome без
 * сети, asset-guard `/proxy` в worker, TMPDIR попытки, renderId для уборки Chrome),
 * таймаут, отмена и `orphaned`. С `req.export` worker вместо кадров и превью пишет файл
 * экспорта, ffprobe идёт по нему; `frames/` не создаётся.
 */
export async function renderJob(req: RenderJobRequest, signal?: AbortSignal, deps: RenderDeps = {}): Promise<RenderResult> {
  const spawn = deps.spawn ?? spawnTracked;
  const fail = (stage: RenderStage, message: string, extra: Partial<RenderResult> = {}): RenderResult => ({
    ok: false,
    stills: [],
    browserLogs: [],
    ...extra,
    error: { stage, message },
  });
  const cancelled = () => fail("aborted", "рендер отменён до запуска worker");

  if (signal?.aborted) return cancelled();
  const frames = req.settings.duration_frames;
  const badFrames = req.stills.filter((f) => !Number.isInteger(f) || f < 0 || f >= frames);
  if (badFrames.length > 0) return fail("still", `кадры вне 0..${frames - 1}: ${badFrames.join(", ")}`);

  if (!process.features.typescript) throw new Error("render: Node без стирания типов (нужен 22.18+), worker.ts не запустится");
  if (!existsSync(WORKER_PATH)) throw new Error(`render: нет ${WORKER_PATH}`);
  await access(CHROME_WRAPPER, constants.X_OK).catch((e: unknown) => {
    throw new Error(`render: ${CHROME_WRAPPER} не исполняемый`, { cause: e });
  });
  // отмена во время подготовки не должна потеряться: проверка после каждого await
  const chrome = await (deps.browserPath ?? (async () => findRenderBrowser()))();
  if (signal?.aborted) return cancelled();
  const ffprobe = await (deps.ffprobeBin ?? ffprobeBin)();
  if (signal?.aborted) return cancelled();

  let entryPoint: string;
  let inputProps: Record<string, unknown>;
  try {
    entryPoint = await writeEntry(req.versionDir, req.cacheDir, req.settings);
    inputProps = req.inputProps ?? (await readProps(req.versionDir));
  } catch (e) {
    if (e instanceof StorageError) throw e;
    return fail("bundle", (e as Error).message);
  }
  const key = basename(dirname(entryPoint));
  // Task 49a: отметка до worker — уборка кэша не тронет бандл активной задачи
  await markCacheUse(req.cacheDir, key, req.run.runId);

  const outDir = req.outDir ?? req.versionDir;
  const framesDir = req.export ? undefined : await mkdirOne(join(outDir, "frames"));
  const bundlesDir = await mkdirOne(join(req.cacheDir, "bundles"));
  const { root, runId, attempt, registry } = req.run;
  const ref = { runId, attempt };
  const tmpRoot = await safeMkdir(root, "run/tmp");
  // chrome-wrapper.sh пишет запись Chrome в `run/processes/`, но каталог не создаёт
  await safeMkdir(root, "run/processes");
  if (signal?.aborted) return cancelled();
  const runTmp = await mkdtemp(join(tmpRoot, `${runId}-a${attempt}-`));
  // ключ рендера: два дубля одной попытки рендерят параллельно с одним (runId, attempt)
  const renderId = basename(runTmp);
  const env = childEnv(runTmp);

  const { num, den } = req.settings.fps;
  const job: WorkerJob = {
    mode: req.export ? "export" : "render",
    entryPoint,
    bundleDir: join(bundlesDir, key),
    rootDir: dirname(entryPoint),
    nodeModules: APP_NODE_MODULES,
    motionKitDir: MOTION_KIT_DIR,
    browserExecutable: CHROME_WRAPPER,
    chrome,
    run: { root, runId, attempt, renderId },
    inputProps,
    composition: { width: req.settings.width, height: req.settings.height, fps: num / den, durationInFrames: frames },
    stills: framesDir ? req.stills.map((frame) => ({ frame, out: join(framesDir, `${frame}.png`) })) : [],
    preview: !req.export && req.preview ? { out: join(outDir, "preview.mp4"), scale: req.preview.scale, crf: req.preview.crf } : null,
    export: req.export ?? null,
    ...(!req.export && req.preview && req.sweep ? { sweep: req.sweep } : {}),
    timeoutMs: innerTimeoutMs(req.timeoutMs),
    concurrency: req.concurrency ?? currentRenderConcurrency(),
  };

  const ac = new AbortController();
  let why: "timeout" | "aborted" | undefined;
  const timer = setTimeout(() => {
    why ??= "timeout";
    ac.abort();
  }, req.timeoutMs);
  const onAbort = () => {
    why ??= "aborted";
    ac.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const interrupted = (logs: string[]) =>
    why === "timeout"
      ? fail("timeout", `рендер не уложился в ${req.timeoutMs} мс; группа процессов убита`, { browserLogs: logs })
      : fail("aborted", "рендер отменён; группа процессов убита", { browserLogs: logs });

  let orphaned = false;
  try {
    if (ac.signal.aborted) return interrupted([]);
    const w = await spawn(root, ref, process.execPath, [...NODE_ARGS, WORKER_PATH], {
      cwd: runTmp,
      env,
      signal: ac.signal,
      stdin: JSON.stringify(job),
      killGraceMs: deps.killGraceMs ?? 5000,
      registry,
    });
    const out = parseWorkerOutput(w.stdout);
    if (w.orphaned) {
      orphaned = true;
      return fail(
        "orphaned",
        "группа worker не исчезла после SIGKILL; её запись оставлена в run/processes/, попытка не завершена (stale_process)",
        { browserLogs: out.logs },
      );
    }
    // Chrome — в своей группе: добиваем по TMPDIR этого рендера, затем закрываем записи его
    // Chrome (не всей попытки: Chrome соседнего дубля жив и нужен ему)
    const strays = await reapByMarker(runTmp + "/", { graceMs: 0, waitMs: STRAY_WAIT_MS });
    const browsers = await settleBrowserRecords(fileProcessRegistry(root), { ...ref, renderId });
    if (strays.length > 0 || browsers.length > 0) {
      orphaned = true;
      const pids = [...new Set([...strays.map((p) => p.pid), ...browsers.map((p) => p.pid)])].join(", ");
      return fail(
        "orphaned",
        `Chrome (pid ${pids}) не исчез после SIGKILL; записи Chrome оставлены в run/processes/, ` +
          `процессы без записи уберёт reapStrayRenderers; попытка не завершена (stale_process)`,
        { browserLogs: out.logs },
      );
    }
    // worker и Chrome подтверждённо мертвы — их недоделки можно убрать
    await removeLeftovers(outDir, bundlesDir);
    if (why) return interrupted(out.logs);
    const r = out.result;
    if (!r) {
      const stage = out.stage ?? "bundle";
      return fail(stage, `worker завершился (code ${w.code}, signal ${w.signal}) без результата на этапе ${stage}: ${tail(w.stderr)}`, {
        browserLogs: out.logs,
      });
    }
    const browserLogs = out.logs.length > 0 ? out.logs : r.browserLogs;
    if (!req.export && req.preview === null) return r.ok ? { ok: true, stills: r.stills, browserLogs } : { ok: false, stills: r.stills, browserLogs, error: r.error ?? { stage: out.stage ?? "still", message: "worker не снял кадры" } };
    const media = req.export ? r.exportPath : r.previewPath;
    if (!r.ok || !media) {
      const error = r.error ?? { stage: out.stage ?? "media", message: req.export ? "worker не вернул файл экспорта" : "worker не вернул превью" };
      return { ok: false, stills: r.stills, browserLogs, error };
    }

    const p = await spawn(root, ref, ffprobe, [...FFPROBE_ARGS, media], { cwd: runTmp, env, signal: ac.signal, registry });
    if (p.orphaned) {
      orphaned = true;
      return fail("orphaned", "группа ffprobe не исчезла после SIGKILL; её запись оставлена в run/processes/, попытка не завершена (stale_process)", {
        browserLogs,
      });
    }
    if (why) return interrupted(browserLogs);
    const base = req.export ? { stills: r.stills, exportPath: media, browserLogs } : { stills: r.stills, previewPath: media, browserLogs };
    if (p.code !== 0) return fail("ffprobe", `ffprobe завершился с кодом ${p.code}: ${tail(p.stderr)}`, base);
    try {
      return { ok: true, ...base, probe: parseProbe(p.stdout) };
    } catch (e) {
      return fail("ffprobe", (e as Error).message, base);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    // при живых процессах каталог не трогаем, только помечаем: в нём их файлы
    if (orphaned) await rename(runTmp, `${runTmp}.quarantined`).catch(() => undefined);
    else await rm(runTmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
