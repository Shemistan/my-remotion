// Task 38-39: правка видеосцены в Playground (`playground.edit` с входом `video` генерации) —
// длительность только по плану (Р-V6, как S16a у сценария): патч длительности не применяется,
// заметка о закреплённой длительности в ответе, Engineer получает ограничение, длительность
// версии не по плану — blocking `duration_changed`. Фейковые агенты и рендер.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MotionSpec, type ScenePlanItem, type VideoSceneContext, ZONE_RECTS, defaultSettings } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as plans from "../../src/db/repos/plans.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { durationChecks, playgroundEdit, videoPlannedFrames } from "../../src/pipeline/playground-edit.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { readVersion } from "../../src/scenes/store.js";
import { planDoc, sc } from "../analysis/plan-helpers.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { plan } from "./edit-fixtures.js";
import { GOOD_SCENE, directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
const settings = defaultSettings();
const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

beforeEach(async () => {
  env = await setupDb("ms-video-edit-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

/** Сцена плана pln_v на `frames` кадров (fullscreen — без проверок по альфе). */
const item = (frames: number, over: Partial<ScenePlanItem> = {}): ScenePlanItem =>
  sc(3_000_000, 3_000_000 + (frames * 1e6) / 30, { id: "sp_001", status: "accepted", frames: { start: 90, end: 90 + frames }, composition_mode: "fullscreen", zone: "full", rect: ZONE_RECTS.full, ...over });

function publish(revision: number, items: ScenePlanItem[]): void {
  const doc = planDoc(items, { plan_id: "pln_v", revision, ...(revision > 1 ? { parent_revision: revision - 1 } : {}) });
  const rel = `${artifactPaths(env.s.root, "playground").planRev("pln_v", revision)}/plan.json`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(doc));
  if (!plans.get(env.db, "pln_v")) plans.create(env.db, { id: "pln_v", project_id: "playground" });
  plans.insertRevision(env.db, { doc, rel_path: rel, sha256: "a".repeat(64), opportunities: [] });
}

const video = (): VideoSceneContext => ({
  project_id: "playground", plan_id: "pln_v", plan_revision: 1, item_id: "sp_001", style: { preset: "dark-premium", intensity: "balanced", depth: 2 },
  lead_frames: 15, tail_frames: 30, placement: { mode: "fullscreen", zone: "full", rect: ZONE_RECTS.full, transparent: false },
});

async function start(over: Partial<GenerateDeps>) {
  const d = await makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
  runner = new JobRunner({
    db: env.db, root: env.s.root, owner: "srv", pollMs: 5,
    handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }), "playground.edit": playgroundEdit({ deps: () => d, repo }) },
  });
  runner.start();
  const scene = repo.createScene("playground", { prompt: "Рост", settings });
  let k = 0;
  const wait = async (id: string) => {
    await until(() => TERMINAL.includes(jobs.get(env.db, id)!.status), "итог задачи", 20_000);
    return jobs.get(env.db, id)!;
  };
  const gen = () => wait(enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "Рост", settings }, idempotencyKey: `g${++k}` }).job.id);
  /** Генерация «видеосцены»: вход `video` (как пакет видеосцен), версия — от обычной генерации. */
  const asVideo = () => jobs.insert(env.db, { id: "job_video_gen", type: "playground.generate", project_id: "playground", scene_id: scene.id, input: { sceneId: scene.id, prompt: "бриф", settings, video: video() }, status: "completed", attempt: 1 });
  const edit = (input: Record<string, unknown>, text?: string) => {
    const msg = text ? chat.add(env.db, { scene_id: scene.id, role: "user", text }) : undefined;
    return wait(enqueue(env.db, { type: "playground.edit", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, ...(msg ? { messageId: msg.id } : {}), ...input }, idempotencyKey: `e${++k}` }).job.id);
  };
  return { scene, gen, asVideo, edit };
}

describe("videoPlannedFrames", () => {
  it("кадры сцены текущей ревизии; сцены там нет или не принята — null; плана нет — undefined", () => {
    expect(videoPlannedFrames(env.db, env.s.root, video())).toBeUndefined();
    publish(1, [item(180)]);
    expect(videoPlannedFrames(env.db, env.s.root, video())).toBe(180);
    publish(2, [item(150)]);
    expect(videoPlannedFrames(env.db, env.s.root, video())).toBe(150);
    publish(3, [item(150, { status: "rejected" })]);
    expect(videoPlannedFrames(env.db, env.s.root, video())).toBeNull();
  });

  it("durationChecks видеосцены — текст «по плану видеопроекта»", () => {
    const v = (n: number) => ({ spec: { duration_frames: n } as MotionSpec, settings: { ...settings, duration_frames: n } });
    expect(durationChecks(v(240), 180, 180, "плану видеопроекта")).toEqual([expect.objectContaining({ code: "duration_changed", severity: "blocking", description: expect.stringMatching(/по плану видеопроекта/) })]);
    expect(durationChecks(v(240), 180)[0]!.description).toMatch(/по плану сценария/);
  });
});

describe("playground.edit видеосцены: длительность только план", () => {
  it("патч длительности не применяется: Engineer — ограничение, версия 180 кадров, в ответе — заметка о закреплённой длительности", async () => {
    publish(1, [item(180)]);
    const agents = fakeAgents({
      engineer: async () => ({ files: { "src/Scene.tsx": GOOD_SCENE } }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "label", kind: "code", description: "крупнее" }], preserve: [], reply: "Сделал подпись крупнее." }) }),
    });
    const { scene, gen, asVideo, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    asVideo();
    const before = agents.engineerCalls.length;
    const job = await edit({ settings_patch: { duration_frames: 240 } }, "крупнее подпись и подольше");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.slice(before)[0]!.input).toMatch(/Длительность сцены фиксирована визуальным планом: 180 кадров/);
    const v2 = versions.listByScene(env.db, scene.id).at(-1)!;
    expect(v2.number).toBe(2);
    expect((await readVersion(join(env.s.root, v2.path))).settings.duration_frames).toBe(180);
    const msg = chat.list(env.db, scene.id).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg.text).toMatch(/Длительность видеосцены фиксирована планом: 180 кадров \(6,0 с\)/);
  });

  it("план видеопроекта сменил длительность (150), Director держит 180 — правка не публикуется (длина версии только по плану)", async () => {
    publish(1, [item(180)]);
    const agents = fakeAgents({
      engineer: async () => ({ files: { "src/Scene.tsx": GOOD_SCENE } }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "label", kind: "code", description: "крупнее" }], preserve: [], reply: "ок" }) }),
    });
    const { scene, gen, asVideo, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    asVideo();
    publish(2, [item(150)]);
    const job = await edit({}, "крупнее подпись");
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/180 ≠ настройкам 150/);
    expect(versions.listByScene(env.db, scene.id).map((x) => x.number)).toEqual([1]);
  });

  it("план видеопроекта сменил длительность (150), Director перестроил биты — v2 на 150 кадров с заметкой «выровнена под визуальный план»", async () => {
    publish(1, [item(180)]);
    const d150 = () => {
      const o = directorOutput();
      o.spec.duration_frames = 150;
      o.spec.beats = [
        { id: "b1", start_frame: 0, end_frame: 40, action: "title-entrance", description: "", element_ids: ["title"] },
        { id: "b2", start_frame: 30, end_frame: 110, action: "chart-growth", description: "", element_ids: ["chart"] },
        { id: "b3", start_frame: 110, end_frame: 125, action: "final-emphasis", description: "", element_ids: ["chart"] },
        { id: "b4", start_frame: 125, end_frame: 150, action: "hold", description: "дрейф", element_ids: ["chart"] },
      ];
      return o;
    };
    let edits = 0;
    const agents = fakeAgents({
      director: async () => ({ output: edits > 0 ? d150() : directorOutput() }),
      engineer: async () => ({ files: { "src/Scene.tsx": GOOD_SCENE } }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "label", kind: "code", description: "крупнее" }], preserve: [], reply: "ок" }) }),
    });
    const { scene, gen, asVideo, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    asVideo();
    publish(2, [item(150)]);
    edits++;
    const job = await edit({}, "крупнее подпись");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v2 = versions.listByScene(env.db, scene.id).at(-1)!;
    expect(v2.number).toBe(2);
    expect((await readVersion(join(env.s.root, v2.path))).settings.duration_frames).toBe(150);
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).toMatch(/выровнена под визуальный план: 150 кадров/);
  });
});
