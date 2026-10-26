// Подготовка приёмки Phase 4 (Task 41, `make acceptance-video-scenes`): внешний SSD подключён →
// хранилище приёмки `materialsPath("acceptance", "phase4")`: нет — клон APFS (`cp -c -R`, без лишнего
// места) хранилища приёмки Phase 2–3 `acceptance/store`; перед копией на источнике не должно быть
// живого сервера (studio.db никем не открыт — `lsof`, грабли №5: сервер на копии видит записи процессов
// оригинала) → `server.port` копии = порт приёмки → `doctor` → sha256 studio.db источника «до» → сервер
// на 127.0.0.1:<порт> с `web/dist`, реальными claude, рендером и ffmpeg. Teardown — SIGTERM серверу.
// MS_ACC_REUSE=1 — продолжить прогон (state.json): тот же каталог прогона, сервер прошлого — мёртв.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { materialsRoot } from "../../../core/src/storage/materials.js";
import {
  ACC_ROOT, APP, PORT, PROJECT_ID, RUN_DIR, SRC_ROOT, STATE_FILE, type AccState, alive, killServer, log, portBusy, redact, saveState, sha256File,
  startServer, state, writeEvidence,
} from "./helpers.js";

const tsx = (args: string[], timeout = 300_000) =>
  execFileSync(process.execPath, ["--import", "tsx", ...args], { cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" }, encoding: "utf8", timeout });

/** Кто держит studio.db источника (пусто — сервера нет). */
function holders(root: string): string {
  try {
    return execFileSync("lsof", ["-t", join(root, "studio.db")], { encoding: "utf8" }).trim();
  } catch {
    return ""; // lsof: код 1 — никто не держит
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(materialsRoot())) throw new Error(`внешний SSD не подключён: приёмка идёт только в ${materialsRoot()}`);
  if (PORT === 8790) throw new Error("порт приёмки — не 8790 (рабочий сервер): задайте MS_ACC_PORT");
  if (await portBusy()) throw new Error(`порт ${PORT} занят: остановите прошлый сервер приёмки`);
  if (!existsSync(join(APP, "web/dist/index.html"))) throw new Error("нет web/dist: сначала `make web-build`");

  if (!existsSync(ACC_ROOT)) {
    const busy = holders(SRC_ROOT);
    if (busy) throw new Error(`studio.db источника ${SRC_ROOT} открыт процессами ${busy.replace(/\n/g, ",")}: копию делать только без сервера на источнике (грабли №5)`);
    const t0 = Date.now();
    execFileSync("cp", ["-c", "-R", SRC_ROOT, ACC_ROOT], { timeout: 1_800_000 });
    log(`копия хранилища ${SRC_ROOT} → ${ACC_ROOT} (клон APFS) за ${Math.round((Date.now() - t0) / 1000)} с`);
  }
  const cfgPath = join(ACC_ROOT, "config.json");
  const cfg = existsSync(cfgPath) ? (JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>) : {};
  if ((cfg.server as { port?: number } | undefined)?.port !== PORT) writeFileSync(cfgPath, JSON.stringify({ ...cfg, server: { port: PORT } }, null, 2) + "\n");

  // ASR Phase 4 не нужен (транскрипт уже в проекте) — его проблема не останавливает приёмку
  const doctor = JSON.parse(tsx(["server/src/cli/doctor.ts", "--json"])) as { ok: boolean; checks: { name: string; ok: boolean; status: string; detail: string }[] };
  writeEvidence("setup", "doctor.json", JSON.parse(redact(JSON.stringify(doctor))));
  const bad = doctor.checks.filter((c) => !c.ok && c.name !== "asr");
  if (bad.length > 0) throw new Error(`doctor: есть проблемы — ${JSON.stringify(bad)}`);

  const reuse = process.env.MS_ACC_REUSE === "1" && existsSync(STATE_FILE);
  if (reuse) {
    const st = state();
    if (alive(st.serverPid)) throw new Error(`сервер прошлого прогона жив (pid ${st.serverPid})`);
  } else {
    const runDir = join(RUN_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(runDir, { recursive: true });
    const st: AccState = { runDir, serverPid: 0, serverLog: join(runDir, "server.log"), projectId: PROJECT_ID, timings: {} };
    writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + "\n");
    writeEvidence("setup", "source-before.json", { source_store: SRC_ROOT, studio_db_sha256: sha256File(join(SRC_ROOT, "studio.db")), store: ACC_ROOT, at: new Date().toISOString() });
  }
  await startServer();
  saveState({});

  return async () => {
    if (!existsSync(STATE_FILE)) return;
    const { serverPid } = state();
    if (serverPid && alive(serverPid)) await killServer("SIGTERM");
  };
}
