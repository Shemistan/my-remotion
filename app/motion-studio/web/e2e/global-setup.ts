// Подготовка Playwright UI: порт 8790 свободен → tmp-хранилище (`doctor --init`,
// MS_ALLOW_SYSTEM_DISK=1 — только для него) → засев версий реальным рендером (`seed-cli.ts`) →
// `server/src/main.ts` (production, `web/dist`) → ждём `/api/health`. claudeBin — заглушка:
// платных вызовов агентов в UI-e2e нет. Реальное хранилище на SSD
// не трогается: в нём могут быть pending-задачи, которые сервер начал бы выполнять платно.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { APP, type E2EState, MEDIA_FIXTURES, PORT, RUN_DIR, STATE_FILE, talkingHead } from "./helpers.js";

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
  // агенты Claude в UI-e2e не вызываются никогда: claudeBin — заглушка, которая сразу падает
  // (Visual QA после «Рендера» получает ошибку агента, версия публикуется без его оценки)
  const fakeClaude = join(run, "claude-disabled");
  writeFileSync(fakeClaude, "#!/bin/sh\necho 'claude отключён в UI-e2e' >&2\nexit 1\n", { mode: 0o755 });
  const configPath = join(root, "config.json");
  const config = existsSync(configPath) ? (JSON.parse(readFileSync(configPath, "utf8")) as object) : {};
  // видеопроект (Task 29): импорт по пути — только из каталога фикстур (ffmpeg + say), ASR —
  // настоящий воркер ai-platform по умолчаниям config.ts
  if (!["talk-ru-cfr.mp4", "Запись экрана 1.mp4"].every((f) => existsSync(join(MEDIA_FIXTURES, f)))) {
    execFileSync(process.execPath, [join(APP, "scripts/make-media-fixtures.mjs")], { cwd: APP, stdio: "ignore", timeout: 300_000 });
  }
  // Task 33: ролик с лицом (`MS_TEST_TALKING_HEAD`) импортируется по пути — его каталог тоже корень импорта
  const head = talkingHead();
  const importRoots = head ? [MEDIA_FIXTURES, dirname(head)] : [MEDIA_FIXTURES];
  writeFileSync(configPath, JSON.stringify({ ...config, claudeBin: fakeClaude, media: { importRoots } }, null, 2));
  const out = execFileSync(TSX, ["web/e2e/seed-cli.ts"], { cwd: APP, env, encoding: "utf8", timeout: 600_000 });
  const seeded = JSON.parse(out.trim().split("\n").at(-1)!) as Omit<E2EState, "root" | "serverPid" | "serverLog">;

  const serverLog = join(run, "server.log");
  const fd = openSync(serverLog, "a");
  // один процесс (`node --import tsx`, как `npm start`): `kill -9` в video-phase2.spec бьёт сам сервер
  const server = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], { cwd: APP, env, stdio: ["ignore", fd, fd], detached: false });
  server.unref();
  await waitReady(60_000);
  const st: E2EState = { root, serverPid: server.pid!, serverLog, ...seeded };
  writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
}
