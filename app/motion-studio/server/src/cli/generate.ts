// generate: сцена Motion Playground из текстового запроса (вертикальный срез).
// `npm run generate -- "<запрос>" [--duration-frames N] [--aspect 16:9|9:16|1:1]
//   [--style dark-premium|light-clean|tech-neon]`
// Старт — общий с сервером `bootCore({ kind: "cli" })` (ADR 0007): owner lock → storage →
// studio.db → реестр процессов → reap (не чисто — отказ с pid и командой) → sweep →
// relock → reconcile → восстановление задач → раннер. Затем ensureRenderBrowser (до трат
// на агентов), сцена и задача `playground.generate` (обработчик `interimGenerate`) в этом
// же процессе; CLI ждёт её итога. Код выхода 1 при failed и любом отказе, 2 — usage.
import { pathToFileURL } from "node:url";
import { type Settings, SettingsSchema, StylePresetSchema, defaultSettings } from "@ms/contracts";
import { OwnerBusyError, StorageError } from "@ms/core";
import { ensureRenderBrowser, renderVersion } from "@ms/render";
import { type BootOptions, type Core, bootCore } from "../boot.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { interimGenerate } from "../jobs/interim-generate.js";
import { enqueue, requestCancel } from "../jobs/queue.js";
import { type GenerateResult, generateScene } from "../pipeline/generate.js";
import { newId } from "../scenes/ids.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { DEFAULT_PROJECT } from "../scenes/store.js";
import { typecheckVersion } from "../scenes/typecheck.js";

export const USAGE =
  'usage: generate "<запрос>" [--duration-frames N] [--aspect 16:9|9:16|1:1] [--style dark-premium|light-clean|tech-neon]';

const SIZES: Record<Settings["aspect_ratio"], [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
};

/** Разбор аргументов; ошибка — строка с причиной. */
export function parseArgs(argv: string[]): { prompt: string; settings: Settings } | string {
  const s = defaultSettings();
  let prompt: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a}: нет значения`);
      return v;
    };
    try {
      if (a === "--duration-frames") {
        const n = Number(val());
        if (!Number.isInteger(n) || n <= 0) return `--duration-frames: нужно целое > 0`;
        s.duration_frames = n;
      } else if (a === "--aspect") {
        const v = val();
        if (!(v in SIZES)) return `--aspect: 16:9 | 9:16 | 1:1, получено ${v}`;
        s.aspect_ratio = v as Settings["aspect_ratio"];
        [s.width, s.height] = SIZES[s.aspect_ratio];
      } else if (a === "--style") {
        const v = StylePresetSchema.safeParse(val());
        if (!v.success) return `--style: dark-premium | light-clean | tech-neon`;
        s.style_preset = v.data;
      } else if (a.startsWith("--")) {
        return `неизвестный флаг ${a}`;
      } else if (prompt === undefined) {
        prompt = a;
      } else {
        return "запрос — один аргумент (возьми его в кавычки)";
      }
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (!prompt?.trim()) return "нет запроса";
  return { prompt: prompt.trim(), settings: SettingsSchema.parse(s) };
}

/** Ядро для CLI: `Core` и итоги пайплайна по задачам (печатаются и при неудаче). */
export type CliCore = Pick<Core, "root" | "reaped" | "boot" | "close"> & {
  /** Ставит задачу генерации и ждёт итога; `signal` — отмена (Ctrl-C). */
  generate(prompt: string, settings: Settings, signal: AbortSignal): Promise<GenerateResult>;
};

/** Шаги CLI; в тестах подменяются. */
export interface CliSteps {
  boot(env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<CliCore>;
  /** Chrome Headless Shell на месте (скачать при отсутствии); CLI может менять cwd. */
  ensureBrowser(): Promise<{ path: string }>;
}

const TERMINAL = new Set(["completed", "failed", "cancelled", "blocked", "awaiting_input", "awaiting_approval"]);

/**
 * Настоящий старт: `bootCore` с обработчиком `playground.generate` = `interimGenerate`
 * (config.json, KB, Claude Code, рендер). `opts` — подмены для интеграционных тестов.
 */
export async function bootCli(env: NodeJS.ProcessEnv, log: (line: string) => void, opts: Partial<BootOptions> & { generate?: typeof generateScene } = {}): Promise<CliCore> {
  const results = new Map<string, GenerateResult>();
  const core = await bootCore({
    env,
    kind: "cli",
    ...opts,
    handlers: (svc) => ({
      "playground.generate": interimGenerate({
        deps: () => ({
          storage: svc.storageCheck,
          kb: svc.kb,
          agents: svc.agents,
          render: renderVersion,
          check: checkSceneDir,
          typecheck: typecheckVersion,
          config: svc.config,
          log,
        }),
        generate: opts.generate,
        onResult: (job, r) => results.set(job.id, r),
      }),
    }),
  });
  return {
    root: core.root,
    reaped: core.reaped,
    boot: core.boot,
    close: () => core.close(),
    async generate(prompt, settings, signal) {
      const job = tx(core.db, () => {
        const scene = core.repo.createScene(DEFAULT_PROJECT, { prompt, settings });
        const input = { sceneId: scene.id, prompt, settings };
        return enqueue(core.db, { type: "playground.generate", projectId: DEFAULT_PROJECT, sceneId: scene.id, input, idempotencyKey: `cli-${newId("run")}` }).job;
      });
      const onAbort = () => {
        try {
          requestCancel(core.db, job.id);
        } catch {
          // база недоступна — задачу разберёт восстановление
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        for (;;) {
          const j = jobs.get(core.db, job.id);
          if (j && TERMINAL.has(j.status)) {
            const r = results.get(job.id);
            if (r) return r;
            const stage = j.error?.stage ?? (j.status === "blocked" ? "orphaned" : "publish");
            return { status: "failed", runId: job.id, costUsd: 0, engineerCalls: 0, warnings: [], timings: {}, failure: { stage, message: j.error?.message ?? j.status } };
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

export const realSteps: CliSteps = {
  boot: (env, log) => bootCli(env, log),
  ensureBrowser: ensureRenderBrowser,
};

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export async function runGenerate(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
  steps: CliSteps = realSteps,
  signal: AbortSignal = new AbortController().signal,
): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    io.err(`${args}\n${USAGE}`);
    return 2;
  }
  const root = env.MS_DATA_DIR?.trim();
  if (!root) {
    io.err("storage: env_missing: MS_DATA_DIR не задан");
    return 1;
  }

  let core: CliCore;
  try {
    core = await steps.boot(env, (l) => io.err(l));
  } catch (e) {
    if (e instanceof OwnerBusyError || e instanceof StorageError) io.err(e.message);
    else io.err(`ошибка старта: ${(e as Error).message}`);
    return 1;
  }
  try {
    // остатки прежних прогонов не завершились — отказ (ADR 0007)
    if (core.reaped.alive.length > 0) {
      const byRun = new Map<string, string[]>();
      for (const p of core.reaped.alive) byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), `pid ${p.pid} (${p.cmd})`]);
      for (const [runId, who] of byRun) io.err(`stale_process: процессы прогона ${runId} не завершились: ${who.join("; ")}. Заверши их вручную и повтори.`);
      return 1;
    }
    if (core.reaped.strays.length > 0) {
      io.err(`stale_process: процессы рендера не завершились: ${core.reaped.strays.map((p) => `pid ${p.pid}`).join(", ")}. Заверши их вручную и повтори.`);
      return 1;
    }
    for (const d of core.boot.swept.quarantined) io.err(`⚠ брошенный draft помечен карантином (abandoned): ${d}`);
    for (const d of core.boot.relock.relocked) io.err(`relock: версия закрыта от записи: ${d}`);
    for (const b of core.boot.relock.broken) io.err(`⚠ повреждённая версия (не тронута): ${b.dir}: ${b.error}`);
    for (const b of core.boot.reconcile.missing.broken) io.err(`⚠ версия ${b.versionId} недоступна (broken): ${b.reason}`);

    try {
      await steps.ensureBrowser();
    } catch (e) {
      io.err(`render: Chrome Headless Shell недоступен (${(e as Error).message}); запусти npm run doctor`);
      return 1;
    }

    const t0 = Date.now();
    const r = await core.generate(args.prompt, args.settings, signal);
    io.out(`status: ${r.status}`);
    if (r.failure) io.out(`failure: ${r.failure.stage}: ${r.failure.message}`);
    if (r.versionDir) io.out(`version: ${r.versionDir}`);
    if (r.previewPath) io.out(`preview: ${r.previewPath}`);
    io.out(`cost: $${r.costUsd.toFixed(2)}; engineer calls: ${r.engineerCalls}; time: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const w of r.warnings) io.out(`warning: ${w}`);
    return r.status === "ready" ? 0 : 1;
  } catch (e) {
    io.err(`ошибка: ${(e as Error).message}`);
    return 1;
  } finally {
    await core.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  process.once("SIGTERM", () => ac.abort());
  const code = await runGenerate(process.argv.slice(2), process.env, { out: (l) => console.log(l), err: (l) => console.error(l) }, realSteps, ac.signal);
  process.exitCode = code;
}
