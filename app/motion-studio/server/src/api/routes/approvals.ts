// Approvals видеопроекта (Task 29, 33, `05` §7): состояние A и B (только чтение — разошедшийся
// субъект показывается `stale`, но не пишется), утверждение A (`approveRoughCut`: нельзя при
// `proposed`) и B (`approveVisualPlan`: 409 с перечнем сцен или проблем), отзыв решения человеком.
import { ApprovalBodySchema, ApprovalDtoSchema, type ProjectApprovalsDto, ProjectApprovalsDtoSchema } from "@ms/contracts";
import { peekApprovalState } from "../../approvals/engine.js";
import { currentSubject } from "../../approvals/subjects.js";
import type { Db } from "../../db/open.js";
import * as approvals from "../../db/repos/approvals.js";
import * as projects from "../../db/repos/projects.js";
import { tx } from "../../db/tx.js";
import { approveRoughCut } from "../../edit/approval-a.js";
import { approveVisualPlan } from "../../analysis/approval-b.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { notFound } from "../errors.js";

/** A и B проекта без записи в БД. */
export function projectApprovals(db: Db, projectId: string): ProjectApprovalsDto {
  const state = (kind: "A" | "B") => {
    const s = peekApprovalState(db, projectId, kind, currentSubject(db, projectId, kind));
    return { state: s.state, ...(s.approval ? { approval: s.approval } : {}), ...(s.reason ? { reason: s.reason } : {}) };
  };
  return { A: state("A"), B: state("B") };
}

export function approvalRoutes(app: ZApp, { core }: ApiContext): void {
  const projectOr404 = (id: string) => {
    const p = projects.get(core.db, id);
    if (!p) throw notFound(`проект ${id}`);
    return p;
  };

  app.get("/api/projects/:id/approvals", { schema: { params: IdParams, response: { 200: ProjectApprovalsDtoSchema } } }, async (req) => {
    projectOr404(req.params.id);
    return projectApprovals(core.db, req.params.id);
  });

  app.post("/api/projects/:id/approvals", {
    schema: { params: IdParams, body: ApprovalBodySchema, response: { 201: ApprovalDtoSchema } },
  }, async (req, reply) => {
    projectOr404(req.params.id);
    const a = req.body.kind === "A" ? approveRoughCut(core.db, req.params.id) : approveVisualPlan(core.db, req.params.id, core.root);
    return reply.status(201).send(a);
  });

  app.post("/api/approvals/:id/revoke", { schema: { params: IdParams, response: { 200: ApprovalDtoSchema } } }, async (req) => {
    return tx(core.db, () => {
      if (!approvals.get(core.db, req.params.id)) throw notFound(`решение ${req.params.id}`);
      approvals.revoke(core.db, req.params.id);
      return approvals.get(core.db, req.params.id)!;
    });
  });
}
