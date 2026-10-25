// Task 35′ (Р-V4): Approval C — на версию сцены, final — на ревизию таймлайна + настройки; отзыв и
// поиск — по субъекту (`subject_key`), A и B — по виду в проекте, как раньше.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalHash } from "@ms/contracts/canonical";
import { approvalState, approve, peekApprovalState } from "../../src/approvals/engine.js";
import { finalSubject, sceneSubject } from "../../src/approvals/subjects.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { defaultSettings } from "@ms/contracts";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const H1 = canonicalHash(1);
const H2 = canonicalHash(2);
const H3 = canonicalHash(3);
let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-approvals-scope-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("approve по субъекту", () => {
  it("C другой сцены не отзывается; новая C той же сцены отзывает прежнюю", () => {
    const c1 = approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s1@r1", subjectHash: H1 });
    const c2 = approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s2@r3", subjectHash: H2 });
    expect(approvals.get(db, c1.id)!.status).toBe("valid");
    approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s1@r2", subjectHash: H3 });
    expect(approvals.get(db, c1.id)!.status).toBe("revoked");
    expect(approvals.get(db, c2.id)!.status).toBe("valid");
  });

  it("final — по таймлайну: другой таймлайн не трогает", () => {
    const f1 = approve(db, { projectId: "p1", kind: "final", subjectRef: "timeline:tml_1@r1", subjectHash: H1 });
    const f2 = approve(db, { projectId: "p1", kind: "final", subjectRef: "timeline:tml_2@r1", subjectHash: H1 });
    approve(db, { projectId: "p1", kind: "final", subjectRef: "timeline:tml_1@r2", subjectHash: H2 });
    expect([approvals.get(db, f1.id)!.status, approvals.get(db, f2.id)!.status]).toEqual(["revoked", "valid"]);
  });

  it("A и B — прежнее поведение: новое решение отзывает все того же вида в проекте", () => {
    const b1 = approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: H1 });
    const b2 = approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_2@r1", subjectHash: H1 });
    expect(approvals.get(db, b1.id)!.status).toBe("revoked");
    expect(approvals.get(db, b2.id)!.status).toBe("valid");
  });

  it("approvalState / peekApprovalState C — по субъекту (явный ключ или из текущего ref)", () => {
    approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s1@r1", subjectHash: H1 });
    approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s2@r1", subjectHash: H2 });
    expect(approvalState(db, "p1", "C", { ref: "scene:s1@r1", hash: H1 }).state).toBe("valid");
    expect(approvalState(db, "p1", "C", { ref: "scene:s1@r1", hash: H1 }, "scene:s1").state).toBe("valid");
    expect(peekApprovalState(db, "p1", "C", { ref: "scene:s2@r1", hash: H2 }).state).toBe("valid");
    // у сцены s3 решения нет — missing, а не «последнее C проекта»
    expect(approvalState(db, "p1", "C", { ref: "scene:s3@r1", hash: H1 }).state).toBe("missing");
    // текущая версия s1 другая — stale только у s1
    expect(peekApprovalState(db, "p1", "C", { ref: "scene:s1@r2", hash: H3 })).toMatchObject({ state: "stale", reason: "subject_changed" });
    expect(approvalState(db, "p1", "C", { ref: "scene:s1@r2", hash: H3 })).toMatchObject({ state: "stale", reason: "subject_changed" });
    expect(approvalState(db, "p1", "C", { ref: "scene:s2@r1", hash: H2 }).state).toBe("valid");
    expect(approvals.latestActive(db, "p1", "C", "scene:s2")!.subject_ref).toBe("scene:s2@r1");
  });
});

describe("субъекты C и final", () => {
  it("sceneSubject: scene:<id>@r<номер>, хеш — manifest_sha256; failed и сломанная — нет субъекта", () => {
    scenes.create(db, { id: "scn_1", project_id: "p1", title: "x" });
    const v = (id: string, number: number, status: "ready" | "failed", sha: string) => versions.insert(db, {
      id, scene_id: "scn_1", parent_version_id: null, number, status, prompt: "p", edit_plan: null, settings: defaultSettings(),
      path: `scenes/scn_1/${id}`, manifest_sha256: sha, created_by_job_id: null, created_at: "2026-10-25T00:00:00.000Z",
    });
    v("ver_1", 1, "ready", "b".repeat(64));
    v("ver_2", 2, "failed", "c".repeat(64));
    v("ver_3", 3, "ready", "d".repeat(64));
    versions.markBroken(db, "ver_3", "каталог пропал");
    expect(sceneSubject(db, "ver_1")).toEqual({ ref: "scene:scn_1@r1", hash: "b".repeat(64) });
    expect(sceneSubject(db, "ver_2")).toBeUndefined();
    expect(sceneSubject(db, "ver_3")).toBeUndefined();
    expect(sceneSubject(db, "ver_nope")).toBeUndefined();
  });

  it("finalSubject: timeline:<id>@r<N>, хеш — canonicalHash(настроек)", () => {
    const req = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 } as const;
    expect(finalSubject("tml_1", 2, req)).toEqual({ ref: "timeline:tml_1@r2", hash: canonicalHash(req) });
    expect(finalSubject("tml_1", 2, { ...req, quality: "high" }).hash).not.toBe(canonicalHash(req));
  });
});
