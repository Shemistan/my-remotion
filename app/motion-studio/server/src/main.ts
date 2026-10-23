// Точка входа сервера (`npm start`, `npm run dev`): `bootCore({ kind: "server" })` (ADR 0007
// п. 5: owner-lock → хранилище → БД → реестр → восстановление → раннер с обработчиками задач)
// → Control API → `listen` только на 127.0.0.1:8790. SIGTERM/SIGINT: API закрывается (SSE-потоки
// тоже), раннер прерывает попытки, БД закрывается, owner-lock освобождается.
// `--dev` — Vite middleware (Q7), иначе статика `web/dist`.
import { pathToFileURL } from "node:url";
import { PORT, buildApp } from "./api/app.js";
import { bootCore } from "./boot.js";
import { registerHandlers } from "./jobs/handlers.js";

export const HOST = "127.0.0.1";

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const dev = argv.includes("--dev");
  const log = (line: string) => console.log(`[motion-studio] ${line}`);
  const core = await bootCore({
    env,
    kind: "server",
    handlers: (svc) => registerHandlers(svc, { log }),
    storageLog: (l) => log(`storage: ${l}`),
    log: (step) => log(`boot: ${step}`),
  });
  for (const w of core.boot.reconcile.missing.broken) log(`предупреждение: версия недоступна: ${JSON.stringify(w)}`);
  if (core.reaped.alive.length > 0) log(`предупреждение: живы процессы прежних попыток: ${core.reaped.alive.map((p) => p.pid).join(", ")}`);

  let app;
  try {
    app = await buildApp(core, { port: PORT, dev, logger: { level: env.MS_LOG_LEVEL ?? "info" } });
    await app.listen({ host: HOST, port: PORT });
  } catch (e) {
    await app?.close().catch(() => undefined);
    await core.close();
    throw e;
  }
  log(`Control API: http://${HOST}:${PORT}${dev ? " (dev, Vite)" : ""}; хранилище ${core.root}`);

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: остановка — API, раннер (abort попыток), БД, owner-lock`);
    try {
      await app.close();
    } finally {
      await core.close();
    }
    log("остановлен");
  };
  for (const s of ["SIGTERM", "SIGINT"] as const) {
    process.once(s, () => {
      stop(s).then(
        () => process.exit(0),
        (e: unknown) => {
          console.error(e);
          process.exit(1);
        },
      );
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((e: unknown) => {
    console.error(`[motion-studio] не запустился: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}
