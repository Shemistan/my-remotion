// Приёмка Phase 4 (Task 41): общее для шагов — хранилище приёмки (APFS-копия проекта приёмки
// Phase 3: `materialsPath("acceptance", "phase4")`, оригинал acceptance/store не трогается), состояние
// прогона (`tmp/acceptance-video-scenes/state.json`), сервер на 127.0.0.1:<свой порт> (`server/src/main.ts`
// = `npm start`, один процесс), запросы к API с Origin и Idempotency-Key, studio.db (readonly),
// sha256 каталогов версий, evidence и проверки [A]. Личные кадры в evidence — только ≤ 480 px (V4).
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, type Locator, type Page, expect } from "@playwright/test";
import Database from "better-sqlite3";
import type { Job, VideoBatchDto, VideoSceneDto, VideoScenesStateDto } from "@ms/contracts";
import { materialsPath } from "../../../core/src/storage/materials.js";

export const APP = fileURLToPath(new URL("../../../", import.meta.url));
export const REPO = join(APP, "../..");
/** Хранилище приёмки Phase 4: копия (`cp -c`, клон APFS) хранилища приёмки Phase 2–3. */
export const ACC_ROOT = process.env.MS_ACC_ROOT ?? materialsPath("acceptance", "phase4");
/** Источник копии — только чтение (на нём не должно быть запущенного сервера, грабли №5). */
export const SRC_ROOT = materialsPath("acceptance", "store");
/** Порт приёмки — свой, не 8790 рабочего сервера (`server.port` в config.json копии). */
export const PORT = Number(process.env.MS_ACC_PORT ?? 8791);
export const BASE = `http://127.0.0.1:${PORT}`;
export const ORIGIN = BASE;
export const RUN_DIR = join(REPO, "tmp/acceptance-video-scenes");
export const STATE_FILE = join(RUN_DIR, "state.json");
export const EVIDENCE = join(REPO, "docs/evidence/phase-4");
/** Примеры для человека (README.txt рядом — только добавлять). */
export const EXAMPLES = materialsPath("examples", "phase4", "41-приёмка");
/** Проект приёмки Phase 3 (видеопроект с утверждённым планом). `MS_ACC_PROJECT` — другой. */
export const PROJECT_ID = process.env.MS_ACC_PROJECT ?? "prj_01M5Q5QWCS597HRDM4X9S74WEJ";

export interface StepTiming { wall_ms: number; cost_usd?: number; note?: string }
export interface AccState {
  runDir: string;
  serverPid: number;
  serverLog: string;
  projectId: string;
  planId?: string;
  /** Сцены пакета по порядку плана (item_id). */
  items?: string[];
  batches?: Record<string, string>;
  timings: Record<string, StepTiming>;
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
export function timing(step: string, t: StepTiming): void {
  saveState({ timings: { ...state().timings, [step]: t } });
}
export const log = (s: string): void => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HOME = homedir();
/** Evidence без личного: домашний каталог → `~`, поле `hostname` журналов pino вырезается. */
export function redact(text: string): string {
  return text.split(HOME).join("~").replace(/(\\*)"hostname\1":\1"[^"\\]*\1",?/g, "");
}

// --- сервер ---

export function portBusy(port = PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port });
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
export async function waitHealthy(timeoutMs = 180_000): Promise<{ storage: string }> {
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
export const serverEnv = (): NodeJS.ProcessEnv => ({ ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" });

/** Запускает сервер (тот же `server/src/main.ts`, что `npm start`) и ждёт `/api/health`. */
export async function startServer(): Promise<ChildProcess> {
  const { serverLog } = state();
  if (await portBusy()) throw new Error(`порт ${PORT} занят`);
  const fd = openSync(serverLog, "a");
  const child = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], { cwd: APP, env: serverEnv(), stdio: ["ignore", fd, fd] });
  child.unref();
  await waitHealthy();
  saveState({ serverPid: child.pid! });
  return child;
}
/** Останавливает сервер сигналом и ждёт, пока процесс исчезнет и порт освободится. */
export async function killServer(signal: "SIGKILL" | "SIGTERM" = "SIGKILL"): Promise<void> {
  const { serverPid } = state();
  if (alive(serverPid)) process.kill(serverPid, signal);
  const until = Date.now() + 120_000;
  while ((alive(serverPid) || (await portBusy())) && Date.now() < until) await sleep(300);
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
export const jobCost = (jobIds: readonly string[]): number =>
  jobIds.length === 0 ? 0 : db((d) => d.prepare(`SELECT COALESCE(SUM(cost_usd), 0) FROM agent_runs WHERE job_id IN (${jobIds.map(() => "?").join(",")})`).pluck().get(...jobIds) as number);
export const jobEvents = (jobId: string) =>
  db((d) => d.prepare("SELECT ts, level, kind, message FROM job_events WHERE job_id = ? AND kind != 'progress' ORDER BY id").all(jobId)) as { ts: string; level: string; kind: string; message: string }[];
export interface VersionRow { id: string; scene_id: string; number: number; status: string; parent_version_id: string | null; path: string; created_by_job_id: string | null; settings_json: string; manifest_sha256: string }
export const sceneVersions = (sceneId: string): VersionRow[] =>
  db((d) => d.prepare("SELECT id, scene_id, number, status, parent_version_id, path, created_by_job_id, settings_json, manifest_sha256 FROM scene_versions WHERE scene_id = ? ORDER BY number").all(sceneId)) as VersionRow[];
export const versionDir = (v: Pick<VersionRow, "path">): string => join(ACC_ROOT, v.path);
export const approvalsOf = (projectId: string) =>
  db((d) => d.prepare("SELECT id, kind, subject_ref, subject_hash, status, stale_reason, decided_at FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId)) as
    { id: string; kind: string; subject_ref: string; subject_hash: string; status: string; stale_reason: string | null; decided_at: string }[];
export const jobRow = (jobId: string) =>
  db((d) => d.prepare("SELECT id, status, stage, attempt, interrupts, started_at, finished_at, error_json, input_refs_json FROM jobs WHERE id = ?").get(jobId)) as
    { id: string; status: string; stage: string | null; attempt: number; interrupts: number; started_at: string | null; finished_at: string | null; error_json: string | null; input_refs_json: string };
export const liveProcesses = (jobId: string) =>
  db((d) => d.prepare("SELECT job_id, attempt, pid, pgid, cmd, started_at FROM job_processes WHERE job_id = ? AND ended_at IS NULL ORDER BY started_at").all(jobId)) as
    { job_id: string; attempt: number; pid: number; pgid: number; cmd: string; started_at: string }[];

/** QA-отчёт версии (последняя попытка): вердикты и замечания. */
export function qaOf(versionId: string): { verdicts: Record<string, string>; issues: { code: string; severity: string; source?: string; message?: string }[] } | undefined {
  const row = db((d) => d.prepare("SELECT technical, visual, semantic, style, report_path FROM qa_reports WHERE version_id = ? ORDER BY attempt DESC, id DESC LIMIT 1").get(versionId)) as
    { technical: string; visual: string; semantic: string; style: string; report_path: string } | undefined;
  if (!row) return undefined;
  const path = row.report_path.startsWith("/") ? row.report_path : join(ACC_ROOT, row.report_path);
  let issues: { code: string; severity: string; source?: string; message?: string }[] = [];
  try {
    const rep = JSON.parse(readFileSync(path, "utf8")) as { issues?: typeof issues };
    issues = rep.issues ?? [];
  } catch {
    // отчёт не читается — только вердикты
  }
  return { verdicts: { technical: row.technical, visual: row.visual, semantic: row.semantic, style: row.style }, issues };
}

// --- API ---

export async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(path);
  expect(r.ok(), `${path}: ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}
/** GET свежим fetch (без keep-alive сокета к остановленному серверу); сетевые ошибки — повтор до `waitMs`. */
export async function fetchJson<T>(path: string, waitMs = 5 * 60_000): Promise<T> {
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      const r = await fetch(`${BASE}${path}`);
      if (r.ok) return (await r.json()) as T;
      if (r.status < 500) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    } catch (e) {
      if (Date.now() > until || (e as Error).message.startsWith(`${path}:`)) throw e;
    }
    await sleep(3000);
  }
}
/** POST как у UI: Origin обязателен на мутациях, создающие — с Idempotency-Key. */
export async function post(request: APIRequestContext, path: string, data: unknown, key: string = randomUUID()) {
  return request.post(path, { data, headers: { Origin: ORIGIN, "Idempotency-Key": key } });
}
export const scenesState = (projectId = state().projectId) => fetchJson<VideoScenesStateDto>(`/api/projects/${projectId}/video/scenes`);
export const batchDto = (id: string) => fetchJson<VideoBatchDto>(`/api/video-batches/${id}`);
export const jobDto = async (id: string) => (await fetchJson<{ job: Job }>(`/api/jobs/${id}`)).job;
export const sceneOf = (st: VideoScenesStateDto, itemId: string): VideoSceneDto => {
  const s = st.scenes.find((x) => x.item_id === itemId);
  if (!s) throw new Error(`нет сцены ${itemId} в состоянии видеопроекта`);
  return s;
};

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled", "blocked"]);
export const terminal = (status: string): boolean => TERMINAL.has(status);

export async function waitJob(jobId: string, timeoutMs: number, pollMs = 10_000): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = await jobDto(jobId);
    if (terminal(j.status)) return j;
    if (Date.now() > until) throw new Error(`задача ${jobId} не завершилась за ${timeoutMs} мс (${j.status}, ${j.stage})`);
    await sleep(pollMs);
  }
}
/** Ждёт конца всех сцен пакетов опросом; `onTick` — между опросами (убийство процессов, рестарт). */
export async function waitBatches(ids: readonly string[], timeoutMs: number, onTick?: (b: VideoBatchDto[]) => Promise<void>, pollMs = 20_000): Promise<VideoBatchDto[]> {
  const t0 = Date.now();
  let lastLog = 0;
  for (;;) {
    const bs = await Promise.all(ids.map((id) => batchDto(id)));
    const items = bs.flatMap((b) => b.items);
    if (Date.now() - lastLog > 120_000) {
      lastLog = Date.now();
      log(`пакеты ${ids.join(",")}: ${items.map((x) => `${x.item_id}=${x.job?.status ?? x.status}${x.job?.stage ? `/${x.job.stage}` : ""}`).join(" ")} (${Math.round((Date.now() - t0) / 60_000)} мин)`);
    }
    if (items.every((x) => !x.job || terminal(x.job.status))) return bs;
    if (Date.now() - t0 > timeoutMs) throw new Error(`пакеты не закончились за ${timeoutMs} мс`);
    await onTick?.(bs);
    await sleep(pollMs);
  }
}

// --- файлы ---

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
/** sha256 каталога: отсортированные относительные пути и sha256 файлов. */
export function sha256Dir(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else h.update(`${relative(dir, p)}\0${sha256File(p)}\n`);
    }
  };
  walk(dir);
  return h.digest("hex");
}
/** sha256 большого файла потоково через shasum (исходники ≥ 1 ГБ). */
export const shasum = (path: string): string => execFileSync("shasum", ["-a", "256", path], { encoding: "utf8", maxBuffer: 1 << 20 }).split(" ")[0]!;

/** Кадр видео в PNG ≤ 480 px по ширине (личный ролик, V4). */
export function frame480(video: string, seconds: number, out: string): void {
  mkdirSync(join(out, ".."), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", seconds.toFixed(3), "-i", `file:${video}`, "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", out], { stdio: "ignore" });
}

// --- evidence ---

export function writeEvidence(dir: string, name: string, data: unknown): void {
  mkdirSync(join(EVIDENCE, dir), { recursive: true });
  writeFileSync(join(EVIDENCE, dir, name), redact(typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n"));
}
/** Скриншот страницы в `<evidence>/<dir>/ui/<name>.png`, уменьшенный до 480 px (лицо автора, V4). */
export async function shot(page: Page, dir: string, name: string): Promise<void> {
  const out = join(EVIDENCE, dir, "ui");
  mkdirSync(out, { recursive: true });
  const path = join(out, `${name}.png`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path, fullPage: false });
  execFileSync("sips", ["-Z", "480", path], { stdio: "ignore" });
}

/** Проверки [A] с итогом в `<evidence>/<dir>/checks.json`; провал — мягкий (видны все). */
export class Checks {
  readonly rows: { id: string; title: string; kind: string; pass: boolean; detail: string }[] = [];
  constructor(private readonly dir: string) {
    const f = join(EVIDENCE, dir, "checks.json");
    // повтор шага дописывает поверх: прежние строки с тем же id заменяются
    if (existsSync(f)) this.rows.push(...(JSON.parse(readFileSync(f, "utf8")) as Checks["rows"]));
  }
  check(id: string, title: string, pass: boolean, detail: unknown = "", kind = "A"): boolean {
    const d = typeof detail === "string" ? detail : JSON.stringify(detail);
    this.put({ id, title, kind, pass, detail: d });
    expect.soft(pass, `${id} ${title}: ${d}`).toBe(true);
    return pass;
  }
  note(id: string, title: string, detail: unknown, kind = "H"): void {
    this.put({ id, title, kind, pass: true, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  }
  private put(row: Checks["rows"][number]): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    mkdirSync(join(EVIDENCE, this.dir), { recursive: true });
    writeFileSync(join(EVIDENCE, this.dir, "checks.json"), redact(JSON.stringify(this.rows, null, 2) + "\n"));
  }
}

// --- UI ---

export async function openProject(page: Page, tabName?: string): Promise<void> {
  await page.goto(`/projects/${state().projectId}`);
  if (tabName) await tab(page, tabName);
}
export async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}
export const tile = (page: Page, itemId: string): Locator => page.locator(`[data-testid="video-scene-tile"][data-item="${itemId}"]`);

export { existsSync };
