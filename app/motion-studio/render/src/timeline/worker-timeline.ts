// Дочерний процесс рендера таймлайна (Task 36): медиасервер → bundle → selectComposition
// `ProjectTimeline` → стоп-кадры (renderStill) и/или файл диапазона (renderMedia H.264/AAC 48 кГц).
// Запускается renderTimelineRange через spawnTracked как `node --disable-warning=ExperimentalWarning
// worker-timeline.ts` (стирание типов Node 22.18+, без сборки): локальные модули — `import type`
// или явный `.ts` только с node:*-зависимостями; рантайм — node:* и @remotion/*.
//
// Защита та же, что у рендера версии (worker.ts): обёртка Chrome без сети (chrome-wrapper.sh,
// напрямую — только порт сервера бандла), asset-guard Node-загрузок Remotion, TMPDIR попытки.
// Отличие одно: `AssetPolicy.media` — медиасервер этого процесса (`serveMedia`, 127.0.0.1:0,
// токен в пути), с которого Node-сторона Remotion качает master и звук. Медиасервер живёт в
// процессе worker: убийство группы по таймауту или отмене гасит и его.
//
// Ревью I3: Remotion на каждый renderStill/renderMedia заводит новый каталог загрузок и качает
// `src` целиком, поэтому вызову отдаётся не master, а его вырезка под кадры вызова (`cut<N>`,
// режет renderTimelineRange); `mediaBytes` результата — сколько медиасервер отдал.
//
// Протокол stdout — как у worker.ts: `@@ms:stage <stage>`, `@@ms:log <json>`, `@@ms:origins <json>`
// (разрешённые origin — родитель видит их и после убийства); ПОСЛЕДНЯЯ строка — JSON результата.
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import type * as Renderer from "@remotion/renderer";
import type { BrowserLog, HeadlessBrowser } from "@remotion/renderer";
import type { WorkerStage } from "../node/protocol.js";
import type { TimelineVideoSource, TimelineWorkerJob, TimelineWorkerResult } from "./protocol.js";
// .ts явно: исполняется стиранием типов Node, без загрузчика
import { type AssetPolicy, blockingOnDownload, installAssetGuard } from "../node/asset-guard.ts";
import { jailResolve } from "../node/resolve-jail.ts";
import { type MediaServer, serveMedia } from "./media-server.ts";

// CJS-сборка рендерера: только в ней installAssetGuard подменяет downloadAsset (asset-guard.ts)
const { openBrowser, renderMedia, renderStill, selectComposition } = createRequire(import.meta.url)("@remotion/renderer") as typeof Renderer;

const STAGE = "@@ms:stage ";
const LOG = "@@ms:log ";
const ORIGINS = "@@ms:origins ";
const LOG_LEVEL = "error";
const COMPOSITION = "ProjectTimeline";
const SAMPLE_RATE = 48_000;
const DELAY_RENDER_TIMEOUT = /delayRender\(\).*not cleared after \d+ms/s;

const browserLogs: string[] = [];
let allowedOrigins: string[] = [];
let stage: WorkerStage = "bundle";
let browser: HeadlessBrowser | undefined;
let media: MediaServer | undefined;

function startStage(s: WorkerStage): void {
  stage = s;
  process.stdout.write(`${STAGE}${s}\n`);
}

function pushLog(line: string): void {
  browserLogs.push(line);
  process.stdout.write(`${LOG}${JSON.stringify(line)}\n`);
}

const onBrowserLog = (log: BrowserLog) => pushLog(`[${log.type}] ${log.text}`);
const onAssetBlocked = (message: string) => pushLog(`[asset-guard] ${message}`);

function finish(result: TimelineWorkerResult): void {
  process.stdout.write(JSON.stringify(result) + "\n", () => process.exit(result.ok ? 0 : 1));
}

process.on("SIGTERM", () => process.exit(143));

async function readStdin(): Promise<string> {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

function parseJob(text: string): TimelineWorkerJob {
  const job = JSON.parse(text) as Partial<TimelineWorkerJob>;
  const need = ["entryPoint", "bundleDir", "rootDir", "nodeModules", "motionKitDir", "browserExecutable", "chrome"] as const;
  for (const k of need) if (typeof job[k] !== "string") throw new Error(`worker-timeline: в задании нет ${k}`);
  if (!job.composition || !job.props || !job.media || typeof job.media.video !== "string" || job.output === undefined || !job.run || !Array.isArray(job.stills) || typeof job.timeoutMs !== "number") {
    throw new Error("worker-timeline: неполное задание");
  }
  if (job.props.audio !== (job.media.audio !== undefined)) throw new Error("worker-timeline: props.audio и media.audio не согласованы");
  if (job.output === null && job.stills.length === 0) throw new Error("worker-timeline: нечего рендерить — ни кадров, ни файла");
  return job as TimelineWorkerJob;
}

async function ensureBundle(job: TimelineWorkerJob): Promise<string> {
  if (existsSync(join(job.bundleDir, "index.html"))) return job.bundleDir;
  const tmp = `${job.bundleDir}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  try {
    await bundle({
      entryPoint: job.entryPoint,
      outDir: tmp,
      rootDir: job.rootDir,
      enableCaching: false,
      ignoreRegisterRootWarning: true,
      // модули — только из node_modules workspaces (resolve-jail.ts), как у бандла сцены
      webpackOverride: (config) => ({ ...config, resolve: jailResolve(config.resolve, { nodeModules: job.nodeModules, motionKitDir: job.motionKitDir }) }),
    });
  } catch (e) {
    await rm(tmp, { recursive: true, force: true });
    throw e;
  }
  try {
    await rename(tmp, job.bundleDir);
  } catch (e) {
    if (!existsSync(join(job.bundleDir, "index.html"))) throw e;
    await rm(tmp, { recursive: true, force: true });
  }
  return job.bundleDir;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => (port > 0 ? resolve(port) : reject(new Error("worker-timeline: не удалось выбрать порт сервера бандла"))));
    });
  });
}

async function run(job: TimelineWorkerJob): Promise<TimelineWorkerResult> {
  startStage("bundle");
  // вырезки master (ревью I3) — свои ключи: Remotion качает файл целиком в каталог загрузок вызова
  media = await serveMedia({ ...job.media.cuts, video: job.media.video, ...(job.media.audio !== undefined ? { audio: job.media.audio } : {}) });
  const serveUrl = await ensureBundle(job);

  startStage("still");
  process.env.MS_CHROME = job.chrome;
  process.env.MS_RUN_ROOT = job.run.root;
  process.env.MS_RUN_ID = job.run.runId;
  process.env.MS_RUN_ATTEMPT = String(job.run.attempt);
  if (job.run.renderId !== undefined) process.env.MS_RENDER_ID = job.run.renderId;
  const port = await freePort();
  process.env.MS_BUNDLE_PORT = String(port);
  allowedOrigins = [media.origin, `http://localhost:${port}`, `http://127.0.0.1:${port}`];
  process.stdout.write(`${ORIGINS}${JSON.stringify(allowedOrigins)}\n`);
  // Node-сторона Remotion: файлы бандла и ровно медиасервер этого процесса с его токеном
  const assets: AssetPolicy = { bundlePort: port, media: { origin: media.origin, tokens: new Set([media.token]) } };
  installAssetGuard(assets, onAssetBlocked);
  browser = await openBrowser("chrome", { browserExecutable: job.browserExecutable, chromeMode: "headless-shell", logLevel: LOG_LEVEL });
  const server = media;
  const propsFor = (v: TimelineVideoSource | undefined): Record<string, unknown> => {
    const p: Record<string, unknown> = {
      ...job.props,
      video: { sequences: v?.sequences ?? job.props.video.sequences, src: server.urlFor(v?.file ?? "video") },
    };
    if (job.props.audio) p.audio = { src: server.urlFor("audio") };
    else delete p.audio;
    return p;
  };
  const inputProps = propsFor(undefined);
  const common = {
    serveUrl, inputProps, puppeteerInstance: browser, browserExecutable: job.browserExecutable, timeoutInMilliseconds: job.timeoutMs,
    onBrowserLog, logLevel: LOG_LEVEL, chromeMode: "headless-shell", port,
  } as const;
  const onDownload = blockingOnDownload(assets, onAssetBlocked);
  const selected = await selectComposition({ ...common, id: COMPOSITION });
  const composition = { ...selected, ...job.composition };
  // Remotion рендерит `composition.props` (разрешённые при selectComposition), а не `inputProps`
  // вызова: вырезка master — в обоих
  const callWith = (v: TimelineVideoSource | undefined) => {
    const props = propsFor(v);
    return { inputProps: props, composition: { ...composition, props } };
  };

  const stills: string[] = [];
  for (const s of job.stills) {
    await renderStill({ ...common, ...callWith(s.video), onDownload, frame: s.frame, output: s.out, imageFormat: "png", overwrite: true });
    stills.push(s.out);
  }
  if (!job.output) return { ok: true, stills, browserLogs, allowedOrigins, mediaBytes: media.bytesSent() };

  startStage("media");
  const out = job.output;
  // временное имя рядом с итоговым: недописанный файл не выглядит готовым
  const tmpOut = join(out.out, "..", `.timeline-${process.pid}.tmp.mp4`);
  await renderMedia({
    ...common, ...callWith(out.video), onDownload,
    codec: "h264", crf: out.crf, scale: out.scale, x264Preset: out.x264Preset,
    audioCodec: "aac", audioBitrate: `${out.audioBitrateKbps}k`, enforceAudioTrack: true, sampleRate: SAMPLE_RATE,
    frameRange: out.frameRange, outputLocation: tmpOut, overwrite: true, ...(out.colorSpace ? { colorSpace: out.colorSpace } : {}),
  });
  await rename(tmpOut, out.out);
  return { ok: true, stills, outPath: out.out, browserLogs, allowedOrigins, mediaBytes: media.bytesSent() };
}

async function main(): Promise<void> {
  let job: TimelineWorkerJob;
  try {
    job = parseJob(await readStdin());
  } catch (e) {
    finish({ ok: false, stills: [], browserLogs, allowedOrigins, error: { stage: "bundle", message: (e as Error).message } });
    return;
  }
  let result: TimelineWorkerResult;
  try {
    result = await run(job);
  } catch (e) {
    const err = e as Error;
    result = { ok: false, stills: [], browserLogs, allowedOrigins, ...(media ? { mediaBytes: media.bytesSent() } : {}), error: { stage: DELAY_RENDER_TIMEOUT.test(err.message) ? "timeout" : stage, message: err.stack ?? err.message } };
  }
  await browser?.close({ silent: true }).catch(() => undefined);
  await media?.close().catch(() => undefined);
  finish(result);
}

void main();
