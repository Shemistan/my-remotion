// Дочерний процесс рендера: bundle → selectComposition → renderStill по кадрам →
// renderMedia (H.264); в режиме export — один renderMedia файла экспорта (MP4 H.264/AAC или
// ProRes 4444 с альфой) с той же защитой. Запускается renderVersion через spawnTracked как
// `node --disable-warning=ExperimentalWarning worker.ts` — встроенное в Node 22.18+
// стирание типов, без сборки и загрузчиков. Поэтому локальные модули — `import type`
// (стираются целиком) или явный `.ts` без зависимостей кроме node:* (resolve-jail.ts);
// рантайм-импорты — из node:* и @remotion/*.
//
// Протокол stdout: строки `@@ms:stage <stage>` (начат этап) и `@@ms:log <json-строка>`
// (лог браузера) идут по ходу работы — родитель видит их даже после убийства по
// таймауту; ПОСЛЕДНЯЯ строка — JSON WorkerResult. Задание приходит JSON-ом в stdin.
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import type * as Renderer from "@remotion/renderer";
import type { BrowserLog, HeadlessBrowser } from "@remotion/renderer";
import type { WorkerJob, WorkerResult, WorkerStage } from "./protocol.js";
// .ts явно: worker исполняется стиранием типов Node, без загрузчика
import { type AssetPolicy, blockingOnDownload, installAssetGuard } from "./asset-guard.ts";
import { jailResolve } from "./resolve-jail.ts";
import { runSweep } from "./sweep.ts";

// Рендерер — CJS-сборка через require, а не ESM: только в ней installAssetGuard может
// подменить downloadAsset (asset-guard.ts); ESM-сборка Remotion — один файл без швов.
const { openBrowser, renderFrames, renderMedia, renderStill, selectComposition } = createRequire(import.meta.url)("@remotion/renderer") as typeof Renderer;

const STAGE = "@@ms:stage ";
const LOG = "@@ms:log ";
// Remotion пишет в консоль сам; оставляем только ошибки, чтобы не путать протокол.
const LOG_LEVEL = "error";

// «A delayRender() "…" was called but not cleared after 13000ms»
const DELAY_RENDER_TIMEOUT = /delayRender\(\).*not cleared after \d+ms/s;

const browserLogs: string[] = [];
let stage: WorkerStage = "bundle";
let browser: HeadlessBrowser | undefined;

function startStage(s: WorkerStage): void {
  stage = s;
  process.stdout.write(`${STAGE}${s}\n`);
}

function pushLog(line: string): void {
  browserLogs.push(line);
  process.stdout.write(`${LOG}${JSON.stringify(line)}\n`);
}

function onBrowserLog(log: BrowserLog): void {
  pushLog(`[${log.type}] ${log.text}`);
}

/** Отказ asset-guard — в лог рендера: браузер видит лишь 500 от /proxy без причины. */
const onAssetBlocked = (message: string) => pushLog(`[asset-guard] ${message}`);

function finish(result: WorkerResult): void {
  process.stdout.write(JSON.stringify(result) + "\n", () => process.exit(result.ok ? 0 : 1));
}

// SIGTERM от spawnTracked: выходим сразу. Обработчик `exit` в Remotion добивает группу
// Chrome (он запущен detached, в своей группе); без этого Node с подписчиком SIGTERM
// не завершился бы до SIGKILL.
process.on("SIGTERM", () => process.exit(143));

async function readStdin(): Promise<string> {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

function parseJob(text: string): WorkerJob {
  const job = JSON.parse(text) as Partial<WorkerJob>;
  const need = ["entryPoint", "bundleDir", "rootDir", "nodeModules", "motionKitDir", "browserExecutable", "chrome"] as const;
  for (const k of need) if (typeof job[k] !== "string") throw new Error(`worker: в задании нет ${k}`);
  if (!job.composition || job.preview === undefined || job.export === undefined || !job.run || !Array.isArray(job.stills) || typeof job.timeoutMs !== "number") {
    throw new Error("worker: неполное задание");
  }
  if (job.mode !== "render" && job.mode !== "export") throw new Error(`worker: неизвестный режим ${JSON.stringify(job.mode)}`);
  if (job.mode === "export" && (!job.export || job.preview !== null || job.stills.length > 0)) {
    throw new Error("worker: режим export — только export, без стоп-кадров и превью");
  }
  return job as WorkerJob;
}

/** Бандл из кэша или новая сборка во временный каталог с атомарной публикацией. */
async function ensureBundle(job: WorkerJob): Promise<string> {
  if (existsSync(join(job.bundleDir, "index.html"))) return job.bundleDir;
  const tmp = `${job.bundleDir}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  const built = bundle({
    entryPoint: job.entryPoint,
    outDir: tmp,
    rootDir: job.rootDir,
    // свой кэш бандлов по contentKey; кэш webpack писал бы в node_modules/.cache
    enableCaching: false,
    ignoreRegisterRootWarning: true,
    // Модули — только из node_modules workspaces, без поиска вверх от draft
    // (resolve-jail.ts): подменить пакет файлом в draft нельзя.
    webpackOverride: (config) => ({
      ...config,
      resolve: jailResolve(config.resolve, { nodeModules: job.nodeModules, motionKitDir: job.motionKitDir }),
    }),
  });
  try {
    await built;
  } catch (e) {
    await rm(tmp, { recursive: true, force: true });
    throw e;
  }
  try {
    await rename(tmp, job.bundleDir);
  } catch (e) {
    // параллельный рендер того же содержимого успел первым — берём его бандл
    if (!existsSync(join(job.bundleDir, "index.html"))) throw e;
    await rm(tmp, { recursive: true, force: true });
  }
  return job.bundleDir;
}

/** Свободный TCP-порт на 127.0.0.1 (там слушает сервер бандла Remotion). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => (port > 0 ? resolve(port) : reject(new Error("worker: не удалось выбрать порт сервера бандла"))));
    });
  });
}

async function run(job: WorkerJob): Promise<WorkerResult> {
  startStage("bundle");
  const serveUrl = await ensureBundle(job);

  startStage("still");
  // для chrome-wrapper.sh: Remotion запускает браузер с env этого процесса
  process.env.MS_CHROME = job.chrome;
  process.env.MS_RUN_ROOT = job.run.root;
  process.env.MS_RUN_ID = job.run.runId;
  process.env.MS_RUN_ATTEMPT = String(job.run.attempt);
  if (job.run.renderId !== undefined) process.env.MS_RENDER_ID = job.run.renderId;
  // Порт сервера бандла выбираем сами и до запуска Chrome: обёртка пускает напрямую
  // только его, остальной loopback (Control API 127.0.0.1:8790) закрыт прокси.
  const port = await freePort();
  process.env.MS_BUNDLE_PORT = String(port);
  // Node-сторона того же сервера (/proxy, звук renderMedia) идёт мимо прокси Chrome:
  // качать можно только файлы самого бандла (и data:). Ставится до первого запуска
  // сервера (selectComposition, у которого нет хука onDownload).
  const assets: AssetPolicy = { bundlePort: port };
  installAssetGuard(assets, onAssetBlocked);
  browser = await openBrowser("chrome", {
    browserExecutable: job.browserExecutable,
    chromeMode: "headless-shell",
    logLevel: LOG_LEVEL,
  });
  const common = {
    serveUrl,
    inputProps: job.inputProps,
    puppeteerInstance: browser,
    browserExecutable: job.browserExecutable,
    timeoutInMilliseconds: job.timeoutMs,
    onBrowserLog,
    logLevel: LOG_LEVEL,
    chromeMode: "headless-shell",
    port,
  } as const;
  // официальный хук Remotion — второй рубеж за installAssetGuard
  const onDownload = blockingOnDownload(assets, onAssetBlocked);
  const selected = await selectComposition({ ...common, id: "Scene" });
  // настройки сцены — поверх композиции из бандла: бандл кэшируется по содержимому
  const composition = { ...selected, ...job.composition };

  if (job.mode === "export" && job.export) {
    // Экспорт: один renderMedia с настройками кодека, защита та же, что у превью (common —
    // обёртка Chrome и порт бандла, onDownload — asset-guard). Временное имя рядом с `out`
    // и rename: недописанный файл не выглядит готовым.
    const ex = job.export;
    startStage("media");
    const tmpOut = join(ex.out, "..", `.export-${process.pid}.tmp.${ex.codec === "prores" ? "mov" : "mp4"}`);
    const codecOptions =
      ex.codec === "prores"
        ? { codec: "prores", proResProfile: ex.proResProfile, pixelFormat: ex.pixelFormat, imageFormat: ex.imageFormat } as const
        : { codec: "h264", crf: ex.crf, audioCodec: ex.audioCodec, enforceAudioTrack: ex.enforceAudioTrack } as const;
    await renderMedia({ ...common, onDownload, composition, ...codecOptions, scale: ex.scale, outputLocation: tmpOut, overwrite: true });
    await rename(tmpOut, ex.out);
    return { ok: true, stills: [], exportPath: ex.out, browserLogs };
  }

  const stills: string[] = [];
  for (const s of job.stills) {
    // реестр раскладки motion-kit (0.4.0): только кадры-стоп печатают `[motion-kit:layout]`;
    // флаг — во входных props (getInputProps), props композиции сцены не меняются
    await renderStill({ ...common, inputProps: { ...job.inputProps, __msLayoutProbe: true }, onDownload, composition, frame: s.frame, output: s.out, imageFormat: "png", overwrite: true });
    stills.push(s.out);
  }

  if (!job.preview) return { ok: true, stills, browserLogs };
  startStage("media");
  // временное имя: недописанное превью не выглядит готовым
  const tmpOut = join(job.preview.out, "..", `.preview-${process.pid}.tmp.mp4`);
  await renderMedia({
    ...common,
    onDownload,
    composition,
    codec: "h264",
    crf: job.preview.crf,
    scale: job.preview.scale,
    outputLocation: tmpOut,
    overwrite: true,
  });
  await rename(tmpOut, job.preview.out);
  if (job.sweep) {
    // временной проход пробы (S15b): только DOM-замеры каждого N-го кадра, без снимков; падение
    // страницы — один повтор в новой странице (S17b); сбой не роняет рендер — QA пометит пропуск
    const sweep = job.sweep;
    await runSweep(
      () => renderFrames({
        ...common, onDownload, composition, inputProps: { ...job.inputProps, __msLayoutProbe: "sweep" }, imageFormat: "none", outputDir: null,
        everyNthFrame: sweep.every, scale: sweep.scale, onStart: () => undefined, onFrameUpdate: () => undefined,
      }),
      pushLog,
    );
  }
  return { ok: true, stills, previewPath: job.preview.out, browserLogs };
}

async function main(): Promise<void> {
  let job: WorkerJob;
  try {
    job = parseJob(await readStdin());
  } catch (e) {
    finish({ ok: false, stills: [], browserLogs, error: { stage: "bundle", message: (e as Error).message } });
    return;
  }
  let result: WorkerResult;
  try {
    result = await run(job);
  } catch (e) {
    const err = e as Error;
    const message = err.stack ?? err.message;
    // таймаут delayRender Remotion (он чуть короче внешнего) — это тоже таймаут рендера
    const timedOut = DELAY_RENDER_TIMEOUT.test(err.message);
    result = { ok: false, stills: [], browserLogs, error: { stage: timedOut ? "timeout" : stage, message } };
  }
  await browser?.close({ silent: true }).catch(() => undefined);
  finish(result);
}

void main();
