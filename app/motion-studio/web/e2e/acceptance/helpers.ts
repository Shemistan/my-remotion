// Приёмка Phase 1 (Task 22): общее для спецификаций — хранилище на SSD, состояние прогона,
// сервер (`node --import tsx server/src/main.ts` = `npm start`, один процесс: `kill -9` бьёт
// именно владельца owner-lock), действия через UI с реальными агентами, чтение studio.db
// (readonly), evidence и журнал проверок [A].
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, type Page, expect } from "@playwright/test";
import Database from "better-sqlite3";
import type { Job, SceneDetailDto, Settings, VersionDto } from "@ms/contracts";
import { renderVersion } from "@ms/render";
import { type LayoutFrame, parseLayout } from "../../../server/src/qa/layout.js";

export const APP = fileURLToPath(new URL("../../../", import.meta.url));
export const REPO = join(APP, "../..");
export const ACC_ROOT = "/Volumes/External SSD/MotionStudio-acceptance";
export const ACC_DIR = join(REPO, "tmp/acceptance");
export const STATE_FILE = join(ACC_DIR, "state.json");
export const EVIDENCE = join(REPO, "docs/evidence/phase-1");
export const PORT = 8790;
export const BASE = `http://127.0.0.1:${PORT}`;
export const GEN_TIMEOUT = 30 * 60_000;

export const TEST1 =
  "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении";
export const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";
export const PURPLE = "сделай всё в фиолетовых тонах";
export const TEST3 = "Уменьши скорость анимации на 25 %, сделай карточки более объёмными, сохрани композицию и верни цветовую палитру из первой версии";

export interface SeededScene {
  sceneId: string;
  versionIds: string[];
}
export interface Generated {
  sceneId: string;
  jobId: string;
  versionId: string | null;
  status: Job["status"];
  wallMs: number;
}
export interface AccState {
  runDir: string;
  serverPid: number;
  serverLog: string;
  hooksDir: string;
  scratchRoot: string;
  fixtures: { projectId: string; kit: SeededScene; hang: SeededScene };
  projectId?: string;
  test1?: Generated & { exportId?: string };
  test2?: Generated;
  test3?: { v2: Generated; v3: Generated; exportId?: string; exportProbe?: Probe };
  [k: string]: unknown;
}

export function state(): AccState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AccState;
}
export function saveState(patch: Partial<AccState>): AccState {
  const next = { ...state(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}

/** Продолжение прогона (MS_ACC_REUSE=1): готовые шаги берутся из state.json, не повторяются. */
export const REUSE = process.env.MS_ACC_REUSE === "1";

export const sleep =(ms: number) => new Promise((r) => setTimeout(r, ms));

export function portBusy(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port: PORT });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitHealthy(timeoutMs = 120_000): Promise<{ storage: string }> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return (await r.json()) as { storage: string };
    } catch {
      // ещё не слушает
    }
    if (Date.now() > until) throw new Error(`сервер не ответил на /api/health за ${timeoutMs} мс`);
    await sleep(500);
  }
}

/** Окружение сервера приёмки: SSD-хранилище, тестовые хуки только для приёмки (без маршрутов). */
export function serverEnv(hooksDir: string): NodeJS.ProcessEnv {
  return { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_TEST_HOOKS: "1", MS_TEST_HOOKS_DIR: hooksDir, MS_LOG_LEVEL: "warn" };
}

/** Запускает сервер (тот же `server/src/main.ts`, что `npm start`) и ждёт `/api/health`. */
export async function startServer(opts: { hooksDir?: string; serverLog?: string } = {}): Promise<ChildProcess> {
  const st = existsSync(STATE_FILE) ? state() : undefined;
  const hooksDir = opts.hooksDir ?? st!.hooksDir;
  const serverLog = opts.serverLog ?? st!.serverLog;
  if (await portBusy()) throw new Error(`порт ${PORT} занят`);
  const fd = openSync(serverLog, "a");
  const child = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], { cwd: APP, env: serverEnv(hooksDir), stdio: ["ignore", fd, fd] });
  child.unref();
  await waitHealthy();
  if (st) saveState({ serverPid: child.pid! });
  return child;
}

/** Убивает сервер сигналом и ждёт, пока процесс исчезнет и порт освободится. */
export async function killServer(signal: "SIGKILL" | "SIGTERM" = "SIGKILL"): Promise<void> {
  const { serverPid } = state();
  if (alive(serverPid)) process.kill(serverPid, signal);
  const until = Date.now() + 60_000;
  while ((alive(serverPid) || (await portBusy())) && Date.now() < until) await sleep(200);
  if (alive(serverPid)) throw new Error(`сервер ${serverPid} жив после ${signal}`);
}

// --- studio.db (readonly) ---

export function db<T>(fn: (d: Database.Database) => T): T {
  const d = new Database(join(ACC_ROOT, "studio.db"), { readonly: true, fileMustExist: true });
  try {
    return fn(d);
  } finally {
    d.close();
  }
}
export const versionDir = (versionId: string) =>
  join(ACC_ROOT, db((d) => (d.prepare("SELECT path FROM scene_versions WHERE id = ?").pluck().get(versionId) as string)));
export const jobCost = (jobId: string) =>
  db((d) => (d.prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM agent_runs WHERE job_id = ?").pluck().get(jobId) as number));

// --- API ---

export async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(path);
  expect(r.ok(), `${path}: ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}
export const scene = (request: APIRequestContext, id: string) => getJson<SceneDetailDto>(request, `/api/scenes/${id}`);
export const version = (request: APIRequestContext, id: string) => getJson<VersionDto>(request, `/api/versions/${id}`);
export const job = async (request: APIRequestContext, id: string) => (await getJson<{ job: Job }>(request, `/api/jobs/${id}`)).job;

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled", "blocked"]);

/**
 * Ждёт завершения задачи. UI обновляется по SSE; оракул — `GET /api/jobs/:id`. Уточнения
 * Concept (`awaiting_input`) пропускаются кнопкой «Пропустить» в UI, если страница сцены
 * открыта (иначе — тем же запросом, что шлёт UI).
 */
export async function waitJob(page: Page, jobId: string, timeoutMs = GEN_TIMEOUT): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = await job(page.request, jobId);
    if (TERMINAL.has(j.status)) return j;
    if (j.status === "awaiting_input") {
      const panel = page.getByRole("region", { name: "Уточняющие вопросы" });
      if (await panel.isVisible().catch(() => false)) await panel.getByRole("button", { name: "Пропустить" }).click();
      else await page.request.post(`/api/jobs/${jobId}/input`, { data: { skip: true } });
      await sleep(3000);
      continue;
    }
    if (Date.now() > until) throw new Error(`задача ${jobId} не завершилась за ${timeoutMs} мс (${j.status}, ${j.stage})`);
    await sleep(5000);
  }
}

const latestVersion = (d: SceneDetailDto) => [...d.versions].sort((a, b) => b.number - a.number)[0];

/**
 * Новая сцена через UI на странице проекта: промпт → «Сгенерировать» → страница сцены →
 * ожидание задачи (до 30 мин).
 */
export async function generateViaUi(page: Page, prompt: string): Promise<Generated> {
  await page.getByLabel("Что показать").fill(prompt);
  const t0 = Date.now();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/projects\/[^/]+\/scenes$/.test(r.url())),
    page.getByRole("button", { name: "Сгенерировать" }).click(),
  ]);
  const created = (await resp.json()) as { scene: { id: string }; job: Job };
  await page.waitForURL(new RegExp(`/scenes/${created.scene.id}`));
  const j = await waitJob(page, created.job.id);
  const d = await scene(page.request, created.scene.id);
  const v = latestVersion(d);
  return { sceneId: created.scene.id, jobId: j.id, versionId: v?.version_id ?? null, status: j.status, wallMs: Date.now() - t0 };
}

/** Правка через чат сцены (страница сцены открыта): текст → «Отправить» → задача → версия. */
export async function chatEditViaUi(page: Page, sceneId: string, text: string): Promise<Generated> {
  const t0 = Date.now();
  await page.getByRole("region", { name: "Чат" }).getByLabel("Сообщение").fill(text);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${sceneId}/messages`)),
    page.getByRole("button", { name: "Отправить" }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(202);
  const jobId = ((await resp.json()) as { job: Job }).job.id;
  const j = await waitJob(page, jobId);
  const out = (j.output_refs as { version_id?: string } | null)?.version_id;
  const v = out ?? latestVersion(await scene(page.request, sceneId))?.version_id ?? null;
  return { sceneId, jobId, versionId: v, status: j.status, wallMs: Date.now() - t0 };
}

export interface Probe {
  video: { codec_name: string; width: number; height: number; r_frame_rate: string; duration?: string; pix_fmt?: string };
  audio?: { codec_name: string };
  durationS: number;
}
export function probe(path: string): Probe {
  const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path], { encoding: "utf8" })) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; duration?: string; pix_fmt?: string }[];
    format: { duration: string };
  };
  const video = p.streams.find((s) => s.codec_type === "video")!;
  const audio = p.streams.find((s) => s.codec_type === "audio");
  return { video: video as Probe["video"], ...(audio ? { audio } : {}), durationS: Number(video.duration ?? p.format.duration) };
}

/**
 * «Экспорт» открытой версии через UI → задача → «Скачать» → файл в каталоге прогона.
 * Возвращает id задачи и экспорта, путь скачанного файла и ffprobe.
 */
export async function exportViaUi(page: Page, format: "mp4" | "prores4444" = "mp4"): Promise<{ jobId: string; exportId: string; path: string; probe: Probe }> {
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Экспорт версии" });
  await dialog.getByLabel(format === "mp4" ? "MP4 (H.264 + AAC)" : "ProRes 4444 с альфа-каналом").check();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/versions\/[^/]+\/exports$/.test(r.url())),
    dialog.getByRole("button", { name: "Экспортировать" }).click(),
  ]);
  const jobId = ((await resp.json()) as { job: Job }).job.id;
  const j = await waitJob(page, jobId, 20 * 60_000);
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const exportId = (j.output_refs as { export_id: string }).export_id;
  const link = page.locator(".export-job").getByRole("link", { name: "Скачать" });
  await expect(link).toBeVisible({ timeout: 60_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const path = join(state().runDir, `${exportId}.${format === "mp4" ? "mp4" : "mov"}`);
  await file.saveAs(path);
  return { jobId, exportId, path, probe: probe(path) };
}

/**
 * Проверочный рендер опубликованной версии: стоп-кадры в отдельный каталог (`outDir`,
 * исходники не копируются), процессы и кэш — в tmp-хранилище прогона, не в хранилище
 * приёмки. Возвращает каталог кадров, журнал браузера и реестр раскладки motion-kit.
 */
export async function renderFrames(versionId: string, frames: number[], tag: string): Promise<{ out: string; logs: string[]; layout: LayoutFrame[]; settings: Settings }> {
  const { scratchRoot } = state();
  const dir = versionDir(versionId);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as Settings;
  const out = join(state().runDir, "renders", `${tag}-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  mkdirSync(join(scratchRoot, "cache"), { recursive: true });
  const r = await renderVersion({
    versionDir: dir, outDir: out, settings, cacheDir: join(scratchRoot, "cache"), stills: frames, preview: null, timeoutMs: 10 * 60_000,
    run: { root: scratchRoot, runId: `acc-${tag}-${Date.now()}`, attempt: 1 },
  });
  expect(r.ok, `проверочный рендер ${tag}: ${JSON.stringify(r.error)}`).toBe(true);
  return { out, logs: r.browserLogs, layout: parseLayout(r.browserLogs), settings };
}

/** Evidence версии или экспорта (`scripts/collect-evidence.mjs`), итог — JSON. */
export function collect(id: string, dest: string): Record<string, unknown> {
  mkdirSync(dest, { recursive: true });
  const out = execFileSync(process.execPath, [join(APP, "scripts/collect-evidence.mjs"), id, dest], {
    cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT }, encoding: "utf8", timeout: 300_000,
  });
  return JSON.parse(out.trim().split("\n").at(-1)!) as Record<string, unknown>;
}

export async function shot(page: Page, dir: string, name: string): Promise<void> {
  mkdirSync(join(EVIDENCE, dir, "ui"), { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, dir, "ui", `${name}.png`), fullPage: true });
}

/** Проверки [A] с итогом в `<evidence>/<dir>/checks.json`; провал — мягкий (видны все). */
export class Checks {
  readonly rows: { id: string; title: string; kind: string; pass: boolean; detail: string }[] = [];
  constructor(private readonly dir: string) {}
  check(id: string, title: string, pass: boolean, detail: unknown = "", kind = "A"): boolean {
    const d = typeof detail === "string" ? detail : JSON.stringify(detail);
    this.rows.push({ id, title, kind, pass, detail: d });
    expect.soft(pass, `${id} ${title}: ${d}`).toBe(true);
    this.save();
    return pass;
  }
  note(id: string, title: string, detail: unknown, kind = "H"): void {
    this.rows.push({ id, title, kind, pass: true, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
    this.save();
  }
  save(): void {
    mkdirSync(join(EVIDENCE, this.dir), { recursive: true });
    writeFileSync(join(EVIDENCE, this.dir, "checks.json"), JSON.stringify(this.rows, null, 2) + "\n");
  }
}

export function writeEvidence(dir: string, name: string, data: unknown): void {
  mkdirSync(join(EVIDENCE, dir), { recursive: true });
  writeFileSync(join(EVIDENCE, dir, name), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
}

/** Проигрывание в плеере: `currentTime` растёт. */
export async function plays(page: Page): Promise<number> {
  const video = page.locator(".player video");
  await expect(video).toHaveJSProperty("readyState", 4, { timeout: 60_000 });
  await page.getByRole("button", { name: "Воспроизвести" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
  const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.getByRole("button", { name: "Пауза" }).click();
  return t;
}
