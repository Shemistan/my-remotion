// Task 43: гейт финала — A и B валидны, ревизия таймлайна текущая и свежая, нет blocking, C каждой
// утверждённой сцены валидна на её версии; `override` — с причиной.
import { afterEach, describe, expect, it } from "vitest";
import type { VideoTimelineDoc } from "@ms/contracts";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import { assembleGate } from "../../src/final/gate.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { publishTimelineRevision, saveTimelineRevision } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, approveC, seedScene, seedTimelineProject } from "../timeline/helpers.js";

let env: TimelineEnv;
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});
const deps = () => ({ db: env.db, store: env.store, root: env.s.root });
const ref = (d: Pick<VideoTimelineDoc, "timeline_id" | "revision">) => ({ timelineId: d.timeline_id, revision: d.revision });
const gate = (d: Pick<VideoTimelineDoc, "timeline_id" | "revision">) => assembleGate(env.db, env.s.root, "p1", ref(d));
const codes = (d: Pick<VideoTimelineDoc, "timeline_id" | "revision">) => {
  const g = gate(d);
  return g.ok ? [] : g.errors.map((e) => e.code);
};

async function published(o: { secondC?: boolean; overrides?: Record<string, string> } = {}) {
  env = await seedTimelineProject("ms-v43-gate-");
  const a = seedScene(env, ITEMS[0]!);
  const b = seedScene(env, ITEMS[1]!, { withC: o.secondC ?? true });
  const doc = await publishTimelineRevision(deps(), "p1", buildTimelineDoc(env.db, env.s.root, "p1", o.overrides ? { overrides: o.overrides } : {}));
  return { a, b, doc };
}

describe("assembleGate", () => {
  it("свежая ревизия с A, B и C → ok; новая C другой версии сцены → только timeline_stale", async () => {
    const { a, doc } = await published();
    expect(gate(doc)).toEqual({ ok: true });
    approveC(env.db, addVersion(env.db, a.sceneId, 87).id);
    expect(gate(doc)).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "timeline_stale" })] });
  });

  it("A устарело → approval_required", async () => {
    const { doc } = await published();
    approvalsRepo.markStale(env.db, { projectId: "p1", kind: "A" }, "subject_changed");
    expect(codes(doc)).toContain("approval_required");
    expect(gate(doc)).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "approval_required", detail: expect.stringMatching(/A/) })] });
  });

  it("не текущая ревизия → timeline_stale; ревизии нет → timeline_stale", async () => {
    const { doc } = await published();
    const r2 = await saveTimelineRevision(deps(), doc.timeline_id, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_002", start_frame: 606 }] });
    expect(gate(r2)).toEqual({ ok: true });
    expect(codes(doc)).toEqual(["timeline_stale"]);
    expect(codes({ timeline_id: doc.timeline_id, revision: 9 })).toEqual(["timeline_stale"]);
    expect(codes({ timeline_id: "tl_other", revision: 1 })).toEqual(["timeline_stale"]);
  });

  it("blocking-проблема ревизии → blocking_issues", async () => {
    const { doc } = await published();
    const r2 = await saveTimelineRevision(deps(), doc.timeline_id, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 0 }] });
    expect(r2.issues.some((i) => i.severity === "blocking")).toBe(true);
    expect(codes(r2)).toEqual(["blocking_issues"]);
  });

  it("C утверждённой сцены отозвана → approval_required (C) и timeline_stale", async () => {
    const { a, doc } = await published();
    approvalsRepo.revokeActive(env.db, "p1", "C", `scene:${a.sceneId}`);
    const g = gate(doc);
    expect(g.ok).toBe(false);
    if (g.ok) return;
    expect(g.errors.map((e) => e.code).sort()).toEqual(["approval_required", "timeline_stale"]);
    expect(g.errors.find((e) => e.code === "approval_required")!.detail).toMatch(/sp_001/);
  });

  it("override с причиной без C — ok", async () => {
    const { doc } = await published({ secondC: false, overrides: { sp_002: "без утверждения: проверка" } });
    expect(doc.scenes.map((c) => c.include)).toEqual(["approved", "override"]);
    expect(gate(doc)).toEqual({ ok: true });
  });
});
