// generate: сцена Motion Playground из текстового запроса (вертикальный срез).
// `npm run generate -- "<запрос>" [--duration-frames N] [--aspect 16:9|9:16|1:1]
//   [--style dark-premium|light-clean|tech-neon]`
// Порядок старта (ADR 0007): owner lock (держим до выхода) → checkStorage → reapStale
// незавершённых прогонов + reapStrayRenderers (не чисто — отказ с pid и командой) →
// relockVersions → generateScene. Код выхода 1 при failed и любом отказе, 2 — usage.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Settings, SettingsSchema, StylePresetSchema, defaultSettings } from "@ms/contracts";
import {
  OwnerBusyError,
  type OwnerLock,
  type StorageEnv,
  type StorageStatus,
  type TrackedProcess,
  acquireOwnerLock,
  checkStorage,
  fileProcessRegistry,
  macosProbe,
  reapStale,
} from "@ms/core";
import { findRenderBrowser, reapStrayRenderers, renderVersion } from "@ms/render";
import { ClaudeCodeRuntime } from "../agents/claude-code.js";
import { loadConfig, readConfigFile } from "../config.js";
import { KnowledgeAdapter } from "../knowledge/adapter.js";
import { DEFAULT_PROMPTS_DIR, type GenerateResult, generateScene } from "../pipeline/generate.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { relockVersions } from "../scenes/store.js";
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

/** Шаги старта и генерации; в тестах подменяются. */
export interface CliSteps {
  acquireLock(root: string): Promise<OwnerLock>;
  checkStorage(env: StorageEnv): Promise<StorageStatus>;
  /** Прогоны, у которых остались записи в `run/processes/`. */
  leftoverRuns(root: string): Promise<string[]>;
  reapStale(root: string, runId: string): Promise<{ clean: boolean; alive: TrackedProcess[] }>;
  reapStrays(root: string): Promise<{ pid: number; pgid: number }[]>;
  relock(root: string): Promise<{ relocked: string[]; broken: { dir: string; error: string }[] }>;
  generate(prompt: string, settings: Settings, status: Extract<StorageStatus, { ok: true }>, env: NodeJS.ProcessEnv, signal: AbortSignal, log: (l: string) => void): Promise<GenerateResult>;
}

async function leftoverRuns(root: string): Promise<string[]> {
  const records = await fileProcessRegistry(root).list();
  return [...new Set(records.map((p) => p.runId))];
}

/** Настоящая генерация: config.json, KB, Claude Code, рендер. */
async function realGenerate(
  prompt: string,
  settings: Settings,
  status: Extract<StorageStatus, { ok: true }>,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  log: (l: string) => void,
): Promise<GenerateResult> {
  const root = status.root;
  findRenderBrowser(); // нет Chrome — отказ до трат на агентов
  const config = loadConfig({ ...env, MS_DATA_DIR: root }, await readConfigFile(root));
  const kb = await KnowledgeAdapter.load({ kbRoot: config.kb.root, sourceRoot: config.kb.sourceRoot });
  const agents = new ClaudeCodeRuntime({ bin: config.claudeBin, logRoot: join(root, "logs", "agent-runs"), promptsDir: DEFAULT_PROMPTS_DIR });
  const storeId = status.marker.store_id;
  return generateScene(
    prompt,
    settings,
    {
      storage: () => checkStorage(env, macosProbe, storeId),
      kb,
      agents,
      render: renderVersion,
      check: checkSceneDir,
      typecheck: typecheckVersion,
      config,
      log,
    },
    signal,
  );
}

export const realSteps: CliSteps = {
  acquireLock: (root) => acquireOwnerLock(root, "cli"),
  checkStorage: (env) => checkStorage(env, macosProbe),
  leftoverRuns,
  reapStale: (root, runId) => reapStale(root, runId),
  reapStrays: (root) => reapStrayRenderers(root),
  relock: relockVersions,
  generate: realGenerate,
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

  let lock: OwnerLock;
  try {
    lock = await steps.acquireLock(root);
  } catch (e) {
    io.err(e instanceof OwnerBusyError ? e.message : `owner lock не взят: ${(e as Error).message}`);
    return 1;
  }
  try {
    const status = await steps.checkStorage(env);
    if (!status.ok) {
      io.err(`storage: ${status.reason}: ${status.detail}`);
      return 1;
    }

    // остатки прежних прогонов: сначала добить, иначе отказ (ADR 0007)
    for (const runId of await steps.leftoverRuns(root)) {
      const r = await steps.reapStale(root, runId);
      if (!r.clean) {
        const who = r.alive.map((p) => `pid ${p.pid} (${p.cmd})`).join("; ");
        io.err(`stale_process: процессы прогона ${runId} не завершились: ${who}. Заверши их вручную и повтори.`);
        return 1;
      }
    }
    const strays = await steps.reapStrays(root);
    if (strays.length > 0) {
      io.err(`stale_process: процессы рендера не завершились: ${strays.map((p) => `pid ${p.pid}`).join(", ")}. Заверши их вручную и повтори.`);
      return 1;
    }
    const relock = await steps.relock(root);
    for (const d of relock.relocked) io.err(`relock: версия закрыта от записи: ${d}`);
    for (const b of relock.broken) io.err(`⚠ повреждённая версия (не тронута): ${b.dir}: ${b.error}`);

    const t0 = Date.now();
    const r = await steps.generate(args.prompt, args.settings, status, env, signal, (l) => io.err(l));
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
    await lock.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  process.once("SIGTERM", () => ac.abort());
  const code = await runGenerate(process.argv.slice(2), process.env, { out: (l) => console.log(l), err: (l) => console.error(l) }, realSteps, ac.signal);
  process.exitCode = code;
}
