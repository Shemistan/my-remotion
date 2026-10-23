// doctor (`03` §7): проверка окружения перед запуском сервера и генерацией. Строки: Node ≥ 22;
// `claude --version` и вход (короткий `claude -p` модели haiku без инструментов, стоимость
// < $0,01); ffmpeg/ffprobe и энкодеры libx264, aac, prores_ks; KB_ROOT/KB_SOURCE_ROOT; StorageGuard
// MS_DATA_DIR; Chrome Headless Shell (скачивается при отсутствии); `quick_check` studio.db;
// owner-lock свободен. Итог — таблица (или `--json`), код 1 при любой ошибке.
// `--init` создаёт хранилище, `--adopt` привязывает его к новому тому после переноса (вывод —
// StorageStatus в JSON). `--import-slice` (Q2): под owner lock открывает studio.db (миграции,
// сверка store_id), закрывает незакрытые версии, доводит прерванные rename и регистрирует
// каталоги версий без строки в БД (`reconcileVersions`); код 1, если версии пропущены или broken.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import {
  OwnerBusyError,
  acquireOwnerLock,
  checkStorage,
  initStore,
  macosProbe,
  StorageError,
  type StorageEnv,
  type StorageStatus,
  type VolumeProbe,
} from "@ms/core";
import { ensureRenderBrowser, findOnPath } from "@ms/render";
import { childEnv } from "../agents/env.js";
import { loadConfig, readConfigFile } from "../config.js";
import { bindStoreId, quickCheck } from "../db/meta.js";
import { migrate } from "../db/migrate.js";
import { openDb } from "../db/open.js";
import { KnowledgeAdapter } from "../knowledge/adapter.js";
import { reconcileVersions } from "../scenes/import-slice.js";
import { SceneRepo } from "../scenes/repo.js";
import { relockVersions } from "../scenes/store.js";

const USAGE = "usage: doctor [--json] | --init | --adopt | --import-slice";
/** Порог стоимости проверочного вызова Claude (`03` §7). */
export const LOGIN_MAX_USD = 0.01;
const ENCODERS = ["libx264", "aac", "prores_ks"] as const;

export type BrowserCheck = () => Promise<{ path: string }>;

export interface CheckRow {
  name: string;
  ok: boolean;
  /** `ok` или код неудачи: `missing`, `error`, `busy`, `skipped`, `expensive`, причина StorageGuard… */
  status: string;
  detail: string;
}

export async function runDoctor(
  argv: string[],
  env: StorageEnv & NodeJS.ProcessEnv,
  probe: VolumeProbe,
  browser: BrowserCheck = ensureRenderBrowser,
): Promise<{ code: number; output: string }> {
  const [mode, ...rest] = argv;
  if (mode === "--json" && rest.length === 0) return fullCheck(env, probe, browser, true);
  if (rest.length > 0 || (mode !== undefined && mode !== "--init" && mode !== "--adopt" && mode !== "--import-slice")) {
    return { code: 2, output: USAGE };
  }
  if (mode === undefined) return fullCheck(env, probe, browser, false);
  if (mode === "--import-slice") return importSlice(env, probe);

  const root = env.MS_DATA_DIR?.trim();
  if (!root) return report({ ok: false, reason: "env_missing", detail: "MS_DATA_DIR не задан" });
  try {
    await initStore(root, probe, { adopt: mode === "--adopt", allowSystemDisk: env.MS_ALLOW_SYSTEM_DISK === "1" });
  } catch (e) {
    if (e instanceof StorageError) return report({ ok: false, reason: e.reason, detail: e.detail });
    return { code: 1, output: String((e as Error).message) };
  }
  return report(await checkStorage(env, probe));
}

type Exec = (bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<string>;
const exec: Exec = async (bin, args, env, timeout) => (await promisify(execFile)(bin, args, { env, timeout, maxBuffer: 8 * 1024 * 1024 })).stdout;
const firstLine = (s: string) => s.trim().split("\n")[0]!.trim();
const errText = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0]!;

async function fullCheck(env: NodeJS.ProcessEnv, probe: VolumeProbe, browser: BrowserCheck, json: boolean): Promise<{ code: number; output: string }> {
  const rows: CheckRow[] = [];
  const row = (name: string, ok: boolean, status: string, detail: string) => rows.push({ name, ok, status: ok ? "ok" : status, detail });
  const root = env.MS_DATA_DIR?.trim();

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
    else rows.push(await claudeLogin(claude, cenv));
  }

  // ffmpeg, ffprobe, энкодеры
  const ffmpeg = await findOnPath("ffmpeg", env.PATH);
  const ffprobe = await findOnPath("ffprobe", env.PATH);
  for (const [name, bin] of [["ffmpeg", ffmpeg], ["ffprobe", ffprobe]] as const) {
    if (!bin) {
      row(name, false, "missing", `${name} не найден в PATH (brew install ffmpeg)`);
      continue;
    }
    try {
      row(name, true, "ok", firstLine(await exec(bin, ["-version"], { PATH: env.PATH }, 15_000)));
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

  // KB
  try {
    if (!existsSync(config.kb.sourceRoot)) throw new Error(`KB_SOURCE_ROOT нет: ${config.kb.sourceRoot}`);
    const kb = await KnowledgeAdapter.load({ kbRoot: config.kb.root, sourceRoot: config.kb.sourceRoot });
    row("kb", kb.size > 0, "error", `${kb.size} записей, KB_ROOT ${config.kb.root}, KB_SOURCE_ROOT ${config.kb.sourceRoot}`);
  } catch (e) {
    row("kb", false, "error", errText(e));
  }

  // хранилище
  const storage: StorageStatus = root ? await checkStorage(env as StorageEnv, probe) : { ok: false, reason: "env_missing", detail: "MS_DATA_DIR не задан" };
  row("storage", storage.ok, storage.ok ? "ok" : storage.reason, storage.ok ? `${storage.root}, свободно ${(storage.freeBytes / 1024 ** 3).toFixed(1)} ГБ` : storage.detail);

  // Chrome Headless Shell
  try {
    row("chrome", true, "ok", (await browser()).path);
  } catch (e) {
    row("chrome", false, "error", errText(e));
  }

  // studio.db и owner-lock: только при доступном хранилище
  if (!storage.ok) {
    row("db", false, "skipped", "хранилище недоступно");
    row("owner_lock", false, "skipped", "хранилище недоступно");
  } else {
    rows.push(...(await dbAndLock(storage.root)));
  }

  const ok = rows.every((r) => r.ok);
  const output = json ? JSON.stringify({ ok, checks: rows, storage }, null, 2) : table(rows, ok);
  return { code: ok ? 0 : 1, output };
}

/** Вход Claude: короткий вызов haiku без инструментов; стоимость из `total_cost_usd`. */
async function claudeLogin(bin: string, env: NodeJS.ProcessEnv): Promise<CheckRow> {
  const args = [
    "-p", "--restricted", "--strict-mcp-config", "--no-session-persistence",
    "--model", "haiku", "--tools", "", "--output-format", "json", "--max-budget-usd", "0.05",
    "Ответь одним словом: ok",
  ];
  try {
    const out = JSON.parse(await exec(bin, args, env, 90_000)) as { is_error?: boolean; result?: string; total_cost_usd?: number };
    const cost = out.total_cost_usd ?? 0;
    if (out.is_error) return { name: "claude_login", ok: false, status: "error", detail: `ошибка входа: ${String(out.result ?? "").slice(0, 200)}` };
    if (cost >= LOGIN_MAX_USD) return { name: "claude_login", ok: false, status: "expensive", detail: `вход работает, но вызов стоил $${cost.toFixed(4)} ≥ $${LOGIN_MAX_USD}` };
    return { name: "claude_login", ok: true, status: "ok", detail: `haiku ответил, $${cost.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}` };
  } catch (e) {
    return { name: "claude_login", ok: false, status: "error", detail: errText(e) };
  }
}

/** owner-lock свободен (сервер не запущен) и `quick_check` базы под ним; занят — база только для чтения. */
async function dbAndLock(root: string): Promise<CheckRow[]> {
  const dbPath = join(root, "studio.db");
  const check = (readonly: boolean): CheckRow => {
    if (!existsSync(dbPath)) return { name: "db", ok: true, status: "ok", detail: "studio.db ещё нет — создаст первый запуск" };
    try {
      const db = readonly ? new Database(dbPath, { readonly: true, fileMustExist: true }) : openDb(root);
      try {
        return quickCheck(db) ? { name: "db", ok: true, status: "ok", detail: "quick_check ok" } : { name: "db", ok: false, status: "corrupt", detail: "quick_check не прошёл — studio.db повреждена" };
      } finally {
        db.close();
      }
    } catch (e) {
      return { name: "db", ok: false, status: "error", detail: errText(e) };
    }
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

function table(rows: CheckRow[], ok: boolean): string {
  const w = Math.max(...rows.map((r) => r.name.length));
  const lines = rows.map((r) => `${r.status.padEnd(10)} ${r.name.padEnd(w)}  ${r.detail}`);
  return [...lines, "", ok ? "doctor: всё в порядке" : `doctor: есть проблемы (${rows.filter((r) => !r.ok).map((r) => r.name).join(", ")})`].join("\n");
}

async function importSlice(env: StorageEnv, probe: VolumeProbe): Promise<{ code: number; output: string }> {
  const status = await checkStorage(env, probe);
  if (!status.ok) return report(status);
  const { root } = status;
  let lock;
  try {
    lock = await acquireOwnerLock(root, "cli");
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  }
  try {
    const db = openDb(root);
    try {
      migrate(db);
      bindStoreId(db, status.marker);
      const relock = await relockVersions(root);
      const repo = new SceneRepo({ root, db, guard: () => checkStorage(env, probe, status.marker.store_id) });
      const imported = await reconcileVersions(repo, root);
      const ok = imported.skipped.length === 0 && imported.missing.broken.length === 0 && relock.broken.length === 0;
      return { code: ok ? 0 : 1, output: JSON.stringify({ ok, root, relock, import: imported }, null, 2) };
    } finally {
      db.close();
    }
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  } finally {
    await lock.release();
  }
}

function report(status: StorageStatus): { code: number; output: string } {
  return { code: status.ok ? 0 : 1, output: JSON.stringify(status, null, 2) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, output } = await runDoctor(process.argv.slice(2), process.env, macosProbe);
  (code === 0 ? console.log : console.error)(output);
  process.exitCode = code;
}
