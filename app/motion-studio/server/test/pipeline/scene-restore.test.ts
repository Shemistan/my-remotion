// Обработчик scene.restore (Task 18, M17): новая версия-копия готовой версии без LLM;
// при другом render_lock_sha256 — перерендер в draft и новый render_env.
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { type RenderEnv, defaultSettings } from "@ms/contracts";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { playgroundEdit } from "../../src/pipeline/playground-edit.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { renderEnv } from "../../src/pipeline/render-env.js";
import { sceneRestore } from "../../src/pipeline/scene-restore.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { QUARANTINE, readVersion } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { BAD_SCENE, fakeAgents, fakeRender, makeDeps, makeSkills, okStatus } from "./helpers.js";
import { plan } from "./edit-fixtures.js";

let env: JobsEnv;
let repo: SceneRepo;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-scene-restore-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

async function start(o: { env?: () => Promise<RenderEnv>; engineer?: Parameters<typeof fakeAgents>[0]["engineer"]; render?: Parameters<typeof fakeRender>[0] } = {}) {
  const render = fakeRender({ png: true, ...o.render });
  const d = await makeDeps(env.s.root, await makeSkills(env.s.tmp), { render: render.render, agents: fakeAgents(o.engineer ? { engineer: o.engineer } : {}) });
  runner = new JobRunner({
    db: env.db, root: env.s.root, owner: "srv", pollMs: 5,
    handlers: {
      "playground.generate": playgroundGenerate({ deps: () => d, repo }),
      "playground.edit": playgroundEdit({ deps: () => d, repo }),
      "scene.restore": sceneRestore({ repo, deps: () => ({ storage: () => okStatus(env.s.root), render: d.render, config: d.config }), ...(o.env ? { renderEnv: o.env } : {}) }),
    },
  });
  runner.start();
  const scene = repo.createScene("playground", { prompt: "p", settings: defaultSettings() });
  let k = 0;
  const run = async (type: "playground.generate" | "playground.edit" | "scene.restore", input: Record<string, unknown>, jobSceneId = scene.id) => {
    const id = enqueue(env.db, { type, projectId: "playground", sceneId: jobSceneId, input: { sceneId: scene.id, ...input }, idempotencyKey: `k${++k}` }).job.id;
    await until(() => TERMINAL.includes(jobs.get(env.db, id)!.status), "итог задачи", 20_000);
    return jobs.get(env.db, id)!;
  };
  return { scene, render, run };
}

const rows = (sceneId: string) => versions.listByScene(env.db, sceneId);

describe("sceneRestore", () => {
  it("v1, v2, v3 → восстановить v1: v4 с parent v1 становится current, 4 строки истории, без LLM и рендера", async () => {
    const { scene, render, run } = await start();
    await run("playground.generate", { prompt: "p", settings: defaultSettings() });
    await run("playground.edit", { plan: plan({ timing_scale: 2 }) });
    await run("playground.edit", { plan: plan({ param_patch: { style: { depth: 3 } } }) });
    const before = rows(scene.id);
    expect(before).toHaveLength(3);
    const renders = render.calls.length;
    const job = await run("scene.restore", { versionId: before[0]!.id });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const after = rows(scene.id);
    expect(after).toHaveLength(4);
    expect(after.slice(0, 3)).toEqual(before);
    expect(after[3]).toMatchObject({ number: 4, parent_version_id: before[0]!.id, status: "ready", edit_plan: { kind: "restore", base_version_id: before[0]!.id } });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBe(after[3]!.id);
    expect(render.calls.length).toBe(renders);
    const m = await readVersion(join(env.s.root, after[3]!.path));
    const m1 = await readVersion(join(env.s.root, before[0]!.path));
    expect(m.render_env).toEqual(m1.render_env);
    expect(job.output_refs).toMatchObject({ version_id: after[3]!.id, version_number: 4, restored_from: before[0]!.id, rerendered: false });
    expect(chat.list(env.db, scene.id).at(-1)!.text).toMatch(/Версия 1 восстановлена как версия 4/);
  });

  it("другой render_lock_sha256 → renderVersion с outDir draft, render_env новой версии = текущий", async () => {
    const current = { ...(await renderEnv()), render_lock_sha256: "f".repeat(64) };
    const { scene, render, run } = await start({ env: async () => current });
    await run("playground.generate", { prompt: "p", settings: defaultSettings() });
    const [v1] = rows(scene.id);
    const renders = render.calls.length;
    const job = await run("scene.restore", { versionId: v1!.id });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(render.calls.length).toBe(renders + 1);
    const call = render.calls.at(-1)!;
    expect(call.outDir).toBe(join(env.s.root, "workspace/drafts", `${job.id}-a1`));
    expect(call.versionDir).toBe(call.outDir);
    const v2 = rows(scene.id)[1]!;
    expect((await readVersion(join(env.s.root, v2.path))).render_env).toEqual(current);
    expect(job.output_refs).toMatchObject({ rerendered: true });
  });

  it("восстановление failed-версии → задача failed, версий не прибавилось", async () => {
    const { scene, run } = await start({ engineer: async () => ({ files: { "src/Scene.tsx": BAD_SCENE } }) });
    await run("playground.generate", { prompt: "p", settings: defaultSettings() });
    const [v1] = rows(scene.id);
    expect(v1!.status).toBe("failed");
    const job = await run("scene.restore", { versionId: v1!.id });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline", message: expect.stringMatching(/restore_not_ready/) });
    expect(rows(scene.id)).toHaveLength(1);
  });

  it("перерендер не прошёл probe → задача failed (probe), новой версии нет, draft в карантине, current прежняя", async () => {
    const current = { ...(await renderEnv()), render_lock_sha256: "e".repeat(64) };
    let restoring = false;
    const { scene, run } = await start({
      env: async () => current,
      render: { onCall: async (req) => (restoring ? { ok: true, stills: [], previewPath: join(req.versionDir, "preview.mp4"), browserLogs: [], probe: { durationMs: 1000, width: 10, height: 10, fps: { num: 30, den: 1 }, codec: "h264" } } : undefined) },
    });
    await run("playground.generate", { prompt: "p", settings: defaultSettings() });
    const [v1] = rows(scene.id);
    restoring = true;
    const job = await run("scene.restore", { versionId: v1!.id });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ stage: "probe" });
    expect(rows(scene.id)).toHaveLength(1);
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBe(v1!.id);
    const draft = join(env.s.root, "workspace/drafts", `${job.id}-a1`);
    expect(readFileSync(join(draft, QUARANTINE), "utf8")).toMatch(/restore: перерендер не прошёл ffprobe/);
  });

  it("M3: input.sceneId ≠ job.scene_id → failed, версий не прибавилось", async () => {
    const { scene, run } = await start();
    await run("playground.generate", { prompt: "p", settings: defaultSettings() });
    const [v1] = rows(scene.id);
    const other = repo.createScene("playground", { prompt: "x", settings: defaultSettings() });
    const job = await run("scene.restore", { versionId: v1!.id }, other.id);
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/scene_id/);
    expect(rows(scene.id)).toHaveLength(1);
  });
});

