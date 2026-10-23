// Тестовые хуки приёмки (Task 22, `09` §5 п. 8–9) в процессе настоящего сервера. Включаются
// ТОЛЬКО переменной MS_TEST_HOOKS=1 (и каталогом взвода MS_TEST_HOOKS_DIR); маршрутов не
// регистрируют — взвод кладёт тест файлом `<MS_TEST_HOOKS_DIR>/arm.json`, его забирает первая
// попытка `scene.export` (атомарный rename, одноразово):
// - `{"hook":"stale-attempt"}` — после рендера экспорта задача возвращается в очередь (как
//   при потере lease), раннер захватывает новую попытку, а устаревшая доходит до публикации:
//   её отклоняет fencing (`fenced_out`), draft уходит в карантин; новая попытка экспортирует;
// - `{"hook":"orphan","cmd":…,"args":[…]}` — вместо экспорта попытка запускает `cmd` через
//   spawnTracked (реестр попытки) и ждёт отмены: «живой рендер» для `kill -9` сервера.
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { spawnTracked } from "@ms/core";
import type { exportVersion } from "@ms/render";
import * as jobs from "../db/repos/jobs.js";
import type { Handlers, JobContext } from "./types.js";

export type TestHookArm = { hook: "stale-attempt" } | { hook: "orphan"; cmd: string; args: string[] };

export interface TestHooks {
  /** Обёртка обработчика `scene.export`: забирает взвод на попытку. */
  wrap(handlers: Handlers): Handlers;
  /** Обёртка `exportVersion`: момент «рендер готов, публикации ещё не было». */
  exportVersion(real: typeof exportVersion): typeof exportVersion;
}

const ARM = "arm.json";
/** Сколько ждать захвата новой попытки (опрос раннера — доли секунды). */
const TAKEOVER_MS = 60_000;
const key = (runId: string, attempt: number) => `${runId}#${attempt}`;

export function testHooks(env: NodeJS.ProcessEnv, log?: (line: string) => void): TestHooks | undefined {
  if (env.MS_TEST_HOOKS !== "1") return undefined;
  const dir = env.MS_TEST_HOOKS_DIR;
  if (!dir) throw new Error("MS_TEST_HOOKS=1 требует MS_TEST_HOOKS_DIR (каталог взвода arm.json)");
  log?.(`внимание: тестовые хуки включены (MS_TEST_HOOKS=1, взвод — ${join(dir, ARM)})`);
  const armed = new Map<string, { ctx: JobContext; arm: TestHookArm }>();

  /** Забирает взвод (rename атомарен: из двух попыток его получит одна). */
  const take = (who: string): TestHookArm | undefined => {
    const taken = join(dir, `${ARM}.taken-${who}`);
    try {
      renameSync(join(dir, ARM), taken);
    } catch {
      return undefined;
    }
    return JSON.parse(readFileSync(taken, "utf8")) as TestHookArm;
  };

  return {
    wrap(handlers) {
      const real = handlers["scene.export"];
      if (!real) return handlers;
      return {
        ...handlers,
        "scene.export": async (ctx) => {
          const arm = take(`${ctx.job.id}-a${ctx.attempt}`);
          if (!arm) return real(ctx);
          ctx.emit("test_hook", `тестовый хук ${arm.hook} (MS_TEST_HOOKS=1)`);
          if (arm.hook === "orphan") {
            const r = await spawnTracked(ctx.run.root, ctx.run, arm.cmd, arm.args, {
              cwd: ctx.run.root, env: { PATH: env.PATH ?? "/usr/bin:/bin" }, signal: ctx.signal, registry: ctx.run.registry, killGraceMs: 1000,
            });
            if (r.orphaned) return { status: "blocked", error: { code: "stale_process", stage: "orphaned", message: "тестовый хук orphan: группа не исчезла" } };
            return { status: "failed", error: { code: "pipeline", stage: "export", message: `тестовый хук orphan: процесс вышел (${r.code ?? r.signal})` } };
          }
          const k = key(ctx.job.id, ctx.attempt);
          armed.set(k, { ctx, arm });
          try {
            return await real(ctx);
          } finally {
            armed.delete(k);
          }
        },
      };
    },

    exportVersion(real) {
      return async (req, signal, deps) => {
        const r = await real(req, signal, deps);
        const a = armed.get(key(req.run.runId, req.run.attempt));
        if (a?.arm.hook !== "stale-attempt") return r;
        const { ctx } = a;
        // как потеря lease: задача снова в очереди, эта попытка продолжает и дойдёт до публикации
        jobs.update(ctx.db, ctx.job.id, { status: "pending", lease_owner: null, lease_until: null });
        ctx.emit("test_hook", `попытка ${ctx.attempt}: рендер готов, задача возвращена в очередь — ждём новую попытку`);
        const until = Date.now() + TAKEOVER_MS;
        while ((jobs.get(ctx.db, ctx.job.id)?.attempt ?? 0) <= ctx.attempt) {
          if (Date.now() > until) throw new Error(`тестовый хук stale-attempt: новая попытка не захватила задачу за ${TAKEOVER_MS} мс`);
          await new Promise((res) => setTimeout(res, 50));
        }
        return r;
      };
    },
  };
}
