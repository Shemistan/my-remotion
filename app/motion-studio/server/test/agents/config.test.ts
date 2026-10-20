import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadConfig, readConfigFile } from "../../src/config.js";
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
  expect(c.agents.engineer).toEqual({ model: "opus", timeoutMs: 600_000, maxBudgetUsd: 2 });
  expect(c.kb.root).toMatch(/\/knowledge$/);
});

it("config.json overrides one key and keeps the rest", () => {
  const c = loadConfig({ MS_DATA_DIR: root }, { agents: { engineer: { model: "sonnet" } } });
  expect(c.agents.engineer.model).toBe("sonnet");
  expect(c.agents.engineer.timeoutMs).toBe(600_000);
  expect(c.agents.motion_director.model).toBe("opus");
});

it("config.json overrides scene, claudeBin and kb; env KB_* wins over defaults", () => {
  const c = loadConfig(
    { MS_DATA_DIR: root, KB_SOURCE_ROOT: "/src" },
    { claudeBin: "/opt/claude", scene: { maxCostUsd: 1 }, kb: { root: "/kb" } },
  );
  expect(c.claudeBin).toBe("/opt/claude");
  expect(c.scene).toEqual({ maxCostUsd: 1, maxAutoFixes: 2 });
  expect(c.kb).toEqual({ root: "/kb", sourceRoot: "/src" });
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
