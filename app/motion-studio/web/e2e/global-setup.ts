// Подготовка Playwright UI: порт 8790 свободен → tmp-хранилище (`doctor --init`,
// MS_ALLOW_SYSTEM_DISK=1 — только для него) → засев версий реальным рендером (`seed-cli.ts`) →
// `server/src/main.ts` (production, `web/dist`) → ждём `/api/health`. Реальное хранилище на SSD
// не трогается: в нём могут быть pending-задачи, которые сервер начал бы выполнять платно.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { APP, type E2EState, PORT, RUN_DIR, STATE_FILE } from "./helpers.js";

const TSX = join(APP, "node_modules/.bin/tsx");

function portBusy(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port: PORT });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function waitReady(timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {
      // ещё не слушает
    }
    if (Date.now() > until) throw new Error(`сервер не ответил на /api/health за ${timeoutMs} мс`);
    await new Promise((res) => setTimeout(res, 500));
  }
}

export default async function globalSetup(): Promise<void> {
  if (await portBusy()) throw new Error(`порт ${PORT} занят: остановите запущенный Motion Studio перед e2e-ui`);
  if (!existsSync(join(APP, "web/dist/index.html"))) throw new Error("нет web/dist: сначала `make web-build`");
  const run = join(RUN_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(run, { recursive: true });
  const root = join(run, "store");
  const env = { ...process.env, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1", MS_LOG_LEVEL: "warn" };
  execFileSync(TSX, ["server/src/cli/doctor.ts", "--init"], { cwd: APP, env, stdio: "ignore" });
  const out = execFileSync(TSX, ["web/e2e/seed-cli.ts"], { cwd: APP, env, encoding: "utf8", timeout: 600_000 });
  const seeded = JSON.parse(out.trim().split("\n").at(-1)!) as Omit<E2EState, "root" | "serverPid" | "serverLog">;

  const serverLog = join(run, "server.log");
  const fd = openSync(serverLog, "a");
  const server = spawn(TSX, ["server/src/main.ts"], { cwd: APP, env, stdio: ["ignore", fd, fd], detached: false });
  server.unref();
  await waitReady(60_000);
  const st: E2EState = { root, serverPid: server.pid!, serverLog, ...seeded };
  writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
}
