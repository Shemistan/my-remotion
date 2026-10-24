// Визуальный план через API (Task 33): запуск `plan.visual` (гейт A, входы), ревизия плана со
// свежестью входов, правка сцен (лицо без причины — blocking), Approval B (409 с перечнем
// проблем → с причиной — 201), перепроверка, сводка видеопроекта.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { seedPlanProject } from "../analysis/plan-db-helpers.js";
import { ctx, opp, out } from "../analysis/plan-helpers.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { seedSemantic } from "./plan-api-helpers.js";
import { k, storeOf } from "./video-helpers.js";

let api: Api;
afterEach(() => api?.close());

/** Сцена sp_001 — overlay в левой трети (лицо справа не задето), `proposed`. */
async function seed() {
  api = await makeApi();
  const items = buildPlanItems(out([opp()]), ctx()).items;
  return seedPlanProject(api.core.db, storeOf(api), api.core.root, items);
}
const generate = (key: string, body: unknown = {}) => api.inj("POST", "/api/projects/p1/plan/generate", { ...okHeaders, ...k(key) }, body);
const revise = (base: number, ops: unknown[]) => api.inj("POST", "/api/plans/pln_1/revisions", okHeaders, { base_revision: base, ops });
const approveB = () => api.inj("POST", "/api/projects/p1/approvals", okHeaders, { kind: "B" });

describe("plan/generate", () => {
  beforeEach(seed);

  it("без A — 409 approval_required; без смысловой разметки — semantic_missing; устаревшая — тоже; со свежей — 202", async () => {
    const a = await generate("g1");
    expect(a.statusCode).toBe(409);
    expect(a.json().error).toBe("approval_required");
    approveRoughCut(api.core.db, "p1");
    const s = await generate("g2");
    expect(s.statusCode).toBe(409);
    expect(s.json().error).toBe("semantic_missing");
    await seedSemantic(api, "sem_old", 9);
    expect((await generate("g3")).json().error).toBe("semantic_missing");
    await seedSemantic(api);
    const r = await generate("g4", { useAgent: false });
    expect(r.statusCode, r.body).toBe(202);
    expect(jobsRepo.get(api.core.db, r.json().job.id)).toMatchObject({ type: "plan.visual", input: { projectId: "p1", useAgent: false } });
    expect(jobsRepo.list(api.core.db, { projectId: "p1" }).filter((j) => j.type === "plan.visual")).toHaveLength(1);
  });
});

it("plan/generate без анализа видеоряда — 409 footage_missing", async () => {
  api = await makeApi();
  await seedPlanProject(api.core.db, storeOf(api), api.core.root, []);
  api.core.db.prepare("DELETE FROM footage_analyses").run();
  approveRoughCut(api.core.db, "p1");
  await seedSemantic(api);
  const r = await generate("g5");
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe("footage_missing");
});

describe("ревизии плана и Approval B", () => {
  beforeEach(seed);

  it("GET plans/:id — ревизия, свежесть входов, предложения агента; ?revision; неизвестный — 404", async () => {
    expect((await api.inj("GET", "/api/plans/pln_1", getHeaders)).json().proposals).toEqual({}); // ревизию опубликовала не задача plan.visual
    jobsRepo.insert(api.core.db, { id: "job_pv1", type: "plan.visual", project_id: "p1", input: { projectId: "p1" }, status: "completed", attempt: 1, output_refs: { plan_id: "pln_1", revision: 1 } });
    const g = await api.inj("GET", "/api/plans/pln_1", getHeaders);
    expect(g.statusCode, g.body).toBe(200);
    const dto = g.json();
    expect(dto).toMatchObject({ id: "pln_1", current_revision: 1, inputs_fresh: { edl: true, transcript: true, style: true }, recheck: null });
    expect(dto.doc.items.map((x: { id: string; status: string }) => [x.id, x.status])).toEqual([["sp_001", "proposed"]]);
    expect(dto.proposals.sp_001).toEqual({ visual_type: "growth-decline", composition_mode: "overlay", zone: "left_third", start_word_id: "w_000005", end_word_id: "w_000009" });
    expect((await api.inj("GET", "/api/plans/pln_1?revision=1", getHeaders)).json().doc.revision).toBe(1);
    expect((await api.inj("GET", "/api/plans/pln_1?revision=5", getHeaders)).statusCode).toBe(404);
    expect((await api.inj("GET", "/api/plans/pln_none", getHeaders)).statusCode).toBe(404);
    const v = (await api.inj("GET", "/api/projects/p1/video", getHeaders)).json();
    expect(v.plan).toEqual({ id: "pln_1", current_revision: 1 });
    expect(v.style).toMatchObject({ current_revision: 1 });
  });

  it("зона на лицо без причины → 201 и blocking face_overlap → B 409 blocking_issues с перечнем → причина → B 201", async () => {
    approveRoughCut(api.core.db, "p1");
    const r = await revise(1, [
      { op: "modify", item_id: "sp_001", patch: { zone: "right_third" } },
      { op: "set_status", item_id: "sp_001", status: "accepted" },
    ]);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().doc.revision).toBe(2);
    const face = r.json().doc.issues.find((x: { code: string }) => x.code === "face_overlap");
    expect(face).toMatchObject({ item_id: "sp_001", severity: "blocking" });
    expect(r.json().doc.items[0].face_overlap.ratio).toBeGreaterThan(0.02);

    const no = await approveB();
    expect(no.statusCode).toBe(409);
    expect(no.json().error).toBe("blocking_issues");
    expect(no.json().issues).toEqual([expect.objectContaining({ item_id: "sp_001", code: "face_overlap", severity: "blocking" })]);

    const why = await revise(2, [{ op: "modify", item_id: "sp_001", patch: { override_reason: "автор показывает на схему" } }]);
    expect(why.statusCode, why.body).toBe(201);
    expect(why.json().doc.issues.find((x: { code: string }) => x.code === "face_overlap")).toMatchObject({ severity: "warning" });
    const b = await approveB();
    expect(b.statusCode, b.body).toBe(201);
    expect(b.json()).toMatchObject({ kind: "B", status: "valid", subject_ref: "plan:pln_1@r3" });
    expect((await api.inj("GET", "/api/projects/p1/approvals", getHeaders)).json().B).toMatchObject({ state: "valid" });
  });

  it("B: без A — approval_required; proposed — items_unresolved; конфликт ревизии — 409; сцена пользователя по словам", async () => {
    expect((await approveB()).json().error).toBe("approval_required");
    approveRoughCut(api.core.db, "p1");
    const u = await approveB();
    expect(u.statusCode).toBe(409);
    expect(u.json().error).toBe("items_unresolved");
    expect(u.json().items).toEqual(["sp_001"]);
    expect((await revise(7, [{ op: "set_status", item_id: "sp_001", status: "rejected" }])).json()).toMatchObject({ error: "revision_conflict" });
    const add = await revise(1, [{
      op: "add", start_word_id: "w_000011", end_word_id: "w_000014", visual_type: "key-point-emphasis", composition_mode: "overlay", zone: "left_third", purpose: "выделить итог",
    }]);
    expect(add.statusCode, add.body).toBe(201);
    expect(add.json().doc.items.at(-1)).toMatchObject({ id: "sp_002", origin: "user", status: "accepted", evidence: [{ quote: "Это главный итог нашей" }] });
  });

  it("PUT style: контраст — 400 style_contrast с парами; валидный → 201, B stale(style_changed), перепроверка в очереди", async () => {
    approveRoughCut(api.core.db, "p1");
    await revise(1, [{ op: "set_status", item_id: "sp_001", status: "accepted" }]);
    expect((await approveB()).statusCode).toBe(201);

    const bad = await api.inj("PUT", "/api/projects/p1/style", okHeaders, { base: { preset: "dark-premium", intensity: "balanced", depth: 1, palette_overrides: { text: "#333333" } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("style_contrast");
    expect(bad.json().pairs).toEqual([expect.objectContaining({ key: "text", color: "#333333", min: 4.5 })]);
    expect(bad.json().pairs[0].ratio).toBeLessThan(4.5);

    const ok = await api.inj("PUT", "/api/projects/p1/style", okHeaders, { base: { preset: "dark-premium", intensity: "calm", depth: 1 } });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().current).toMatchObject({ revision: 2, author: "user" });
    expect((await api.inj("GET", "/api/projects/p1/approvals", getHeaders)).json().B).toMatchObject({ state: "stale", reason: "style_changed" });
    expect((await api.inj("GET", "/api/plans/pln_1", getHeaders)).json().inputs_fresh).toEqual({ edl: true, transcript: true, style: false });
    expect(jobsRepo.list(api.core.db, { projectId: "p1" }).filter((j) => j.type === "plan.recheck")).toHaveLength(1);
    expect((await approveB()).json().error).toBe("plan_outdated");
  });

  it("POST plans/:id/recheck — 202 plan.recheck (Idempotency-Key); итог перепроверки текущей ревизии — в recheck", async () => {
    const r = await api.inj("POST", "/api/plans/pln_1/recheck", { ...okHeaders, ...k("rc-1") }, {});
    expect(r.statusCode, r.body).toBe(202);
    expect(jobsRepo.get(api.core.db, r.json().job.id)).toMatchObject({ type: "plan.recheck", project_id: "p1", input: { projectId: "p1" } });
    expect((await api.inj("POST", "/api/plans/pln_1/recheck", { ...okHeaders, ...k("rc-1") }, {})).json().job.id).toBe(r.json().job.id);
    expect((await api.inj("POST", "/api/plans/pln_none/recheck", { ...okHeaders, ...k("rc-2") }, {})).statusCode).toBe(404);

    // задача перепроверки завершилась ревизией r1 (как если бы её опубликовала она)
    const changed = [{ item_id: "sp_001", change: "anchor_cut" }, { item_id: "sp_002", change: "remapped" }];
    jobsRepo.update(api.core.db, r.json().job.id, { status: "completed", output_refs: { plan_id: "pln_1", revision: 1, changed } });
    expect((await api.inj("GET", "/api/plans/pln_1", getHeaders)).json().recheck).toEqual({ changed });
    // повторная перепроверка без изменений не затирает итог
    const again = await api.inj("POST", "/api/plans/pln_1/recheck", { ...okHeaders, ...k("rc-3") }, {});
    jobsRepo.update(api.core.db, again.json().job.id, { status: "completed", output_refs: { no_change: true, plan_id: "pln_1", revision: 1, changed: [] } });
    expect((await api.inj("GET", "/api/plans/pln_1", getHeaders)).json().recheck).toEqual({ changed });
  });
});
