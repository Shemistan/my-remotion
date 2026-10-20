// Рендер версии в отслеживаемом дочернем процессе (worker.ts через spawnTracked).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Settings } from "@ms/contracts";
import { StorageError, killGroup, safeMkdir, spawnTracked } from "@ms/core";
import { findRenderBrowser } from "./browser.js";
import { APP_NODE_MODULES, MOTION_KIT_DIR, mkdirOne, readProps, writeEntry } from "./entry.js";
import { FFPROBE_ARGS, type ProbeResult, ffprobeBin, parseProbe } from "./ffprobe.js";
import type { WorkerJob, WorkerResult, WorkerStage } from "./protocol.js";

export interface RenderRequest {
  versionDir: string;
  settings: Settings;
  cacheDir: string;
  stills: number[];
  preview: { scale: number; crf: number };
  timeoutMs: number;
  run: { root: string; runId: string; attempt: number };
}

/**
 * Этап, на котором рендер не удался:
 * - `bundle` / `still` / `media` — внутри worker (сборка, стоп-кадры, превью); сюда же
 *   ошибки исходников версии (нет `src/Scene.tsx`, битый `props.json`) и кадры вне сцены;
 * - `probe` — ffprobe превью не отработал или не разобран;
 * - `timeout` — не уложились в `timeoutMs`, группа процессов убита;
 * - `aborted` — сработал `signal` вызывающего, группа убита;
 * - `orphaned` — группа процессов (worker, ffprobe или Chrome) не исчезла и после SIGKILL:
 *   попытка НЕ завершена, запись в `run/processes/` оставлена для reapStale. Это не
 *   обычная ошибка рендера: повторять попытку нельзя, пока процессы живы (ADR 0007,
 *   `stale_process`).
 */
export type RenderStage = WorkerStage | "probe" | "timeout" | "aborted" | "orphaned";

export interface RenderResult {
  ok: boolean;
  stills: string[];
  previewPath?: string;
  probe?: ProbeResult;
  browserLogs: string[];
  error?: { stage: RenderStage; message: string };
}

/** Подмены для юнит-тестов. */
export interface RenderDeps {
  spawn?: typeof spawnTracked;
  browserPath?: () => Promise<string>;
  ffprobeBin?: () => Promise<string>;
  /** Пауза SIGTERM → SIGKILL группе worker при таймауте/отмене, мс (5000). */
  killGraceMs?: number;
}

export const WORKER_PATH = fileURLToPath(new URL("./worker.ts", import.meta.url));
// worker.ts исполняется встроенным стиранием типов Node 22.18+ (без tsx и сборки)
const NODE_ARGS = ["--disable-warning=ExperimentalWarning"];
const STAGE_PREFIX = "@@ms:stage ";
const LOG_PREFIX = "@@ms:log ";
const WORKER_STAGES: readonly string[] = ["bundle", "still", "media"] satisfies WorkerStage[];
const MAX_LOGS = 1000;
const STDERR_TAIL = 4000;
const STRAY_WAIT_MS = 5000;

interface WorkerOutput {
  stage?: WorkerStage;
  logs: string[];
  result?: WorkerResult;
}

function parseWorkerOutput(stdout: string): WorkerOutput {
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

/** Процессы, в командной строке которых есть `marker` (Chrome: `--user-data-dir` в TMPDIR попытки). */
async function findStrays(marker: string): Promise<{ pid: number; pgid: number }[]> {
  const out = await new Promise<string>((resolve, reject) =>
    execFile("/bin/ps", ["-axww", "-o", "pid=,pgid=,command="], { maxBuffer: 64 * 1024 * 1024 }, (e, so) => (e ? reject(e) : resolve(so))),
  );
  const found: { pid: number; pgid: number }[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes(marker)) continue;
    const m = /^\s*(\d+)\s+(\d+)\s/.exec(line);
    if (m) found.push({ pid: Number(m[1]), pgid: Number(m[2]) });
  }
  return found.filter((p) => p.pid !== process.pid);
}

/**
 * Chrome Remotion запускает в собственной группе (detached), и убийство группы worker
 * его не задевает. Ищем такие процессы по TMPDIR попытки, бьём их группы SIGKILL и
 * ждём исчезновения. Возвращает тех, кто выжил.
 */
async function reapStrays(marker: string): Promise<{ pid: number; pgid: number }[]> {
  let strays = await findStrays(marker);
  if (strays.length === 0) return [];
  for (const pgid of new Set(strays.map((p) => p.pgid))) killGroup(pgid, "SIGKILL");
  const until = Date.now() + STRAY_WAIT_MS;
  while (strays.length > 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
    strays = await findStrays(marker);
  }
  return strays;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Недоделки убитых worker: `bundles/<key>.tmp-<pid>` и `.preview-<pid>.tmp.mp4` версии.
 * Удаляем только те, чей pid мёртв, — параллельный рендер того же содержимого не трогаем.
 */
async function removeLeftovers(versionDir: string, bundlesDir: string): Promise<void> {
  const dead = (name: string, re: RegExp) => {
    const m = re.exec(name);
    return m !== null && !pidAlive(Number(m[1]));
  };
  for (const n of await readdir(bundlesDir)) {
    if (dead(n, /^[0-9a-f]{64}\.tmp-(\d+)$/)) await rm(join(bundlesDir, n), { recursive: true, force: true });
  }
  for (const n of await readdir(versionDir)) {
    if (dead(n, /^\.preview-(\d+)\.tmp\.mp4$/)) await rm(join(versionDir, n), { force: true });
  }
}

function childEnv(tmpdir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TMPDIR: tmpdir, LANG: process.env.LANG ?? "en_US.UTF-8" };
  if (process.env.PATH !== undefined) env.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) env.HOME = process.env.HOME;
  return env;
}

/**
 * Рендер версии: бандл (кэш по contentKey) → стоп-кадры `<versionDir>/frames/<n>.png` →
 * превью `<versionDir>/preview.mp4` (H.264) → ffprobe. Всё тяжёлое — в worker под
 * `spawnTracked`; ffprobe тоже отслеживается. Таймаут и `signal` убивают группу.
 * Gate по настройкам (`probeGate`) вызывающий применяет сам к `probe`.
 *
 * Временные файлы Remotion и профиль Chrome — в `run/tmp/<runId>-a<attempt>-*` хранилища
 * (TMPDIR дочернего процесса), не на системном диске; каталог удаляется в конце.
 *
 * Бросает (а не возвращает ok:false), если рендер невозможен в принципе: хранилище
 * недоступно (StorageError), нет Chrome Headless Shell или ffprobe, Node без стирания
 * типов. `versionDir` и `cacheDir` должны существовать.
 */
export async function renderVersion(req: RenderRequest, signal?: AbortSignal, deps: RenderDeps = {}): Promise<RenderResult> {
  const spawn = deps.spawn ?? spawnTracked;
  const fail = (stage: RenderStage, message: string, extra: Partial<RenderResult> = {}): RenderResult => ({
    ok: false,
    stills: [],
    browserLogs: [],
    ...extra,
    error: { stage, message },
  });

  if (signal?.aborted) return fail("aborted", "рендер отменён до запуска");
  const frames = req.settings.duration_frames;
  const badFrames = req.stills.filter((f) => !Number.isInteger(f) || f < 0 || f >= frames);
  if (badFrames.length > 0) return fail("still", `кадры вне 0..${frames - 1}: ${badFrames.join(", ")}`);

  if (!process.features.typescript) throw new Error("render: Node без стирания типов (нужен 22.18+), worker.ts не запустится");
  if (!existsSync(WORKER_PATH)) throw new Error(`render: нет ${WORKER_PATH}`);
  const browserExecutable = await (deps.browserPath ?? (async () => findRenderBrowser()))();
  const ffprobe = await (deps.ffprobeBin ?? ffprobeBin)();

  let entryPoint: string;
  let inputProps: Record<string, unknown>;
  try {
    entryPoint = await writeEntry(req.versionDir, req.cacheDir, req.settings);
    inputProps = await readProps(req.versionDir);
  } catch (e) {
    if (e instanceof StorageError) throw e;
    return fail("bundle", (e as Error).message);
  }
  const key = basename(dirname(entryPoint));

  const framesDir = await mkdirOne(join(req.versionDir, "frames"));
  const bundlesDir = await mkdirOne(join(req.cacheDir, "bundles"));
  const { root, runId, attempt } = req.run;
  const ref = { runId, attempt };
  const tmpRoot = await safeMkdir(root, "run/tmp");
  const runTmp = await mkdtemp(join(tmpRoot, `${runId}-a${attempt}-`));
  const env = childEnv(runTmp);

  const { num, den } = req.settings.fps;
  const job: WorkerJob = {
    entryPoint,
    bundleDir: join(bundlesDir, key),
    rootDir: dirname(entryPoint),
    nodeModules: APP_NODE_MODULES,
    motionKitDir: MOTION_KIT_DIR,
    browserExecutable,
    inputProps,
    composition: { width: req.settings.width, height: req.settings.height, fps: num / den, durationInFrames: frames },
    stills: req.stills.map((frame) => ({ frame, out: join(framesDir, `${frame}.png`) })),
    preview: { out: join(req.versionDir, "preview.mp4"), scale: req.preview.scale, crf: req.preview.crf },
    timeoutMs: req.timeoutMs,
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
  const interrupted = (logs: string[]) =>
    why === "timeout"
      ? fail("timeout", `рендер не уложился в ${req.timeoutMs} мс; группа процессов убита`, { browserLogs: logs })
      : fail("aborted", "рендер отменён; группа процессов убита", { browserLogs: logs });

  try {
    const w = await spawn(root, ref, process.execPath, [...NODE_ARGS, WORKER_PATH], {
      cwd: runTmp,
      env,
      signal: ac.signal,
      stdin: JSON.stringify(job),
      killGraceMs: deps.killGraceMs ?? 5000,
    });
    const out = parseWorkerOutput(w.stdout);
    const survivors = await reapStrays(runTmp);
    if (w.orphaned || survivors.length > 0) {
      const who = w.orphaned ? `группа worker ${process.execPath}` : `Chrome (pid ${survivors.map((p) => p.pid).join(", ")})`;
      return fail("orphaned", `${who} не исчезла после SIGKILL; попытка не завершена, нужен reapStale`, { browserLogs: out.logs });
    }
    // worker подтверждённо мёртв — его недоделки можно убрать
    await removeLeftovers(req.versionDir, bundlesDir);
    if (why) return interrupted(out.logs);
    const r = out.result;
    if (!r) {
      const stage = out.stage ?? "bundle";
      return fail(stage, `worker завершился (code ${w.code}, signal ${w.signal}) без результата на этапе ${stage}: ${tail(w.stderr)}`, {
        browserLogs: out.logs,
      });
    }
    const browserLogs = out.logs.length > 0 ? out.logs : r.browserLogs;
    if (!r.ok || !r.previewPath) {
      const error = r.error ?? { stage: out.stage ?? "media", message: "worker не вернул превью" };
      return { ok: false, stills: r.stills, browserLogs, error };
    }

    const p = await spawn(root, ref, ffprobe, [...FFPROBE_ARGS, r.previewPath], { cwd: runTmp, env, signal: ac.signal });
    if (p.orphaned) return fail("orphaned", `группа ffprobe не исчезла после SIGKILL; попытка не завершена`, { browserLogs });
    if (why) return interrupted(browserLogs);
    const base = { stills: r.stills, previewPath: r.previewPath, browserLogs };
    if (p.code !== 0) return fail("probe", `ffprobe завершился с кодом ${p.code}: ${tail(p.stderr)}`, base);
    try {
      return { ok: true, ...base, probe: parseProbe(p.stdout) };
    } catch (e) {
      return fail("probe", (e as Error).message, base);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    await rm(runTmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
