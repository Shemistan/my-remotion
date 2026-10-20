// Логика generateScene на фейковых адаптерах (агенты, рендер, KB, typecheck);
// static check и хранилище (tmp/) — настоящие.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageError, type StorageStatus } from "@ms/core";
import { canSpend } from "../../src/pipeline/budget.js";
import { generateScene, qaFrames } from "../../src/pipeline/generate.js";
import { searchCandidates } from "../../src/pipeline/refs.js";
import { readVersion, sweepAbandonedDrafts } from "../../src/scenes/store.js";
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
    expect(JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")).composition.archetype).toBe("split");
    expect(m.preview?.path).toBe("preview.mp4");
    expect(m.qa_frames.length).toBe(m.qa_frames_sha256.length);
    expect(m.qa_frames.length).toBeGreaterThan(2);
    expect(r.previewPath).toBe(join(r.versionDir!, "preview.mp4"));
    for (const f of ["spec.json", "settings.json", "refs/kb/fake/line-chart/CARD.md", "refs/motion-kit/API.md", "refs/skills/remotion-markup/SKILL.md", "refs/skills/remotion-markup/timing.md"]) {
      expect(existsSync(join(r.versionDir!, f)), f).toBe(true);
    }
    expect(existsSync(join(root, "workspace/projects/playground/scenes", m.scene_id, "brief.json"))).toBe(true);
  });

  it("кадры QA: конец входов, середина акцента, последний; середины битов — с шагом ≥ 10", () => {
    const f = qaFrames(directorOutput().spec, 180);
    expect(f).toEqual([40, 80, 140, 165, 179]);
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

describe("searchCandidates", () => {
  it("отбрасывает doc и записи «Не рисует» / «Своей картинки нет», не больше limit", () => {
    const kb = fakeKb([
      view({ id: "a/doc", kind: "doc", visualizes: "Не рисует: процесс" }),
      view({ id: "a/util", kind: "util", visualizes: "Своей картинки нет: конфиг" }),
      view({ id: "a/one" }),
      view({ id: "a/two" }),
    ]);
    expect(searchCandidates(kb, "рост", 1).map((v) => v.id)).toEqual(["a/one"]);
    expect(searchCandidates(kb, "рост", 12).map((v) => v.id)).toEqual(["a/one", "a/two"]);
  });
});

describe("generateScene: каждый выход после draft — публикация failed или карантин", () => {
  it("отмена во время Engineer (процесс завершён) → опубликована failed/cancelled", async () => {
    const ac = new AbortController();
    const agents = fakeAgents({ engineer: async () => { ac.abort(); return { status: "cancelled", files: { "src/Scene.tsx": GOOD_SCENE } }; } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }), ac.signal);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "cancelled" } });
    expect((await readVersion(r.versionDir!)).failure?.stage).toBe("cancelled");
  });

  it("отмена во время рендера → опубликована failed/cancelled", async () => {
    const ac = new AbortController();
    const { render } = fakeRender({ onCall: async () => { ac.abort(); return { ok: false, stills: [], browserLogs: [], error: { stage: "aborted", message: "отменён" } }; } });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { render }), ac.signal);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "cancelled" } });
    expect((await readVersion(r.versionDir!)).status).toBe("failed");
  });

  it("отмена между исправлениями (до следующего вызова Engineer) → опубликована failed/cancelled", async () => {
    const ac = new AbortController();
    const typecheck = async () => { ac.abort(); return [{ file: "src/Scene.tsx", line: 1, message: "ошибка" }]; };
    const r = await generateScene("тест", s, await makeDeps(root, skills, { typecheck }), ac.signal);
    expect(r).toMatchObject({ status: "failed", engineerCalls: 1, failure: { stage: "cancelled" } });
    expect((await readVersion(r.versionDir!)).failure?.stage).toBe("cancelled");
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
    const registry = { add: async () => undefined, remove: async () => undefined, list: async () => [{ runId: "run_B", attempt: 1, pid: 1, pgid: 1, startedAt: "", cmd: "x" }] };
    const r = await sweepAbandonedDrafts(root, registry);
    expect(r.quarantined).toEqual([join(drafts, "run_A-a1")]);
    expect(r.skipped).toEqual([join(drafts, "run_B-a1")]);
    expect(JSON.parse(readFileSync(join(drafts, "run_A-a1", ".quarantined"), "utf8")).reason).toBe("abandoned");
    expect(readFileSync(join(drafts, "run_C-a1", ".quarantined"), "utf8")).toContain("old");
  });
});

describe("qaFrames на spec реальных прогонов", () => {
  const spec = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/specs/${name}`, import.meta.url)), "utf8"));
  it.each([
    ["test1-slice.json", 130, 76],
    ["test2-slice.json", 150, 42],
    ["test1-r1.json", 123, 60],
    ["test2-r1.json", 152, 72],
  ])("%s: середина акцента %i и конец входов %i — в кадрах; нет кадров внутри входа заголовка; шаг ≥ 10", (name, accentMid, entranceEnd) => {
    const sp = spec(name);
    const f = qaFrames(sp, sp.duration_frames);
    expect(f).toContain(accentMid);
    expect(f).toContain(entranceEnd);
    expect(f).toContain(sp.duration_frames - 1);
    expect(f.length).toBeLessThanOrEqual(6);
    // ни одного кадра внутри входа текстового элемента (заголовок/кикер наполовину вошёл)
    const kinds = new Map(sp.elements.map((e: { id: string; kind: string }) => [e.id, e.kind]));
    const textIn = sp.beats.filter((b: { action: string; element_ids: string[] }) => /entrance/.test(b.action) && b.element_ids.some((id) => kinds.get(id) === "text"));
    for (const b of textIn) expect(f.filter((x) => x > b.start_frame && x < b.end_frame), b.action).toEqual([]);
    for (let i = 1; i < f.length; i++) expect(f[i]! - f[i - 1]!).toBeGreaterThanOrEqual(10);
  });
});
