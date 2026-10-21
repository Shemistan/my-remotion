// Финальная волна исправлений среза: граница draft для Engineer (I1a), отказы spawn в
// рантайме агентов (I2), словарь ошибок хранилища (I3), фильтр выбора Director (I6).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StorageError, StoragePathError, type StorageStatus, type spawnTracked } from "@ms/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { generateScene, isStorageError } from "../../src/pipeline/generate.js";
import { readVersion } from "../../src/scenes/store.js";
import {
  GOOD_SCENE, OFFLINE, directorOutput, fakeAgents, fakeKb, makeDeps, makeSkills, makeStore, makeTmp, okStatus, removeTmp, settings, view,
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

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

describe("I1a: Engineer правит только src/** и props.json", () => {
  it("node_modules в корне draft и правка spec.json → откат, причина Engineer, следующий вызов → ready", async () => {
    let specSeen = "";
    const agents = fakeAgents({
      engineer: async (task, n) => {
        if (n === 1) {
          specSeen = readFileSync(join(task.workdir, "spec.json"), "utf8");
          await put(join(task.workdir, "node_modules", "@remotion", "fonts", "index.js"), "module.exports = 'shadow';\n");
          await writeFile(join(task.workdir, "spec.json"), "{\"hacked\":true}\n");
          await put(join(task.workdir, "refs", "kb", "fake", "line-chart", "CARD.md"), "подмена\n");
        }
        return { files: { "src/Scene.tsx": GOOD_SCENE } };
      },
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "ready", engineerCalls: 2 });
    expect(agents.engineerCalls[1]!.input).toContain("[draft-boundary]");
    expect(agents.engineerCalls[1]!.input).toContain("node_modules");
    expect(existsSync(join(r.versionDir!, "node_modules"))).toBe(false);
    expect(readFileSync(join(r.versionDir!, "spec.json"), "utf8")).toBe(specSeen);
    expect(readFileSync(join(r.versionDir!, "refs/kb/fake/line-chart/CARD.md"), "utf8")).toBe("# fake/line-chart\n");
    expect(r.warnings.some((w) => /вне src\/ и props\.json/.test(w))).toBe(true);
    const log = JSON.parse(readFileSync(join(r.versionDir!, "pipeline-log.json"), "utf8")) as { history: { stage: string; message: string }[] };
    expect(log.history.some((h) => h.stage === "static" && h.message.includes("[draft-boundary]"))).toBe(true);
    // в manifest нет ничего вне того, что пайплайн положил сам
    expect((await readVersion(r.versionDir!)).files.every((f) => !f.path.includes("node_modules"))).toBe(true);
  });

  it("Engineer каждый раз пишет вне зоны → failed/static, опубликованная версия чистая", async () => {
    const agents = fakeAgents({
      engineer: async (task) => {
        await writeFile(join(task.workdir, "package.json"), JSON.stringify({ browser: { remotion: "./evil.js" } }));
        await writeFile(join(task.workdir, "selection.json"), "{}");
        return { files: { "src/Scene.tsx": GOOD_SCENE } };
      },
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", engineerCalls: 3, failure: { stage: "static", message: expect.stringContaining("package.json") } });
    expect(existsSync(join(r.versionDir!, "package.json"))).toBe(false);
    const sel = JSON.parse(readFileSync(join(r.versionDir!, "selection.json"), "utf8")) as { items: { kb_id: string }[] };
    expect(sel.items.map((i) => i.kb_id)).toEqual(["fake/line-chart"]);
    expect((await readVersion(r.versionDir!)).failure?.stage).toBe("static");
  });

  it("src/node_modules/x/package.json (в зоне Engineer) ловит static check: forbidden-file", async () => {
    const agents = fakeAgents({
      engineer: async () => ({
        files: { "src/Scene.tsx": GOOD_SCENE, "src/node_modules/x/package.json": JSON.stringify({ main: "../../../evil.js" }) },
      }),
    });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "static", message: expect.stringContaining("src/node_modules") } });
    expect(agents.engineerCalls[1]!.input).toContain("forbidden-file");
  });
});

describe("I6: выбор Director — только кандидаты и permissive", () => {
  it("id вне кандидатов и restricted-кандидат отброшены с предупреждением до refs, manifest и промпта Engineer", async () => {
    const kb = fakeKb([view(), view({ id: "fake/gpl-chart", license: "GPL-3.0", license_class: "restricted" }), view({ id: "fake/hidden", kind: "doc", visualizes: "Не рисует: справка" })]);
    const out = directorOutput();
    out.selection.items.push(
      { kb_id: "fake/gpl-chart", strategy: "reuse", why: "", files_to_copy: [] },
      { kb_id: "fake/hidden", strategy: "reuse", why: "", files_to_copy: [] },
      { kb_id: "made/up", strategy: "build", why: "", files_to_copy: [] },
    );
    const agents = fakeAgents({ director: async () => ({ output: out }) });
    const r = await generateScene("тест", s, await makeDeps(root, skills, { kb, agents }));
    expect(r.status).toBe("ready");
    const m = await readVersion(r.versionDir!);
    expect(m.knowledge_refs.map((k) => k.kb_id)).toEqual(["fake/line-chart"]);
    const kr = JSON.parse(readFileSync(join(r.versionDir!, "knowledge-refs.json"), "utf8")) as { kb_id: string }[];
    expect(kr.map((k) => k.kb_id)).toEqual(["fake/line-chart"]);
    const sel = JSON.parse(readFileSync(join(r.versionDir!, "selection.json"), "utf8")) as { items: { kb_id: string }[]; dropped: { kb_id: string; reason: string }[] };
    expect(sel.items.map((i) => i.kb_id)).toEqual(["fake/line-chart"]);
    expect(sel.dropped).toEqual([
      { kb_id: "fake/gpl-chart", reason: expect.stringContaining("restricted") },
      { kb_id: "fake/hidden", reason: expect.stringContaining("кандидат") },
      { kb_id: "made/up", reason: expect.stringContaining("кандидат") },
    ]);
    const input = agents.engineerCalls[0]!.input;
    for (const id of ["fake/gpl-chart", "fake/hidden", "made/up"]) expect(input).not.toContain(id);
    expect(existsSync(join(r.versionDir!, "refs/kb/fake/gpl-chart"))).toBe(false);
    expect(r.warnings.filter((w) => w.includes("отброшено"))).toHaveLength(3);
  });
});

describe("I3: isStorageError", () => {
  it("StorageError и отказ guard публикации — хранилище; путь вне хранилища и похожие сообщения — нет", () => {
    expect(isStorageError(new StorageError("not_found", "x"))).toBe(true);
    expect(isStorageError(new Error("storage_unavailable: not_found: x"))).toBe(true);
    expect(isStorageError(new StoragePathError("../x"))).toBe(false);
    expect(isStorageError(new Error("storage: путь выходит за пределы хранилища: \"../x\""))).toBe(false);
    expect(isStorageError(new Error("boom"))).toBe(false);
  });
});

// --- I2: настоящий ClaudeCodeRuntime с подменённым spawnTracked ---

const FAKE_BIN = fileURLToPath(new URL("../fixtures/bin/fake-claude.sh", import.meta.url));
const resultJson = (output: unknown) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.1, session_id: "s", permission_denials: [], structured_output: output });

/** Хранилище «в порядке» первые `okCalls` проверок, затем отключено. */
function storageGoneAfter(okCalls: number): () => Promise<StorageStatus> {
  let n = 0;
  return async () => (++n <= okCalls ? okStatus(root) : OFFLINE);
}

describe("I2: отказ spawn в рантайме агентов не превращается в failed/cli", () => {
  const runtime = (spawn: typeof spawnTracked) => new ClaudeCodeRuntime({ bin: FAKE_BIN, logRoot: join(root, "logs", "agent-runs"), spawn });

  it("Director: реестр не записан (StorageError) до тика сторожа → storage, каталог Director в карантине", async () => {
    const spawn: typeof spawnTracked = async () => {
      throw new StorageError("not_found", "корень хранилища недоступен");
    };
    const deps = await makeDeps(root, skills, { agents: runtime(spawn), watchIntervalMs: 3_600_000 });
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage", message: expect.stringContaining("Motion Director") } });
    expect(r.versionDir).toBeUndefined();
    expect(existsSync(join(root, "run/agent-cwd", `${r.runId}-a1-director`, ".quarantined"))).toBe(true);
  });

  it("Director: spawn упал не по хранилищу, но guard подтверждает отключение → storage", async () => {
    const spawn: typeof spawnTracked = async () => {
      throw new Error("spawn EIO");
    };
    // старт, перед Director; дальше — диск пропал (сторож ещё не тикал)
    const deps = await makeDeps(root, skills, { agents: runtime(spawn), storage: storageGoneAfter(2), watchIntervalMs: 3_600_000 });
    const r = await generateScene("тест", s, deps);
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
  });

  it("Director: spawn упал при живом хранилище → director (не cli-результат), каталог в карантине", async () => {
    const spawn: typeof spawnTracked = async () => {
      throw new Error("spawn EAGAIN");
    };
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents: runtime(spawn), watchIntervalMs: 3_600_000 }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "director", message: expect.stringContaining("EAGAIN") } });
    expect(existsSync(join(root, "run/agent-cwd", `${r.runId}-a1-director`, ".quarantined"))).toBe(true);
  });

  it("Engineer: spawn упал при живом хранилище → процесс неизвестен: draft в карантине, публикации нет", async () => {
    const spawn: typeof spawnTracked = async (_root, _ref, _cmd, args) => {
      if (args.includes("acceptEdits")) throw new Error("spawn EAGAIN");
      return { code: 0, signal: null, stdout: resultJson(directorOutput()), stderr: "", orphaned: false };
    };
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents: runtime(spawn), watchIntervalMs: 3_600_000 }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "engineer", message: expect.stringContaining("EAGAIN") } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
    // TMPDIR вызова с неизвестным процессом не удалён, а помечен
    expect(readdirSync(join(root, "run", "tmp")).some((n) => n.includes("-engineer-") && n.endsWith(".quarantined"))).toBe(true);
  });

  it("Engineer: реестр не записан (StorageError) → storage, draft в карантине", async () => {
    const spawn: typeof spawnTracked = async (_root, _ref, _cmd, args) => {
      if (args.includes("acceptEdits")) throw new StorageError("not_writable", "run/processes");
      return { code: 0, signal: null, stdout: resultJson(directorOutput()), stderr: "", orphaned: false };
    };
    const r = await generateScene("тест", s, await makeDeps(root, skills, { agents: runtime(spawn), watchIntervalMs: 3_600_000 }));
    expect(r).toMatchObject({ status: "failed", failure: { stage: "storage" } });
    expect(existsSync(join(r.versionDir!, ".quarantined"))).toBe(true);
    expect(versionsOf()).toEqual([]);
  });
});
