// Подготовка приёмки Phase 1 (Task 22): внешний SSD подключён → хранилище
// MotionStudio-acceptance (нет — `doctor --init`) → `doctor` обязан пройти (реальный claude,
// ffmpeg, KB, Chrome, owner-lock) → sha256 исходников KB «до» → засев фикстур (kit-gallery,
// hang-scene; реальный рендер, без LLM) → сервер `server/src/main.ts` на 127.0.0.1:8790 с
// `web/dist` и реальным claude. Возвращает teardown: SIGTERM серверу.
// MS_ACC_REUSE=1 — продолжить прошлый прогон (state.json): без засева и без нового «до».
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACC_DIR, ACC_ROOT, APP, EVIDENCE, STATE_FILE, type AccState, alive, killServer, portBusy, saveState, startServer, state } from "./helpers.js";

const tsx = (args: string[], env: NodeJS.ProcessEnv, timeout = 900_000) =>
  execFileSync(process.execPath, ["--import", "tsx", ...args], { cwd: APP, env, encoding: "utf8", timeout });

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync("/Volumes/External SSD")) throw new Error("внешний SSD не подключён: приёмка идёт только на /Volumes/External SSD");
  if (await portBusy()) throw new Error("порт 8790 занят: остановите запущенный Motion Studio");
  if (!existsSync(join(APP, "web/dist/index.html"))) throw new Error("нет web/dist: сначала `make web-build`");
  const env = { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" };
  const mvp = join(EVIDENCE, "mvp-criteria");
  mkdirSync(mvp, { recursive: true });

  if (!existsSync(ACC_ROOT)) tsx(["server/src/cli/doctor.ts", "--init"], env);
  // doctor обязан пройти (код 0); вывод — в evidence
  const doctor = tsx(["server/src/cli/doctor.ts"], env, 300_000);
  writeFileSync(join(mvp, "doctor.txt"), doctor);

  const reuse = process.env.MS_ACC_REUSE === "1" && existsSync(STATE_FILE);
  if (reuse) {
    const st = state();
    if (alive(st.serverPid)) throw new Error(`сервер прошлого прогона жив (pid ${st.serverPid})`);
    await startServer();
  } else {
    const runDir = join(ACC_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    const hooksDir = join(runDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });
    execFileSync(process.execPath, [join(APP, "scripts/kb-hashes.mjs"), "before", mvp], { cwd: APP, encoding: "utf8" });
    const out = tsx(["web/e2e/acceptance/seed-cli.ts"], env);
    const fixtures = JSON.parse(out.trim().split("\n").at(-1)!) as AccState["fixtures"];
    // отдельное tmp-хранилище для проверочных рендеров теста (стабильность, кадры импульса,
    // раскладка hold): хранилище приёмки при живом сервере пишет только сервер
    const scratchRoot = join(runDir, "scratch-store");
    tsx(["server/src/cli/doctor.ts", "--init"], { ...env, MS_DATA_DIR: scratchRoot, MS_ALLOW_SYSTEM_DISK: "1" });
    const serverLog = join(runDir, "server.log");
    writeFileSync(STATE_FILE, JSON.stringify({ runDir, serverPid: 0, serverLog, hooksDir, scratchRoot, fixtures } satisfies AccState, null, 2) + "\n");
    await startServer({ hooksDir, serverLog });
  }
  saveState({});

  return async () => {
    if (!existsSync(STATE_FILE)) return;
    const { serverPid } = state();
    if (serverPid && alive(serverPid)) await killServer("SIGTERM");
  };
}
