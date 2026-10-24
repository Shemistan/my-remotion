// Разнообразие сценария: плана до генерации (`planDiversity`, S3) и пакета после (`packageDiversity`, S11).
// S1 — заглушка поставщика предупреждений карточек сцен для `scriptState`.
import type { PlanIssue, ScriptPlanRevisionDoc } from "@ms/contracts";
import type { Db } from "../db/open.js";

/** Предупреждения разнообразия пакета по `scene_id` для `ScriptSceneDto.warnings` (S11 заменяет тело). */
export const warningsForState: (db: Db, root: string, projectId: string, plan: ScriptPlanRevisionDoc | null) => Record<string, PlanIssue[]> = () => ({});
