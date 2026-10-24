// Вертикальные двойники сцен 9:16 (S10, спека §6.3, Р6): для принятых сцен с готовой и не
// устаревшей 16:9-версией — пакет задач `playground.generate` с `script.aspect = "9:16"` и
// `reference_version_id` (эталон). Постановка — общая с генерацией (`stageBatch`: ключи
// `:s<styleRev>[:try-n]`, брифы, транзакция). Approval B заново не берётся: план тот же, но
// он не должен быть `outdated` (текст новее плана). Сцены без готовой 16:9 — в `skipped`.
import type { ScriptBatchDto, ScriptSceneItem } from "@ms/contracts";
import { currentProjectStyle } from "../analysis/project-style.js";
import { ApiError, notFound } from "../api/errors.js";
import type { Db } from "../db/open.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { scriptScenes } from "../db/repos/script.js";
import * as versions from "../db/repos/versions.js";
import { sha256 } from "../scenes/hash.js";
import { batchForKey, batchStatus, keyPrefix, stageBatch } from "./batch.js";
import { itemFingerprint } from "./fingerprint.js";
import { currentScript, currentScriptPlan } from "./read.js";

export interface StartReframeInput {
  projectId: string;
  /** Выбранные сцены плана; нет — все принятые. */
  itemIds?: string[];
  idempotencyKey: string;
}

/** Причины пропуска сцены (показываются человеку как есть). */
export const REFRAME_SKIP = {
  noReference: "нет готовой версии 16:9",
  staleReference: "версия 16:9 устарела",
  notAccepted: "сцена снята с плана",
} as const;

/** Отпечаток тела запроса в id пакета: тот же ключ с другим телом (или у генерации) — 422. */
const requestTag = (itemIds: readonly string[] | undefined): string =>
  sha256(JSON.stringify({ reframe: "9:16", item_ids: itemIds ? [...new Set(itemIds)].sort() : null })).slice(0, 10);

export function startReframe(core: { db: Db; root: string }, i: StartReframeInput): ScriptBatchDto {
  const { db, root } = core;
  const project = projects.get(db, i.projectId);
  if (!project) throw notFound(`проект ${i.projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
  const batchId = `${keyPrefix(i.projectId, i.idempotencyKey)}${requestTag(i.itemIds)}`;
  const existing = batchForKey(db, i.projectId, i.idempotencyKey);
  if (existing) {
    if (existing.id !== batchId) {
      throw new ApiError(422, "idempotency_key_reused", `ключ ${i.idempotencyKey} уже использован пакетом ${existing.id} с другим запросом`);
    }
    return batchStatus(db, root, batchId);
  }

  const script = currentScript(db, root, i.projectId);
  if (!script) throw new ApiError(409, "no_script", "текста сценария нет");
  const cur = currentScriptPlan(db, root, i.projectId);
  if (!cur) throw new ApiError(409, "no_plan", "плана сценария нет");
  if (cur.doc.inputs.script.revision !== script.revision) throw new ApiError(409, "plan_outdated", "текст сценария изменился после плана — перестройте план");
  const style = currentProjectStyle(db, root, i.projectId);
  if (!style) throw new ApiError(409, "no_style", "стиля проекта нет");
  const styleRef = { id: style.style_id, revision: style.revision };

  const accepted = cur.doc.items.filter((x) => x.status === "accepted");
  const skipped: { item_id: string; reason: string }[] = [];
  let wanted: ScriptSceneItem[] = accepted;
  if (i.itemIds) {
    const known = new Map(cur.doc.items.map((x) => [x.id, x]));
    const unknown = i.itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new ApiError(422, "unknown_item", `в плане нет сцен: ${unknown.join(", ")}`);
    const want = new Set(i.itemIds);
    for (const id of want) if (known.get(id)!.status !== "accepted") skipped.push({ item_id: id, reason: REFRAME_SKIP.notAccepted });
    wanted = accepted.filter((x) => want.has(x.id));
  }

  // эталон — текущая готовая 16:9-версия сцены, сделанная по текущей сцене плана
  const reference = new Map<string, string>();
  for (const item of wanted) {
    const row = scriptScenes.get(db, cur.planId, item.id, "16:9");
    const vid = row ? scenes.get(db, row.scene_id)?.current_version_id : undefined;
    const v = vid ? versions.get(db, vid) : undefined;
    if (!row || !v || v.status !== "ready" || v.broken_reason) skipped.push({ item_id: item.id, reason: REFRAME_SKIP.noReference });
    else if (row.item_fingerprint !== itemFingerprint(item, styleRef)) skipped.push({ item_id: item.id, reason: REFRAME_SKIP.staleReference });
    else reference.set(item.id, v.id);
  }
  const selected = wanted.filter((x) => reference.has(x.id));
  return stageBatch(core, { project, script, cur, style, aspect: "9:16", batchId, accepted, selected, skipped, regenerate: false, approval: "keep", reference });
}
