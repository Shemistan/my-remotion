// Обработчик playground.edit (Task 18) на раннере: фейковые агенты и рендер (кадры — настоящие
// PNG), настоящие static check, SceneRepo (fencing), studio.db и журнал. Базовые версии —
// настоящим обработчиком playground.generate.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EditPlan, type MotionSpec, defaultSettings } from "@ms/contracts";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { playgroundEdit } from "../../src/pipeline/playground-edit.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { readVersion } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { BAD_SCENE, directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills } from "./helpers.js";
import { plan } from "./edit-fixtures.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-playground-edit-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const settings = defaultSettings();
const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

/** Director с раскладкой элементов (для проверки композиции). */
function laidOut(dx = 0) {
  const o = directorOutput();
  o.spec.elements[0]!.layout = { x: 0.1, y: 0.05, w: 0.8, h: 0.1 };
  o.spec.elements[1]!.layout = { x: 0.1 + dx, y: 0.3, w: 0.8 - dx, h: 0.6 };
  return o;
}

/** Раннер с generate и edit на одних фейках; `gen`/`edit` — задача и её итог. */
async function start(over: Partial<GenerateDeps> = {}) {
  const render = fakeRender({ png: true });
  const d = await makeDeps(env.s.root, skills, { render: render.render, ...over });
  runner = new JobRunner({
    db: env.db, root: env.s.root, owner: "srv", pollMs: 5,
    handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }), "playground.edit": playgroundEdit({ deps: () => d, repo }) },
  });
  runner.start();
  const scene = repo.createScene("playground", { prompt: "Рост пользователей", settings });
  let k = 0;
  const wait = async (id: string) => {
    await until(() => TERMINAL.includes(jobs.get(env.db, id)!.status), "итог задачи", 20_000);
    return jobs.get(env.db, id)!;
  };
  const gen = async () => wait(enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "Рост пользователей", settings }, idempotencyKey: `g${++k}` }).job.id);
  const edit = async (input: Record<string, unknown>, text?: string) => {
    const msg = text ? chat.add(env.db, { scene_id: scene.id, role: "user", text }) : undefined;
    return wait(enqueue(env.db, { type: "playground.edit", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, ...(msg ? { messageId: msg.id } : {}), ...input }, idempotencyKey: `e${++k}` }).job.id);
  };
  return { scene, render, d, gen, edit };
}

const rows = (sceneId: string) => versions.listByScene(env.db, sceneId);
const json = <T>(dir: string, name: string) => JSON.parse(readFileSync(join(env.s.root, dir, name), "utf8")) as T;

describe("playgroundEdit: path param", () => {
  it("Edit Planner → param: Engineer не вызывается, рендер 1 раз; v2 от v1 — 240 кадров, depth 2, edit_plan, ответ в чат", async () => {
    const agents = fakeAgents({
      director: async () => ({ output: laidOut() }),
      editPlanner: async () => ({ output: plan({ path: "param", timing_scale: 1 / 0.75, param_patch: { style: { depth: 2 } }, preserve: ["composition"], reply: "Замедлил на 25 % и добавил объёма." }) }),
    });
    const { scene, render, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    const [v1] = rows(scene.id);
    const before = { engineer: agents.engineerCalls.length, renders: render.calls.length, tasks: agents.tasks.length };

    const job = await edit({}, "Уменьши скорость на 25 %, сделай объёмнее");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.slice(before.tasks).map((t) => t.role)).toEqual(["edit_planner", "visual_qa"]);
    expect(agents.engineerCalls.length).toBe(before.engineer);
    expect(render.calls.length - before.renders).toBe(1);
    // Edit Planner получил текущую версию и историю
    const plannerInput = String(agents.tasks[before.tasks]!.input);
    expect(plannerInput).toContain(v1!.id);
    expect(plannerInput).toContain("Уменьши скорость на 25 %");

    const v2 = rows(scene.id)[1]!;
    expect(v2).toMatchObject({ number: 2, status: "ready", parent_version_id: v1!.id, prompt: "Уменьши скорость на 25 %, сделай объёмнее" });
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBe(v2.id);
    const m = await readVersion(join(env.s.root, v2.path));
    expect(m.edit_plan).toMatchObject({ path: "param", base_version_id: v1!.id, timing_scale: 1 / 0.75 });
    expect(m.settings.duration_frames).toBe(240);
    expect(m.changed_files).toEqual(["props.json"]);
    expect(json<MotionSpec>(v2.path, "spec.json").duration_frames).toBe(240);
    const props = json<{ timing: { duration_frames: number }; style: { depth: number } }>(v2.path, "props.json");
    expect(props.timing.duration_frames).toBe(240);
    expect(props.style.depth).toBe(2);
    expect(json<{ depth: number }>(v2.path, "style.json").depth).toBe(2);
    // код сцены — тот же, что у базы
    expect(readFileSync(join(env.s.root, v2.path, "src/Scene.tsx"), "utf8")).toBe(readFileSync(join(env.s.root, v1!.path, "src/Scene.tsx"), "utf8"));
    expect(job.output_refs).toMatchObject({ version_id: v2.id, version_number: 2, path: "param" });
    const msg = chat.list(env.db, scene.id).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg).toMatchObject({ version_id: v2.id, job_id: job.id });
    expect(msg.text).toContain("Замедлил на 25 % и добавил объёма.");
    expect(msg.text).toContain("Версия 2 готова");
  });

  it("plan + settings_patch { duration_frames: 240 } (кнопка Render) → Edit Planner не вызывается, settings.json — 240", async () => {
    const agents = fakeAgents({});
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const [v1] = rows(scene.id);
    const p = plan({ base_version_id: v1!.id, path: "param", changes: [{ target: "settings", kind: "param", description: "длительность 240" }], reply: "Длительность — 8 с." });
    const job = await edit({ plan: p, settings_patch: { duration_frames: 240 } });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.some((t) => t.role === "edit_planner")).toBe(false);
    const v2 = rows(scene.id)[1]!;
    expect(json<{ duration_frames: number }>(v2.path, "settings.json").duration_frames).toBe(240);
    expect(json<MotionSpec>(v2.path, "spec.json").duration_frames).toBe(240);
  });

  it("сбой Edit Planner → failed, stage edit_planner, версий не прибавилось", async () => {
    const agents = fakeAgents({ editPlanner: async () => ({ status: "failed", error: { kind: "schema", message: "не по схеме" } }) });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const job = await edit({}, "сделай фиолетовым");
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline", stage: "edit_planner" });
    expect(rows(scene.id)).toHaveLength(1);
  });

  it("правка при failed v1: «палитра из первой версии» → первая ready, reply объясняет", async () => {
    let n = 0;
    const purple = { accent: ["#a06bff", "#d18cff", "#7d5cff"], bg: "#120a1f" };
    const agents = fakeAgents({
      // первая генерация: Engineer всегда пишет запрещённый код → v1 failed
      engineer: async () => ({ files: { "src/Scene.tsx": ++n <= 3 ? BAD_SCENE : (await import("./helpers.js")).GOOD_SCENE } }),
      editPlanner: async (_t, k) => ({
        output: k === 1
          ? plan({ param_patch: { style: { palette_overrides: purple } }, reply: "Фиолетовая палитра." })
          : plan({ changes: [{ target: "palette", kind: "param", description: "палитра v1" }], borrow: [{ from_version_id: rows(sceneId)[0]!.id, what: "palette" }], reply: "Вернул палитру первой версии." }),
      }),
    });
    const { scene, gen, edit } = await start({ agents });
    const sceneId = scene.id;
    await gen();
    expect(rows(sceneId)[0]!.status).toBe("failed");
    await gen();
    const v2 = rows(sceneId)[1]!;
    expect(v2.status).toBe("ready");
    expect((await edit({}, "сделай всё в фиолетовых тонах")).status).toBe("completed");
    const v3 = rows(sceneId)[2]!;
    expect(json<{ style: { palette_overrides: unknown } }>(v3.path, "props.json").style.palette_overrides).toEqual(purple);

    const job = await edit({}, "верни палитру из первой версии");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v4 = rows(sceneId)[3]!;
    expect(v4.parent_version_id).toBe(v3.id);
    const v2Palette = json<{ palette: unknown }>(v2.path, "style.json").palette;
    expect(json<{ palette: unknown }>(v4.path, "style.json").palette).toEqual(v2Palette);
    expect((v4.edit_plan as EditPlan).borrow).toEqual([{ from_version_id: v2.id, what: "palette" }]);
    const msg = chat.list(env.db, sceneId).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg.text).toMatch(/версия 1 .*не удалась.*верси[яию] 2/i);
  });
});

describe("playgroundEdit: path code и spec", () => {
  it("path code → Director и Engineer получают базу = указанная версия, не current; композиция базы сохранена", async () => {
    let directorN = 0;
    let engineerProps: { timing: { duration_frames: number } } | undefined;
    const agents = fakeAgents({
      // правка: Director сдвигает график на 10 % — пайплайн возвращает раскладку базы
      director: async () => ({ output: laidOut(++directorN === 1 ? 0 : 0.1) }),
      engineer: async (task, n) => {
        if (n === 2) engineerProps = JSON.parse(readFileSync(join(task.workdir, "props.json"), "utf8"));
        const good = (await import("./helpers.js")).GOOD_SCENE;
        return { files: { "src/Scene.tsx": n === 1 ? good : good.replace("#000", "#111") } };
      },
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "линия толще" }], preserve: ["composition"], reply: "Сделал линию толще." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const [v1] = rows(scene.id);
    expect((await edit({ plan: plan({ base_version_id: v1!.id, timing_scale: 2, reply: "медленнее" }) })).status).toBe("completed");
    const v2 = rows(scene.id)[1]!;
    expect(scenes.get(env.db, scene.id)!.current_version_id).toBe(v2.id);

    const job = await edit({ baseVersionId: v1!.id }, "сделай линию графика толще");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const director = agents.tasks.filter((t) => t.role === "motion_director")[1]!;
    expect(String(director.input)).toContain("# База правки");
    expect(String(director.input)).toContain(`"duration_frames": 180`);
    expect(String(director.input)).not.toContain(`"duration_frames": 360`);
    expect(engineerProps?.timing.duration_frames).toBe(180); // копия props базы v1, а не v2 (360)
    const v3 = rows(scene.id)[2]!;
    expect(v3.parent_version_id).toBe(v1!.id);
    const m = await readVersion(join(env.s.root, v3.path));
    expect(m.edit_plan).toMatchObject({ path: "code", base_version_id: v1!.id });
    expect(m.changed_files).toEqual(["src/Scene.tsx"]);
    const chart = json<MotionSpec>(v3.path, "spec.json").elements.find((e) => e.id === "chart")!;
    expect(chart.layout).toEqual(laidOut().spec.elements[1]!.layout);
  });

  it("preserve palette: Engineer сменил палитру → blocking palette_changed, исправление тем же циклом", async () => {
    const { contractProps } = await import("./helpers.js");
    const agents = fakeAgents({
      engineer: async (task, n) => {
        const props = JSON.parse(await contractProps(task.workdir));
        if (n === 2) props.style.palette_overrides = { accent: ["#ff0000"] };
        return { files: { "src/Scene.tsx": (await import("./helpers.js")).GOOD_SCENE, "props.json": JSON.stringify(props) } };
      },
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "толще" }], preserve: ["palette"], reply: "ок" }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const job = await edit({}, "линия толще, цвета не трогай");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(3);
    expect(agents.engineerCalls[2]!.input).toContain("palette_changed");
    const v2 = rows(scene.id)[1]!;
    expect(json<{ style: { palette_overrides?: unknown } }>(v2.path, "props.json").style.palette_overrides).toBeUndefined();
  });

  it("settings_patch { aspect_ratio 9:16, 1080×1920 } → path spec, Director и Engineer вызваны", async () => {
    const agents = fakeAgents({});
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const before = agents.tasks.length;
    const job = await edit({ settings_patch: { aspect_ratio: "9:16", width: 1080, height: 1920 } });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.slice(before).map((t) => t.role)).toEqual(["motion_director", "engineer", "visual_qa"]);
    const v2 = rows(scene.id)[1]!;
    expect(v2.settings).toMatchObject({ aspect_ratio: "9:16", width: 1080, height: 1920 });
    expect((v2.edit_plan as EditPlan).path).toBe("spec");
  });
});
