// Task 45: API таймлайна видеопроекта — состояние со свежестью, сборка (`timeline.build`,
// Idempotency-Key), правка ревизии (201 | 409 `revision_conflict`, коды операций), список и
// документ ревизии, превью (`timeline.preview`) и его файл только после публикации.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TimelineDtoSchema } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { TIMELINE_PREVIEW_FILE } from "../../src/pipeline/timeline-preview.js";
import { addVersion, approveC } from "../timeline/helpers.js";
import { okHeaders } from "./helpers.js";
import { type TimelineApi, key, timelineApi } from "./timeline-api-helpers.js";

let t: TimelineApi;
afterEach(() => t.api.close());

const TL = "tl_p1";

describe("GET /api/projects/:id/timeline", () => {
  it("таймлайна нет — 404 timeline_not_found; есть — ревизия, свежесть, превью не готово", async () => {
    t = await timelineApi({ publish: false });
    const none = await t.api.inj("GET", "/api/projects/p1/timeline");
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe("timeline_not_found");
    await t.api.close();

    t = await timelineApi();
    const r = await t.api.inj("GET", "/api/projects/p1/timeline");
    expect(r.statusCode).toBe(200);
    const dto = TimelineDtoSchema.parse(r.json());
    expect(dto).toMatchObject({ timeline_id: TL, revision: 1, fresh: true, reasons: [], preview_ready: false, job: null });
    expect(dto.doc.scenes.map((c) => c.clip_id)).toEqual(["clip_sp_001", "clip_sp_002"]);
  });

  it("новая C другой версии — fresh: false, version_changed", async () => {
    t = await timelineApi();
    approveC(t.api.core.db, addVersion(t.api.core.db, t.sceneIds[0]!, 87).id);
    const dto = (await t.api.inj("GET", "/api/projects/p1/timeline")).json();
    expect(dto).toMatchObject({ fresh: false, reasons: ["version_changed"] });
  });
});

describe("POST /api/projects/:id/timeline/build", () => {
  it("202 задача timeline.build; тот же ключ — та же задача (200); без ключа — 400", async () => {
    t = await timelineApi({ publish: false });
    expect((await t.api.inj("POST", "/api/projects/p1/timeline/build", okHeaders, {})).statusCode).toBe(400);
    const r = await t.api.inj("POST", "/api/projects/p1/timeline/build", key("b1"), {});
    expect(r.statusCode).toBe(202);
    expect(r.json().job).toMatchObject({ type: "timeline.build", project_id: "p1", input: { projectId: "p1" } });
    const again = await t.api.inj("POST", "/api/projects/p1/timeline/build", key("b1"), {});
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(r.json().job.id);
    // задача видна в состоянии таймлайна
    const dto = await t.api.inj("GET", "/api/projects/p1/timeline");
    expect(dto.statusCode).toBe(404);
    expect(dto.json().job).toMatchObject({ id: r.json().job.id });
  });

  it("A не утверждено — 409 approval_required без задачи; не видеопроект — 409", async () => {
    t = await timelineApi({ publish: false });
    t.api.core.db.prepare("UPDATE approvals SET status = 'revoked' WHERE kind = 'A'").run();
    const r = await t.api.inj("POST", "/api/projects/p1/timeline/build", key("b2"), {});
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("approval_required");
    expect(jobs.list(t.api.core.db, { projectId: "p1" }).filter((j) => j.type === "timeline.build")).toEqual([]);
    const pg = await t.api.inj("POST", "/api/projects", okHeaders, { title: "Сцены" });
    const r2 = await t.api.inj("POST", `/api/projects/${pg.json().id}/timeline/build`, key("b3"), {});
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error).toBe("not_video_project");
  });
});

describe("POST /api/timelines/:id/revisions", () => {
  it("сдвиг → 201 r2 (прилипание к слову); старая база → 409 revision_conflict", async () => {
    t = await timelineApi();
    const r = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_002", start_frame: 608 }] });
    expect(r.statusCode).toBe(201);
    const dto = TimelineDtoSchema.parse(r.json());
    expect(dto.revision).toBe(2);
    // слово 41 начинается на кадре 606 — сдвиг на 608 прилипает к нему
    expect(dto.doc.scenes.find((c) => c.clip_id === "clip_sp_002")!.start_frame).toBe(606);
    const stale = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "include", clip_id: "clip_sp_001", include: false }] });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: "revision_conflict", base: 1, current: 2 });
  });

  it("сдвиг с Alt (snap: false) — кадр как есть, без прилипания", async () => {
    t = await timelineApi();
    const r = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_002", start_frame: 608, snap: false }] });
    expect(r.statusCode).toBe(201);
    expect(r.json().doc.scenes.find((c: { clip_id: string }) => c.clip_id === "clip_sp_002").start_frame).toBe(608);
  });

  it("операции вне Р-V6 (set_duration) — 400; клипа нет — 422 clip_not_found; холостая — 422 no_change", async () => {
    t = await timelineApi();
    const bad = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "set_duration", clip_id: "clip_sp_001", frames: 10 }] });
    expect(bad.statusCode).toBe(400);
    const missing = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_x", start_frame: 1 }] });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error).toBe("clip_not_found");
    const same = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "include", clip_id: "clip_sp_001", include: true }] });
    expect(same.statusCode).toBe(422);
    expect(same.json().error).toBe("no_change");
    const nope = await t.api.inj("POST", "/api/timelines/tl_none/revisions", okHeaders, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 1 }] });
    expect(nope.statusCode).toBe(404);
    expect(nope.json().error).toBe("timeline_not_found");
  });

  it("исключение и возврат без C — 422 override_reason_required, с причиной — override", async () => {
    t = await timelineApi({ secondC: false });
    const r = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "include", clip_id: "clip_sp_002", include: true }] });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe("override_reason_required");
    const ok = await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "include", clip_id: "clip_sp_002", include: true, override_reason: "черновик для заказчика" }] });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().doc.scenes.find((c: { clip_id: string }) => c.clip_id === "clip_sp_002")).toMatchObject({ include: "override", override_reason: "черновик для заказчика" });
  });
});

describe("ревизии и превью", () => {
  it("GET revisions — по порядку с текущей; GET revisions/:n — документ; нет — 404", async () => {
    t = await timelineApi();
    await t.api.inj("POST", `/api/timelines/${TL}/revisions`, okHeaders, { base_revision: 1, ops: [{ op: "include", clip_id: "clip_sp_001", include: false }] });
    const list = (await t.api.inj("GET", `/api/timelines/${TL}/revisions`)).json();
    expect(list.map((x: { revision: number; current: boolean; ops: number }) => [x.revision, x.current, x.ops])).toEqual([[1, false, 0], [2, true, 1]]);
    const r1 = await t.api.inj("GET", `/api/timelines/${TL}/revisions/1`);
    expect(r1.statusCode).toBe(200);
    expect(r1.json().doc.scenes).toHaveLength(2);
    expect((await t.api.inj("GET", `/api/timelines/${TL}/revisions/9`)).statusCode).toBe(404);
  });

  it("POST preview → 202 timeline.preview; файл — 404 до публикации, 206 по Range после", async () => {
    t = await timelineApi();
    const r = await t.api.inj("POST", `/api/timelines/${TL}/revisions/1/preview`, key("p1"), {});
    expect(r.statusCode).toBe(202);
    expect(r.json().job).toMatchObject({ type: "timeline.preview", input: { timelineId: TL, revision: 1 } });
    expect((await t.api.inj("POST", `/api/timelines/${TL}/revisions/5/preview`, key("p2"), {})).statusCode).toBe(404);
    expect((await t.api.inj("GET", `/api/timelines/${TL}/revisions/1/preview.mp4`)).statusCode).toBe(404);
    // публикация превью: файл и строка публикации (как у ArtifactStore)
    const rel = artifactPaths(t.api.core.root, "p1").timelinePreviewRev(TL, 1);
    mkdirSync(join(t.api.core.root, rel), { recursive: true });
    writeFileSync(join(t.api.core.root, rel, TIMELINE_PREVIEW_FILE), "0123456789abcdef");
    t.api.core.db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, NULL, NULL, ?)").run(rel, new Date().toISOString());
    const part = await t.api.inj("GET", `/api/timelines/${TL}/revisions/1/preview.mp4`, { range: "bytes=0-3" });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("0123");
    expect((await t.api.inj("GET", "/api/projects/p1/timeline")).json().preview_ready).toBe(true);
  });
});
