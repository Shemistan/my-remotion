// Обработчик playground.edit (Task 18) на раннере: фейковые агенты и рендер (кадры — настоящие
// PNG), настоящие static check, SceneRepo (fencing), studio.db и журнал. Базовые версии —
// настоящим обработчиком playground.generate.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EditPlan, type MotionSpec, defaultSettings } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as chat from "../../src/db/repos/chat.js";
import { scriptPlans } from "../../src/db/repos/script.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { durationChecks, normalizePlan, playgroundEdit } from "../../src/pipeline/playground-edit.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { PLAN } from "../script/plan-ops-fixtures.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { readVersion } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { BAD_SCENE, GOOD_SCENE, directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills } from "./helpers.js";
import { history as fixtureHistory, plan, spec180 } from "./edit-fixtures.js";

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

/** Второстепенный элемент базы с раскладкой (вне битов): его Director может выкинуть при пересборке. */
const BADGE = { id: "badge", kind: "text" as const, role: "бейдж", entrance: "fade" as const, content: { text: "beta" }, layout: { x: 0.7, y: 0.9, w: 0.2, h: 0.05 } };
function withBadge(o: ReturnType<typeof laidOut>) {
  o.spec.elements.push(structuredClone(BADGE));
  o.spec.beats[0]!.element_ids.push(BADGE.id);
  return o;
}

/** Раннер с generate и edit на одних фейках; `gen`/`edit` — задача и её итог. */
async function start(over: Partial<GenerateDeps> = {}, renderOpts: Parameters<typeof fakeRender>[0] = {}) {
  const render = fakeRender({ png: true, ...renderOpts });
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
  const edit = async (input: Record<string, unknown>, text?: string, jobSceneId = scene.id) => {
    const msg = text ? chat.add(env.db, { scene_id: scene.id, role: "user", text }) : undefined;
    return wait(enqueue(env.db, { type: "playground.edit", projectId: "playground", sceneId: jobSceneId, input: { sceneId: scene.id, ...(msg ? { messageId: msg.id } : {}), ...input }, idempotencyKey: `e${++k}` }).job.id);
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
    // рендер версии — один; ещё один — проба кадра hold базы (preserve composition), без превью
    const calls = render.calls.slice(before.renders);
    expect(calls.filter((c) => c.preview !== null)).toHaveLength(1);
    expect(calls.filter((c) => c.preview === null).map((c) => c.stills)).toEqual([[179]]);
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
  }, 30_000); // четыре задачи подряд: под нагрузкой pre-commit дольше 10 с
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
        return { files: { "src/Scene.tsx": n === 1 ? good : good.replace("[0, 1]", "[0, 0.9]") } };
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

  it("M-R1: Director при пересборке выкинул элемент базы, правка его не трогает → возвращён из базы, без провала цикла", async () => {
    let editing = false;
    const agents = fakeAgents({
      director: async () => ({ output: editing ? laidOut() : withBadge(laidOut()) }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "линии толще" }], preserve: ["composition"], reply: "ок" }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    expect(json<MotionSpec>(rows(scene.id)[0]!.path, "spec.json").elements.map((e) => e.id)).toContain("badge");
    editing = true;
    const before = agents.engineerCalls.length;
    const job = await edit({}, "сделай линии толще, сохрани композицию");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length - before).toBe(1);
    const v2 = rows(scene.id)[1]!;
    expect(json<MotionSpec>(v2.path, "spec.json").elements.find((e) => e.id === "badge")?.layout).toEqual(BADGE.layout);
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).toMatch(/badge: возвращён/);
  });

  it("M-R1: правка по плану убирает элемент → его пропажа не blocking, элемент не возвращается", async () => {
    let editing = false;
    const agents = fakeAgents({
      director: async () => ({ output: editing ? laidOut() : withBadge(laidOut()) }),
      editPlanner: async () => ({ output: plan({ path: "spec", changes: [{ target: "badge", kind: "spec", description: "убрать бейдж" }], preserve: ["composition"], reply: "Убираю бейдж." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    expect(json<MotionSpec>(rows(scene.id)[0]!.path, "spec.json").elements.map((e) => e.id)).toContain("badge");
    editing = true;
    const before = agents.engineerCalls.length;
    const job = await edit({}, "убери бейдж, остальное не трогай");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length - before).toBe(1);
    const v2 = rows(scene.id)[1]!;
    expect(json<MotionSpec>(v2.path, "spec.json").elements.map((e) => e.id)).not.toContain("badge");
  });

  it("M3: правка сцены сценария — окно речи из входа script исходной генерации идёт в проверку spec Director", async () => {
    let editing = false;
    let round = 0;
    const agents = fakeAgents({
      director: async () => {
        const o = laidOut();
        // правка, раунд 2: удержание ≥ tail (60) — исправлено по speech_window
        if (editing && ++round === 2) {
          o.spec.beats[2] = { ...o.spec.beats[2]!, start_frame: 100, end_frame: 120 };
          o.spec.beats[1] = { ...o.spec.beats[1]!, end_frame: 100 };
          o.spec.beats[3] = { ...o.spec.beats[3]!, start_frame: 120 };
        }
        return { output: o };
      },
      editPlanner: async () => ({ output: plan({ path: "spec", changes: [{ target: "chart", kind: "spec", description: "другой график" }], preserve: [], reply: "Меняю график." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    // сцена сценария: вход script у генерации сцены (окно lead 15 / tail 60)
    const script = { project_id: "playground", plan_id: "pln_x", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style: { preset: "dark-premium", intensity: "balanced", depth: 2 }, lead_frames: 15, tail_frames: 60 };
    jobs.insert(env.db, { id: "job_script_gen", type: "playground.generate", project_id: "playground", scene_id: scene.id, input: { sceneId: scene.id, prompt: "бриф", settings, script }, status: "completed", attempt: 1 });
    editing = true;
    const job = await edit({}, "поменяй график");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const dir = agents.tasks.filter((t) => t.role === "motion_director").slice(1);
    expect(dir).toHaveLength(2);
    expect(String(dir[1]!.input)).toContain("speech_window");
  });

  it("I3: правка сцены сценария — проверка наложения (extraQa) в цикле: заливка корня → раунд Engineer; у Playground — нет", async () => {
    let editing = false;
    let filled = 0;
    const fill = GOOD_SCENE.replace("{{ opacity: o }}", '{{ opacity: o, background: "#000" }}');
    const agents = fakeAgents({
      // первый вызов Engineer в правке сцены сценария — с заливкой корня, дальше — исправлено
      engineer: async () => ({ files: { "src/Scene.tsx": editing && ++filled === 1 ? fill : GOOD_SCENE } }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "толще" }], preserve: [], reply: "ок" }) }),
    });
    const { scene, render, gen, edit } = await start({ agents });
    await gen();
    const transparent = () => render.calls.filter((c) => (c.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent === true);
    // Playground: проверки наложения нет
    expect((await edit({}, "толще")).status).toBe("completed");
    expect(transparent()).toEqual([]);
    const script = { project_id: "playground", plan_id: "pln_x", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style: { preset: "dark-premium", intensity: "balanced", depth: 2 }, lead_frames: 15, tail_frames: 30 };
    jobs.insert(env.db, { id: "job_script_gen", type: "playground.generate", project_id: "playground", scene_id: scene.id, input: { sceneId: scene.id, prompt: "бриф", settings, script }, status: "completed", attempt: 1 });
    const before = agents.engineerCalls.length;
    editing = true;
    const job = await edit({}, "ещё толще");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const calls = agents.engineerCalls.slice(before);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]!.input).toContain("overlay_root_fill");
    expect(transparent().length).toBeGreaterThanOrEqual(1);
  });

  /** Сцена сценария: план pln_f7 r1 со сценой ss_001 на 180 кадров и вход script у генерации сцены. */
  function scriptScene(sceneId: string, total = 180) {
    const item = { ...PLAN.items[0]!, frames: { lead: 15, speech: total - 45, tail: 30, total } };
    const doc = { ...PLAN, plan_id: "pln_f7", items: [item] };
    const rel = `${artifactPaths(env.s.root, "playground").planRev("pln_f7", 1)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
    writeFileSync(join(env.s.root, rel), JSON.stringify(doc));
    scriptPlans.create(env.db, { id: "pln_f7", project_id: "playground" });
    scriptPlans.insertRevision(env.db, { doc, rel_path: rel, sha256: "a".repeat(64) });
    const script = { project_id: "playground", plan_id: "pln_f7", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style: { preset: "dark-premium", intensity: "balanced", depth: 2 }, lead_frames: 15, tail_frames: 30 };
    jobs.insert(env.db, { id: "job_script_gen", type: "playground.generate", project_id: "playground", scene_id: sceneId, input: { sceneId, prompt: "бриф", settings, script }, status: "completed", attempt: 1 });
  }

  it("F7: «медленнее» у сцены сценария — длительность версии по плану (180), темп — внутри сцены через spec; ответ объясняет", async () => {
    const agents = fakeAgents({
      director: async () => ({ output: laidOut() }),
      editPlanner: async () => ({ output: plan({ path: "param", timing_scale: 1.25, preserve: ["composition"], reply: "Замедлил." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    scriptScene(scene.id);
    const before = agents.tasks.length;
    const job = await edit({}, "сделай медленнее");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v2 = rows(scene.id)[1]!;
    const m = await readVersion(join(env.s.root, v2.path));
    expect(m.settings.duration_frames).toBe(180);
    expect(json<MotionSpec>(v2.path, "spec.json").duration_frames).toBe(180);
    expect((m.edit_plan as { timing_scale?: number } | null)?.timing_scale).toBeUndefined();
    // темп меняет Director внутри той же длительности
    expect(agents.tasks.slice(before).map((t) => t.role)).toContain("motion_director");
    const msg = chat.list(env.db, scene.id).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg.text).toMatch(/длительность сцены сценария.*180 кадров/i);
  });

  it("F7: Engineer правки сцены сценария получает ограничение длительности; патч длительности не применяется", async () => {
    const agents = fakeAgents({
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "толще" }], preserve: [], reply: "ок" }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    scriptScene(scene.id);
    const before = agents.engineerCalls.length;
    const job = await edit({ settings_patch: { duration_frames: 240 } }, "толще");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.slice(before)[0]!.input).toMatch(/Длительность сцены фиксирована планом сценария: 180 кадров/);
    expect((await readVersion(join(env.s.root, rows(scene.id)[1]!.path))).settings.duration_frames).toBe(180);
  });

  it("ревью S16a M4: база не по плану (180 вместо 210) на пути param — длительность выровнена под план, правка проходит", async () => {
    const agents = fakeAgents({ director: async () => ({ output: laidOut() }) });
    const { scene, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    const [v1] = rows(scene.id);
    scriptScene(scene.id, 210);
    const before = agents.engineerCalls.length;
    const job = await edit({ plan: plan({ base_version_id: v1!.id, path: "param", changes: [{ target: "depth", kind: "param", description: "объёмнее" }], param_patch: { style: { depth: 2 } }, reply: "Объёмнее." }) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length).toBe(before);
    const v2 = rows(scene.id)[1]!;
    const m = await readVersion(join(env.s.root, v2.path));
    expect(m.settings.duration_frames).toBe(210);
    expect(json<MotionSpec>(v2.path, "spec.json").duration_frames).toBe(210);
    expect(json<{ timing: { duration_frames: number } }>(v2.path, "props.json").timing.duration_frames).toBe(210);
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).toMatch(/выровнена под план сценария: 210 кадров/);
  });

  it("ревью S16a M4: база не по плану на пути code с «темп тот же» — длительность по плану, «темп» не держит базу", async () => {
    let d = 0;
    const agents = fakeAgents({
      director: async () => {
        const o = laidOut();
        if (++d > 1) {
          o.spec.duration_frames = 210;
          o.spec.beats = o.spec.beats.map((b) => (b.id === "b4" ? { ...b, end_frame: 210 } : b));
        }
        return { output: o };
      },
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "толще" }], preserve: ["timing"], reply: "Толще." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    scriptScene(scene.id, 210);
    const before = agents.engineerCalls.length;
    const job = await edit({}, "линия толще, темп тот же");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v2 = rows(scene.id)[1]!;
    const m = await readVersion(join(env.s.root, v2.path));
    expect(m.settings.duration_frames).toBe(210);
    expect((m.edit_plan as { preserve: string[] }).preserve).not.toContain("timing");
    expect(agents.engineerCalls.slice(before)[0]!.input).not.toMatch(/Сохранить как в базе: .*timing/);
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).not.toMatch(/Темп не сохранён/);
  });

  it("S17a fix: база с settings не по плану, а spec по плану — заметка называет длину settings, путь param выравнивает settings", async () => {
    const agents = fakeAgents({ director: async () => ({ output: laidOut() }) });
    const { scene, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    const [v1] = rows(scene.id);
    env.db.prepare("UPDATE scene_versions SET settings_json = ? WHERE id = ?").run(JSON.stringify({ ...v1!.settings, duration_frames: 210 }), v1!.id);
    scriptScene(scene.id);
    const before = agents.engineerCalls.length;
    const job = await edit({ plan: plan({ base_version_id: v1!.id, path: "param", changes: [{ target: "depth", kind: "param", description: "объёмнее" }], param_patch: { style: { depth: 2 } }, reply: "Объёмнее." }) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length).toBe(before);
    const v2 = rows(scene.id)[1]!;
    expect((await readVersion(join(env.s.root, v2.path))).settings.duration_frames).toBe(180);
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).toMatch(/\(210 кадров\) не по плану/);
  });

  it("S17a fix: сцену сняли с плана — длительность не закреплена, в ответе сказано, что сцена устарела", async () => {
    const agents = fakeAgents({ director: async () => ({ output: laidOut() }) });
    const { scene, gen, edit } = await start({ agents });
    expect((await gen()).status).toBe("completed");
    const [v1] = rows(scene.id);
    scriptScene(scene.id);
    const doc = { ...PLAN, plan_id: "pln_f7", revision: 2, parent_revision: 1, items: [{ ...PLAN.items[0]!, status: "rejected" as const }] };
    const rel = `${artifactPaths(env.s.root, "playground").planRev("pln_f7", 2)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
    writeFileSync(join(env.s.root, rel), JSON.stringify(doc));
    scriptPlans.insertRevision(env.db, { doc, rel_path: rel, sha256: "a".repeat(64) });
    const job = await edit({ plan: plan({ base_version_id: v1!.id, path: "param", changes: [{ target: "depth", kind: "param", description: "объёмнее" }], param_patch: { style: { depth: 2 } }, reply: "Объёмнее." }) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const msg = chat.list(env.db, scene.id).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg.text).toMatch(/нет в текущем плане сценария.*длительность не закреплена.*устарела/);
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

/** props по контракту с узлами схемы в content (раскладка — доли кадра). */
async function propsWithNodes(workdir: string, orchX = 0.4): Promise<string> {
  const { contractProps } = await import("./helpers.js");
  const props = JSON.parse(await contractProps(workdir));
  props.content = { nodes: [{ id: "node-user", label: "Пользователь", layout: { x: 0.05, y: 0.4, w: 0.15, h: 0.15 } }, { id: "node-orch", label: "Оркестратор", layout: { x: orchX, y: 0.4, w: 0.2, h: 0.2 } }], flows: [{ edge: "e1", travel: 18 }] };
  return JSON.stringify(props);
}

describe("playgroundEdit: «сохрани композицию» по тому, что рисует сцена (I1)", () => {
  it("path code: Engineer сдвинул узел в props.content → blocking composition_changed, исправление тем же циклом", async () => {
    const agents = fakeAgents({
      engineer: async (task, n) => ({ files: { "src/Scene.tsx": (await import("./helpers.js")).GOOD_SCENE, "props.json": await propsWithNodes(task.workdir, n === 2 ? 0.5 : 0.4) } }),
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "edges", kind: "code", description: "линии толще" }], preserve: ["composition"], reply: "Линии толще." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const job = await edit({}, "сделай линии толще, сохрани композицию");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(3);
    expect(agents.engineerCalls[2]!.input).toContain("composition_changed");
    expect(agents.engineerCalls[2]!.input).toContain("content.nodes[node-orch].layout");
    const v2 = rows(scene.id)[1]!;
    const nodes = json<{ content: { nodes: { id: string; layout: { x: number } }[] } }>(v2.path, "props.json").content.nodes;
    expect(nodes.find((n) => n.id === "node-orch")!.layout.x).toBe(0.4);
  });

  it("path param: param_patch.content сдвигает узлы → blocking composition_changed (не публикуется молча)", async () => {
    const agents = fakeAgents({
      engineer: async (task) => ({ files: { "src/Scene.tsx": (await import("./helpers.js")).GOOD_SCENE, "props.json": await propsWithNodes(task.workdir) } }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const [v1] = rows(scene.id);
    const moved = { nodes: [{ id: "node-user", label: "Пользователь", layout: { x: 0.05, y: 0.4, w: 0.15, h: 0.15 } }, { id: "node-orch", label: "Оркестратор", layout: { x: 0.6, y: 0.4, w: 0.2, h: 0.2 } }] };
    const job = await edit({ plan: plan({ base_version_id: v1!.id, path: "param", param_patch: { content: moved }, preserve: ["composition"], reply: "ок" }) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    // первый проход без Engineer не прошёл сверку — Engineer вызван с composition_changed
    expect(agents.engineerCalls).toHaveLength(2);
    expect(agents.engineerCalls[1]!.input).toContain("composition_changed");
  });

  it("кадр hold базы и новой версии по реестру раскладки: код сдвинул подпись → blocking composition_changed; проба базы — один рендер без превью", async () => {
    const SHIFT = "/* сдвиг */";
    const layout = (req: { versionDir: string; settings: { duration_frames: number } }, f: number) => {
      if (f !== req.settings.duration_frames - 1) return undefined;
      const shifted = readFileSync(join(req.versionDir, "src/Scene.tsx"), "utf8").includes(SHIFT);
      return [
        { id: "label:node-orch:0", role: "label", text: "Оркестратор", rect: { x: shifted ? 1000 : 800, y: 500, w: 200, h: 40 }, fontPx: 30, opacity: 1 },
        { id: "label:node-user:1", role: "label", text: "Пользователь", rect: { x: 100, y: 500, w: 200, h: 40 }, fontPx: 30, opacity: 1 },
      ];
    };
    const agents = fakeAgents({
      engineer: async (_t, n) => {
        const good = (await import("./helpers.js")).GOOD_SCENE;
        return { files: { "src/Scene.tsx": n === 2 ? `${SHIFT}\n${good}` : good } };
      },
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "edges", kind: "code", description: "толще" }], preserve: ["composition"], reply: "ок" }) }),
    });
    const { scene, render, gen, edit } = await start({ agents }, { layout });
    await gen();
    const [v1] = rows(scene.id);
    const before = render.calls.length;
    const job = await edit({}, "линии толще, композицию не трогай");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const calls = render.calls.slice(before);
    const probes = calls.filter((c) => c.preview === null);
    expect(probes).toHaveLength(1);
    expect(probes[0]!.versionDir).toBe(join(env.s.root, v1!.path));
    expect(probes[0]!.outDir).not.toBe(probes[0]!.versionDir);
    expect(probes[0]!.stills).toEqual([179]);
    expect(agents.engineerCalls).toHaveLength(3);
    expect(agents.engineerCalls[2]!.input).toContain("composition_changed");
    expect(agents.engineerCalls[2]!.input).toContain("label:node-orch");
    const v2 = rows(scene.id)[1]!;
    expect(readFileSync(join(env.s.root, v2.path, "src/Scene.tsx"), "utf8")).not.toContain(SHIFT);
    const log = readFileSync(join(env.s.root, v2.path, "pipeline-log.json"), "utf8");
    expect(log).toMatch(/hold/);
  });
});

describe("playgroundEdit: мелкие правила (M2–M5)", () => {
  it("M3: input.sceneId ≠ job.scene_id → failed, версий не прибавилось", async () => {
    const { scene, gen, edit } = await start({ agents: fakeAgents({}) });
    await gen();
    const other = repo.createScene("playground", { prompt: "другая", settings });
    const job = await edit({ plan: plan({ timing_scale: 2 }) }, undefined, other.id);
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/scene_id/);
    expect(rows(scene.id)).toHaveLength(1);
    expect(rows(other.id)).toHaveLength(0);
  });

  it("M4: заимствование у failed-версии → ближайшая ready по номеру; M5: settings_patch убирает из preserve то, что меняет", () => {
    const h = [
      { ...fixtureHistory[0]!, version_id: "a", number: 1 }, { ...fixtureHistory[0]!, version_id: "b", number: 2, status: "failed" as const },
      { ...fixtureHistory[0]!, version_id: "c", number: 3 }, { ...fixtureHistory[0]!, version_id: "d", number: 4 },
      { ...fixtureHistory[0]!, version_id: "e", number: 5, status: "failed" as const }, { ...fixtureHistory[0]!, version_id: "f", number: 6 },
    ];
    const r = normalizePlan(plan({ borrow: [{ from_version_id: "e", what: "palette" }] }), "f", h);
    expect(r.plan.borrow[0]!.from_version_id).toBe("d");
    expect(r.notes[0]).toMatch(/Версия 5 не удалась.*версии 4/);
    const first = normalizePlan(plan({ borrow: [{ from_version_id: "a", what: "palette" }] }), "f", [{ ...h[0]!, status: "failed" as const }, ...h.slice(1)]);
    expect(first.plan.borrow[0]!.from_version_id).toBe("c");
    const p = normalizePlan(plan({ preserve: ["palette", "timing", "composition"] }), "f", h, { style_preset: "light-clean", duration_frames: 240 });
    expect(p.plan.preserve).toEqual(["composition"]);
    expect(normalizePlan(plan({ preserve: ["palette"] }), "f", h, { color_palette: ["#ffffff"] }).plan.preserve).toEqual([]);
  });

  it("замена текста (param_patch.content или цель content.*) снимает text, но не composition: место подписи сверяется, перекладку от текста терпит сверка (I-R1)", () => {
    const h = fixtureHistory;
    const viaParam = normalizePlan(plan({ param_patch: { content: { title: "Бронирование отеля за три шага" } }, preserve: ["composition", "text", "palette"] }), "f", h);
    expect(viaParam.plan.preserve).toEqual(["composition", "palette"]);
    const viaCode = normalizePlan(plan({ path: "code", changes: [{ target: "content.title", kind: "code", description: "новый заголовок" }], preserve: ["composition", "text"] }), "f", h);
    expect(viaCode.plan.preserve).toEqual(["composition"]);
    const viaElement = normalizePlan(plan({ path: "spec", changes: [{ target: "title", kind: "spec", description: "текст заголовка: «Бронирование»" }], preserve: ["composition", "text"] }), "f", h, {}, spec180);
    expect(viaElement.plan.preserve).toEqual(["composition"]);
  });

  it("M-R2: темп на пути param — кадры числом в коде сцены и числа вне договора content → предупреждение в warnings", async () => {
    const { contractProps, GOOD_SCENE } = await import("./helpers.js");
    const agents = fakeAgents({
      engineer: async (task) => {
        const props = JSON.parse(await contractProps(task.workdir));
        props.content = { intro: { start: 12 }, tokens: [{ edge: "e1", until: 150 }] };
        return { files: { "src/Scene.tsx": `${GOOD_SCENE}\n// <DataToken until={150} enterAt={20} />\n`, "props.json": JSON.stringify(props) } };
      },
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const [v1] = rows(scene.id);
    const job = await edit({ plan: plan({ base_version_id: v1!.id, path: "param", timing_scale: 2, reply: "медленнее" }) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v2 = rows(scene.id)[1]!;
    const warnings = readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8");
    expect(warnings).toContain("content.intro.start");
    expect(warnings).toMatch(/until=\{150\}/);
    expect(json<{ content: { tokens: { until: number }[] } }>(v2.path, "props.json").content.tokens[0]!.until).toBe(300);
  });

  it("M2: «темп тот же» на пути code — Director перестроил биты → предупреждение в warnings и ответе", async () => {
    let d = 0;
    const agents = fakeAgents({
      director: async () => {
        const o = laidOut();
        if (++d === 2) o.spec.beats = o.spec.beats.map((b) => ({ ...b, end_frame: Math.min(180, b.end_frame + 10), start_frame: b.start_frame }));
        return { output: o };
      },
      editPlanner: async () => ({ output: plan({ path: "code", changes: [{ target: "chart", kind: "code", description: "толще" }], preserve: ["timing"], reply: "Сделал толще." }) }),
    });
    const { scene, gen, edit } = await start({ agents });
    await gen();
    const job = await edit({}, "линия толще, темп тот же");
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const v2 = rows(scene.id)[1]!;
    expect(readFileSync(join(env.s.root, v2.path, "warnings.json"), "utf8")).toMatch(/темп|тайминг/i);
    const msg = chat.list(env.db, scene.id).filter((x) => x.role === "assistant").at(-1)!;
    expect(msg.text).toMatch(/темп|тайминг/i);
  });
});


describe("F7: durationChecks (сцена сценария)", () => {
  it("длительность версии не по плану — blocking duration_changed; по плану — пусто", () => {
    expect(durationChecks({ spec: spec180, settings: { ...settings, duration_frames: 180 } }, 180)).toEqual([]);
    const off = durationChecks({ spec: { ...spec180, duration_frames: 240 }, settings: { ...settings, duration_frames: 240 } }, 180);
    expect(off).toEqual([expect.objectContaining({ code: "duration_changed", severity: "blocking", source: "programmatic" })]);
    expect(off[0]!.description).toMatch(/240 кадров вместо 180/);
  });

  it("ревью S16a M4: база уже не по плану и правка не выровняла длительность — warning, а не blocking; третья длина — blocking", () => {
    const v = (n: number) => ({ spec: { ...spec180, duration_frames: n }, settings: { ...settings, duration_frames: n } });
    expect(durationChecks(v(180), 210, 180)).toEqual([expect.objectContaining({ code: "duration_changed", severity: "warning" })]);
    expect(durationChecks(v(240), 210, 180)).toEqual([expect.objectContaining({ code: "duration_changed", severity: "blocking" })]);
    expect(durationChecks(v(210), 210, 180)).toEqual([]);
  });
});
