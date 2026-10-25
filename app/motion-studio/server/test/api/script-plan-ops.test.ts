// S4 «сценарий → моушн»: `POST /api/projects/:id/script/plan/ops` — синхронная правка плана
// сценария (спека §7): новая ревизия, 409 revision_conflict / resource_busy / plan_outdated, 422.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ScriptPlanRevisionDoc, type ScriptRevisionDoc, ScriptPlanDtoSchema } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approve } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore, ResourceBusyError } from "../../src/artifacts/store.js";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import * as plans from "../../src/db/repos/plans.js";
import * as resourceLocks from "../../src/db/repos/resource-locks.js";
import { scriptPlans } from "../../src/db/repos/script.js";
import { projectLockKey } from "../../src/jobs/locks.js";
import { enqueue } from "../../src/jobs/queue.js";
import { savePlanOps } from "../../src/script/plan-ops.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { PLAN, SCRIPT, SHA, w } from "../script/plan-ops-fixtures.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

/** Текст SCRIPT как блоки для PUT. */
const blocks = SCRIPT.blocks.map((b) => ({ title: b.title, text: b.text }));

describe("POST /api/projects/:id/script/plan/ops", () => {
  let api: Api;
  let id: string;
  let script: ScriptRevisionDoc;
  const url = () => `/api/projects/${id}/script/plan/ops`;

  beforeEach(async () => {
    api = await makeApi();
    id = (await api.inj("POST", "/api/projects", okHeaders, { title: "s", kind: "script" })).json().id;
    script = (await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { blocks })).json().script;
    // план r1 по текущему тексту (как опубликовал бы script.plan)
    const doc: ScriptPlanRevisionDoc = { ...PLAN, inputs: { ...PLAN.inputs, script: { id: script.script_id, revision: script.revision, hash: SHA } } };
    const { db, root } = api.core;
    const rel = `${artifactPaths(root, id).planRev(doc.plan_id, 1)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), JSON.stringify(doc));
    scriptPlans.create(db, { id: doc.plan_id, project_id: id });
    scriptPlans.insertRevision(db, { doc, rel_path: rel, sha256: SHA });
  });
  afterEach(() => api.close());

  it("200 ScriptPlanDto: новая ревизия; GET видит её; валидный B устаревает", async () => {
    const { db } = api.core;
    const cur = currentSubject(db, id, "B")!;
    approve(db, { projectId: id, kind: "B", subjectRef: cur.ref, subjectHash: cur.hash });
    const r = await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [{ op: "add", start_word_id: w(30), end_word_id: w(41) }] });
    expect(r.statusCode).toBe(200);
    const dto = ScriptPlanDtoSchema.parse(r.json());
    expect(dto).toMatchObject({ plan_id: PLAN.plan_id, doc: { revision: 2, parent_revision: 1 }, approval: { state: "stale" } });
    expect(dto.doc.items.map((x) => x.id)).toEqual(["ss_001", "ss_002", "ss_004", "ss_003"]);
    const st = (await api.inj("GET", `/api/projects/${id}/script`)).json();
    expect(st.plan.doc.revision).toBe(2);
    expect(st.approval.state).toBe("stale");
  });

  it("S16a F2/F3: сцена по выделению или смена приёма → задача дозаполнения script.plan с fill; без ожидающих сцен — без задачи", async () => {
    const { db } = api.core;
    const fillJobs = () => jobsRepo.list(db, { projectId: id }).filter((j) => j.type === "script.plan" && (j.input as { fill?: unknown }).fill);
    const r = await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [{ op: "add", start_word_id: w(30), end_word_id: w(41) }] });
    expect(r.statusCode).toBe(200);
    expect(fillJobs().map((j) => j.input)).toEqual([{ projectId: id, fill: { plan_id: PLAN.plan_id, revision: 2 } }]);
    const r2 = await api.inj("POST", url(), okHeaders, { base_revision: 2, ops: [{ op: "modify", item_id: "ss_002", patch: { technique: "timeline" } }] });
    expect(r2.statusCode).toBe(200);
    expect(fillJobs()).toHaveLength(2);
    // правка без новых незаполненных сцен (скорость чтения) задачу не ставит
    await api.inj("POST", url(), okHeaders, { base_revision: 3, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] });
    expect(fillJobs()).toHaveLength(2);
  });

  it("base_revision не текущая — 409 revision_conflict", async () => {
    const op = { op: "set_status", item_id: "ss_002", status: "rejected" };
    expect((await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [op] })).statusCode).toBe(200);
    const again = await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [op] });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: "revision_conflict", base: 1, current: 2 });
  });

  it("идёт script.plan (замок плана) — 409 resource_busy, ревизия не создаётся", async () => {
    const { db } = api.core;
    const job = enqueue(db, { type: "script.plan", projectId: id, input: { projectId: id }, idempotencyKey: "k" }).job;
    expect(resourceLocks.acquire(db, projectLockKey(id, "plan"), job.id)).toBe(true);
    const r = await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_002", status: "rejected" }] });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: "resource_busy", job_id: job.id });
    expect((await api.inj("GET", `/api/projects/${id}/script`)).json().plan.doc.revision).toBe(1);
  });

  it("fix M7: замок взят после ранней проверки (гонка) — resource_busy в транзакции публикации", async () => {
    const { db, root } = api.core;
    const job = enqueue(db, { type: "script.plan", projectId: id, input: { projectId: id }, idempotencyKey: "k2" }).job;
    const store = new ArtifactStore({ root, db, guard: api.core.storageCheck });
    const write = store.writeRevision.bind(store);
    // задача берёт замок между ранней проверкой savePlanOps и транзакцией публикации
    store.writeRevision = (...args) => {
      expect(resourceLocks.acquire(db, projectLockKey(id, "plan"), job.id)).toBe(true);
      return write(...args);
    };
    await expect(savePlanOps({ db, store, root }, id, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_002", status: "rejected" }] }))
      .rejects.toBeInstanceOf(ResourceBusyError);
    expect(plans.byProject(db, id)!.current_revision).toBe(1);
  });

  it("текст новее плана — 409 plan_outdated", async () => {
    expect((await api.inj("PUT", `/api/projects/${id}/script`, okHeaders, { base_revision: 1, blocks })).statusCode).toBe(200);
    const r = await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_002", status: "rejected" }] });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: "plan_outdated" });
  });

  it("422: overlap, bad_range, unknown_item, no_change; 400 — тело не по схеме; 404/409 проекта", async () => {
    const post = (ops: unknown[]) => api.inj("POST", url(), okHeaders, { base_revision: 1, ops });
    const ov = await post([{ op: "add", start_word_id: w(5), end_word_id: w(9) }]);
    expect(ov.statusCode).toBe(422);
    expect(ov.json()).toMatchObject({ error: "overlap", item_id: "ss_001" });
    expect((await post([{ op: "add", start_word_id: w(59), end_word_id: w(62) }])).json()).toMatchObject({ error: "bad_range" });
    expect((await post([{ op: "set_status", item_id: "ss_404", status: "rejected" }])).json()).toMatchObject({ error: "unknown_item" });
    expect((await post([{ op: "set_status", item_id: "ss_001", status: "accepted" }])).json()).toMatchObject({ error: "no_change" });
    expect((await api.inj("POST", url(), okHeaders, { base_revision: 1, ops: [] })).statusCode).toBe(400);
    expect((await api.inj("POST", "/api/projects/nope/script/plan/ops", okHeaders, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] })).statusCode).toBe(404);
    const pg = await api.inj("POST", "/api/projects/playground/script/plan/ops", okHeaders, { base_revision: 1, ops: [{ op: "set_status", item_id: "ss_001", status: "rejected" }] });
    expect(pg.json()).toMatchObject({ error: "not_script_project" });
  });
});
