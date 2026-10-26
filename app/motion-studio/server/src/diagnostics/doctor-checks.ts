// Проверки doctor (`03` §7), общие для CLI (`npm run doctor`) и API (`GET /api/diagnostics/doctor`,
// Task 48). Строки: Node ≥ 22; `claude --version` и вход (короткий `claude -p` модели haiku без
// инструментов, стоимость < $0,01); ffmpeg/ffprobe, энкодеры libx264, aac, prores_ks и фильтры
// silencedetect, scdet; ASR (python mlx-audio, воркер ai-platform и его sha256, коммит, веса, порт
// 8780); `vision-detect` (Task 30); KB_ROOT/KB_SOURCE_ROOT; StorageGuard MS_DATA_DIR; Chrome
// Headless Shell; `quick_check` studio.db; owner-lock; копия хранилища (S20, `store_copy`). `degraded` (нет vision-detect) и `warning`
// (хранилище вне папки материалов — S18; `deps` — инструменты не из `.deps` — S19) —
// предупреждения, `ok: true`.
//
// `fast` (UI): без платного входа Claude (строка `claude_login` — `skipped`, ok) и без скачивания
// Chrome (только поиск уже скачанного). В сервере (`db`): база — своя (`quick_check` открытого
// соединения), owner-lock держит этот сервер — это норма, а не `busy`. Детали строк — через `redact`.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import {
  OwnerBusyError,
  acquireOwnerLock,
  checkStorage,
  isDepsNode,
  macosProbe,
  materialsAdvice,
  resolveTool,
  type StorageEnv,
  type StorageStatus,
  type VolumeProbe,
} from "@ms/core";
import type { DoctorReportDto } from "@ms/contracts";
import { ensureRenderBrowser, findOnPath, findRenderBrowser } from "@ms/render";
import { childEnv } from "../agents/env.js";
import { DEFAULT_VISION_BIN, visionAvailable } from "../analysis/vision.js";
import { LEGACY_ASR_PYTHON, LEGACY_MODELS_DIR, loadConfig, readConfigFile, type AppConfig } from "../config.js";
import { quickCheck, storeCopiedFrom, storeCopiedText } from "../db/meta.js";
import type { Db } from "../db/open.js";
import { openDb } from "../db/open.js";
import { KnowledgeAdapter } from "../knowledge/adapter.js";
import { AI_PLATFORM_PORT, type AsrCapability, asrCapability } from "../media/asr-capability.js";
import { redact } from "./redact.js";

/** Порог стоимости проверочного вызова Claude (`03` §7). */
export const LOGIN_MAX_USD = 0.01;
const ENCODERS = ["libx264", "aac", "prores_ks"] as const;
/** Фильтры ffmpeg для импорта и чернового монтажа (Phase 2–3): тишина, смена сцены. */
const FILTERS = ["silencedetect", "scdet"] as const;

export type BrowserCheck = () => Promise<{ path: string }>;
/** Доступность ASR (Task 26); подменяется в тестах. */
export type AsrCheck = (cfg: AppConfig["asr"]) => Promise<AsrCapability>;
/** Проверка `vision-detect` (Task 30); подменяется в тестах. */
export type VisionCheck = () => Promise<{ ok: boolean; status: string; detail: string }>;

/**
 * `vision-detect` собран и отвечает `--version`. Нет бинарника — не ошибка, а `degraded`
 * (ревью Task 30, m8): footage.analyze работает в режиме `llm_only`, doctor не падает. Бинарник
 * есть, но не отвечает — ошибка (сломанная сборка).
 */
export const visionCheck: VisionCheck = () => checkVisionBin(DEFAULT_VISION_BIN);

/** Проверка бинарника `vision-detect` по пути (тесты — несуществующий путь). */
export async function checkVisionBin(bin: string): ReturnType<VisionCheck> {
  if (!(await visionAvailable(bin))) {
    return { ok: true, status: "degraded", detail: `нет ${bin} — анализ видеоряда в режиме llm_only (низкая уверенность зон); собрать: make install или npm run build:vision (swiftc из Command Line Tools)` };
  }
  try {
    const { stdout } = await promisify(execFile)(bin, ["--version"], { timeout: 15_000 });
    return { ok: true, status: "ok", detail: `${stdout.trim()} (${bin})` };
  } catch (e) {
    return { ok: false, status: "error", detail: `${bin} --version: ${(e as Error).message.split("\n")[0]}` };
  }
}

export interface CheckRow {
  name: string;
  ok: boolean;
  /** `ok`, `degraded` (работает с ограничением, `ok: true`), `warning` (предупреждение, `ok: true`) или код неудачи: `missing`, `error`, `busy`, `skipped`, `expensive`, причина StorageGuard… */
  status: string;
  detail: string;
}

export interface DoctorDeps {
  /** Chrome Headless Shell со скачиванием (полная проверка, CLI). */
  browser?: BrowserCheck;
  /** Chrome Headless Shell без сети (`fast`). */
  findBrowser?: () => string;
  asr?: AsrCheck;
  vision?: VisionCheck;
}

export interface DoctorChecksOptions {
  fast?: boolean;
  /** База сервера: `quick_check` по ней, owner-lock не берётся (его держит сервер). */
  db?: Db;
  /** Проверка хранилища сервера (`core.storageCheck`) вместо `checkStorage(env, probe)`. */
  storage?: () => Promise<StorageStatus>;
}

type Exec = (bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number, cwd?: string) => Promise<string>;
const exec: Exec = async (bin, args, env, timeout, cwd) => (await promisify(execFile)(bin, args, { env, timeout, maxBuffer: 8 * 1024 * 1024, ...(cwd ? { cwd } : {}) })).stdout;
const firstLine = (s: string) => s.trim().split("\n")[0]!.trim();
const errText = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0]!;

/** Строки doctor и состояние хранилища. */
export async function doctorChecks(
  env: NodeJS.ProcessEnv,
  probe: VolumeProbe,
  deps: DoctorDeps = {},
  opts: DoctorChecksOptions = {},
): Promise<{ rows: CheckRow[]; storage: StorageStatus }> {
  const browser = deps.browser ?? ensureRenderBrowser;
  const findBrowser = deps.findBrowser ?? findRenderBrowser;
  const asrCheck = deps.asr ?? ((cfg: AppConfig["asr"]) => asrCapability(cfg));
  const vision = deps.vision ?? visionCheck;
  const rows: CheckRow[] = [];
  const row = (name: string, ok: boolean, status: string, detail: string) => rows.push({ name, ok, status: ok ? "ok" : status, detail });
  const root = env.MS_DATA_DIR?.trim();
  // S19: что взято не из `.deps` / папки материалов (запасной путь до ./setup) — строка `deps`
  const fallback: string[] = [];
  const depsOk = (() => {
    try {
      return isDepsNode(process.execPath, env);
    } catch {
      return false;
    }
  })();
  if (!depsOk) fallback.push(`node (${process.execPath})`);

  // node
  const major = Number(process.versions.node.split(".")[0]);
  row("node", major >= 22, "error", `${process.versions.node}${major >= 22 ? "" : " — нужен Node ≥ 22 (scripts/with-node.sh)"}`);

  // настройки: config.json хранилища (claudeBin, KB); без MS_DATA_DIR — умолчания
  let config;
  try {
    config = loadConfig({ ...env, MS_DATA_DIR: root || "/" }, root ? await readConfigFile(root).catch(() => undefined) : undefined);
  } catch {
    config = loadConfig({ ...env, MS_DATA_DIR: root || "/" });
  }
  const cenv = childEnv(env);

  // claude: версия и вход
  const claude = config.claudeBin.includes("/") ? (existsSync(config.claudeBin) ? config.claudeBin : undefined) : await findOnPath(config.claudeBin, cenv.PATH);
  if (!claude) {
    row("claude", false, "missing", `${config.claudeBin} не найден в PATH (Claude Code CLI)`);
    row("claude_login", false, "skipped", "нет claude");
  } else {
    let version: string | undefined;
    try {
      version = firstLine(await exec(claude, ["--version"], cenv, 15_000));
      row("claude", true, "ok", `${version} (${claude})`);
    } catch (e) {
      row("claude", false, "error", errText(e));
    }
    if (version === undefined) row("claude_login", false, "skipped", "claude --version не отработал");
    else if (opts.fast) rows.push({ name: "claude_login", ok: true, status: "skipped", detail: "быстрая проверка: вход не проверялся (платный вызов) — «Полная проверка»" });
    else rows.push(await claudeLogin(claude, cenv));
  }

  // ffmpeg, ffprobe (S19: `.deps/ffmpeg`, иначе PATH — с предупреждением), энкодеры
  const tools = (["ffmpeg", "ffprobe"] as const).map((name) => {
    try {
      return [name, resolveTool(name, env)] as const;
    } catch {
      return [name, undefined] as const; // относительный MS_DEPS_DIR
    }
  });
  const ffmpeg = tools[0]![1]?.path;
  for (const [name, t] of tools) {
    if (!t) {
      row(name, false, "missing", `${name} не найден ни в .deps/ffmpeg, ни в PATH (./setup ставит закреплённую сборку)`);
      continue;
    }
    if (t.source === "path") fallback.push(`${name} (PATH ${t.path})`);
    try {
      row(name, true, "ok", `${firstLine(await exec(t.path, ["-version"], { PATH: env.PATH }, 15_000))} (${t.path})`);
    } catch (e) {
      row(name, false, "error", errText(e));
    }
  }
  if (!ffmpeg) row("encoders", false, "skipped", "нет ffmpeg");
  else {
    try {
      const out = await exec(ffmpeg, ["-hide_banner", "-encoders"], { PATH: env.PATH }, 15_000);
      const have = new Set([...out.matchAll(/^\s*[VAS][A-Z.]{5}\s+(\S+)/gm)].map((m) => m[1]!));
      const missing = ENCODERS.filter((e) => !have.has(e));
      row("encoders", missing.length === 0, "missing", missing.length === 0 ? ENCODERS.join(", ") : `нет энкодеров: ${missing.join(", ")}`);
    } catch (e) {
      row("encoders", false, "error", errText(e));
    }
  }
  if (!ffmpeg) row("filters", false, "skipped", "нет ffmpeg");
  else {
    try {
      const out = await exec(ffmpeg, ["-hide_banner", "-filters"], { PATH: env.PATH }, 15_000);
      const have = new Set([...out.matchAll(/^\s*[T.][S.][C.]\s+(\S+)\s+\S+->\S+/gm)].map((m) => m[1]!));
      const missing = FILTERS.filter((f) => !have.has(f));
      row("filters", missing.length === 0, "missing", missing.length === 0 ? FILTERS.join(", ") : `нет фильтров: ${missing.join(", ")}`);
    } catch (e) {
      row("filters", false, "error", errText(e));
    }
  }

  // ASR (Phase 2): python mlx-audio, воркер ai-platform (sha256 = контракт), веса, коммит, порт 8780
  try {
    const cap = await asrCheck(config.asr);
    if (cap.available) {
      const port = cap.gpuContention ? `; порт ${AI_PLATFORM_PORT} занят — ai-platform может держать GPU` : "";
      row("asr", true, "ok", `${config.asr.model}, воркер sha256 ${cap.workerSha256.slice(0, 12)}…, ai-platform ${cap.commit.slice(0, 7)}, python ${config.asr.python}${port}`);
    } else row("asr", false, cap.reason, cap.detail);
  } catch (e) {
    row("asr", false, "error", errText(e));
  }

  const home = env.HOME?.trim() || homedir();
  if (config.asr.python === LEGACY_ASR_PYTHON(home)) fallback.push(`python ASR (${config.asr.python})`);
  if (config.asr.modelsDir === LEGACY_MODELS_DIR) fallback.push(`веса ASR (${LEGACY_MODELS_DIR})`);

  // Apple Vision (Task 30): детектор лиц и рук для безопасных зон
  try {
    const v = await vision();
    // degraded — предупреждение: строка ok (код 0), статус виден в таблице и JSON
    rows.push({ name: "vision", ok: v.ok, status: v.ok && v.status === "degraded" ? "degraded" : v.ok ? "ok" : v.status, detail: v.detail });
  } catch (e) {
    row("vision", false, "error", errText(e));
  }

  // KB
  try {
    if (!existsSync(config.kb.sourceRoot)) throw new Error(`KB_SOURCE_ROOT нет: ${config.kb.sourceRoot}`);
    const kb = await KnowledgeAdapter.load({ kbRoot: config.kb.root, sourceRoot: config.kb.sourceRoot });
    row("kb", kb.size > 0, "error", `${kb.size} записей, KB_ROOT ${config.kb.root}, KB_SOURCE_ROOT ${config.kb.sourceRoot}`);
  } catch (e) {
    row("kb", false, "error", errText(e));
  }

  // хранилище
  const storage: StorageStatus = opts.storage
    ? await opts.storage()
    : root ? await checkStorage(env as StorageEnv, probe) : { ok: false, reason: "env_missing", detail: "MS_DATA_DIR не задан" };
  row("storage", storage.ok, storage.ok ? "ok" : storage.reason, storage.ok ? `${storage.root}, свободно ${(storage.freeBytes / 1024 ** 3).toFixed(1)} ГБ` : storage.detail);
  // S18: на SSD материалов хранилище — только в папке материалов; вне её — предупреждение (ADR 0006)
  try {
    const advice = root ? materialsAdvice(root, env) : undefined;
    if (advice) rows.push({ name: "materials", ok: true, status: "warning", detail: advice });
  } catch (e) {
    row("materials", false, "error", errText(e)); // напр. относительный MS_MATERIALS_ROOT
  }

  // Chrome Headless Shell: полная проверка — со скачиванием, быстрая — только поиск скачанного
  try {
    row("chrome", true, "ok", opts.fast ? findBrowser() : (await browser()).path);
  } catch (e) {
    row("chrome", false, "error", errText(e));
  }

  // studio.db и owner-lock: только при доступном хранилище
  if (opts.db) {
    rows.push(dbRow(() => opts.db!, false), { name: "owner_lock", ok: true, status: "ok", detail: `занят этим сервером (pid ${process.pid})` });
  } else if (!storage.ok) {
    row("db", false, "skipped", "хранилище недоступно");
    row("owner_lock", false, "skipped", "хранилище недоступно");
  } else {
    rows.push(...(await dbAndLock(storage.root)));
  }
  // S20: копия хранилища — предупреждение (e2e и приёмки законно работают на копиях)
  if (storage.ok) {
    const copy = opts.db ? storeCopyRow(opts.db, storage.root) : storeCopyRowReadonly(storage.root);
    if (copy) rows.push(copy);
  }

  if (fallback.length > 0) {
    rows.push({ name: "deps", ok: true, status: "warning", detail: `не из .deps: ${fallback.join(", ")} — ./setup поставит зависимости в .deps и веса в папку материалов` });
  }
  return { rows: rows.map((r) => ({ ...r, detail: redact(r.detail) })), storage };
}

/** Вход Claude: короткий вызов haiku без инструментов; стоимость из `total_cost_usd`. */
async function claudeLogin(bin: string, env: NodeJS.ProcessEnv): Promise<CheckRow> {
  const args = [
    "-p", "--restricted", "--strict-mcp-config", "--no-session-persistence",
    "--model", "haiku", "--tools", "", "--output-format", "json", "--max-budget-usd", "0.05",
    "Ответь одним словом: ok",
  ];
  // пустой временный каталог: CLAUDE.md и настройки из cwd не попадают в контекст (F8)
  const cwd = await mkdtemp(join(tmpdir(), "ms-doctor-"));
  try {
    const out = JSON.parse(await exec(bin, args, env, 90_000, cwd)) as { is_error?: boolean; result?: string; total_cost_usd?: number };
    const cost = out.total_cost_usd ?? 0;
    if (out.is_error) return { name: "claude_login", ok: false, status: "error", detail: `ошибка входа: ${String(out.result ?? "").slice(0, 200)}` };
    if (cost >= LOGIN_MAX_USD) return { name: "claude_login", ok: false, status: "expensive", detail: `вход работает, но вызов стоил $${cost.toFixed(4)} ≥ $${LOGIN_MAX_USD}` };
    return { name: "claude_login", ok: true, status: "ok", detail: `haiku ответил, $${cost.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}` };
  } catch (e) {
    return { name: "claude_login", ok: false, status: "error", detail: errText(e) };
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** `quick_check` базы: `open` даёт соединение, `close` — закрыть ли его после проверки. */
function dbRow(open: () => Db, close: boolean): CheckRow {
  try {
    const db = open();
    try {
      return quickCheck(db) ? { name: "db", ok: true, status: "ok", detail: "quick_check ok" } : { name: "db", ok: false, status: "corrupt", detail: "quick_check не прошёл — studio.db повреждена" };
    } finally {
      if (close) db.close();
    }
  } catch (e) {
    return { name: "db", ok: false, status: "error", detail: errText(e) };
  }
}

/** S20: хранилище — копия (путь корня в `meta` другой) → предупреждение `store_copy` (ok: true). */
export function storeCopyRow(db: Db, root: string): CheckRow | undefined {
  const from = storeCopiedFrom(db, root);
  return from === undefined ? undefined : { name: "store_copy", ok: true, status: "warning", detail: storeCopiedText(from) };
}

/** `storeCopyRow` по закрытой базе (CLI): только чтение; базы нет или не читается — строки нет. */
function storeCopyRowReadonly(root: string): CheckRow | undefined {
  const dbPath = join(root, "studio.db");
  if (!existsSync(dbPath)) return undefined;
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true }) as unknown as Db;
    try {
      return storeCopyRow(db, root);
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

/** owner-lock свободен (сервер не запущен) и `quick_check` базы под ним; занят — база только для чтения. */
async function dbAndLock(root: string): Promise<CheckRow[]> {
  const dbPath = join(root, "studio.db");
  const check = (readonly: boolean): CheckRow => {
    if (!existsSync(dbPath)) return { name: "db", ok: true, status: "ok", detail: "studio.db ещё нет — создаст первый запуск" };
    return dbRow(() => (readonly ? (new Database(dbPath, { readonly: true, fileMustExist: true }) as unknown as Db) : openDb(root)), true);
  };
  let lock;
  try {
    lock = await acquireOwnerLock(root, "cli");
  } catch (e) {
    const busy = e instanceof OwnerBusyError;
    const pid = busy ? (e.owner?.pid ?? e.pid) : undefined;
    return [
      check(true),
      { name: "owner_lock", ok: false, status: busy ? "busy" : "error", detail: busy ? `хранилище занято (${e.owner?.kind ?? "?"}, pid ${pid ?? "?"}) — сервер уже запущен?` : errText(e) },
    ];
  }
  try {
    return [check(false), { name: "owner_lock", ok: true, status: "ok", detail: "свободен" }];
  } finally {
    await lock.release();
  }
}

export interface DoctorOptions extends DoctorChecksOptions {
  env?: NodeJS.ProcessEnv;
  probe?: VolumeProbe;
  deps?: DoctorDeps;
}

/** Отчёт doctor (`DoctorReportDto`): строки, общий итог (все `ok`), время. */
export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReportDto> {
  const { rows } = await doctorChecks(opts.env ?? process.env, opts.probe ?? macosProbe, opts.deps, opts);
  return { ok: rows.every((r) => r.ok), rows, created_at: new Date().toISOString() };
}
