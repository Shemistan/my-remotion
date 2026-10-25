// Task 42: операции над ревизией таймлайна (Р-V6, Д2) — перемещение в пределах якорей с
// прилипанием к слову, выбор утверждённой версии, включение/исключение; длительности и зоны нет.
// `saveTimelineRevision`: новая ревизия с fencing по базе, 409 revision_conflict / resource_busy.
import { afterEach, describe, expect, it } from "vitest";
import { TimelineOpSchema, type VideoTimelineDoc } from "@ms/contracts";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as resourceLocks from "../../src/db/repos/resource-locks.js";
import { videoTimelines } from "../../src/db/repos/video.js";
import { approve } from "../../src/approvals/engine.js";
import { finalSubject } from "../../src/approvals/subjects.js";
import { projectLockKey } from "../../src/jobs/locks.js";
import { enqueue } from "../../src/jobs/queue.js";
import { buildTimelineDoc, timelineIdFor } from "../../src/timeline/build.js";
import { applyTimelineOps, publishTimelineRevision, readTimelineDoc, saveTimelineRevision, timelineOpsContext } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, approveC, seedScene, seedTimelineProject } from "./helpers.js";

let env: TimelineEnv;
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});

const blocking = (d: VideoTimelineDoc) => d.issues.filter((i) => i.severity === "blocking");
const deps = () => ({ db: env.db, store: env.store, root: env.s.root });

async function seeded(o: { secondC?: boolean } = {}) {
  env = await seedTimelineProject("ms-v42-ops-");
  const a = seedScene(env, ITEMS[0]!);
  const b = seedScene(env, ITEMS[1]!, { withC: o.secondC ?? true });
  const d1 = buildTimelineDoc(env.db, env.s.root, "p1");
  return { a, b, d1, ctx: timelineOpsContext(env.db, env.s.root, d1) };
}

describe("applyTimelineOps", () => {
  it("move −19 при якоре на 351 → без blocking (прилипание к началу слова); −80 → anchor_outside; с причиной — warning", async () => {
    const { d1, ctx } = await seeded();
    const d2 = applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 300 - 19 }], ctx);
    expect(d2.scenes[0]!.start_frame).toBe(276); // слово w_000019 начинается на кадре 276
    expect(blocking(d2)).toEqual([]);
    expect(applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 300 - 19 }], {}).scenes[0]!.start_frame).toBe(281);
    const d3 = applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 300 - 80 }], ctx);
    expect(d3.issues).toContainEqual(expect.objectContaining({ item_id: "sp_001", code: "anchor_outside", severity: "blocking" }));
    const d4 = applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 216, override_reason: "так задумано" }], ctx);
    expect(d4.issues).toContainEqual(expect.objectContaining({ code: "anchor_outside", severity: "warning" }));
    expect(d4.ops).toEqual([{ op: "move", clip_id: "clip_sp_001", start_frame: 216, override_reason: "так задумано" }]);
    // ещё один сдвиг без причины — причина снята, снова blocking
    const d5 = applyTimelineOps(d4, [{ op: "move", clip_id: "clip_sp_001", start_frame: 222 }], {});
    expect(blocking(d5).map((i) => i.code)).toEqual(["anchor_outside"]);
    expect(d5.ops).toHaveLength(2);
  });

  it("TimelineOpSchema не принимает set_duration и set_zone (Р-V6, Д2)", () => {
    expect(TimelineOpSchema.safeParse({ op: "set_duration", clip_id: "clip_sp_002", duration_frames: 150 }).success).toBe(false);
    expect(TimelineOpSchema.safeParse({ op: "set_zone", clip_id: "clip_sp_002", zone: "left_third" }).success).toBe(false);
  });

  it("use_version: только версия с валидной C; неутверждённая — version_not_approved", async () => {
    const { a, d1, ctx } = await seeded();
    const v2 = addVersion(env.db, a.sceneId, 87);
    expect(() => applyTimelineOps(d1, [{ op: "use_version", clip_id: "clip_sp_001", version_id: v2.id }], timelineOpsContext(env.db, env.s.root, d1))).toThrow(/version_not_approved/);
    approveC(env.db, v2.id);
    const d2 = applyTimelineOps(d1, [{ op: "use_version", clip_id: "clip_sp_001", version_id: v2.id }], timelineOpsContext(env.db, env.s.root, d1));
    expect(d2.scenes[0]).toMatchObject({ version_id: v2.id, version_number: 2, include: "approved" });
    expect(() => applyTimelineOps(d1, [{ op: "use_version", clip_id: "clip_nope", version_id: v2.id }], ctx)).toThrow(/clip_not_found/);
  });

  it("include: исключение пользователем и возврат; неутверждённая сцена — только override с причиной", async () => {
    const { d1, ctx } = await seeded({ secondC: false });
    expect(d1.excluded).toEqual([{ item_id: "sp_002", reason: "not_approved" }]);
    const off = applyTimelineOps(d1, [{ op: "include", clip_id: "clip_sp_001", include: false }], ctx);
    expect(off.scenes).toEqual([]);
    expect(off.excluded).toContainEqual({ item_id: "sp_001", reason: "user" });
    const on = applyTimelineOps(off, [{ op: "include", clip_id: "clip_sp_001", include: true }], ctx);
    expect(on.scenes.map((c) => c.item_id)).toEqual(["sp_001"]);
    expect(on.excluded).toEqual([{ item_id: "sp_002", reason: "not_approved" }]);
    expect(() => applyTimelineOps(d1, [{ op: "include", clip_id: "clip_sp_002", include: true }], ctx)).toThrow(/override_reason_required/);
    const ov = applyTimelineOps(d1, [{ op: "include", clip_id: "clip_sp_002", include: true, override_reason: "черновой показ" }], ctx);
    expect(ov.scenes[1]).toMatchObject({ item_id: "sp_002", include: "override", override_reason: "черновой показ", start_frame: 600 });
    expect(ov.excluded).toEqual([]);
  });
});

describe("saveTimelineRevision", () => {
  it("новая ревизия от базы; база устарела → revision_conflict; таймлайн пишет задача → resource_busy; final устаревает", async () => {
    const { d1 } = await seeded();
    const tid = timelineIdFor("p1");
    await publishTimelineRevision(deps(), "p1", d1);
    const f = finalSubject(tid, 1, { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 });
    approve(env.db, { projectId: "p1", kind: "final", subjectRef: f.ref, subjectHash: f.hash });
    const r2 = await saveTimelineRevision(deps(), tid, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 290 }] });
    expect(r2).toMatchObject({ revision: 2, parent_revision: 1 });
    expect(videoTimelines.byProject(env.db, "p1")!.current_revision).toBe(2);
    expect(readTimelineDoc(env.db, env.s.root, tid).scenes[0]!.start_frame).toBe(r2.scenes[0]!.start_frame);
    expect(approvalsRepo.latestActive(env.db, "p1", "final", `timeline:${tid}`)).toMatchObject({ status: "stale", stale_reason: "timeline_changed" });
    await expect(saveTimelineRevision(deps(), tid, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 291 }] })).rejects.toMatchObject({ code: "revision_conflict", status: 409 });
    const j = enqueue(env.db, { type: "timeline.build", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "busy" }).job;
    resourceLocks.acquire(env.db, projectLockKey("p1", "timeline"), j.id);
    await expect(saveTimelineRevision(deps(), tid, { base_revision: 2, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 330 }] })).rejects.toMatchObject({ code: "resource_busy" });
    expect(jobs.get(env.db, j.id)!.status).toBe("pending");
    await expect(saveTimelineRevision(deps(), tid, { base_revision: 2, ops: [] })).rejects.toMatchObject({ code: "empty_ops", status: 422 });
    await expect(saveTimelineRevision(deps(), "tl_nope", { base_revision: 1, ops: [] })).rejects.toMatchObject({ code: "timeline_not_found", status: 404 });
  });
});
