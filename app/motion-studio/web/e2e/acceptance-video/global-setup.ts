// Подготовка приёмки Phase 2–3 (Task 34, `make acceptance-video`): внешний SSD подключён →
// хранилище MotionStudio-acceptance (нет — `doctor --init`) → `doctor` обязан пройти, ASR — `ok`,
// vision — `ok` (не `degraded`) → копия-отрезок сырого ролика (`pick-test-video.mjs --raw`, уже
// сделанная — переиспользуется) → sha256 оригинала и копии «до» → сервер на 127.0.0.1:8790 с
// `web/dist` и реальными claude / ASR-воркером / ffmpeg. Возвращает teardown: SIGTERM серверу.
// MS_ACC_REUSE=1 — продолжить прошлый прогон (state.json): без нового «до», проект тот же.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  ACC_ROOT, ACC_SRC, APP, ORIGINAL, ORIGINAL_SHA256, RUN_ROOT, STATE_FILE, type VideoAccState, alive, killServer, portBusy, redact, saveState,
  sha256File, startServer, state, writeEvidence,
} from "./helpers.js";

const tsx = (args: string[], env: NodeJS.ProcessEnv, timeout = 900_000) =>
  execFileSync(process.execPath, ["--import", "tsx", ...args], { cwd: APP, env, encoding: "utf8", timeout });

/** Копия-отрезок: `MS_ACC_VIDEO` или единственная `IMG_0685-*.mov` в ACC_SRC, иначе — выбор скриптом. */
function pickVideo(): { path: string; window?: { start_s: number; end_s: number }; pick?: unknown } {
  const env = process.env.MS_ACC_VIDEO;
  if (env) return { path: env };
  const have = existsSync(ACC_SRC) ? readdirSync(ACC_SRC).filter((f) => /^IMG_0685-\d+-\d+\.mov$/.test(f)) : [];
  if (have.length === 1) {
    const [, a, b] = /-(\d+)-(\d+)\.mov$/.exec(have[0]!)!;
    return { path: join(ACC_SRC, have[0]!), window: { start_s: Number(a), end_s: Number(b) } };
  }
  const out = execFileSync(process.execPath, [join(APP, "scripts/pick-test-video.mjs"), "--raw"], { cwd: APP, encoding: "utf8", timeout: 1_800_000, maxBuffer: 64 << 20 });
  const pick = JSON.parse(out) as { chosen: { path: string; window: { start_s: number; end_s: number } } };
  return { path: pick.chosen.path, window: pick.chosen.window, pick };
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync("/Volumes/External SSD")) throw new Error("внешний SSD не подключён: приёмка идёт только на /Volumes/External SSD");
  if (await portBusy()) throw new Error("порт 8790 занят: остановите запущенный Motion Studio");
  if (!existsSync(join(APP, "web/dist/index.html"))) throw new Error("нет web/dist: сначала `make web-build`");
  const renamed = readdirSync(dirname(ACC_ROOT)).filter((n) => n.startsWith(`${basename(ACC_ROOT)}.renamed-`));
  if (renamed.length > 0) throw new Error(`найден ${renamed.join(", ")} рядом с ${ACC_ROOT}: прошлый прогон устойчивости не вернул каталог — верните вручную`);
  const env = { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" };
  if (!existsSync(ACC_ROOT)) tsx(["server/src/cli/doctor.ts", "--init"], env);
  // doctor обязан пройти (код 0), ASR и Apple Vision — в строю
  const doctor = JSON.parse(tsx(["server/src/cli/doctor.ts", "--json"], env, 300_000)) as { ok: boolean; checks: { name: string; status: string; detail: string }[] };
  writeEvidence("import", "doctor.json", JSON.parse(redact(JSON.stringify(doctor))));
  if (!doctor.ok) throw new Error(`doctor: есть проблемы — ${JSON.stringify(doctor.checks.filter((c) => c.status !== "ok"))}`);
  for (const name of ["asr", "vision"]) {
    const c = doctor.checks.find((x) => x.name === name);
    if (c?.status !== "ok") throw new Error(`doctor: ${name} не ok — ${JSON.stringify(c)}`);
  }

  const reuse = process.env.MS_ACC_REUSE === "1" && existsSync(STATE_FILE);
  if (reuse) {
    const st = state();
    if (alive(st.serverPid)) throw new Error(`сервер прошлого прогона жив (pid ${st.serverPid})`);
  } else {
    const t0 = Date.now();
    const v = pickVideo();
    const [origBefore, copySha] = await Promise.all([sha256File(ORIGINAL), sha256File(v.path)]);
    if (origBefore !== ORIGINAL_SHA256) throw new Error(`sha256 оригинала ${origBefore} ≠ снятому контроллером ${ORIGINAL_SHA256}`);
    const runDir = join(RUN_ROOT, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(runDir, { recursive: true });
    const st: VideoAccState = {
      runDir, serverPid: 0, serverLog: join(runDir, "server.log"),
      video: { path: v.path, sha256: copySha, ...(v.window ? { window: v.window } : {}) },
      original: { sha256_before: origBefore }, timings: { setup: { wall_ms: Date.now() - t0 } },
    };
    writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + "\n");
    writeEvidence("import", "source-before.json", { original: { path: ORIGINAL, sha256: origBefore }, copy: st.video, at: new Date().toISOString() });
  }
  await startServer();
  saveState({});

  return async () => {
    if (!existsSync(STATE_FILE)) return;
    const { serverPid } = state();
    if (serverPid && alive(serverPid)) await killServer("SIGTERM");
  };
}
