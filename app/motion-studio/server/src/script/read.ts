// Текущие ревизии сценарного проекта из хранилища: текст (`scripts`) и план сценария (таблицы
// visual_plans, файл `script-plan.json`; ревизия с другим файлом — план видео, не сценария).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ScriptPlanRevisionDoc, ScriptPlanRevisionDocSchema, type ScriptRevisionDoc, ScriptRevisionDocSchema } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as plans from "../db/repos/plans.js";
import { scriptRevisions, scripts } from "../db/repos/script.js";

export const SCRIPT_FILE = "script.json";
export const SCRIPT_PLAN_FILE = "script-plan.json";

/** Документ текущей ревизии текста проекта, проверенный схемой; текста нет — `undefined`. */
export function currentScript(db: Db, root: string, projectId: string): ScriptRevisionDoc | undefined {
  const s = scripts.byProject(db, projectId);
  const row = s?.current_revision == null ? undefined : scriptRevisions.get(db, s.id, s.current_revision);
  if (!row) return undefined;
  return ScriptRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/** Текущая ревизия плана сценария: документ, id плана и `hash` ревизии (субъект Approval B). */
export function currentScriptPlan(db: Db, root: string, projectId: string): { doc: ScriptPlanRevisionDoc; planId: string; hash: string } | undefined {
  const p = plans.byProject(db, projectId);
  const row = p?.current_revision == null ? undefined : plans.revision(db, p.id, p.current_revision);
  if (!row || !row.rel_path.endsWith(`/${SCRIPT_PLAN_FILE}`)) return undefined;
  const doc = ScriptPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
  return { doc, planId: p!.id, hash: row.hash };
}
