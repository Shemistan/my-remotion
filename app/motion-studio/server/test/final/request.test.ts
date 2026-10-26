// Task 43: «Смонтировать и экспортировать» — одна транзакция: гейт → Approval final (субъект
// `timeline:<id>@r<N>` + canonicalHash(настроек), Р-V4) → задача `final.render`.
import { afterEach, describe, expect, it } from "vitest";
import type { FinalExportRequest } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { FinalGateFailed } from "../../src/final/gate.js";
import { requestFinal } from "../../src/final/request.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { publishTimelineRevision, saveTimelineRevision } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { ITEMS, type TimelineEnv, seedScene, seedTimelineProject } from "../timeline/helpers.js";

let env: TimelineEnv;
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});
const deps = () => ({ db: env.db, store: env.store, root: env.s.root });
const core = () => ({ db: env.db, root: env.s.root });
const req1080: FinalExportRequest = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 };
const req720: FinalExportRequest = { resolution: "720p", quality: "draft", audio_bitrate_kbps: 192 };

async function published() {
  env = await seedTimelineProject("ms-v43-req-");
  for (const it of ITEMS) seedScene(env, it);
  const r1 = await publishTimelineRevision(deps(), "p1", buildTimelineDoc(env.db, env.s.root, "p1"));
  return saveTimelineRevision(deps(), r1.timeline_id, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_002", start_frame: 606 }] });
}

describe("requestFinal", () => {
  it("Approval final на ревизию с хешем настроек и задача final.render", async () => {
    const doc = await published();
    const { approval, job } = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req1080 });
    expect(approval).toMatchObject({ kind: "final", status: "valid", project_id: "p1", subject_ref: `timeline:${doc.timeline_id}@r2`, subject_hash: canonicalHash(req1080) });
    expect(job).toMatchObject({ type: "final.render", project_id: "p1", status: "pending" });
    expect(job.input).toEqual({ timelineId: doc.timeline_id, revision: 2, request: req1080, approvalId: approval.id });
  });

  it("другие настройки той же ревизии → новое final, прежнее revoked; ключ идемпотентности — та же задача", async () => {
    const doc = await published();
    const first = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req1080, idempotencyKey: "k1" });
    const again = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req1080, idempotencyKey: "k1" });
    expect(again.job.id).toBe(first.job.id);
    expect(again.approval.id).toBe(first.approval.id);
    const second = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req720 });
    expect(second.approval.id).not.toBe(first.approval.id);
    expect(second.job.id).not.toBe(first.job.id);
    expect(approvalsRepo.get(env.db, first.approval.id)!.status).toBe("revoked");
    expect(approvalsRepo.get(env.db, second.approval.id)!.subject_hash).toBe(canonicalHash(req720));
  });

  it("новое final той же области → прежняя задача финала отменяется (pending — cancelled, running — cancel_requested)", async () => {
    const doc = await published();
    const a = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req1080 });
    const b = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req720 });
    expect(jobs.get(env.db, a.job.id)).toMatchObject({ status: "cancelled", cancel_requested: true });
    jobs.update(env.db, b.job.id, { status: "running", attempt: 1 });
    const c = requestFinal(core(), { timelineId: doc.timeline_id, revision: 2, request: req1080 });
    expect(jobs.get(env.db, b.job.id)).toMatchObject({ status: "running", cancel_requested: true });
    expect(jobs.get(env.db, c.job.id)).toMatchObject({ status: "pending", cancel_requested: false });
    expect(approvalsRepo.get(env.db, b.approval.id)!.status).toBe("revoked");
  });

  it("гейт не пройден → FinalGateFailed с причинами; ни решения, ни задачи", async () => {
    const doc = await published();
    let err: unknown;
    try {
      requestFinal(core(), { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FinalGateFailed);
    expect((err as FinalGateFailed).errors.map((e) => e.code)).toEqual(["timeline_stale"]);
    expect(approvalsRepo.list(env.db, "p1", "final")).toEqual([]);
    expect(jobs.list(env.db, { projectId: "p1" }).filter((j) => j.type === "final.render")).toEqual([]);
  });
});
