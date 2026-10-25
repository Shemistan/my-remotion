import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { configFileIssues, loadConfig, readConfigFile } from "../../src/config.js";
import { makeTmp, removeTmp } from "./helpers.js";

const root = "/Volumes/Test/MotionStudio";

it("defaults: opus for director and engineer, sonnet for the rest", () => {
  const c = loadConfig({ MS_DATA_DIR: root });
  expect(c.agents.engineer.model).toBe("opus");
  expect(c.agents.motion_director.model).toBe("opus");
  expect(c.agents.visual_qa.model).toBe("sonnet");
  expect(c.agents.concept.model).toBe("sonnet");
  expect(c.agents.edit_planner.model).toBe("sonnet");
});

it("defaults: limits from Global Constraints", () => {
  const c = loadConfig({ MS_DATA_DIR: root });
  expect(c).toMatchObject({
    dataDir: root,
    claudeBin: "claude",
    agentRuntime: "claude-code",
    scene: { maxCostUsd: 5, maxAutoFixes: 2 },
  });
  expect(c.agents.engineer).toEqual({ model: "opus", timeoutMs: 1_200_000, maxBudgetUsd: 2 });
  expect(c.kb.root).toMatch(/\/knowledge$/);
});

it("config.json overrides one key and keeps the rest", () => {
  const c = loadConfig({ MS_DATA_DIR: root }, { agents: { engineer: { model: "sonnet" } } });
  expect(c.agents.engineer.model).toBe("sonnet");
  expect(c.agents.engineer.timeoutMs).toBe(1_200_000);
  expect(c.agents.motion_director.model).toBe("opus");
});

it("config.json overrides scene, claudeBin and kb; env KB_* wins over defaults", () => {
  const c = loadConfig(
    { MS_DATA_DIR: root, KB_SOURCE_ROOT: "/src" },
    { claudeBin: "/opt/claude", scene: { maxCostUsd: 1 }, kb: { root: "/kb" } },
  );
  expect(c.claudeBin).toBe("/opt/claude");
  expect(c.scene).toMatchObject({ maxCostUsd: 1, maxAutoFixes: 2 });
  expect(c.kb).toEqual({ root: "/kb", sourceRoot: "/src" });
});

it("S5: второй дубль — по умолчанию revise при overall < 6.5; config.json и env MS_SECOND_TAKE его меняют", () => {
  expect(loadConfig({ MS_DATA_DIR: root }).scene.secondTake).toEqual({ mode: "revise", threshold: 6.5, fixes: 1 });
  expect(loadConfig({ MS_DATA_DIR: root }, { scene: { secondTake: { mode: "fresh" } } }).scene.secondTake).toEqual({ mode: "fresh", threshold: 6.5, fixes: 1 });
  expect(loadConfig({ MS_DATA_DIR: root, MS_SECOND_TAKE: "off" }, { scene: { secondTake: { mode: "fresh" } } }).scene.secondTake.mode).toBe("off");
  expect(() => loadConfig({ MS_DATA_DIR: root, MS_SECOND_TAKE: "twice" })).toThrow(/MS_SECOND_TAKE/);
  // порог для A/B: Visual QA ставит выше судьи, при 6.5 дубль почти не включается
  expect(loadConfig({ MS_DATA_DIR: root, MS_SECOND_TAKE_THRESHOLD: "7.5" }).scene.secondTake).toEqual({ mode: "revise", threshold: 7.5, fixes: 1 });
  expect(() => loadConfig({ MS_DATA_DIR: root, MS_SECOND_TAKE_THRESHOLD: "11" })).toThrow(/MS_SECOND_TAKE_THRESHOLD/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { scene: { secondTake: { mode: "x" } } })).toThrow(/config/);
});

it("MS_DATA_DIR is required", () => {
  expect(() => loadConfig({})).toThrow(/MS_DATA_DIR/);
  expect(() => loadConfig({ MS_DATA_DIR: "  " })).toThrow(/MS_DATA_DIR/);
});

it("rejects unknown keys, unknown roles and bad values in config.json", () => {
  expect(() => loadConfig({ MS_DATA_DIR: root }, { agnets: {} })).toThrow(/config\.json/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { agents: { hacker: { model: "opus" } } })).toThrow(/config\.json/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { agents: { engineer: { maxBudgetUsd: -1 } } })).toThrow(/config\.json/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { agentRuntime: "api" })).toThrow(/config\.json/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { dataDir: "/elsewhere" })).toThrow(/config\.json/);
});

it("S17b: порт сервера — 8790 по умолчанию, server.port из config.json в 1024–65535; хост не настраивается", () => {
  expect(loadConfig({ MS_DATA_DIR: root }).server).toEqual({ port: 8790 });
  expect(loadConfig({ MS_DATA_DIR: root }, { server: { port: 8791 } }).server).toEqual({ port: 8791 });
  expect(loadConfig({ MS_DATA_DIR: root }, { server: {} }).server).toEqual({ port: 8790 });
  for (const port of [0, 80, 1023, 65536, 8790.5, "8790"]) {
    expect(() => loadConfig({ MS_DATA_DIR: root }, { server: { port } }), String(port)).toThrow(/config\.json.*server\.port/);
  }
  expect(() => loadConfig({ MS_DATA_DIR: root }, { server: { host: "0.0.0.0" } })).toThrow(/config\.json/);
  expect(configFileIssues({ server: { port: 70000 } })).toEqual([{ path: "server.port", message: expect.any(String) }]);
});

it("readConfigFile: missing file is undefined, bad JSON throws, good JSON loads", async () => {
  const dir = await makeTmp();
  try {
    expect(await readConfigFile(dir)).toBeUndefined();
    await writeFile(join(dir, "config.json"), "{ nope");
    await expect(readConfigFile(dir)).rejects.toThrow(/не JSON/);
    await writeFile(join(dir, "config.json"), JSON.stringify({ agents: { concept: { model: "haiku" } } }));
    expect(loadConfig({ MS_DATA_DIR: dir }, await readConfigFile(dir)).agents.concept.model).toBe("haiku");
  } finally {
    await removeTmp(dir);
  }
});

it("model names are validated; maxBudgetUsd has an upper bound", () => {
  const load = (engineer: object) => loadConfig({ MS_DATA_DIR: root }, { agents: { engineer } });
  expect(load({ model: "claude-haiku-5-5" }).agents.engineer.model).toBe("claude-haiku-5-5");
  expect(load({ model: "opus[1m]" }).agents.engineer.model).toBe("opus[1m]");
  expect(() => load({ model: "opus --dangerously-skip-permissions" })).toThrow(/config\.json/);
  expect(() => load({ model: "-opus" })).toThrow(/config\.json/);
  expect(load({ maxBudgetUsd: 50 }).agents.engineer.maxBudgetUsd).toBe(50);
  expect(() => load({ maxBudgetUsd: 51 })).toThrow(/config\.json/);
});

it("Task 20: limits (агенты 10, рендеры 3 — по коду семафоров S5) и defaults: Settings; config.json их меняет", () => {
  const c = loadConfig({ MS_DATA_DIR: root });
  expect(c.limits).toEqual({ maxRunning: 5, agentCalls: 10, renders: 3, exportTimeoutMs: 1_800_000 });
  expect(c.defaults).toEqual(defaultSettings());
  const d = { ...defaultSettings(), duration_frames: 300 };
  const f = loadConfig({ MS_DATA_DIR: root }, { limits: { maxRunning: 1, renders: 1 }, defaults: d });
  expect(f.limits).toEqual({ maxRunning: 1, agentCalls: 10, renders: 1, exportTimeoutMs: 1_800_000 });
  expect(f.defaults).toEqual(d);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { limits: { nope: 1 } })).toThrow(/limits/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { limits: { agentCalls: 0 } })).toThrow(/limits\.agentCalls/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { limits: { renders: 1.5 } })).toThrow(/limits\.renders/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { defaults: { ...defaultSettings(), width: 100 } })).toThrow(/defaults/);
});

it("Task 20: configFileIssues — пути полей для ответа API 400", () => {
  expect(configFileIssues({ limits: { maxRunning: 1 } })).toEqual([]);
  expect(configFileIssues({ agents: { engineer: { model: "bad model!" } } }).map((i) => i.path)).toEqual(["agents.engineer.model"]);
  expect(configFileIssues({ limits: { nope: 1 } })[0]!.path).toBe("limits");
});
