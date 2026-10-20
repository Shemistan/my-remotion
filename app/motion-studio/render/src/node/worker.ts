// Дочерний процесс рендера: bundle → selectComposition → renderStill по кадрам →
// renderMedia (H.264). Запускается renderVersion через spawnTracked как
// `node --disable-warning=ExperimentalWarning worker.ts` — встроенное в Node 22.18+
// стирание типов, без сборки и загрузчиков. Поэтому здесь только `import type` из
// локальных файлов (стираются целиком) и рантайм-импорты из node:* и @remotion/*.
//
// Протокол stdout: строки `@@ms:stage <stage>` (начат этап) и `@@ms:log <json-строка>`
// (лог браузера) идут по ходу работы — родитель видит их даже после убийства по
// таймауту; ПОСЛЕДНЯЯ строка — JSON WorkerResult. Задание приходит JSON-ом в stdin.
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { type BrowserLog, type HeadlessBrowser, openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { WorkerJob, WorkerResult, WorkerStage } from "./protocol.js";

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

function onBrowserLog(log: BrowserLog): void {
  const line = `[${log.type}] ${log.text}`;
  browserLogs.push(line);
  process.stdout.write(`${LOG}${JSON.stringify(line)}\n`);
}

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
  if (!job.composition || !job.preview || !job.run || !Array.isArray(job.stills) || typeof job.timeoutMs !== "number") {
    throw new Error("worker: неполное задание");
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
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...(config.resolve?.alias as Record<string, string> | undefined), "@ms/motion-kit": job.motionKitDir },
        // entry и сцена лежат вне дерева пакета: обычный поиск вверх (вложенные
        // node_modules пакетов Remotion), затем node_modules workspaces
        modules: ["node_modules", job.nodeModules],
      },
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

async function run(job: WorkerJob): Promise<WorkerResult> {
  startStage("bundle");
  const serveUrl = await ensureBundle(job);

  startStage("still");
  // для chrome-wrapper.sh: Remotion запускает браузер с env этого процесса
  process.env.MS_CHROME = job.chrome;
  process.env.MS_RUN_ROOT = job.run.root;
  process.env.MS_RUN_ID = job.run.runId;
  process.env.MS_RUN_ATTEMPT = String(job.run.attempt);
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
  } as const;
  const selected = await selectComposition({ ...common, id: "Scene" });
  // настройки сцены — поверх композиции из бандла: бандл кэшируется по содержимому
  const composition = { ...selected, ...job.composition };

  const stills: string[] = [];
  for (const s of job.stills) {
    await renderStill({ ...common, composition, frame: s.frame, output: s.out, imageFormat: "png", overwrite: true });
    stills.push(s.out);
  }

  startStage("media");
  // временное имя: недописанное превью не выглядит готовым
  const tmpOut = join(job.preview.out, "..", `.preview-${process.pid}.tmp.mp4`);
  await renderMedia({
    ...common,
    composition,
    codec: "h264",
    crf: job.preview.crf,
    scale: job.preview.scale,
    outputLocation: tmpOut,
    overwrite: true,
  });
  await rename(tmpOut, job.preview.out);
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
