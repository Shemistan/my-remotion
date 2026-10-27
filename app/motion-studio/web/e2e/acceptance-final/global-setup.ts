// Подготовка приёмки Phase 5 (Task 46, `make acceptance-final`): внешний SSD подключён → хранилище
// приёмки `materialsPath("acceptance", "phase5")`: нет — клон APFS (`cp -c -R`) хранилища приёмки
// Phase 4 `acceptance/phase4`; перед копией на источнике не должно быть живого сервера (studio.db никем
// не открыт — `lsof`, грабли №5) → копия-вырезка 60–120 с сырого ролика в `acceptance/phase5-src`
// (`ffmpeg -c copy`, оригинал только читается, sha256 до) → `server.port` копии = порт приёмки → doctor
// (ASR нужен: Test 4 распознаёт речь) → сервер на 127.0.0.1:<порт> с `web/dist`, реальными claude,
// рендером и ffmpeg. Teardown — SIGTERM серверу. MS_ACC_REUSE=1 — продолжить прогон (state.json).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { materialsRoot } from "../../../core/src/storage/materials.js";
import {
  ACC_ROOT, ACC_SRC, APP, CUT, ORIGINAL, PORT, RUN_DIR, SRC_ROOT, STATE_FILE, type AccState, alive, killServer, log, portBusy, redact, saveState, shasum,
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

  const reuse = process.env.MS_ACC_REUSE === "1" && existsSync(STATE_FILE);
  let source: Record<string, unknown> | undefined;
  if (!existsSync(ACC_ROOT)) {
    const busy = holders(SRC_ROOT);
    if (busy) throw new Error(`studio.db источника ${SRC_ROOT} открыт процессами ${busy.replace(/\n/g, ",")}: копию делать только без сервера на источнике (грабли №5)`);
    const before = shasum(join(SRC_ROOT, "studio.db"));
    const t0 = Date.now();
    execFileSync("cp", ["-c", "-R", SRC_ROOT, ACC_ROOT], { timeout: 1_800_000 });
    source = { source_store: SRC_ROOT, studio_db_sha256_before: before, store: ACC_ROOT, clone_s: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() };
    log(`копия хранилища ${SRC_ROOT} → ${ACC_ROOT} (клон APFS) за ${source.clone_s} с`);
  }
  const cfgPath = join(ACC_ROOT, "config.json");
  const cfg = existsSync(cfgPath) ? (JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>) : {};
  if ((cfg.server as { port?: number } | undefined)?.port !== PORT) writeFileSync(cfgPath, JSON.stringify({ ...cfg, server: { port: PORT } }, null, 2) + "\n");

  // копия-вырезка сырого ролика: -c copy (без перекодирования), оригинал только читается
  const cutName = `IMG_0685-${CUT.start_s}-${CUT.start_s + CUT.dur_s}.mov`;
  const cut = join(ACC_SRC, cutName);
  let original: { sha256_before: string } | undefined;
  if (!existsSync(cut)) {
    mkdirSync(ACC_SRC, { recursive: true });
    original = { sha256_before: shasum(ORIGINAL) };
    execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(CUT.start_s), "-t", String(CUT.dur_s), "-protocol_whitelist", "file", "-i", `file:${ORIGINAL}`,
      "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", `file:${cut}`], { timeout: 1_800_000 });
    log(`вырезка ${cut}`);
  }

  const doctor = JSON.parse(tsx(["server/src/cli/doctor.ts", "--json"])) as { ok: boolean; checks: { name: string; ok: boolean; status: string; detail: string }[] };
  writeEvidence("setup", "doctor.json", JSON.parse(redact(JSON.stringify(doctor))));
  const bad = doctor.checks.filter((c) => !c.ok && !["warning", "skipped"].includes(c.status));
  if (bad.length > 0) throw new Error(`doctor: есть проблемы — ${JSON.stringify(bad)}`);

  if (reuse) {
    const st = state();
    if (alive(st.serverPid)) throw new Error(`сервер прошлого прогона жив (pid ${st.serverPid})`);
  } else {
    const runDir = join(RUN_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(runDir, { recursive: true });
    const st: AccState = { runDir, serverPid: 0, serverLog: join(runDir, "server.log"), timings: {}, video: { path: cut, sha256: shasum(cut) } };
    if (original) st.original = original;
    writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + "\n");
    if (source) writeEvidence("setup", "source-before.json", source);
  }
  await startServer();
  saveState({});

  return async () => {
    if (!existsSync(STATE_FILE)) return;
    const { serverPid } = state();
    if (serverPid && alive(serverPid)) await killServer("SIGTERM");
  };
}
