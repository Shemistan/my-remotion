// Доступность ASR (Task 26): python окружения mlx-audio, воркер ai-platform с закреплённым
// sha256 (контракт), веса модели на томе моделей, коммит ai-platform (справочно), занятость
// порта ai-platform 8780 (R15: возможна конкуренция за GPU — предупреждение, не отказ).
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { connect } from "node:net";
import { join, sep } from "node:path";
import { promisify } from "node:util";
import type { AsrConfig } from "../config.js";
import { sha256File as hashFile } from "../scenes/hash.js";
import { modelDir, workerPath } from "./asr-adapter.js";

export type AsrModel = AsrConfig["model"];

export type AsrUnavailableReason = "python_missing" | "worker_missing" | "model_missing" | "asr_contract_changed" | "models_volume_offline";

export type AsrCapability =
  | { available: true; reason?: undefined; workerSha256: string; commit: string; gpuContention: boolean }
  | { available: false; reason: AsrUnavailableReason; detail: string };

export interface AsrCapabilityDeps {
  exists(path: string): Promise<boolean>;
  sha256File(path: string): Promise<string>;
  /** HEAD репозитория ai-platform (только чтение). */
  gitHead(root: string): Promise<string>;
  portBusy(port: number): Promise<boolean>;
}

/** Порт сервиса ai-platform: занят — его модели могут держать GPU (R15). */
export const AI_PLATFORM_PORT = 8780;

const exists = async (p: string) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * `git rev-parse` в каталоге ai-platform — только чтение. Окружение без `GIT_*` (грабли № 3: под
 * pre-commit git передаёт свой `GIT_DIR`); каталог обязан быть корнем репозитория, иначе
 * (ai-platform не репозиторий, а лежит внутри другого) — ошибка, коммит «unknown».
 */
export async function gitHead(root: string): Promise<string> {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  const { stdout } = await promisify(execFile)("git", ["-C", root, "rev-parse", "--show-toplevel", "HEAD"], { env, timeout: 5000 });
  const [top, head] = stdout.trim().split("\n");
  if (!top || !head || !/^[0-9a-f]{40}$/.test(head)) throw new Error(`git rev-parse: неожиданный вывод ${JSON.stringify(stdout.slice(0, 200))}`);
  if ((await realpath(top)) !== (await realpath(root))) throw new Error(`${root} — не корень репозитория (${top})`);
  return head;
}

/** Слушает ли кто-то `127.0.0.1:<port>` (соединение за 300 мс). */
export function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host: "127.0.0.1", port });
    const done = (v: boolean) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(300, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

export const defaultCapabilityDeps: AsrCapabilityDeps = { exists, sha256File: (p) => hashFile(p), gitHead, portBusy };

/** Корень тома `/Volumes/<имя>` для пути на нём, иначе `undefined`. */
function volumeOf(path: string): string | undefined {
  const parts = path.split(sep);
  return parts[1] === "Volumes" && parts[2] ? join(sep, "Volumes", parts[2]) : undefined;
}

/**
 * Проверки по порядку: python → воркер → sha256 воркера (`expectedWorkerSha256`, иначе
 * `asr_contract_changed`) → том моделей смонтирован → веса модели (`config.json` в каталоге) →
 * коммит ai-platform (не читается — «unknown») → порт 8780.
 */
export async function asrCapability(cfg: AsrConfig, deps: AsrCapabilityDeps = defaultCapabilityDeps, o: { model?: AsrModel } = {}): Promise<AsrCapability> {
  const no = (reason: AsrUnavailableReason, detail: string): AsrCapability => ({ available: false, reason, detail });
  if (!(await deps.exists(cfg.python))) return no("python_missing", `python окружения mlx-audio не найден: ${cfg.python} (asr.python / AIP_MONTAGE_ASR_PYTHON)`);
  const worker = workerPath(cfg);
  if (!(await deps.exists(worker))) return no("worker_missing", `воркер ASR ai-platform не найден: ${worker} (asr.aiPlatformRoot / AI_PLATFORM_ROOT)`);
  const sha = await deps.sha256File(worker);
  if (sha !== cfg.expectedWorkerSha256) {
    return no("asr_contract_changed", `sha256 ${worker} = ${sha}, закреплён ${cfg.expectedWorkerSha256}: контракт воркера мог измениться — сверить вывод и обновить asr.expectedWorkerSha256`);
  }
  const vol = volumeOf(cfg.modelsDir);
  if (vol && !(await deps.exists(vol))) return no("models_volume_offline", `том моделей не подключён: ${vol} (asr.modelsDir ${cfg.modelsDir})`);
  if (!(await deps.exists(cfg.modelsDir))) return no("model_missing", `каталога моделей нет: ${cfg.modelsDir}`);
  const model = o.model ?? cfg.model;
  const dir = modelDir(cfg, model);
  if (!(await deps.exists(join(dir, "config.json")))) return no("model_missing", `весов модели ${model} нет: ${dir}`);
  const commit = await deps.gitHead(cfg.aiPlatformRoot).catch(() => "unknown");
  const gpuContention = await deps.portBusy(AI_PLATFORM_PORT).catch(() => false);
  return { available: true, workerSha256: sha, commit, gpuContention };
}
