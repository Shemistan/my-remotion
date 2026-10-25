// Приёмка Phase 2–3 на реальном сыром ролике (Task 34): общее для спецификаций — хранилище
// приёмки на SSD, состояние прогона (`tmp/acceptance-video/state.json`), сервер (`node --import tsx
// server/src/main.ts` = `npm start`, один процесс: `kill -9` бьёт владельца owner-lock), запросы к
// API с Origin и Idempotency-Key, studio.db (readonly), sha256 и ffprobe, evidence и журнал [A].
// Личные кадры в evidence — только ≤ 480 px (V4): скриншоты уменьшаются `sips -Z 480`.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, type Page, expect } from "@playwright/test";
import Database from "better-sqlite3";
import type { Job } from "@ms/contracts";
import { SSD_ROOT, materialsPath } from "../../../core/src/storage/materials.js";

export const APP = fileURLToPath(new URL("../../../", import.meta.url));
export const REPO = join(APP, "../..");
export const ACC_ROOT = materialsPath("acceptance", "store");
/** Копии-отрезки исходника (оригинал не трогается): импорт идёт отсюда. */
export const ACC_SRC = materialsPath("acceptance", "src");
/** Сырой ролик пользователя (rulings 2026-10-24): только чтение, sha256 до/после. */
export const ORIGINAL = `${SSD_ROOT}/Youtube/FinalVideo/MyProtocol/IMG_0685.MOV`;
export const ORIGINAL_SHA256 = "9df29c1e5c9f26ce3d43a4adda99f4240023e115b65ad6c5647bd75979e7996f";
export const RUN_ROOT = join(REPO, "tmp/acceptance-video");
export const STATE_FILE = join(RUN_ROOT, "state.json");
export const EVIDENCE = join(REPO, "docs/evidence/phase-2");
/** Evidence Phase 3 (Task 34, Steps 7–10): `writeEvidence`/`shot`/`Checks` с корнем `EVIDENCE3`. */
export const EVIDENCE3 = join(REPO, "docs/evidence/phase-3");
export const PORT = 8790;
export const BASE = `http://127.0.0.1:${PORT}`;
export const ORIGIN = BASE;

export interface StepTiming {
  wall_ms: number;
  cost_usd?: number;
  note?: string;
}
export interface VideoAccState {
  runDir: string;
  serverPid: number;
  serverLog: string;
  /** Копия-отрезок, на которой идёт основной сценарий (`pick-test-video.mjs --raw`). */
  video: { path: string; sha256: string; window?: { start_s: number; end_s: number } };
  original: { sha256_before: string; sha256_after?: string };
  projectId?: string;
  mediaId?: string;
  transcriptId?: string;
  edlId?: string;
  timings: Record<string, StepTiming>;
  [k: string]: unknown;
}

export function state(): VideoAccState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as VideoAccState;
}
export function saveState(patch: Partial<VideoAccState>): VideoAccState {
  const next = { ...state(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}
export function timing(step: string, t: StepTiming): void {
  saveState({ timings: { ...state().timings, [step]: t } });
}

const HOME = homedir();
/** Evidence без личного: домашний каталог → `~`, поле `hostname` журналов pino вырезается. */
export function redact(text: string): string {
  return text.split(HOME).join("~").replace(/(\\*)"hostname\1":\1"[^"\\]*\1",?/g, "");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export function serverEnv(): NodeJS.ProcessEnv {
  return { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" };
}

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
export const jobCost = (jobId: string) =>
  db((d) => (d.prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM agent_runs WHERE job_id = ?").pluck().get(jobId) as number));
export const agentRuns = (jobId: string) =>
  db((d) => d.prepare("SELECT id, role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at").all(jobId));
export const jobEvents = (jobId: string) =>
  db((d) => d.prepare("SELECT ts, level, kind, message, data_json FROM job_events WHERE job_id = ? AND kind != 'progress' ORDER BY id").all(jobId));

// --- API ---

export async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(path);
  expect(r.ok(), `${path}: ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}
/** POST как у UI: Origin обязателен на мутациях, создающие — с Idempotency-Key. */
export async function post(request: APIRequestContext, path: string, data: unknown, key: string = randomUUID()) {
  return request.post(path, { data, headers: { Origin: ORIGIN, "Idempotency-Key": key } });
}
export const job = async (request: APIRequestContext, id: string) => (await getJson<{ job: Job }>(request, `/api/jobs/${id}`)).job;

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled", "blocked"]);

/** Ждёт завершения задачи по `GET /api/jobs/:id` (UI обновляется по SSE). */
export async function waitJob(request: APIRequestContext, jobId: string, timeoutMs: number): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = await job(request, jobId);
    if (TERMINAL.has(j.status)) return j;
    if (Date.now() > until) throw new Error(`задача ${jobId} не завершилась за ${timeoutMs} мс (${j.status}, ${j.stage})`);
    await sleep(3000);
  }
}

/** Последняя задача типа в проекте (по сводке видеопроекта). */
export async function latestJob(request: APIRequestContext, projectId: string, type: string): Promise<Job | undefined> {
  const v = await getJson<{ jobs: Job[] }>(request, `/api/projects/${projectId}/video`);
  return v.jobs.find((j) => j.type === type);
}

// --- файлы ---

export function sha256File(path: string): Promise<string> {
  return new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", fail);
  });
}

export interface ProbeJson {
  format: { duration?: string; size?: string; format_name?: string };
  streams: { codec_type: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; nb_frames?: string; duration?: string; side_data_list?: { rotation?: number }[] }[];
}
export function ffprobe(path: string, extra: string[] = []): ProbeJson {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", ...extra, "-show_format", "-show_streams", "-of", "json", `file:${path}`], { encoding: "utf8", maxBuffer: 64 << 20 })) as ProbeJson;
}

// --- evidence ---

export function writeEvidence(dir: string, name: string, data: unknown, root = EVIDENCE): void {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, name), redact(typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n"));
}

/** Скриншот страницы в `<evidence>/<dir>/ui/<name>.png`, уменьшенный до 480 px (лицо автора, V4). */
export async function shot(page: Page, dir: string, name: string, root = EVIDENCE): Promise<void> {
  const out = join(root, dir, "ui");
  mkdirSync(out, { recursive: true });
  const path = join(out, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  execFileSync("sips", ["-Z", "480", path], { stdio: "ignore" });
}

/** Проверки [A] с итогом в `<evidence>/<dir>/checks.json`; провал — мягкий (видны все). */
export class Checks {
  readonly rows: { id: string; title: string; kind: string; pass: boolean; detail: string }[] = [];
  constructor(private readonly dir: string, private readonly root = EVIDENCE) {}
  check(id: string, title: string, pass: boolean, detail: unknown = "", kind = "A"): boolean {
    const d = typeof detail === "string" ? detail : JSON.stringify(detail);
    this.rows.push({ id, title, kind, pass, detail: d });
    expect.soft(pass, `${id} ${title}: ${d}`).toBe(true);
    this.save();
    return pass;
  }
  note(id: string, title: string, detail: unknown, kind = "H→агент"): void {
    this.rows.push({ id, title, kind, pass: true, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
    this.save();
  }
  save(): void {
    mkdirSync(join(this.root, this.dir), { recursive: true });
    writeFileSync(join(this.root, this.dir, "checks.json"), redact(JSON.stringify(this.rows, null, 2) + "\n"));
  }
}

/** Видеопроект через UI: название → «Новый видеопроект» → id из URL. */
export async function newVideoProject(page: Page, title: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Название проекта").fill(title);
  await page.getByRole("button", { name: "Новый видеопроект" }).click();
  await expect(page.getByLabel("Путь к файлу на этом Mac")).toBeVisible();
  const m = /\/projects\/([^/?#]+)/.exec(page.url());
  if (!m) throw new Error(`нет id проекта в URL ${page.url()}`);
  return m[1]!;
}

/** Импорт по пути через UI: путь → «Импортировать» → ответ POST (задача). */
export async function importViaUi(page: Page, path: string): Promise<Job> {
  await page.getByLabel("Путь к файлу на этом Mac").fill(path);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/media\/import$/.test(r.url())),
    page.getByRole("button", { name: "Импортировать" }).click(),
  ]);
  expect([200, 202], await resp.text()).toContain(resp.status());
  return ((await resp.json()) as { job: Job }).job;
}

/** Каталог прогона и файлы рядом с ним (журнал сервера, кадры для проверок). */
export function runFile(name: string): string {
  const dir = state().runDir;
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export { existsSync };
