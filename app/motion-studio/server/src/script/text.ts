// Ревизии текста сценария (спека §5.1, §7, §11): синхронная правка человека — новая иммутабельная
// ревизия `script/<id>/r<N>/script.json` через `ArtifactStore.writeRevision` с `base_revision`.
// Скорость чтения здесь не хранится: она в документе плана (операция `set_reading`).
import { type PutScriptBody, type ReadingSettings, type ScriptRevisionDoc, DEFAULT_READING, ScriptRevisionDocSchema, tokenizeScript } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { ApiError, notFound } from "../api/errors.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as projects from "../db/repos/projects.js";
import { scriptRevisions, scripts } from "../db/repos/script.js";
import { RevisionConflictError } from "../edit/errors.js";
import type { EditDeps } from "../edit/transcript-ops.js";
import { newId } from "../scenes/ids.js";
import { SCRIPT_FILE, currentScriptPlan } from "./read.js";

/** Предел текста сценария в словах (спека §1: длиннее — `script_too_long`). */
export const MAX_SCRIPT_WORDS = 6000;

/** id текста: ULID как у прочих сущностей, префикс `scr_` (в `IdPrefix` его нет — общий файл). */
const newScriptId = (): string => `scr_${newId("syn").slice("syn_".length)}`;

/**
 * Новая ревизия текста сценарного проекта. Проверки до публикации: проект есть (404) и сценарный
 * (409 `not_script_project`), в каждом блоке есть слова (400 `empty_block`, `block` — номер с 1),
 * всего слов ≤ 6000 (413 `script_too_long`), `base_revision` — текущая ревизия (409
 * `revision_conflict`; до первой ревизии текущей нет). Публикация и индекс — одна транзакция;
 * гонка двух правок одной базы — `revision_conflict` у второй. План не трогается: ссылается на
 * старую ревизию — `plan_outdated` в `GET /script`.
 */
export async function saveScriptText(deps: EditDeps, projectId: string, body: PutScriptBody): Promise<ScriptRevisionDoc> {
  const { db, store, root } = deps;
  const project = projects.get(db, projectId);
  if (!project) throw notFound(`проект ${projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");

  const { blocks, words } = tokenizeScript(body.blocks);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w.block_id, (counts.get(w.block_id) ?? 0) + 1);
  const empty = blocks.findIndex((b) => !counts.get(b.id));
  if (empty >= 0) throw new ApiError(400, "empty_block", `блок ${empty + 1} без слов`, { block: empty + 1 });
  if (words.length > MAX_SCRIPT_WORDS) {
    throw new ApiError(413, "script_too_long", `текст длиннее ${MAX_SCRIPT_WORDS} слов (${words.length})`, { words: words.length, max: MAX_SCRIPT_WORDS });
  }

  const row = scripts.byProject(db, projectId);
  const cur = row?.current_revision ?? null;
  const currentNow = (d: Db): number | null => scripts.byProject(d, projectId)?.current_revision ?? null;
  const conflict = (d: Db, base: number | undefined): RevisionConflictError | undefined => {
    if (base === undefined) return undefined;
    const now = currentNow(d);
    return now === base ? undefined : new RevisionConflictError(`текст сценария проекта ${projectId}`, base, now);
  };
  const early = conflict(db, body.base_revision);
  if (early) throw early;

  const scriptId = row?.id ?? newScriptId();
  const doc = ScriptRevisionDocSchema.parse({
    schema_version: 1, script_id: scriptId, revision: (cur ?? 0) + 1, ...(cur === null ? {} : { parent_revision: cur }),
    blocks, words, author: "user",
  });
  const destRel = artifactPaths(root, projectId).scriptRev(scriptId, doc.revision);
  const register = (d: Db, files: { sha256: string }[]) => {
    if (!row) scripts.create(d, { id: scriptId, project_id: projectId });
    scriptRevisions.insert(d, { script_id: scriptId, revision: doc.revision, rel_path: `${destRel}/${SCRIPT_FILE}`, sha256: files[0]!.sha256, hash: canonicalHash(doc) });
    scripts.setCurrent(d, scriptId, doc.revision);
  };
  // в транзакции: база правки по-прежнему текущая; без base_revision — никто не успел раньше
  const check = (d: Db) => conflict(d, body.base_revision) ?? conflict(d, cur ?? undefined)
    ?? (cur === null && currentNow(d) !== null ? new RevisionConflictError(`текст сценария проекта ${projectId}`, 0, currentNow(d)) : undefined);
  await store.writeRevision(destRel, SCRIPT_FILE, doc, register, { check });
  return doc;
}

/** Скорость чтения для `ScriptDto`: из текущего плана сценария, до плана — по умолчанию. */
export function scriptReading(db: Db, root: string, projectId: string): ReadingSettings {
  return currentScriptPlan(db, root, projectId)?.doc.reading ?? DEFAULT_READING;
}
