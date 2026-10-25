// Task 38-39: Approval C на версию видеосцены (Р-V4): субъект `scene:<id>@r<номер>` + хеш
// манифеста; C одной сцены не отзывает C другой; `failed`/сломанная версия — `version_failed`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as approvals from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { approveScene, sceneApprovalState, unapproveScene } from "../../src/video-scenes/approval-c.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let n = 0;
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return "не бросило";
}
async function version(sceneId: string, over: Parameters<typeof meta>[1] = {}): Promise<string> {
  n++;
  const id = `job_${n}`;
  jobs.insert(env.db, { id, type: "playground.generate", project_id: "p1", scene_id: sceneId, input: { n }, status: "running", attempt: 1 });
  const d = await makeDraft(env.s.root, { runId: id, attempt: 1, sceneId, projectId: "p1" });
  return (await repo.publish(d, meta(sceneId, over), { jobId: id, attempt: 1 })).versionId;
}

beforeEach(async () => {
  env = await setupDb("ms-approval-c-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  projects.create(env.db, { id: "p1", kind: "video", title: "в" });
  scenes.create(env.db, { id: "scn_a", project_id: "p1", title: "a" });
  scenes.create(env.db, { id: "scn_b", project_id: "p1", title: "b" });
});
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});

describe("Approval C", () => {
  it("две сцены: новая C сцены 1 не отзывает C сцены 2; C на v2 отзывает C на v1 той же сцены", async () => {
    const a1 = await version("scn_a");
    const b1 = await version("scn_b");
    expect(sceneApprovalState(env.db, "scn_a")).toEqual({ state: "missing" });
    const ca = approveScene(env.db, { sceneId: "scn_a", versionId: a1 });
    expect(ca).toMatchObject({ kind: "C", subject_ref: "scene:scn_a@r1", subject_hash: versions.get(env.db, a1)!.manifest_sha256, status: "valid" });
    const cb = approveScene(env.db, { sceneId: "scn_b", versionId: b1 });
    expect(scenes.get(env.db, "scn_a")!.approved_version_id).toBe(a1);
    const a2 = await version("scn_a");
    approveScene(env.db, { sceneId: "scn_a", versionId: a2 });
    expect(approvals.get(env.db, ca.id)!.status).toBe("revoked");
    expect(approvals.get(env.db, cb.id)!.status).toBe("valid");
    expect(sceneApprovalState(env.db, "scn_a")).toMatchObject({ state: "valid", versionId: a2, versionNumber: 2 });
    expect(sceneApprovalState(env.db, "scn_b")).toMatchObject({ state: "valid", versionId: b1, versionNumber: 1 });
    expect(scenes.get(env.db, "scn_a")!.approved_version_id).toBe(a2);
  });

  it("failed-версия или сломанная — version_failed; версия чужой сцены — version_not_in_scene; снять C — missing", async () => {
    const bad = await version("scn_a", { status: "failed" });
    expect(codeOf(() => approveScene(env.db, { sceneId: "scn_a", versionId: bad }))).toBe("version_failed");
    const ok = await version("scn_a");
    expect(codeOf(() => approveScene(env.db, { sceneId: "scn_b", versionId: ok }))).toBe("version_not_in_scene");
    approveScene(env.db, { sceneId: "scn_a", versionId: ok });
    versions.markBroken(env.db, ok, "файлы версии изменены");
    // версия сломалась после утверждения — C устарело
    expect(sceneApprovalState(env.db, "scn_a")).toMatchObject({ state: "stale", reason: "version_changed", versionId: ok });
    expect(codeOf(() => approveScene(env.db, { sceneId: "scn_a", versionId: ok }))).toBe("version_failed");
    unapproveScene(env.db, "scn_a");
    expect(sceneApprovalState(env.db, "scn_a")).toEqual({ state: "missing" });
    expect(scenes.get(env.db, "scn_a")!.approved_version_id).toBeNull();
  });

  it("проект в корзине — project_deleted, C не ставится", async () => {
    const a1 = await version("scn_a");
    env.db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), "p1");
    expect(codeOf(() => approveScene(env.db, { sceneId: "scn_a", versionId: a1 }))).toBe("project_deleted");
    expect(sceneApprovalState(env.db, "scn_a")).toEqual({ state: "missing" });
  });
});
