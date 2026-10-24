// Рабочий каталог попытки задачи Phase 2–3: `workspace/drafts/<runId>-a<attempt>/` — то же имя,
// что у draft сцены, поэтому восстановление при старте (`sweepAbandonedDrafts`) видит и его.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { SAFE_ID, safeMkdir } from "@ms/core";

export interface JobDraft {
  dir: string;
  runId: string;
  attempt: number;
}

/** Каталог draft попытки; существующий — ошибка (одна попытка — один draft). */
export async function createJobDraft(root: string, ref: { runId: string; attempt: number }): Promise<JobDraft> {
  if (!SAFE_ID.test(ref.runId)) throw new Error(`artifacts: runId не годится для имени файла: ${JSON.stringify(ref.runId)}`);
  if (!Number.isInteger(ref.attempt) || ref.attempt < 1) throw new Error(`artifacts: attempt должен быть целым >= 1: ${ref.attempt}`);
  const name = `${ref.runId}-a${ref.attempt}`;
  const dir = join(await safeMkdir(root, "workspace/drafts"), name);
  try {
    await mkdir(dir); // без recursive: существующий каталог — ошибка
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`artifacts: draft уже exists: ${name}`, { cause: e });
    throw e;
  }
  return { dir, runId: ref.runId, attempt: ref.attempt };
}
