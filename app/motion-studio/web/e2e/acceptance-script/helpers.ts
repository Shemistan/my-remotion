// Приёмка сценарного MVP (S12, спека §13): хранилище приёмки в папке материалов SSD, сервер
// `server/src/main.ts` (= `npm start`) на 127.0.0.1:8790 с `web/dist`, реальный claude и рендер.
// Состояние прогона — tmp/acceptance-script/state.json (есть — продолжение с MS_ACC_ONLY=<шаги>;
// новый прогон — без него), журнал проверок — docs/evidence/script-mvp/checks.json (строка по id
// заменяется при повторе шага), кадры и шпаргалки — docs/evidence/script-mvp/acceptance/.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect } from "@playwright/test";
import Database from "better-sqlite3";
import type { Job, ScriptBatchDto, ScriptPackageDto, ScriptStateDto } from "@ms/contracts";
import { alive, portBusy, redact, sleep, waitHealthy } from "../acceptance/helpers.js";
import { materialsPath } from "../../../core/src/storage/materials.js";

export { alive, portBusy, redact, sleep };

export const APP = fileURLToPath(new URL("../../../", import.meta.url));
export const REPO = join(APP, "../..");
export const ACC_ROOT = materialsPath("acceptance", "store");
export const RUN_DIR = join(REPO, "tmp/acceptance-script");
export const STATE_FILE = join(RUN_DIR, "state.json");
/** Корень evidence сценарного MVP: checks.json и REPORT.md — здесь, остальное — в `acceptance/`. */
export const EVIDENCE_ROOT = join(REPO, "docs/evidence/script-mvp");
export const EVIDENCE = join(EVIDENCE_ROOT, "acceptance");
/** Тексты человека (main checkout, в worktree tmp/ свой): блоки 1–3. */
export const BLOCKS_DIR = process.env.MS_ACC_BLOCKS ?? join(REPO, "tmp/script-mvp");
/** Примеры для человека: копии папок пакетов (только добавлять). */
export const EXAMPLES_ROOT = materialsPath("examples");
export const PORT = 8790;
/** Опрос пакета генерации — раз в 2 мин (бриф S12, «не блокирующе»). */
export const POLL_MS = 2 * 60_000;

export interface StepTime {
  started: string;
  ms: number;
}
export interface AccState {
  runDir: string;
  serverPid: number;
  serverLog: string;
  scratchRoot: string;
  projectId?: string;
  planJobId?: string;
  /** Пакет генерации 16:9 и повторы упавших. */
  batchId?: string;
  batchStartedAt?: string;
  retryBatchIds?: string[];
  restart?: { atMs: number; pidBefore: number; pidAfter: number; downMs: number; running: { item: string; job: string; stage: string | null }[]; note?: string };
  refine?: { itemId: string; sceneId: string; v1: string; v2: string | null; jobId: string };
  packages?: { before?: string; after?: string; vertical?: string };
  reframe?: { itemIds: string[]; batchIds: string[] };
  times: Record<string, StepTime>;
  /** Справочная стоимость по этапам, $ (agent_runs + судья). */
  costs: Record<string, number>;
  judge?: Record<string, { overall: number; notes: Record<string, string>; summary: string; cost_usd: number } | { error: string }>;
}

export function state(): AccState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AccState;
}
export function saveState(patch: Partial<AccState>): AccState {
  const next = { ...state(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}
export function timeStep(name: string, started: number): void {
  const st = state();
  saveState({ times: { ...st.times, [name]: { started: new Date(started).toISOString(), ms: Date.now() - started } } });
}
export function addCost(name: string, usd: number): void {
  const st = state();
  saveState({ costs: { ...st.costs, [name]: Number(usd.toFixed(3)) } });
}

export const log = (s: string): void => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

// --- сервер ---

/** Запускает сервер приёмки (тот же `server/src/main.ts`, что `npm start`) и ждёт `/api/health`. */
export async function startServer(): Promise<ChildProcess> {
  const st = state();
  if (await portBusy()) throw new Error(`порт ${PORT} занят`);
  const fd = openSync(st.serverLog, "a");
  const child = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], {
    cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" }, stdio: ["ignore", fd, fd],
  });
  child.unref();
  await waitHealthy();
  saveState({ serverPid: child.pid! });
  return child;
}

/** Останавливает сервер сигналом и ждёт, пока процесс исчезнет и порт освободится. */
export async function stopServer(signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): Promise<void> {
  const { serverPid } = state();
  if (alive(serverPid)) process.kill(serverPid, signal);
  const until = Date.now() + 120_000;
  while ((alive(serverPid) || (await portBusy())) && Date.now() < until) await sleep(500);
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
/** Справочная стоимость агентов задачи по журналу прогонов (S13). */
export const jobCost = (jobId: string): number =>
  db((d) => d.prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM agent_runs WHERE job_id = ?").pluck().get(jobId) as number);
export const versionPath = (versionId: string): string =>
  join(ACC_ROOT, db((d) => d.prepare("SELECT path FROM scene_versions WHERE id = ?").pluck().get(versionId) as string));

// --- API ---

export async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(path);
  expect(r.ok(), `${path}: ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}
export const scriptState = (request: APIRequestContext, projectId: string) => getJson<ScriptStateDto>(request, `/api/projects/${projectId}/script`);
/**
 * Пакет генерации. Опрос идёт и через рестарт сервера: запрос — свежим `fetch` (без keep-alive
 * сокета к остановленному серверу), сетевые ошибки повторяются до 5 мин.
 */
export async function batch(_request: APIRequestContext, id: string): Promise<ScriptBatchDto> {
  const until = Date.now() + 5 * 60_000;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/script-batches/${id}`);
      if (r.ok) return (await r.json()) as ScriptBatchDto;
      if (r.status < 500) throw new Error(`script-batches/${id}: ${r.status} ${await r.text()}`);
    } catch (e) {
      if (Date.now() > until || (e as Error).message.startsWith("script-batches/")) throw e;
    }
    await sleep(5000);
  }
}
export const pkg = (request: APIRequestContext, id: string) => getJson<ScriptPackageDto>(request, `/api/script-packages/${id}`);
export const job = async (request: APIRequestContext, id: string): Promise<Job> => (await getJson<{ job: Job }>(request, `/api/jobs/${id}`)).job;

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled", "blocked"]);
export const terminal = (status: string): boolean => TERMINAL.has(status);

/** Ждёт конечного статуса задачи опросом `GET /api/jobs/:id`; уточнения Concept — «пропустить». */
export async function waitJob(request: APIRequestContext, jobId: string, timeoutMs: number, pollMs = 10_000): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = await job(request, jobId);
    if (terminal(j.status)) return j;
    if (j.status === "awaiting_input") await request.post(`/api/jobs/${jobId}/input`, { data: { skip: true } });
    if (Date.now() > until) throw new Error(`задача ${jobId} не завершилась за ${timeoutMs} мс (${j.status}, ${j.stage})`);
    await sleep(pollMs);
  }
}

// --- медиа ---

export interface Probe {
  codec: string;
  profile?: string;
  width: number;
  height: number;
  fps: string;
  pixFmt?: string;
  frames: number;
  durationS: number;
  audio?: string;
}
export function probe(path: string): Probe {
  const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-show_format", "-show_streams", "-of", "json", path], { encoding: "utf8" })) as {
    streams: { codec_type: string; codec_name: string; profile?: string; width?: number; height?: number; r_frame_rate?: string; pix_fmt?: string; nb_read_packets?: string; duration?: string }[];
    format: { duration: string };
  };
  const v = p.streams.find((s) => s.codec_type === "video")!;
  const a = p.streams.find((s) => s.codec_type === "audio");
  return {
    codec: v.codec_name, ...(v.profile ? { profile: v.profile } : {}), width: v.width!, height: v.height!, fps: v.r_frame_rate!,
    ...(v.pix_fmt ? { pixFmt: v.pix_fmt } : {}), frames: Number(v.nb_read_packets), durationS: Number(v.duration ?? p.format.duration),
    ...(a ? { audio: a.codec_name } : {}),
  };
}

/** Кадр `frame` видео → PNG ≤ 480 px по большей стороне (evidence). */
export function frame480(video: string, frame: number, out: string): void {
  mkdirSync(join(out, ".."), { recursive: true });
  const full = `${out}.full.png`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `select=eq(n\\,${frame})`, "-vframes", "1", full]);
  execFileSync("/usr/bin/sips", ["-Z", "480", full, "--out", out], { stdio: "ignore" });
  execFileSync("rm", ["-f", full]);
}

// --- проверки ---

export interface CheckRow {
  id: string;
  kind: "A" | "H" | "A (инф.)";
  title: string;
  pass: boolean;
  value: unknown;
}

/**
 * Журнал проверок §13 в docs/evidence/script-mvp/checks.json: строка с тем же id заменяется
 * (продолжение прогона), порядок — по id. Провал — мягкий (expect.soft): видны все.
 */
export function check(id: string, title: string, pass: boolean, value: unknown, kind: CheckRow["kind"] = "A"): boolean {
  const file = join(EVIDENCE_ROOT, "checks.json");
  const rows: CheckRow[] = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CheckRow[]) : [];
  const next = [...rows.filter((r) => r.id !== id), { id, kind, title, pass, value }].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  writeFileSync(file, redact(JSON.stringify(next, null, 2) + "\n"));
  log(`${pass ? "PASS" : "FAIL"} ${id} ${title}: ${JSON.stringify(value).slice(0, 300)}`);
  expect.soft(pass, `${id} ${title}: ${JSON.stringify(value).slice(0, 2000)}`).toBe(true);
  return pass;
}

export function writeEvidence(name: string, data: unknown): void {
  const p = join(EVIDENCE, name);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, redact(typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n"));
}

/** Нормализация фразы для сравнения цитат: только буквы и цифры, ё → е, нижний регистр. */
export const norm = (s: string): string => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
