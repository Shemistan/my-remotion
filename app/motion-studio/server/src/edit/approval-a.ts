// Approval A (`05` §7): человек утверждает текущую ревизию EDL проекта. Субъект —
// `edl:<id>@r<N>`, хеш — canonicalHash документа ревизии (записан при публикации).
import type { Approval } from "@ms/contracts";
import { approvalState, approve } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import { tx } from "../db/tx.js";
import { EditError, ProposedLeftError } from "./errors.js";

/**
 * Утверждает текущую ревизию EDL: нет EDL — `no_edl`; есть вырезки `proposed` —
 * `proposed_left` с их числом. Проверка и решение — одна транзакция (правка EDL между ними
 * невозможна); прежние решения A отзываются (`approve`). B не переутверждается.
 */
export function approveRoughCut(db: Db, projectId: string): Approval {
  return tx(db, () => {
    const subject = currentSubject(db, projectId, "A");
    const e = edls.byProject(db, projectId);
    if (!subject || !e || e.current_revision === null) throw new EditError("no_edl", `у проекта ${projectId} нет чернового монтажа`);
    const proposed = edls.decisions(db, e.id, e.current_revision).filter((d) => d.status === "proposed").length;
    if (proposed > 0) throw new ProposedLeftError(proposed);
    return approve(db, { projectId, kind: "A", subjectRef: subject.ref, subjectHash: subject.hash });
  });
}

/** Approval A валиден для текущей ревизии EDL — гейт `semantic.analyze` и `plan.visual`. */
export function roughCutApprovalValid(db: Db, projectId: string): boolean {
  return approvalState(db, projectId, "A", currentSubject(db, projectId, "A")).state === "valid";
}
