// «Смонтировать и экспортировать» (Task 43, F6): явное действие пользователя — одна транзакция
// `assembleGate` → Approval final (Р-V4: `timeline:<id>@r<N>` + `canonicalHash(настроек)`) →
// задача `final.render`. Новое решение той же области (`timeline:<id>`) отзывает прежнее, а задаче
// прежнего финала этого таймлайна ставит отмену (`pending` — cancelled, `running` — cancel_requested).
import { type Approval, type FinalExportRequest, FinalExportRequestSchema, type Job } from "@ms/contracts";
import { z } from "zod";
import { approve } from "../approvals/engine.js";
import { finalSubject } from "../approvals/subjects.js";
import * as approvals from "../db/repos/approvals.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { cancelSuperseded, enqueue } from "../jobs/queue.js";
import { timelineRow } from "../timeline/ops.js";
import { FinalGateFailed, assembleGate } from "./gate.js";

/** Вход задачи `final.render`. */
export const FinalRenderInputSchema = z.object({
  timelineId: z.string().min(1),
  revision: z.number().int().positive(),
  request: FinalExportRequestSchema,
  approvalId: z.string().min(1),
}).strict();
export type FinalRenderInput = z.infer<typeof FinalRenderInputSchema>;

export interface RequestFinalInput {
  timelineId: string;
  revision: number;
  request: FinalExportRequest;
  /** `Idempotency-Key` запроса; без него — новый ключ на решение. */
  idempotencyKey?: string;
}

/**
 * Решение final и задача рендера. Повтор с тем же ключом — та же задача и то же решение (без
 * нового approval). Гейт не пройден — `FinalGateFailed`, ничего не записано; таймлайна нет — `Error`.
 */
export function requestFinal(core: { db: Db; root: string }, i: RequestFinalInput): { approval: Approval; job: Job } {
  const { db, root } = core;
  const request = FinalExportRequestSchema.parse(i.request);
  return tx(db, () => {
    if (i.idempotencyKey !== undefined) {
      const prev = jobs.findByIdempotencyKey(db, i.idempotencyKey);
      const prevInput = prev?.type === "final.render" ? FinalRenderInputSchema.safeParse(prev.input) : undefined;
      const prevApproval = prevInput?.success ? approvals.get(db, prevInput.data.approvalId) : undefined;
      if (prev && prevApproval) {
        // другой вход под тем же ключом — `IdempotencyKeyReusedError` из enqueue
        enqueue(db, { type: "final.render", projectId: prev.project_id, input: { timelineId: i.timelineId, revision: i.revision, request, approvalId: prevApproval.id }, idempotencyKey: i.idempotencyKey });
        return { approval: prevApproval, job: prev };
      }
    }
    const t = timelineRow(db, i.timelineId);
    if (!t) throw new Error(`таймлайна ${i.timelineId} нет`);
    const gate = assembleGate(db, root, t.project_id, { timelineId: i.timelineId, revision: i.revision });
    if (!gate.ok) throw new FinalGateFailed(gate.errors);
    const subject = finalSubject(i.timelineId, i.revision, request);
    cancelPrevious(db, t.project_id, i.timelineId);
    const approval = approve(db, { projectId: t.project_id, kind: "final", subjectRef: subject.ref, subjectHash: subject.hash });
    const input: FinalRenderInput = { timelineId: i.timelineId, revision: i.revision, request, approvalId: approval.id };
    const { job } = enqueue(db, { type: "final.render", projectId: t.project_id, input, idempotencyKey: i.idempotencyKey ?? `final:${approval.id}` });
    return { approval, job };
  });
}

/** Задачи финала таймлайна `timelineId`, чьё решение отзовёт новое final той же области, — в отмену (`cancelSuperseded`). */
function cancelPrevious(db: Db, projectId: string, timelineId: string): void {
  for (const j of jobs.list(db, { projectId })) {
    if (j.type !== "final.render") continue;
    const input = FinalRenderInputSchema.safeParse(j.input);
    if (input.success && input.data.timelineId === timelineId) cancelSuperseded(db, j.id);
  }
}
