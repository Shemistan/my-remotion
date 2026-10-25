// Тестовые хуки приёмки (Task 22, `09` §5 п. 8–9) в процессе настоящего сервера. Включаются
// ТОЛЬКО переменной MS_TEST_HOOKS=1 (и каталогом взвода MS_TEST_HOOKS_DIR); маршрутов не
// регистрируют — взвод кладёт тест файлом `<MS_TEST_HOOKS_DIR>/arm.json`, его забирает первая
// попытка `scene.export` (атомарный rename, одноразово):
// - `{"hook":"stale-attempt"}` — после рендера экспорта задача возвращается в очередь (как
//   при потере lease), раннер захватывает новую попытку, а устаревшая доходит до публикации:
//   её отклоняет fencing (`fenced_out`), draft уходит в карантин; новая попытка экспортирует;
// - `{"hook":"orphan","cmd":…,"args":[…]}` — вместо экспорта попытка запускает `cmd` через
//   spawnTracked (реестр попытки) и ждёт отмены: «живой рендер» для `kill -9` сервера.
// Предохранители: хуки отказываются стартовать, если MS_DATA_DIR — не хранилище приёмки
// (внутри `<папка материалов>/acceptance/`, S18) и не временный каталог (os.tmpdir() или tmp/ репозитория, юнит-тесты);
// arm.json проверяется схемой — неизвестный хук или лишнее поле → задача failed с причиной.
import { readFileSync, realpathSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MATERIALS_ROOT, materialsRoot, spawnTracked } from "@ms/core";
import type { exportVersion } from "@ms/render";
import * as jobs from "../db/repos/jobs.js";
import type { Handlers, JobContext } from "./types.js";

export const TestHookArmSchema = z.discriminatedUnion("hook", [
  z.object({ hook: z.literal("stale-attempt") }).strict(),
  z.object({ hook: z.literal("orphan"), cmd: z.string().min(1), args: z.array(z.string()) }).strict(),
]);
export type TestHookArm = z.infer<typeof TestHookArmSchema>;

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
/** tmp/ репозитория (этот файл — app/motion-studio/server/src/jobs/). */
const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

const inside = (dir: string, root: string) => {
  const r = relative(root, dir);
  return r !== "" && !r.startsWith("..") && !isAbsolute(r);
};
const real = (p: string) => {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
};

/** Хранилище, на котором хуки допустимы: внутри `<папка материалов>/acceptance/` или временный каталог. */
function allowedDataDir(env: NodeJS.ProcessEnv): void {
  const d = env.MS_DATA_DIR?.trim();
  if (!d) throw new Error("MS_TEST_HOOKS=1 требует MS_DATA_DIR (хранилище приёмки в папке материалов acceptance/)");
  const abs = resolve(d);
  // рабочее хранилище по умолчанию — никогда, как бы ни был задан MS_MATERIALS_ROOT
  const store = join(MATERIALS_ROOT, "store");
  if (abs === store || inside(abs, store) || real(abs) === real(store) || inside(real(abs), real(store))) {
    throw new Error(`MS_TEST_HOOKS=1 запрещён на рабочем хранилище ${store}: только хранилище приёмки (acceptance/ папки материалов) или временный каталог`);
  }
  const acc = join(materialsRoot(env), "acceptance");
  if (inside(abs, acc) || inside(real(abs), real(acc))) return;
  const temp = [tmpdir(), REPO_TMP].flatMap((t) => [resolve(t), real(t)]);
  if (temp.some((t) => inside(abs, t) || inside(real(abs), t))) return;
  throw new Error(`MS_TEST_HOOKS=1 разрешён только на хранилище приёмки (внутри ${acc}/) или во временном каталоге, а не на ${abs}`);
}

/** Разбор взвода: неизвестный хук или лишнее поле — явная ошибка. */
function parseArm(text: string, file: string): TestHookArm {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`тестовый хук: ${file} — не JSON: ${(e as Error).message}`, { cause: e });
  }
  const r = TestHookArmSchema.safeParse(raw);
  if (r.success) return r.data;
  const hook = (raw as { hook?: unknown } | null)?.hook;
  const known: string[] = TestHookArmSchema.options.map((o) => o.shape.hook.value);
  const why = typeof hook === "string" && !known.includes(hook)
    ? `неизвестный хук «${hook}» (есть: ${known.join(", ")})`
    : r.error.issues.map((i) => `${i.path.join(".") || "(корень)"}: ${i.message}`).join("; ");
  throw new Error(`тестовый хук: ${file} не по форме — ${why}`);
}

export function testHooks(env: NodeJS.ProcessEnv, log?: (line: string) => void): TestHooks | undefined {
  if (env.MS_TEST_HOOKS !== "1") return undefined;
  const dir = env.MS_TEST_HOOKS_DIR;
  if (!dir) throw new Error("MS_TEST_HOOKS=1 требует MS_TEST_HOOKS_DIR (каталог взвода arm.json)");
  allowedDataDir(env);
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
    return parseArm(readFileSync(taken, "utf8"), ARM);
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
