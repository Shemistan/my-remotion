// Approval B (`05` §7, Task 32): человек утверждает текущую ревизию визуального плана. Субъект —
// `plan:<id>@r<N>`, хеш — canonicalHash документа ревизии. Нельзя без валидного A, по плану на
// не текущих EDL или стиле, при нерешённых сценах (`proposed`/`stale`) и blocking-проблемах плана
// или стиля проекта. План без сцен (только пропуски с причинами) утверждается.
import type { Approval } from "@ms/contracts";
import { approve } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as plans from "../db/repos/plans.js";
import * as styles from "../db/repos/styles.js";
import { tx } from "../db/tx.js";
import { roughCutApprovalValid } from "../edit/approval-a.js";
import { EditError } from "../edit/errors.js";
import { currentPlan } from "./plan-ops.js";
import { currentProjectStyle, projectStyleFrom } from "./project-style.js";

export function approveVisualPlan(db: Db, projectId: string, root: string): Approval {
  return tx(db, () => {
    if (!roughCutApprovalValid(db, projectId)) throw new EditError("approval_required", "сначала утвердите черновой монтаж (Approval A)");
    const p = plans.byProject(db, projectId);
    const subject = currentSubject(db, projectId, "B");
    if (!p || p.current_revision === null || !subject) throw new EditError("no_plan", `у проекта ${projectId} нет визуального плана`);
    const doc = currentPlan(db, root, p.id, p.current_revision);

    const a = currentSubject(db, projectId, "A")!;
    const edlRef = `edl:${doc.inputs.edl.id}@r${doc.inputs.edl.revision}`;
    if (a.ref !== edlRef || a.hash !== doc.inputs.edl.hash) {
      throw new EditError("plan_outdated", `план построен по ${edlRef}, утверждён ${a.ref} — дождитесь перепроверки плана`);
    }
    const st = styles.byProject(db, projectId);
    const stRev = st?.current_revision == null ? undefined : styles.revision(db, st.id, st.current_revision);
    if (!st || !stRev || st.id !== doc.inputs.style.id || stRev.revision !== doc.inputs.style.revision || stRev.hash !== doc.inputs.style.hash) {
      throw new EditError("plan_outdated", `план построен по стилю ${doc.inputs.style.id}@r${doc.inputs.style.revision}, текущий — ${st ? `${st.id}@r${stRev?.revision ?? "—"}` : "нет"}`);
    }

    const open = doc.items.filter((x) => x.status === "proposed" || x.status === "stale");
    if (open.length > 0) throw new EditError("items_unresolved", `${open.length} сцен ждут решения: ${open.map((x) => x.id).join(", ")}`);

    const style = currentProjectStyle(db, root, projectId)!;
    const blocking = [...doc.issues, ...projectStyleFrom(style.base).issues].filter((x) => x.severity === "blocking");
    if (blocking.length > 0) {
      throw new EditError("blocking_issues", `${blocking.length} блокирующих проблем: ${blocking.map((x) => `${x.item_id ? `${x.item_id} ` : ""}${x.code}`).join(", ")}`);
    }
    return approve(db, { projectId, kind: "B", subjectRef: subject.ref, subjectHash: subject.hash });
  });
}
