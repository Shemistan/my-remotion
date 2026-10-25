// Рендер диапазона таймлайна (Task 36, ADR 0010): одна композиция `ProjectTimeline` для превью
// сцены в контексте, превью таймлайна и финала. Изоляция — как у рендера версии (`renderJob`):
// worker-timeline.ts под spawnTracked, обёртка Chrome без сети, asset-guard с `media` медиасервера
// worker, TMPDIR попытки, таймаут и отмена убивают группу, `orphaned` — живые процессы.
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SequenceSpec } from "@ms/contracts";
import { StorageError, fileProcessRegistry, safeMkdir, spawnTracked } from "@ms/core";
import { CHROME_WRAPPER, findRenderBrowser } from "../node/browser.js";
import { markCacheUse } from "../node/cache-use.js";
import { APP_NODE_MODULES, MOTION_KIT_DIR, mkdirOne } from "../node/entry.js";
import { FFPROBE_ARGS, type ProbeResult, ffprobeBin, parseProbe } from "../node/ffprobe.js";
import { isOverlayUnsupported, overlayInputProps } from "../node/overlay-props.js";
import { reapByMarker, settleBrowserRecords } from "../node/processes.js";
import { NODE_ARGS, type RenderDeps, type RunRef, childEnv, innerTimeoutMs, parseWorkerOutput, pidAlive } from "../node/render-version.js";
import { ffmpegBin } from "../node/ffmpeg.js";
import { type SceneCheck, writeTimelineEntry } from "./entry.js";
import { cutArgs, planVideo } from "./master-cut.js";
import type { TimelineVideoSource, TimelineWorkerJob, TimelineWorkerResult } from "./protocol.js";
import type { TimelineRenderProps, TimelineSceneSpec } from "./types.js";

export const TIMELINE_WORKER_PATH = fileURLToPath(new URL("./worker-timeline.ts", import.meta.url));

/** Файл диапазона: MP4 H.264/AAC 48 кГц. */
export interface TimelineOutput {
  path: string;
  codec: "h264";
  crf: number;
  scale: number;
  audioBitrateKbps: number;
  x264Preset: "medium" | "veryfast";
}

export interface TimelineRenderRequest {
  /** Props композиции; видео и звук — файлами на диске (worker отдаёт их своим медиасервером). */
  props: Omit<TimelineRenderProps, "video" | "audio"> & { video: { path: string; sequences: SequenceSpec[] }; audio?: { path: string } };
  /** Ключ сцены (`scenes[].key`) → каталог версии. */
  versionDirs: Record<string, string>;
  cacheDir: string;
  /** Static check версии до бандла (сервер: `checkSceneDir`). */
  check: SceneCheck;
  /** Кадры `[первый, последний]` включительно для `output`; без поля — весь ролик. */
  range?: [number, number];
  /** Стоп-кадры (кадры ролика) → `<stillsDir>/<n>.png`. */
  stills: number[];
  stillsDir?: string;
  output?: TimelineOutput;
  timeoutMs: number;
  run: RunRef;
}

/**
 * Этап сбоя: `bundle` / `still` / `media` — в worker (сборка и entry, кадры, файл); `probe` —
 * ffprobe файла; `unsupported` — запрос невозможен до рендера (прозрачная сцена с props вне
 * `ScenePropsBase`, кадры вне ролика, нет файла медиа); `timeout`, `aborted`, `orphaned` — как у
 * рендера версии.
 */
export type TimelineStage = "bundle" | "still" | "media" | "probe" | "timeout" | "aborted" | "orphaned" | "unsupported";

export interface TimelineRenderResult {
  ok: boolean;
  stills: string[];
  outPath?: string;
  probe?: ProbeResult;
  browserLogs: string[];
  /** Origin медиасервера и сервера бандла этого рендера (QA `network` их пропускает). */
  allowedOrigins: string[];
  /** Байт, отданных медиасервером worker (master, вырезки, звук) — столько Remotion скачал в TMPDIR. */
  mediaBytes?: number;
  error?: { stage: TimelineStage; message: string };
}

const ORIGINS_PREFIX = "@@ms:origins ";
const STDERR_TAIL = 4000;
const STRAY_WAIT_MS = 5000;
const tail = (s: string) => (s.length > STDERR_TAIL ? "…" + s.slice(-STDERR_TAIL) : s).trim();

function parseOrigins(stdout: string): string[] {
  for (const line of stdout.split("\n")) {
    if (!line.startsWith(ORIGINS_PREFIX)) continue;
    try {
      const v = JSON.parse(line.slice(ORIGINS_PREFIX.length)) as unknown;
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
    } catch {
      // битая строка — без origin
    }
  }
  return [];
}

/** Недоделки убитых worker таймлайна (pid мёртв): бандл `tl-<sha>.tmp-<pid>`, `.timeline-<pid>.tmp.mp4`. */
async function removeLeftovers(bundlesDir: string, outDir: string | undefined): Promise<void> {
  const dead = (name: string, re: RegExp) => {
    const m = re.exec(name);
    return m !== null && !pidAlive(Number(m[1]));
  };
  for (const n of await readdir(bundlesDir)) {
    if (dead(n, /^tl-[0-9a-f]{64}\.tmp-(\d+)$/)) await rm(join(bundlesDir, n), { recursive: true, force: true });
  }
  if (outDir) for (const n of await readdir(outDir)) if (dead(n, /^\.timeline-(\d+)\.tmp\.mp4$/)) await rm(join(outDir, n), { force: true });
}

/**
 * Props сцен для композиции: прозрачные — `overlayInputProps` (Р-V5, как альфа-экспорт S6);
 * строка — причина отказа (`overlay_unsupported`).
 */
export function timelineSceneProps(scenes: TimelineSceneSpec[]): TimelineSceneSpec[] | string {
  const out: TimelineSceneSpec[] = [];
  for (const s of scenes) {
    if (!s.transparent) {
      out.push(s);
      continue;
    }
    const p = overlayInputProps(s.props);
    if (isOverlayUnsupported(p)) return `overlay_unsupported: сцена ${s.clip_id} прозрачная, а props версии вне договора ScenePropsBase — фон не отключить через props.style.transparent`;
    out.push({ ...s, props: p });
  }
  return out;
}

/** Проблемы запроса до рендера; пусто — можно рендерить. */
export function checkTimelineRequest(req: TimelineRenderRequest): string[] {
  const p = req.props;
  const n = p.duration_frames;
  const bad: string[] = [];
  if (!Number.isInteger(n) || n < 1) bad.push(`длительность таймлайна ${n} кадров`);
  const outside = req.stills.filter((f) => !Number.isInteger(f) || f < 0 || f >= n);
  if (outside.length > 0) bad.push(`кадры вне 0..${n - 1}: ${outside.join(", ")}`);
  if (req.stills.length > 0 && !req.stillsDir) bad.push("стоп-кадры без stillsDir");
  if (!req.output && req.stills.length === 0) bad.push("нечего рендерить: ни кадров, ни файла");
  if (req.range) {
    const [a, b] = req.range;
    if (!req.output) bad.push("range без output");
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b >= n) bad.push(`диапазон [${a}, ${b}] вне 0..${n - 1}`);
  }
  if (req.output && extname(req.output.path) !== ".mp4") bad.push(`файл диапазона должен быть .mp4: ${req.output.path}`);
  for (const s of p.scenes) {
    if (req.versionDirs[s.key] === undefined) bad.push(`нет каталога версии для сцены ${s.key} (${s.clip_id})`);
    if (s.start_frame < 0 || s.duration_frames < 1 || s.start_frame + s.duration_frames > n) bad.push(`сцена ${s.clip_id} [${s.start_frame}, +${s.duration_frames}) вне ролика 0..${n}`);
  }
  for (const f of [p.video.path, p.audio?.path].filter((x): x is string => x !== undefined)) if (!isAbsolute(f)) bad.push(`путь медиа не абсолютный: ${f}`);
  return bad;
}

/**
 * Рендер стоп-кадров и/или файла диапазона таймлайна. Бросает (а не возвращает ok:false), если
 * рендер невозможен в принципе: хранилище (StorageError), нет Chrome или ffprobe, Node без стирания
 * типов. Перед бандлом — static check каждой версии (`req.check`), сбой — этап `bundle`.
 */
export async function renderTimelineRange(req: TimelineRenderRequest, signal?: AbortSignal, deps: RenderDeps = {}): Promise<TimelineRenderResult> {
  const spawn = deps.spawn ?? spawnTracked;
  let allowedOrigins: string[] = [];
  const fail = (stage: TimelineStage, message: string, extra: Partial<TimelineRenderResult> = {}): TimelineRenderResult => ({
    ok: false, stills: [], browserLogs: [], allowedOrigins, ...extra, error: { stage, message },
  });
  const cancelled = () => fail("aborted", "рендер таймлайна отменён до запуска worker");
  if (signal?.aborted) return cancelled();
  const problems = checkTimelineRequest(req);
  if (problems.length > 0) return fail("unsupported", problems.join("; "));
  const scenes = timelineSceneProps(req.props.scenes);
  if (typeof scenes === "string") return fail("unsupported", scenes);
  for (const f of [req.props.video.path, req.props.audio?.path].filter((x): x is string => x !== undefined)) {
    const st = await stat(f).catch(() => undefined);
    if (!st?.isFile()) return fail("unsupported", `файла медиа нет: ${f}`);
  }

  if (!process.features.typescript) throw new Error("render: Node без стирания типов (нужен 22.18+), worker-timeline.ts не запустится");
  if (!existsSync(TIMELINE_WORKER_PATH)) throw new Error(`render: нет ${TIMELINE_WORKER_PATH}`);
  await access(CHROME_WRAPPER, constants.X_OK).catch((e: unknown) => {
    throw new Error(`render: ${CHROME_WRAPPER} не исполняемый`, { cause: e });
  });
  const chrome = await (deps.browserPath ?? (async () => findRenderBrowser()))();
  if (signal?.aborted) return cancelled();
  // ffprobe — длина master (план вырезок) и файл диапазона; ffmpeg — вырезки master (ревью I3)
  const ffprobe = await (deps.ffprobeBin ?? ffprobeBin)();
  const ffmpeg = await (deps.ffmpegBin ?? ffmpegBin)();
  if (signal?.aborted) return cancelled();

  let entryPoint: string;
  try {
    const used = [...new Set(scenes.map((s) => s.key))];
    entryPoint = await writeTimelineEntry({ scenes: used.map((key) => ({ key, versionDir: req.versionDirs[key]! })), cacheDir: req.cacheDir, check: req.check, onKey: (k) => markCacheUse(req.cacheDir, k, req.run.runId) });
  } catch (e) {
    if (e instanceof StorageError) throw e;
    return fail("bundle", (e as Error).message);
  }
  const key = basename(dirname(entryPoint));
  const bundlesDir = await mkdirOne(join(req.cacheDir, "bundles"));
  const stillsDir = req.stills.length > 0 ? await mkdirOne(req.stillsDir!) : undefined;
  const outDir = req.output ? dirname(req.output.path) : undefined;
  const { root, runId, attempt, registry } = req.run;
  const ref = { runId, attempt };
  const tmpRoot = await safeMkdir(root, "run/tmp");
  await safeMkdir(root, "run/processes");
  if (signal?.aborted) return cancelled();
  const runTmp = await mkdtemp(join(tmpRoot, `${runId}-a${attempt}-tl-`));
  const renderId = basename(runTmp);
  const env = childEnv(runTmp);

  const p = req.props;
  const job: TimelineWorkerJob = {
    entryPoint,
    bundleDir: join(bundlesDir, key),
    rootDir: dirname(entryPoint),
    nodeModules: APP_NODE_MODULES,
    motionKitDir: MOTION_KIT_DIR,
    browserExecutable: CHROME_WRAPPER,
    chrome,
    run: { root, runId, attempt, renderId },
    props: { width: p.width, height: p.height, fps: p.fps, duration_frames: p.duration_frames, video: { sequences: p.video.sequences }, audio: p.audio !== undefined, scenes },
    media: { video: p.video.path, ...(p.audio ? { audio: p.audio.path } : {}) },
    composition: { width: p.width, height: p.height, fps: p.fps.num / p.fps.den, durationInFrames: p.duration_frames },
    stills: stillsDir ? req.stills.map((frame) => ({ frame, out: join(stillsDir, `${frame}.png`) })) : [],
    output: req.output
      ? { out: req.output.path, crf: req.output.crf, scale: req.output.scale, audioBitrateKbps: req.output.audioBitrateKbps, x264Preset: req.output.x264Preset, frameRange: req.range ?? null }
      : null,
    timeoutMs: innerTimeoutMs(req.timeoutMs),
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
      ? fail("timeout", `рендер таймлайна не уложился в ${req.timeoutMs} мс; группа процессов убита`, { browserLogs: logs })
      : fail("aborted", "рендер таймлайна отменён; группа процессов убита", { browserLogs: logs });

  let orphaned = false;
  const tracked = { cwd: runTmp, env, signal: ac.signal, registry };
  try {
    if (ac.signal.aborted) return interrupted([]);
    // Ревью I3: вызову Remotion — вырезка master под его кадры, а не весь master (master-cut.ts)
    const mp = await spawn(root, ref, ffprobe, [...FFPROBE_ARGS, p.video.path], tracked);
    if (mp.orphaned) {
      orphaned = true;
      return fail("orphaned", "группа ffprobe master не исчезла после SIGKILL; запись оставлена в run/processes/, попытка не завершена (stale_process)");
    }
    if (why) return interrupted([]);
    let masterFrames: number;
    try {
      if (mp.code !== 0) throw new Error(`код ${mp.code}: ${tail(mp.stderr)}`);
      masterFrames = Math.round((parseProbe(mp.stdout).durationMs * p.fps.num) / (p.fps.den * 1000));
    } catch (e) {
      return fail("probe", `ffprobe master ${p.video.path}: ${(e as Error).message}`);
    }
    const ranges: [number, number][] = [...req.stills.map((f): [number, number] => [f, f]), ...(req.output ? [req.range ?? [0, p.duration_frames - 1]] : [])];
    const cuts: Record<string, string> = {};
    const made = new Map<string, string>();
    const sources: (TimelineVideoSource | undefined)[] = [];
    for (const [a, b] of ranges) {
      const plan = planVideo(p.video.sequences, a, b, p.fps, masterFrames);
      if (plan.kind === "full") {
        sources.push(undefined);
        continue;
      }
      if (plan.kind === "none") {
        sources.push({ file: "video", sequences: [] });
        continue;
      }
      let file = made.get(`${plan.start}:${plan.frames}`);
      if (file === undefined) {
        file = `cut${made.size}`;
        const out = join(runTmp, `${file}.mp4`);
        const c = await spawn(root, ref, ffmpeg, cutArgs(p.video.path, out, plan.start, plan.frames, p.fps), tracked);
        if (c.orphaned) {
          orphaned = true;
          return fail("orphaned", "группа ffmpeg вырезки master не исчезла после SIGKILL; запись оставлена в run/processes/, попытка не завершена (stale_process)");
        }
        if (why) return interrupted([]);
        if (c.code !== 0) return fail("media", `вырезка master [${plan.start}, +${plan.frames}): ffmpeg код ${c.code}: ${tail(c.stderr)}`);
        made.set(`${plan.start}:${plan.frames}`, file);
        cuts[file] = out;
      }
      sources.push({ file, sequences: plan.sequences });
    }
    if (made.size > 0) job.media.cuts = cuts;
    job.stills = job.stills.map((s, i) => (sources[i] ? { ...s, video: sources[i] } : s));
    const outSource = req.output ? sources.at(-1) : undefined;
    if (job.output && outSource) job.output.video = outSource;

    const w = await spawn(root, ref, process.execPath, [...NODE_ARGS, TIMELINE_WORKER_PATH], {
      cwd: runTmp, env, signal: ac.signal, stdin: JSON.stringify(job), killGraceMs: deps.killGraceMs ?? 5000, registry,
    });
    const out = parseWorkerOutput(w.stdout);
    allowedOrigins = parseOrigins(w.stdout);
    if (w.orphaned) {
      orphaned = true;
      return fail("orphaned", "группа worker таймлайна не исчезла после SIGKILL; запись оставлена в run/processes/, попытка не завершена (stale_process)", { browserLogs: out.logs });
    }
    const strays = await reapByMarker(runTmp + "/", { graceMs: 0, waitMs: STRAY_WAIT_MS });
    const browsers = await settleBrowserRecords(fileProcessRegistry(root), { ...ref, renderId });
    if (strays.length > 0 || browsers.length > 0) {
      orphaned = true;
      const pids = [...new Set([...strays.map((x) => x.pid), ...browsers.map((x) => x.pid)])].join(", ");
      return fail("orphaned", `Chrome (pid ${pids}) не исчез после SIGKILL; записи оставлены в run/processes/, попытка не завершена (stale_process)`, { browserLogs: out.logs });
    }
    await removeLeftovers(bundlesDir, outDir);
    if (why) return interrupted(out.logs);
    const r = out.result as TimelineWorkerResult | undefined;
    if (!r) {
      const stage = out.stage ?? "bundle";
      return fail(stage, `worker таймлайна завершился (code ${w.code}, signal ${w.signal}) без результата на этапе ${stage}: ${tail(w.stderr)}`, { browserLogs: out.logs });
    }
    if (r.allowedOrigins?.length) allowedOrigins = r.allowedOrigins;
    const browserLogs = out.logs.length > 0 ? out.logs : r.browserLogs;
    const bytes = r.mediaBytes !== undefined ? { mediaBytes: r.mediaBytes } : {};
    if (!r.ok) return { ok: false, stills: r.stills, browserLogs, allowedOrigins, ...bytes, error: r.error ?? { stage: out.stage ?? "media", message: "worker таймлайна не отработал" } };
    if (!req.output) return { ok: true, stills: r.stills, browserLogs, allowedOrigins, ...bytes };
    if (!r.outPath) return fail("media", "worker таймлайна не вернул файл", { stills: r.stills, browserLogs, ...bytes });

    const pr = await spawn(root, ref, ffprobe, [...FFPROBE_ARGS, r.outPath], tracked);
    if (pr.orphaned) {
      orphaned = true;
      return fail("orphaned", "группа ffprobe не исчезла после SIGKILL; запись оставлена в run/processes/, попытка не завершена (stale_process)", { browserLogs });
    }
    if (why) return interrupted(browserLogs);
    const base = { stills: r.stills, outPath: r.outPath, browserLogs, ...bytes };
    if (pr.code !== 0) return fail("probe", `ffprobe завершился с кодом ${pr.code}: ${tail(pr.stderr)}`, base);
    try {
      return { ok: true, ...base, allowedOrigins, probe: parseProbe(pr.stdout) };
    } catch (e) {
      return fail("probe", (e as Error).message, base);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (orphaned) await rename(runTmp, `${runTmp}.quarantined`).catch(() => undefined);
    else await rm(runTmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
