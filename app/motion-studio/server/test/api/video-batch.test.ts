// Task 40: маршруты сцен видеопроекта — состояние, пакет генерации (202/200, Idempotency-Key,
// 409 approval_required / plan_outdated, 422), Approval C (201, 409 version_failed, plan_changed —
// root передаётся), снятие C, превью в контексте (202 задача; файл с Range — 206).
// Обработчиков задач нет: задачи пакета остаются в очереди; версии публикуются вручную.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { videoScenes } from "../../src/db/repos/video.js";
import { seedPlanProject } from "../analysis/plan-db-helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { P, planItems } from "../video-scenes/batch-helpers.js";
import { approve } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });

describe("API сцен видеопроекта (Task 40)", () => {
  let api: Api;
  let store: ArtifactStore;
  beforeEach(async () => {
    api = await makeApi();
    store = new ArtifactStore({ root: api.core.root, db: api.core.db, guard: api.core.storageCheck });
    await seedPlanProject(api.core.db, store, api.core.root, planItems());
  });
  afterEach(() => api.close());

  const approveB = () => {
    const s = currentSubject(api.core.db, P, "B")!;
    approve(api.core.db, { projectId: P, kind: "B", subjectRef: s.ref, subjectHash: s.hash });
  };

  let seq = 0;
  /** Версия сцены пакета от задачи генерации с тем же входом (видео-контекст и отпечаток), как у задачи пакета. */
  async function publishVersion(jobId: string, o: { failed?: boolean } = {}): Promise<string> {
    const { db, root } = api.core;
    const src = jobs.get(db, jobId)!;
    const id = `job_v_${++seq}`;
    jobs.insert(db, { id, type: "playground.generate", project_id: P, scene_id: src.scene_id!, input: src.input, status: "completed", attempt: 1 });
    const draft = await makeDraft(root, { runId: id, attempt: 1, sceneId: src.scene_id!, projectId: P });
    const v = await api.core.repo.publish(draft, meta(src.scene_id!, o.failed ? { status: "failed" } : {}), { jobId: id, attempt: 1 });
    const fp = (src.input as { video_fingerprint?: string }).video_fingerprint;
    if (fp && !o.failed) videoScenes.setFingerprint(db, src.scene_id!, fp);
    return v.versionId;
  }

  it("generate без Approval B → 409 approval_required; не та ревизия → 409 plan_outdated; чужая сцена → 422", async () => {
    const noB = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g0"), { revision: 1 });
    expect(noB.statusCode, noB.body).toBe(409);
    expect(noB.json().error).toBe("approval_required");
    approveB();
    const old = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 2 });
    expect(old.statusCode).toBe(409);
    expect(old.json().error).toBe("plan_outdated");
    const unknown = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g2"), { revision: 1, item_ids: ["sp_999"] });
    expect(unknown.statusCode).toBe(422);
    const noKey = await api.inj("POST", `/api/projects/${P}/video/generate`, okHeaders, { revision: 1 });
    expect(noKey.statusCode).toBe(400);
  });

  it("generate → 202 пакет; тот же ключ → 200 тот же пакет; GET пакета и состояния; cancel → cancelled", async () => {
    approveB();
    const r = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1 });
    expect(r.statusCode, r.body).toBe(202);
    const b = r.json();
    expect(b.counts).toMatchObject({ total: 4, pending: 4 });
    const again = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1 });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(b.id);
    const reused = await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1, regenerate: true });
    expect(reused.statusCode).toBe(422);
    expect((await api.inj("GET", `/api/video-batches/${b.id}`)).json().id).toBe(b.id);
    const st = await api.inj("GET", `/api/projects/${P}/video/scenes`);
    expect(st.statusCode, st.body).toBe(200);
    expect(st.json()).toMatchObject({ plan: { revision: 1 }, approval_b: { state: "valid" } });
    expect(st.json().scenes.map((x: { status: string }) => x.status)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(st.json().batches.map((x: { id: string }) => x.id)).toEqual([b.id]);
    const c = await api.inj("POST", `/api/video-batches/${b.id}/cancel`, okHeaders);
    expect(c.statusCode).toBe(200);
    expect(c.json().counts).toMatchObject({ total: 4, cancelled: 4 });
  });

  it("мутации без Origin отклоняются (как у сценарных маршрутов)", async () => {
    approveB();
    const r = await api.inj("POST", `/api/projects/${P}/video/generate`, { host: "127.0.0.1:8790", origin: undefined, "idempotency-key": "x" }, { revision: 1 });
    expect(r.statusCode).toBe(403);
  });

  it("approve: failed-версия → 409 version_failed; готовая → 201, C valid в состоянии; unapprove → missing", async () => {
    approveB();
    const b = (await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1, item_ids: ["sp_001"] })).json();
    const x = b.items[0];
    const bad = await publishVersion(x.job.id, { failed: true });
    const r409 = await api.inj("POST", `/api/scenes/${x.scene_id}/approve`, okHeaders, { version_id: bad });
    expect(r409.statusCode, r409.body).toBe(409);
    expect(r409.json().error).toBe("version_failed");
    const ok = await publishVersion(x.job.id);
    const r = await api.inj("POST", `/api/scenes/${x.scene_id}/approve`, okHeaders, { version_id: ok });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ kind: "C", status: "valid", subject_ref: `scene:${x.scene_id}@r2` });
    const scene = (await api.inj("GET", `/api/projects/${P}/video/scenes`)).json().scenes.find((s: { item_id: string }) => s.item_id === "sp_001");
    expect(scene.approval).toMatchObject({ state: "valid", version_id: ok, version_number: 2 });
    expect(scene.approved_version_id).toBe(ok);
    const un = await api.inj("POST", `/api/scenes/${x.scene_id}/unapprove`, okHeaders);
    expect(un.statusCode, un.body).toBe(200);
    expect(un.json().state).toBe("missing");
  });

  it("approve версии, сделанной не по текущей сцене плана → 409 plan_changed (root в approveScene)", async () => {
    approveB();
    const b = (await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1, item_ids: ["sp_001"] })).json();
    const x = b.items[0];
    // вход генерации с чужим отпечатком: версия сделана по другой сцене плана
    const job = jobs.get(api.core.db, x.job.id)!;
    jobs.update(api.core.db, job.id, { input: { ...(job.input as object), video_fingerprint: "f".repeat(64) } });
    const v = await publishVersion(job.id);
    const r = await api.inj("POST", `/api/scenes/${x.scene_id}/approve`, okHeaders, { version_id: v });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().error).toBe("plan_changed");
  });

  it("approve сцены не видеопроекта → 409 not_video_scene; нет сцены → 404", async () => {
    const other = api.core.repo.createScene(P, { prompt: "своя", settings: (await import("@ms/contracts")).defaultSettings() });
    const r = await api.inj("POST", `/api/scenes/${other.id}/approve`, okHeaders, { version_id: "ver_x" });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("not_video_scene");
    expect((await api.inj("POST", `/api/scenes/scn_none/approve`, okHeaders, { version_id: "ver_x" })).statusCode).toBe(404);
  });

  it("preview-context: 202 задача scene.preview_context; тот же ключ → 200; failed-версия → 409; файл отдаётся по Range (206)", async () => {
    approveB();
    const b = (await api.inj("POST", `/api/projects/${P}/video/generate`, key("g1"), { revision: 1, item_ids: ["sp_001"] })).json();
    const x = b.items[0];
    const v = await publishVersion(x.job.id);
    const r = await api.inj("POST", `/api/scenes/${x.scene_id}/preview-context`, key("pc1"), { version_id: v });
    expect(r.statusCode, r.body).toBe(202);
    expect(r.json().job).toMatchObject({ type: "scene.preview_context", status: "pending" });
    const again = await api.inj("POST", `/api/scenes/${x.scene_id}/preview-context`, key("pc1"), { version_id: v });
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(r.json().job.id);
    const bad = await publishVersion(x.job.id, { failed: true });
    const r409 = await api.inj("POST", `/api/scenes/${x.scene_id}/preview-context`, key("pc2"), { version_id: bad });
    expect(r409.statusCode).toBe(409);
    expect(r409.json().error).toBe("version_failed");
    expect((await api.inj("POST", `/api/scenes/${x.scene_id}/preview-context`, okHeaders, { version_id: v })).statusCode).toBe(400);

    // файла ещё нет — 404; опубликованный каталог превью (как задача) → Range 206
    expect((await api.inj("GET", `/api/scenes/${x.scene_id}/preview-context.mp4?versionId=${v}`)).statusCode).toBe(404);
    const rel = artifactPaths(api.core.root, P).contextPreview(x.scene_id, v, 1, 30);
    const draft = join(api.core.root, "workspace/drafts", "job_ctx-a1");
    await mkdir(draft, { recursive: true });
    await writeFile(join(draft, "preview.mp4"), Buffer.alloc(4000, 5));
    await store.publish(draft, rel, () => undefined);
    const part = await api.inj("GET", `/api/scenes/${x.scene_id}/preview-context.mp4?versionId=${v}`, { range: "bytes=0-99" });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 0-99/4000");
    expect(part.headers["content-type"]).toContain("video/mp4");
    // без versionId — текущая версия (утверждённой нет)
    const whole = await api.inj("GET", `/api/scenes/${x.scene_id}/preview-context.mp4`);
    expect(whole.statusCode).toBe(200);
    expect(whole.rawPayload.length).toBe(4000);
    const st = (await api.inj("GET", `/api/projects/${P}/video/scenes`)).json().scenes.find((s: { item_id: string }) => s.item_id === "sp_001");
    expect(st.context_preview).toMatchObject({ version_id: v, plan_revision: 1, pad_frames: 30, outdated: false });
  });
});
