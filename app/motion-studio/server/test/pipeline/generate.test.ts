// Логика generateScene на фейковых адаптерах (агенты, рендер, KB, typecheck);
// static check и хранилище (tmp/) — настоящие.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MotionSpec } from "@ms/contracts";
import { StorageError, type StorageStatus } from "@ms/core";
import { graphSetupMin, resolveStyle } from "@ms/render";
import { canSpend } from "../../src/pipeline/budget.js";
import { generateScene } from "../../src/pipeline/generate.js";
import { readVersion, sweepAbandonedDrafts, sweepAgentCwds } from "../../src/scenes/store.js";
import {
  BAD_SCENE, GOOD_SCENE, OFFLINE, directorOutput, fakeAgents, fakeKb, fakeRender, makeDeps, makeSkills, makeStore, makeTmp,
  okStatus, removeTmp, settings, view,
} from "./helpers.js";

let tmp: string;
let root: string;
let skills: string;
beforeEach(async () => {
  tmp = await makeTmp();
  root = await makeStore(tmp);
  skills = await makeSkills(tmp);
});
afterEach(() => removeTmp(tmp));

const s = settings();
const versionsOf = () => {
  const scenes = join(root, "workspace/projects/playground/scenes");
  if (!existsSync(scenes)) return [];
  return readdirSync(scenes).flatMap((sc) => (existsSync(join(scenes, sc, "versions")) ? readdirSync(join(scenes, sc, "versions")) : []));
};
const draftsOf = () => (existsSync(join(root, "workspace/drafts")) ? readdirSync(join(root, "workspace/drafts")) : []);

describe("generateScene: успех", () => {
  it("публикует ready: knowledge-refs.json, spec, settings, refs/, превью и кадры", async () => {
    const deps = await makeDeps(root, skills);
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "ready", engineerCalls: 1 });
    expect(r.costUsd).toBeCloseTo(0.2);
    const kr = JSON.parse(readFileSync(join(r.versionDir!, "knowledge-refs.json"), "utf8"));
    expect(kr[0]).toMatchObject({ kb_id: expect.any(String), commit: expect.any(String), license: expect.any(String), strategy: expect.any(String) });
    const m = await readVersion(r.versionDir!);
    expect(m.status).toBe("ready");
    expect(m.knowledge_refs).toEqual([{ kb_id: "fake/line-chart", commit: "abc1234", license: "MIT", strategy: "adapt" }]);
    expect(m.render_env.remotion).toBe("4.0.537");
    expect(m.qa).toEqual({ technical: "pass", visual: "not_checked", semantic: "not_checked", style: "not_checked" });
    const written = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8"));
    expect(written.composition.archetype).toBe("split");
    // seed фона — id сцены (своя карта света у каждой сцены), выбор Director не теряется
    expect(written.composition.background).toEqual({ seed: r.sceneId });
    expect(m.preview?.path).toBe("preview.mp4");
    expect(m.qa_frames.length).toBe(m.qa_frames_sha256.length);
    expect(m.qa_frames.length).toBeGreaterThan(2);
    expect(r.previewPath).toBe(join(r.versionDir!, "preview.mp4"));
    for (const f of ["spec.json", "settings.json", "refs/kb/fake/line-chart/CARD.md", "refs/motion-kit/API.md", "refs/skills/remotion-markup/SKILL.md", "refs/skills/remotion-markup/timing.md"]) {
      expect(existsSync(join(r.versionDir!, f)), f).toBe(true);
    }
    expect(existsSync(join(root, "workspace/projects/playground/scenes", m.scene_id, "brief.json"))).toBe(true);
  });

  it("Director: кандидаты KB без нерисующих записей, без инструментов; Engineer: cwd = draft и инструменты файлов", async () => {
    const kb = fakeKb([
      view({ id: "doc/howto", kind: "doc", visualizes: "Не рисует: справка" }),
      view({ id: "util/spring", kind: "util", visualizes: "Своей картинки нет: конфиги" }),
      view(),
    ]);
    const agents = fakeAgents({});
    const r = await generateScene("тест", s, await makeDeps(root, skills, { kb, agents }));
    expect(r.status).toBe("ready");
    const [director, engineer] = agents.tasks;
    expect(director!.role).toBe("motion_director");
    expect(director!.tools).toEqual([]);
    expect(String(director!.input)).toContain("fake/line-chart");
    expect(String(director!.input)).not.toContain("doc/howto");
    expect(String(director!.input)).not.toContain("util/spring");
    expect(engineer!.role).toBe("engineer");
    expect(engineer!.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep"]);
    expect(engineer!.workdir).toMatch(/workspace\/drafts\/run_[0-9A-Z]+-a1$/);
  });

  it("каждый прогон — новый runId и новый draft", async () => {
    const deps = await makeDeps(root, skills);
    const a = await generateScene("тест", s, deps);
    const b = await generateScene("тест", s, deps);
    expect(a.runId).not.toBe(b.runId);
    expect(a.versionDir).not.toBe(b.versionDir);
    expect(versionsOf()).toHaveLength(2);
  });
});

describe("generateScene: автоисправления", () => {
  it("Engineer всегда пишет Math.random → первый вызов + 2 исправления → failed/static, причины уходят Engineer", async () => {
    let typechecks = 0;
    const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": BAD_SCENE } }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents, typecheck: async () => (typechecks++, []) }));
    expect(r).toMatchObject({ status: "failed", engineerCalls: 3, failure: { stage: "static" } });
    // static check — до typecheck (rulings п. 16): с нарушениями typecheck не зовётся
    expect(typechecks).toBe(0);
    expect(agents.engineerCalls[1]!.input).toContain("Math.random");
    expect(agents.engineerCalls[1]!.input).toContain("forbidden-global");
    const m = await readVersion(r.versionDir!);
    expect(m).toMatchObject({ status: "failed", failure: { stage: "static" }, preview: null });
    expect(existsSync(join(r.versionDir!, "pipeline-log.json"))).toBe(true);
  });

  it("ошибка typecheck → исправление → ready", async () => {
    let n = 0;
    const r = await generateScene("тест", s, await makeDeps(root, skills, {
      typecheck: async () => (n++ === 0 ? [{ file: "src/Scene.tsx", line: 3, message: "Type 'string' is not assignable" }] : []),
      agents: fakeAgents({}),
    }));
    expect(r).toMatchObject({ status: "ready", engineerCalls: 2 });
  });

  it("ошибка рендера → исправление с текстом ошибки; probe gate → исправление", async () => {
    let n = 0;
    const agents = fakeAgents({});
    const { render } = fakeRender({
      onCall: async (req) => {
        n++;
        if (n === 1) return { ok: false, stills: [], browserLogs: ["[error] boom"], error: { stage: "bundle", message: "Module not found: chart" } };
        if (n === 2) return { ok: true, stills: [], browserLogs: [], previewPath: join(req.versionDir, "preview.mp4"), probe: { durationMs: 1000, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" } };
      },
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents, render }));
    expect(r).toMatchObject({ status: "ready", engineerCalls: 3 });
    expect(agents.engineerCalls[1]!.input).toContain("Module not found: chart");
    expect(agents.engineerCalls[2]!.input).toContain("duration");
  });

  it("бюджет 5, каждый вызов 2: Director (2) → Engineer (4) → исправление 1 (6) → исправление 2 не делается", async () => {
    const agents = fakeAgents({ costUsd: 2 });
    const { render } = fakeRender({ fail: { stage: "media", message: "render crashed" } });
    const b = await generateScene("тест", s, await makeDeps(root, skills, { agents, render }));
    expect(b).toMatchObject({ status: "failed", engineerCalls: 2, failure: { stage: "budget" } });
    expect(b.costUsd).toBe(6);
    expect((await readVersion(b.versionDir!)).failure?.stage).toBe("budget");
  });

  it("бюджет исчерпан до Director → budget, draft не создан", async () => {
    const deps = await makeDeps(root, skills);
    deps.config.scene.maxCostUsd = 0;
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "failed", engineerCalls: 0, failure: { stage: "budget" } });
    expect(r.versionDir).toBeUndefined();
  });

  it("canSpend: spent < scene.maxCostUsd", async () => {
    const { config } = await makeDeps(root, skills);
    expect(canSpend(4.99, config)).toBe(true);
    expect(canSpend(5, config)).toBe(false);
  });
});

describe("generateScene: Director", () => {
  it("Director не ответил по схеме → failed/director, draft не создан", async () => {
    const agents = fakeAgents({ director: async () => ({ status: "failed", output: undefined, error: { kind: "schema", message: "bad" } }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "director" } });
    expect(r.versionDir).toBeUndefined();
    expect(draftsOf()).toEqual([]);
    // сцена с одним brief видна как неудачная
    const failure = JSON.parse(readFileSync(join(root, "workspace/projects/playground/scenes", r.sceneId!, "failure.json"), "utf8"));
    expect(failure).toMatchObject({ run_id: r.runId, stage: "director" });
  });

  it("spec Director с другой длительностью → failed/director", async () => {
    const out = directorOutput();
    out.spec.duration_frames = 90;
    out.spec.beats = out.spec.beats.map((b) => ({ ...b, start_frame: Math.min(b.start_frame, 80), end_frame: Math.min(b.end_frame, 90) }));
    const agents = fakeAgents({ director: async () => ({ output: out }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "director", message: expect.stringContaining("duration_frames") } });
  });
});

describe("generateScene: проверка spec после Director (Task 17)", () => {
  const uniform = () => {
    const out = directorOutput();
    out.spec.elements = ["a", "b", "c"].map((id) => ({ id, kind: "text" as const, role: "текст", entrance: "fade" as const, content: {} }));
    out.spec.beats = out.spec.beats.map((b) => ({ ...b, element_ids: ["a", "b", "c"] }));
    return out;
  };

  it("blocking specChecks (все входы fade) → Director получает замечания и отвечает ещё раз", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? uniform() : directorOutput() }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    const directors = agents.tasks.filter((t) => t.role === "motion_director");
    expect(directors).toHaveLength(2);
    expect(String(directors[1]!.input)).toContain("uniform_entrance");
  });

  /** Spec с фазами (кадры ставит планировщик); `mode` — hold_mode фазы hold. */
  const phasedOut = (mode?: "now-pulse") => {
    const out = directorOutput();
    out.spec.phases = [
      { id: "p-setup", role: "setup", weight: 1, element_ids: ["title"] },
      { id: "p-act", role: "action", weight: 3, element_ids: ["chart"] },
      { id: "p-pay", role: "payoff", weight: 1, element_ids: ["chart"] },
      { id: "p-hold", role: "hold", weight: 1, element_ids: ["chart", "title"], ...(mode ? { hold_mode: mode } : {}) },
    ];
    out.spec.beats = [
      { id: "b1", phase: "p-setup", action: "title-entrance", description: "", element_ids: ["title"] },
      { id: "b2", phase: "p-act", action: "chart-draw", description: "", element_ids: ["chart"] },
      { id: "b3", phase: "p-pay", action: "final-emphasis", description: "", element_ids: ["chart"] },
      { id: "b4", phase: "p-hold", action: "hold", description: "", element_ids: ["chart", "title"] },
    ] as unknown as typeof out.spec.beats;
    return out;
  };

  it("план битов: проверка фаз (нет hold_mode) — в раунд идёт её текст без общего хвоста про фазы битов (s3afix-rereview m4)", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? phasedOut() : phasedOut("now-pulse") }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    const second = String(agents.tasks.filter((t) => t.role === "motion_director")[1]!.input);
    expect(second).toContain("hold_mode");
    expect(second).not.toContain("у каждого бита");
  });

  it("план битов: бит без фазы и кадров — в раунд идёт подсказка про фазы битов", async () => {
    let n = 0;
    const broken = () => {
      const o = phasedOut("now-pulse");
      o.spec.beats = [...o.spec.beats, { id: "b5", action: "x-in", description: "", element_ids: ["title"] }] as typeof o.spec.beats;
      return o;
    };
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? broken() : phasedOut("now-pulse") }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    expect(String(agents.tasks.filter((t) => t.role === "motion_director")[1]!.input)).toContain("у каждого бита");
  });

  it("задача Engineer называет финал: режим удержания и бит hold (S3b)", async () => {
    const agents = fakeAgents({ director: async () => ({ output: phasedOut("now-pulse") }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    expect(agents.engineerCalls[0]!.input).toContain("финал: hold_mode now-pulse, бит hold `b4`");
    // старая spec без фаз — режим по носителю итога (график → data-shimmer)
    const legacy = fakeAgents({});
    await generateScene("тест", s, await makeDeps(root, skills, { agents: legacy }));
    expect(legacy.engineerCalls[0]!.input).toContain("финал: hold_mode data-shimmer, бит hold `b4`");
  });

  it("пресет настроек — до плана битов: минимум setup графа по токенам того пресета, что пойдёт в рендер (s3afix2-rereview m2)", async () => {
    const withGraph = () => {
      const o = phasedOut("now-pulse");
      const nodes = ["a", "b", "c", "d", "e", "f"];
      o.spec.elements = [...o.spec.elements, { id: "graph", kind: "graph", role: "схема", entrance: "draw", content: { edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i], to: n })) } }];
      o.spec.phases = o.spec.phases!.map((p) => (p.id === "p-setup" ? { ...p, element_ids: ["title", "graph"] } : p));
      o.spec.beats = [...o.spec.beats, { id: "b-graph", phase: "p-setup", action: "graph-build", description: "", element_ids: ["graph"] }] as typeof o.spec.beats;
      // Director выбрал пресет с короткими входами — в настройках dark-premium
      o.spec.style_preset = "tech-neon";
      return o;
    };
    const agents = fakeAgents({ director: async () => ({ output: withGraph() }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.style_preset).toBe(s.style_preset);
    const style = resolveStyle({ preset: s.style_preset, intensity: s.animation_intensity, fps: spec.fps });
    const g = spec.beats.find((b) => b.id === "b-graph")!;
    expect(g.end_frame - g.start_frame).toBeGreaterThanOrEqual(graphSetupMin(style, 6));
    expect(r.warnings.filter((w) => w.includes("Director выбрал пресет tech-neon"))).toHaveLength(1);
  });

  it("settle-push у пресета без наезда (light-clean) → now-pulse с предупреждением (s3b-review m7)", async () => {
    const light = { ...s, style_preset: "light-clean" as const };
    const out = () => {
      const o = phasedOut("now-pulse");
      o.spec.phases = o.spec.phases!.map((p) => (p.role === "hold" ? { ...p, hold_mode: "settle-push" as const } : p));
      o.spec.style_preset = "light-clean";
      return o;
    };
    const agents = fakeAgents({ director: async () => ({ output: out() }) });
    const r = await generateScene("тест", light, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    expect(agents.engineerCalls[0]!.input).toContain("финал: hold_mode now-pulse");
    expect(r.warnings.join("\n")).toContain("settle-push");
  });

  it("не исправил со второго раза → failed/director, draft не создан", async () => {
    const agents = fakeAgents({ director: async () => ({ output: uniform() }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "director", message: expect.stringContaining("uniform_entrance") } });
    expect(agents.engineerCalls).toHaveLength(0);
    expect(draftsOf()).toEqual([]);
  });
});

describe("generateScene: хранилище и процессы", () => {
  it("хранилище недоступно с самого начала → ничего не создано", async () => {
    const o = await generateScene("тест", s, await makeDeps(root, skills, { storage: async () => OFFLINE }));
    expect(o.failure!.stage).toBe("storage");
    expect(o.versionDir).toBeUndefined();
    expect(existsSync(join(root, "workspace/projects"))).toBe(false);
  });

  it("хранилище пропало во время рендера → рендер прерван, версии нет", async () => {
    let offline = false;
    let slowRenderAborted = false;
    const okThenOffline = async (): Promise<StorageStatus> => (offline ? OFFLINE : okStatus(root));
    const { render: slowRender } = fakeRender({
      onCall: async (_req, signal) => {
        offline = true;
        await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }));
        slowRenderAborted = true;
        return { ok: false, stills: [], browserLogs: [], error: { stage: "aborted", message: "рендер отменён" } };
      },
    });
    const m = await generateScene("тест", s, await makeDeps(root, skills, { storage: okThenOffline, render: slowRender, watchIntervalMs: 20 }));
    expect(m.failure!.stage).toBe("storage");
    expect(slowRenderAborted).toBe(true);
    expect(versionsOf()).toEqual([]);
    // хранилище недоступно — публиковать нельзя, draft в карантин (здесь маркер записался)
    expect(JSON.parse(readFileSync(join(m.versionDir!, ".quarantined"), "utf8")).reason).toContain("хранилище недоступно");
  });

  it("render orphaned → failure orphaned, draft в карантине, публикации нет", async () => {
    const { render } = fakeRender({ fail: { stage: "orphaned", message: "группа worker не исчезла" } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "orphaned" }, engineerCalls: 1 });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("Engineer orphaned → failure orphaned, draft в карантине", async () => {
    const agents = fakeAgents({ engineer: async () => ({ status: "failed", error: { kind: "orphaned", message: "группа claude жива" } }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "orphaned" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("agents.run() отклонён (StorageError) → storage, draft в карантине, публикации нет", async () => {
    const agents = fakeAgents({ engineer: async () => { throw new StorageError("not_found", "диск пропал"); } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("agents.run() Director отклонён StorageError → storage; каталог Director в карантине, draft не создан", async () => {
    const agents = fakeAgents({ director: async () => { throw new StorageError("not_found", "диск"); } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(r.versionDir).toBeUndefined();
    expect(existsSync(join(root, "run/agent-cwd", `${r.runId}-a1-director`, ".quarantined"))).toBe(true);
  });

  it("agents.run() Director отклонён не по хранилищу → director, не storage", async () => {
    const agents = fakeAgents({ director: async () => { throw new Error("spawn EACCES"); } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "director", message: expect.stringContaining("EACCES") } });
  });

  it("Director orphaned → каталог Director не удалён, в карантине", async () => {
    const agents = fakeAgents({ director: async () => ({ status: "failed", output: undefined, error: { kind: "orphaned", message: "группа жива" } }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "orphaned" } });
    expect(JSON.parse(readFileSync(join(root, "run/agent-cwd", `${r.runId}-a1-director`, ".quarantined"), "utf8")).reason).toContain("orphaned");
  });

  it("render бросил StorageError → storage, draft в карантине, публикации нет", async () => {
    const { render } = fakeRender({ onCall: async () => { throw new StorageError("not_writable", "run/tmp"); } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("хранилище пропало перед публикацией → storage, публикации нет", async () => {
    let calls = 0;
    const { render } = fakeRender({ onCall: async () => { calls = 1000; } });
    const storage = async (): Promise<StorageStatus> => (calls >= 1000 ? OFFLINE : okStatus(root));
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render, storage }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(versionsOf()).toEqual([]);
  });
});

describe("generateScene: прогон задачи (Task 13, fix round 1)", () => {
  it("fenceOk() = false прямо перед публикацией → fenced_out, версии нет, draft попытки в карантине", async () => {
    let calls = 0;
    const deps = { ...(await makeDeps(root, skills)), run: { runId: "job_1", attempt: 2 }, fenceOk: () => (calls++, false) };
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "fenced_out" } });
    expect(calls).toBe(1);
    expect(versionsOf()).toEqual([]);
    expect(draftsOf()).toEqual(["job_1-a2"]);
    expect(JSON.parse(readFileSync(join(root, "workspace/drafts/job_1-a2/.quarantined"), "utf8")).reason).toMatch(/^fenced_out/);
  });

  it("deps.publish заменяет файловую публикацию; meta несёт job попытки", async () => {
    const seen: { job?: unknown }[] = [];
    const deps = {
      ...(await makeDeps(root, skills)),
      run: { runId: "job_1", attempt: 1 },
      fenceOk: () => true,
      publish: async (_d: unknown, meta: { job?: unknown }) => (seen.push(meta), { dir: join(root, "pub"), warnings: ["w-pub"] }),
    };
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "ready", versionDir: join(root, "pub") });
    expect(r.warnings).toContain("w-pub");
    expect(seen[0]!.job).toEqual({ id: "job_1", attempt: 1 });
    expect(versionsOf()).toEqual([]);
  });

  it("deps.publish отклонил fenced_out → этап fenced_out, не publish", async () => {
    const deps = {
      ...(await makeDeps(root, skills)),
      run: { runId: "job_1", attempt: 1 },
      publish: async () => {
        throw new Error("fenced_out: попытка 1 задачи job_1 устарела (текущая: 2)");
      },
    };
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "fenced_out" } });
  });
});

describe("generateScene: отказы прав Engineer (rulings п. 14)", () => {
  it("отказ на чтение вне draft → ready с предупреждением, отказы в warnings.json версии", async () => {
    const denial = { tool_name: "Read", tool_use_id: "t1", tool_input: { file_path: "/Users/x/.zshrc" } };
    const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": GOOD_SCENE }, permissionDenials: [denial] }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    expect(r.warnings.join("\n")).toContain("Read");
    const w = JSON.parse(readFileSync(join(r.versionDir!, "warnings.json"), "utf8"));
    expect(w.permission_denials).toEqual([denial]);
  });

  it("отказ на Write внутри draft → failed/engineer (denied)", async () => {
    const agents = fakeAgents({
      engineer: async (task) => ({
        files: { "src/Scene.tsx": GOOD_SCENE },
        permissionDenials: [{ tool_name: "Write", tool_use_id: "t1", tool_input: { file_path: join(task.workdir, "src/Extra.tsx") } }],
      }),
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "engineer", message: expect.stringContaining("denied") } });
    expect((await readVersion(r.versionDir!)).failure?.message).toContain("denied");
  });

  it("files_written ссылается на несуществующий файл → failed/engineer (denied)", async () => {
    const agents = fakeAgents({
      engineer: async () => ({
        files: { "src/Scene.tsx": GOOD_SCENE },
        output: { files_written: ["src/Scene.tsx", "src/Ghost.tsx"], kit_components_used: [], kb_ids_used: [], notes: "" },
      }),
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "engineer", message: expect.stringContaining("Ghost.tsx") } });
  });
});

describe("generateScene: каждый выход после draft — публикация failed или карантин", () => {
  // Task 17: отменённая задача версию не публикует — draft в карантин «cancelled» (одноразовый)
  const cancelledDraft = (r: { versionDir?: string }) => JSON.parse(readFileSync(join(r.versionDir!, ".quarantined"), "utf8")).reason as string;

  it("отмена во время Engineer (процесс завершён) → карантин cancelled, версии нет", async () => {
    const ac = new AbortController();
    const agents = fakeAgents({ engineer: async () => { ac.abort(); return { status: "cancelled", files: { "src/Scene.tsx": GOOD_SCENE } }; } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }), ac.signal);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "cancelled" } });
    expect(versionsOf()).toEqual([]);
    expect(cancelledDraft(r)).toMatch(/^cancelled/);
  });

  it("отмена во время рендера → карантин cancelled, версии нет", async () => {
    const ac = new AbortController();
    const { render } = fakeRender({ onCall: async () => { ac.abort(); return { ok: false, stills: [], browserLogs: [], error: { stage: "aborted", message: "отменён" } }; } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }), ac.signal);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "cancelled" } });
    expect(versionsOf()).toEqual([]);
    expect(cancelledDraft(r)).toMatch(/^cancelled/);
  });

  it("отмена между исправлениями (до следующего вызова Engineer) → карантин cancelled, версии нет", async () => {
    const ac = new AbortController();
    const typecheck = async () => { ac.abort(); return [{ file: "src/Scene.tsx", line: 1, message: "ошибка" }]; };
    const r = await generateScene("тест", s, await makeDeps(root, skills, { typecheck }), ac.signal);
    expect(r).toMatchObject({ status: "failed", engineerCalls: 1, failure: { stage: "cancelled" } });
    expect(versionsOf()).toEqual([]);
    expect(cancelledDraft(r)).toMatch(/^cancelled/);
  });

  it("сбой в подготовке публикации (pipeline-log.json не пишется) → failed/publish, draft в карантине", async () => {
    const { render } = fakeRender({ onCall: async (req) => { mkdirSync(join(req.versionDir, "pipeline-log.json")); } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "publish" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
  });

  it("подготовка refs не удалась → опубликована failed/prepare с логом", async () => {
    const r = await generateScene("тест", s, await makeDeps(root, skills, { skillsRoot: join(tmp, "нет-такого") }));
    expect(r).toMatchObject({ status: "failed", engineerCalls: 0, failure: { stage: "prepare" } });
    const m = await readVersion(r.versionDir!);
    expect(m.failure?.stage).toBe("prepare");
    expect(existsSync(join(r.versionDir!, "pipeline-log.json"))).toBe(true);
  });

  it("кэш не создаётся (на месте каталога файл) → не сирота: опубликована failed", async () => {
    writeFileSync(join(root, "cache"), "не каталог");
    const r = await generateScene("тест", s, await makeDeps(root, skills));
    expect(r.status).toBe("failed");
    expect((await readVersion(r.versionDir!)).status).toBe("failed");
  });

  it("публикация упала при живом хранилище → failed/publish, draft в карантине", async () => {
    const { render } = fakeRender({
      onCall: async (req) => {
        mkdirSync(join(req.versionDir, "frames"), { recursive: true });
        symlinkSync("/etc/hosts", join(req.versionDir, "frames", "evil.png"));
      },
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "publish" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("хранилище пропало перед вызовом Engineer → карантин, без публикации", async () => {
    let n = 0;
    const storage = async (): Promise<StorageStatus> => (++n > 4 ? OFFLINE : okStatus(root));
    const r = await generateScene("тест", s, await makeDeps(root, skills, { storage }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });

  it("ни один draft не остаётся без маркера или версии (все пути выше)", async () => {
    // после всех сценариев этого файла в своём root draft либо опубликован, либо в карантине
    const { render } = fakeRender({ fail: { stage: "orphaned", message: "x" } });
    await generateScene("тест", s, await makeDeps(root, skills, { render }));
    await generateScene("тест", s, await makeDeps(root, skills, { skillsRoot: join(tmp, "нет") }));
    for (const d of draftsOf()) expect(existsSync(join(root, "workspace/drafts", d, ".quarantined")), d).toBe(true);
  });
});

describe("sweepAbandonedDrafts", () => {
  it("draft без маркера и без живых процессов → abandoned; с записью процесса — не трогается", async () => {
    const drafts = join(root, "workspace/drafts");
    mkdirSync(join(drafts, "run_A-a1"), { recursive: true });
    mkdirSync(join(drafts, "run_B-a1"), { recursive: true });
    mkdirSync(join(drafts, "run_C-a1"), { recursive: true });
    writeFileSync(join(drafts, "run_C-a1", ".quarantined"), "{\"reason\":\"old\"}");
    const registry = { add: async () => undefined, end: async () => undefined, live: async () => [{ runId: "run_B", attempt: 1, pid: 1, pgid: 1, startedAt: "", cmd: "x" }] };
    const r = await sweepAbandonedDrafts(root, registry);
    expect(r.quarantined).toEqual([join(drafts, "run_A-a1")]);
    expect(r.skipped).toEqual([join(drafts, "run_B-a1")]);
    expect(JSON.parse(readFileSync(join(drafts, "run_A-a1", ".quarantined"), "utf8")).reason).toBe("abandoned");
    expect(readFileSync(join(drafts, "run_C-a1", ".quarantined"), "utf8")).toContain("old");
  });
});

describe("sweepAgentCwds (ревью Task 30, m6)", () => {
  it("рабочие каталоги агентов попыток без живых процессов удаляются (и с маркером карантина); с живым процессом — нет", async () => {
    const base = join(root, "run/agent-cwd");
    mkdirSync(join(base, "job_X-a1-footage_analyst", "frames"), { recursive: true });
    writeFileSync(join(base, "job_X-a1-footage_analyst", "frames", "000001000000.png"), "кадр");
    mkdirSync(join(base, "run_Q-a2-director"), { recursive: true });
    writeFileSync(join(base, "run_Q-a2-director", ".quarantined"), "{\"reason\":\"orphaned\"}");
    mkdirSync(join(base, "run_L-a1-concept"), { recursive: true });
    mkdirSync(join(base, "run_L-a12-concept"), { recursive: true }); // другая попытка той же задачи
    const registry = { add: async () => undefined, end: async () => undefined, live: async () => [{ runId: "run_L", attempt: 1, pid: 1, pgid: 1, startedAt: "", cmd: "x" }] };
    const r = await sweepAgentCwds(root, registry);
    expect(r.skipped).toEqual([join(base, "run_L-a1-concept")]);
    expect(r.removed.sort()).toEqual([join(base, "job_X-a1-footage_analyst"), join(base, "run_L-a12-concept"), join(base, "run_Q-a2-director")]);
    expect(readdirSync(base)).toEqual(["run_L-a1-concept"]);
  });
});

describe("generateScene: кадры литералом (Task 19 F2)", () => {
  it("литерал в interpolate(frame, …) → предупреждение static в warnings, версия ready", async () => {
    const scene = GOOD_SCENE.replace("[0, 30]", "[140, 152]");
    const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": scene } }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r.status).toBe("ready");
    const lit = r.warnings.filter((w) => w.includes("кадры литералом"));
    expect(lit).toHaveLength(1);
    expect(lit[0]).toMatch(/src\/Scene\.tsx:4.*140, 152/);
  });
});
