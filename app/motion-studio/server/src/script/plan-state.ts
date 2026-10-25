// Состояние утверждения плана сценария (спека §7; трек A, S4): можно ли дать Approval B на
// ревизию плана. Потребляет пакет генерации (S5). Стиль проекта не сверяется: сцены берут
// текущий стиль (Р15); его отсутствие — отдельная причина у пакета (`no_style`) и в UI.
import type { PlanIssue, ScriptApproval, ScriptPlanRevisionDoc, ScriptRevisionDoc } from "@ms/contracts";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";

export type PlanApprovable = { ok: true } | { ok: false; code: "plan_outdated" | "blocking_issues" | "no_items"; issues?: PlanIssue[] };

/** План построен не по текущей ревизии текста (другой текст или ревизия). */
export const planOutdated = (doc: ScriptPlanRevisionDoc, script: ScriptRevisionDoc): boolean =>
  doc.inputs.script.id !== script.script_id || doc.inputs.script.revision !== script.revision;

/**
 * Можно ли утвердить план: текст не новее плана (`plan_outdated`), нет blocking-проблем
 * (`blocking_issues`, они в `issues`), есть принятые сцены (`no_items`) — в этом порядке.
 */
export function planApprovable(doc: ScriptPlanRevisionDoc, script: ScriptRevisionDoc): PlanApprovable {
  if (planOutdated(doc, script)) return { ok: false, code: "plan_outdated" };
  const blocking = doc.issues.filter((i) => i.severity === "blocking");
  if (blocking.length > 0) return { ok: false, code: "blocking_issues", issues: blocking };
  if (!doc.items.some((i) => i.status === "accepted")) return { ok: false, code: "no_items" };
  return { ok: true };
}

/** Approval B текущей ревизии плана проекта для `ScriptPlanDto.approval` (как в `scriptState`). */
export function scriptApproval(db: Db, projectId: string): ScriptApproval {
  const peek = peekApprovalState(db, projectId, "B", currentSubject(db, projectId, "B"));
  return {
    state: peek.state,
    ...(peek.approval ? { ref: peek.approval.subject_ref } : {}),
    ...(peek.reason ? { reason: peek.reason } : {}),
  };
}
