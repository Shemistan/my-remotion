// Чекпоинты шагов задачи (M7, `04` §6): результат Concept и Motion Director сохраняется в
// `logs/agent-runs/<jobId>/checkpoints/<role>.json` рядом с журналами ClaudeCodeRuntime.
// Новая попытка той же задачи с тем же `input_hash` берёт результат отсюда, а не зовёт
// агента снова. Путь не зависит от попытки: `claimNext` обнуляет `output_refs`, а файл
// остаётся.
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeMkdir } from "@ms/core";
import type { Role } from "../agents/runtime.js";
import { canonicalJson } from "../jobs/queue.js";
import { sha256 } from "../scenes/hash.js";

export interface Checkpoint {
  input_hash: string;
  output: unknown;
}

/** Ссылка на чекпоинт в `jobs.output_refs_json.steps.<role>`. */
export interface StepRef {
  input_hash: string;
  path: string;
}

/** Каталог чекпоинтов задачи относительно корня хранилища. */
export const checkpointsRel = (jobId: string): string => join("logs", "agent-runs", jobId, "checkpoints");

/** Файл чекпоинта роли: чтение (`toolless`) и запись — по одному пути. */
export const checkpointPath = (root: string, jobId: string, role: Role): string => join(root, checkpointsRel(jobId), `${role}.json`);

/** Хеш входа шага: роль, модель и текст задачи (тот же вход — тот же результат). */
export function stepInputHash(role: Role, model: string, input: unknown): string {
  return sha256(canonicalJson({ role, model, input }));
}

/** Пишет чекпоинт атомарно (tmp + rename); каталоги — через `safeMkdir`. Возвращает путь файла. */
export async function writeCheckpoint(root: string, jobId: string, role: Role, cp: Checkpoint): Promise<string> {
  await safeMkdir(root, checkpointsRel(jobId));
  const path = checkpointPath(root, jobId, role);
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(cp, null, 2) + "\n");
  await rename(tmp, path);
  return path;
}

/** Результат чекпоинта, если файл есть, читается и его `input_hash` совпал; иначе `undefined`. */
export async function readCheckpoint(path: string, inputHash: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const cp = JSON.parse(raw) as Partial<Checkpoint>;
    return cp.input_hash === inputHash ? cp.output : undefined;
  } catch {
    return undefined; // недописанный файл — как нет чекпоинта
  }
}
