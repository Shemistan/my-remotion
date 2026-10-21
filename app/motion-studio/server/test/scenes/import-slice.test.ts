import { existsSync } from "node:fs";
import { chmod, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { importSliceVersions, reconcileVersions, recoverMissingVersions } from "../../src/scenes/import-slice.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { publishVersion, readVersion, sweepAbandonedDrafts, writeBrief } from "../../src/scenes/store.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { makeDraft, meta } from "./helpers.js";

let s: TestStore;
let db: Db;
let repo: SceneRepo;
const refs = [{ kb_id: "remotion-bits/counter", repository: "remotion-bits", repository_url: "https://x", commit: "de35fda", license: "MIT", license_class: "permissive", strategy: "adapt", source_paths: ["a.tsx"] }];

beforeEach(async () => {
  s = await makeStore("ms-import-slice-");
  db = openDb(s.root);
  migrate(db);
  repo = new SceneRepo({ root: s.root, db, guard: s.guard });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("importSliceVersions", () => {
  it("версии среза регистрируются: сцена, версии по номерам, current, knowledge_refs; повтор ничего не делает", async () => {
    await writeBrief(s.root, "scn_S", { prompt: "Срезовая сцена", settings: defaultSettings(), created_at: "2026-10-20T00:00:00.000Z" });
    const v1 = await publishVersion(await makeDraft(s.root, { runId: "run_1", attempt: 1, sceneId: "scn_S" }, { refs }), meta("scn_S"), s.guard);
    const v2 = await publishVersion(await makeDraft(s.root, { runId: "run_2", attempt: 1, sceneId: "scn_S" }), meta("scn_S", { status: "failed" }), s.guard);

    expect(await importSliceVersions(repo, s.root)).toMatchObject({ imported: 2, skipped: [] });
    expect(scenes.get(db, "scn_S")).toMatchObject({ project_id: "playground", title: "Срезовая сцена", current_version_id: v1.versionId });
    expect(versions.listByScene(db, "scn_S").map((v) => [v.id, v.number, v.status])).toEqual([[v1.versionId, 1, "ready"], [v2.versionId, 2, "failed"]]);
    expect(db.prepare("SELECT kb_id, repo, license_class FROM knowledge_refs").all()).toEqual([{ kb_id: "remotion-bits/counter", repo: "remotion-bits", license_class: "permissive" }]);
    expect(await importSliceVersions(repo, s.root)).toMatchObject({ imported: 0 });
  });

  it("испорченная версия (sha256) не регистрируется", async () => {
    const v = await publishVersion(await makeDraft(s.root, { runId: "run_1", attempt: 1, sceneId: "scn_S" }), meta("scn_S"), s.guard);
    await chmod(join(v.dir, "props.json"), 0o644);
    await writeFile(join(v.dir, "props.json"), "{\"x\":1}");
    await chmod(join(v.dir, "props.json"), 0o444);
    const r = await importSliceVersions(repo, s.root);
    expect(r.imported).toBe(0);
    expect(r.skipped).toEqual([{ dir: v.dir, error: expect.stringMatching(/sha256/) }]);
    expect(versions.get(db, v.versionId)).toBeUndefined();
  });

  it("reconcile_versions: каталог версии без строки в БД (сбой между rename и COMMIT) подбирается и становится current", async () => {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    jobs.insert(db, { id: "job_1", type: "playground.generate", project_id: "playground", scene_id: sceneId, input: {}, attempt: 1 });
    const v = await publishVersion(await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId }), meta(sceneId, { job: { id: "job_1", attempt: 1 } }), s.guard);
    expect(versions.get(db, v.versionId)).toBeUndefined();
    expect(await importSliceVersions(repo, s.root)).toMatchObject({ imported: 1 });
    expect(versions.get(db, v.versionId)).toMatchObject({ created_by_job_id: "job_1", number: 1 });
    expect(scenes.get(db, sceneId)!.current_version_id).toBe(v.versionId);
  });

  it("проект без строки в БД пропускается с причиной", async () => {
    const v = await publishVersion(await makeDraft(s.root, { runId: "run_1", attempt: 1, sceneId: "scn_X", projectId: "prj_lost" }), meta("scn_X"), s.guard);
    const r = await importSliceVersions(repo, s.root);
    expect(r.imported).toBe(0);
    expect(r.skipped).toEqual([{ dir: join(s.root, "workspace/projects/prj_lost"), error: expect.stringMatching(/проект/) }]);
    expect(existsSync(v.dir)).toBe(true);
  });
});

describe("recoverMissingVersions: строка в БД есть, каталога версии нет, draft с manifest.json остался", () => {
  async function published() {
    const sceneId = repo.createScene("playground", { prompt: "сцена", settings: defaultSettings() }).id;
    jobs.insert(db, { id: "job_1", type: "playground.generate", project_id: "playground", scene_id: sceneId, input: {}, attempt: 1 });
    const d = await makeDraft(s.root, { runId: "job_1", attempt: 1, sceneId });
    const v = await repo.publish(d, meta(sceneId), { jobId: "job_1", attempt: 1 });
    // обратный случай: rename не дошёл до диска — каталог версии снова на месте draft
    await chmod(v.dir, 0o755);
    await rename(v.dir, d.dir);
    return { sceneId, d, v };
  }

  it("целый draft (manifest sha256 совпадает с БД, файлы сверены) — rename доводится, версия закрыта", async () => {
    const { d, v } = await published();
    await sweepAbandonedDrafts(s.root); // как при загрузке: draft уже помечен abandoned
    const r = await recoverMissingVersions(repo, s.root);
    expect(r).toEqual({ restored: [v.versionId], broken: [] });
    expect(existsSync(d.dir)).toBe(false);
    await expect(readVersion(v.dir)).resolves.toMatchObject({ version_id: v.versionId });
    expect(versions.get(db, v.versionId)!.broken_reason).toBeNull();
  });

  it("draft не сходится с БД — строка помечается broken_reason, файлы не трогаются", async () => {
    const { d, v } = await published();
    await chmod(join(d.dir, "props.json"), 0o644);
    await writeFile(join(d.dir, "props.json"), "{\"x\":2}");
    const r = await recoverMissingVersions(repo, s.root);
    expect(r.restored).toEqual([]);
    expect(r.broken).toEqual([{ versionId: v.versionId, reason: expect.stringMatching(/sha256/) }]);
    expect(versions.get(db, v.versionId)!.broken_reason).toMatch(/sha256/);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(v.dir)).toBe(false);
  });

  it("ни каталога, ни draft — broken_reason «каталог версии не найден»; повтор не дублирует", async () => {
    const { d, v } = await published();
    await chmod(d.dir, 0o755);
    const { rm } = await import("node:fs/promises");
    const { unlockTree } = await import("../db/helpers.js");
    await unlockTree(d.dir);
    await rm(d.dir, { recursive: true });
    expect((await recoverMissingVersions(repo, s.root)).broken).toEqual([{ versionId: v.versionId, reason: expect.stringMatching(/не найден/) }]);
    expect((await recoverMissingVersions(repo, s.root)).broken).toEqual([]);
  });

  it("reconcileVersions = восстановление пропавших + импорт каталогов без строки", async () => {
    const { v } = await published();
    const orphan = await publishVersion(await makeDraft(s.root, { runId: "run_9", attempt: 1, sceneId: "scn_O" }), meta("scn_O"), s.guard);
    const r = await reconcileVersions(repo, s.root);
    expect(r.missing).toEqual({ restored: [v.versionId], broken: [] });
    expect(r.imported).toBe(1);
    expect(versions.get(db, orphan.versionId)).toBeDefined();
  });
});
