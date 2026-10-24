// Остановка сервера Playwright UI: SIGTERM (API, раннер, БД, owner-lock) и ожидание выхода.
// tmp-хранилище остаётся в tmp/ui-e2e/ для разбора.
import { existsSync } from "node:fs";
import { STATE_FILE, state } from "./helpers.js";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_FILE)) return;
  const { serverPid } = state();
  if (!alive(serverPid)) return;
  process.kill(serverPid, "SIGTERM");
  const until = Date.now() + 30_000;
  while (alive(serverPid) && Date.now() < until) await new Promise((r) => setTimeout(r, 300));
  if (alive(serverPid)) process.kill(serverPid, "SIGKILL");
}
