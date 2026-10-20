import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { quarantineDraft } from "../../src/scenes/store.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { RENDER_ENV, makeDraft, meta } from "./helpers.js";

let s: TestStore;
let db: Db;
let repo: SceneRepo;

function addJob(id: string, attempt: number, sceneId: string) {
  jobs.insert(db, { id, type: "playground.generate", project_id: "playground", scene_id: sceneId, input: {}, attempt, status: "running" });
  return { jobId: id, attempt };
}

beforeEach(async () => {
  s = await makeStore("ms-scene-repo-");
  db = openDb(s.root);
  migrate(db);
  repo = new SceneRepo({ root: s.root, db, guard: s.guard });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("SceneRepo", () => {
  it("createScene: строка в БД и brief.json в каталоге сцены проекта", async () => {
    const sc = repo.createScene("playground", { prompt: "Рост выручки", settings: defaultSettings() });
    expect(sc).toMatchObject({ project_id: "playground", title: "Рост выручки", current_version_id: null });
    const brief = JSON.parse(await readFile(join(s.root, "workspace/projects/playground/scenes", sc.id, "brief.json"), "utf8"));
    expect(brief).toMatchObject({ prompt: "Рост выручки", settings: defaultSettings() });
    const p = projects.create(db, { title: "Видео" });
    const sc2 = repo.createScene(p.id, { prompt: "x", settings: defaultSettings() });
    expect(existsSync(join(s.root, "workspace/projects", p.id, "scenes", sc2.id, "brief.json"))).toBe(true);
    expect(() => repo.createScene("prj_nope", { prompt: "x", settings: defaultSettings() })).toThrow(/prj_nope/);
  });

  it("fencing, номера, current, restore, diff, cleanupDrafts", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    addJob("job_1", 1, sceneId);
    const draftA1 = await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId });
    jobs.update(db, "job_1", { attempt: 2 });

    // устаревшая попытка: fenced_out, версии нет, draft в карантине
    await expect(repo.publish(draftA1, meta(sceneId), { jobId: "job_1", attempt: 1 })).rejects.toThrow(/fenced_out/);
    expect(versions.listByScene(db, sceneId)).toHaveLength(0);
    expect(existsSync(join(draftA1.dir, ".quarantined"))).toBe(true);
    expect(JSON.parse(await readFile(join(draftA1.dir, ".quarantined"), "utf8")).reason).toMatch(/^fenced_out/);

    const draftA2 = await makeDraft(s.root, { runId: "job_1", attempt: 2, sceneId });
    const v1 = await repo.publish(draftA2, meta(sceneId), { jobId: "job_1", attempt: 2 });
    expect(v1.manifest.number).toBe(1);
    expect(v1.manifest.job).toEqual({ id: "job_1", attempt: 2 });
    expect(scenes.get(db, sceneId)!.current_version_id).toBe(v1.versionId);
    expect(versions.get(db, v1.versionId)).toMatchObject({ number: 1, status: "ready", created_by_job_id: "job_1", path: `workspace/projects/playground/scenes/${sceneId}/versions/${v1.versionId}` });
    expect(existsSync(draftA2.dir)).toBe(false);

    const fence2 = addJob("job_2", 1, sceneId);
    const failedDraft = await makeDraft(s.root, { runId: "job_2", attempt: 1, sceneId });
    const vf = await repo.publish(failedDraft, meta(sceneId, { status: "failed" }), fence2);
    expect(vf.manifest.number).toBe(2);
    expect(scenes.get(db, sceneId)!.current_version_id).toBe(v1.versionId);

    const fence3 = addJob("job_3", 1, sceneId);
    const r = await repo.restore(sceneId, v1.versionId, fence3);
    expect(r.manifest).toMatchObject({ number: 3, parent_version_id: v1.versionId, edit_plan: { kind: "restore", base_version_id: v1.versionId }, prompt: "restore v1", status: "ready" });
    expect(versions.listByScene(db, sceneId)).toHaveLength(3);
    expect(r.manifest.render_env).toEqual(v1.manifest.render_env);
    expect(r.manifest.files.map((f) => [f.path, f.sha256])).toEqual(v1.manifest.files.map((f) => [f.path, f.sha256]));
    expect(scenes.get(db, sceneId)!.current_version_id).toBe(r.versionId);

    const fence4 = addJob("job_4", 1, sceneId);
    await expect(repo.restore(sceneId, vf.versionId, fence4)).rejects.toThrow(/restore_not_ready/);
    expect(existsSync(join(s.root, "workspace/drafts/job_4-a1"))).toBe(false);

    const fence5 = addJob("job_5", 1, sceneId);
    const changed = await makeDraft(s.root, { runId: "job_5", attempt: 1, sceneId, parentVersionId: v1.versionId }, {
      scene: "export const Scene = () => 1;\n",
      props: { style: { palette_overrides: { accent: ["#9B5CFF"] } } },
    });
    const v2Changed = await repo.publish(changed, meta(sceneId, { parent_version_id: v1.versionId }), fence5);
    const d = await repo.diff(v1.versionId, v2Changed.versionId);
    expect(d.props).toContainEqual({ path: "/style/palette_overrides/accent/0", before: "#4F7CFF", after: "#9B5CFF" });
    expect(d.files.find((f) => f.path === "src/Scene.tsx")!.status).toBe("changed");
    expect(d.files.find((f) => f.path === "src/Scene.tsx")!.unified).toContain("+export const Scene = () => 1;");
    expect(d.settings).toEqual([]);
    expect(d.spec).toEqual([]);

    const fence6 = addJob("job_6", 1, sceneId);
    const cancelledDraft = await makeDraft(s.root, { runId: "job_6", attempt: 1, sceneId });
    await quarantineDraft(cancelledDraft, "cancelled: отменено пользователем");
    const live = await makeDraft(s.root, { runId: "job_7", attempt: 1, sceneId });
    await quarantineDraft(live, "interrupted");
    void fence6;
    const c = await repo.cleanupDrafts([{ runId: "job_7", attempt: 1 }]);
    expect(c.kept).toEqual([draftA1.dir, live.dir]);                 // карантин fenced_out и живая попытка остаются
    expect(c.removed).toEqual([cancelledDraft.dir]);                 // карантин cancelled удалён
    expect(existsSync(cancelledDraft.dir)).toBe(false);
    expect(existsSync(draftA1.dir)).toBe(true);
  });

  it("restore с перерендером: render_env и превью из outDir", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    const v1 = await repo.publish(await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId }), meta(sceneId), addJob("job_1", 1, sceneId));
    const newEnv = { ...RENDER_ENV, render_lock_sha256: "e".repeat(64) };
    const r = await repo.restore(sceneId, v1.versionId, addJob("job_2", 1, sceneId), {
      rerender: async (outDir) => {
        await writeFile(join(outDir, "preview.mp4"), "video-2");
        await writeFile(join(outDir, "frames/0.png"), "png-2");
        return { render_env: newEnv };
      },
    });
    expect(r.manifest.render_env).toEqual(newEnv);
    expect(r.manifest.preview!.sha256).not.toBe(v1.manifest.preview!.sha256);
    expect(r.manifest.qa_frames_sha256).not.toEqual(v1.manifest.qa_frames_sha256);
  });

  it("сбой versions.insert после renameSync: каталога версии нет, draft на месте и записываемый", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    const fence = addJob("job_1", 1, sceneId);
    const d = await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId });
    db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON scene_versions BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    await expect(repo.publish(d, meta(sceneId), fence)).rejects.toThrow(/boom/);
    expect(existsSync(join(s.root, "workspace/projects/playground/scenes", sceneId, "versions"))).toBe(true);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(join(d.dir, "manifest.json"))).toBe(false);
    await writeFile(join(d.dir, "src/Scene.tsx"), "export const Scene = () => null;\n");
    expect(versions.listByScene(db, sceneId)).toHaveLength(0);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(join(s.root, "workspace/projects/playground/scenes", sceneId, "versions"))).toEqual([]);
    db.exec("DROP TRIGGER fail_insert");
    await expect(repo.publish(d, meta(sceneId), fence)).resolves.toMatchObject({ manifest: { number: 1 } });
  });

  it("публикация чужого draft или без задачи отклоняется", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    const d = await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId });
    await expect(repo.publish(d, meta(sceneId), { jobId: "job_1", attempt: 1 })).rejects.toThrow(/fenced_out/);
    addJob("job_2", 1, sceneId);
    const d2 = await makeDraft(s.root, { runId: "job_9", attempt: 1, sceneId });
    await expect(repo.publish(d2, meta(sceneId), { jobId: "job_2", attempt: 1 })).rejects.toThrow(/draft/);
  });

  it("хранилище недоступно: storage_unavailable до транзакции, draft цел", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    const fence = addJob("job_1", 1, sceneId);
    const d = await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId });
    const offline = new SceneRepo({ root: s.root, db, guard: async () => ({ ok: false, reason: "not_found", detail: "SSD отключён" }) });
    await expect(offline.publish(d, meta(sceneId), fence)).rejects.toThrow(/storage_unavailable/);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(join(d.dir, ".quarantined"))).toBe(false);
  });
});
