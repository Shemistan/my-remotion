import { expect, it } from "vitest";
import { buildClaudeArgs } from "../../src/agents/claude-code.js";
import { makeTask } from "./helpers.js";

const schema = { type: "object", properties: { ok: { type: "boolean" } } };
const run = { root: "/data", runId: "run1", attempt: 1 };
const directorTask = makeTask({ role: "motion_director", model: "opus", tools: [], input: {}, run, workdir: "/tmp/x" });
const engineerTask = makeTask({
  role: "engineer",
  model: "opus",
  tools: ["Read", "Write", "Edit", "Glob", "Grep"],
  input: {},
  run,
  workdir: "/data/drafts/run1-a1",
});
const after = (a: string[], flag: string) => a[a.indexOf(flag) + 1];

it("director: restricted, no tools, no permission mode, json output", () => {
  const a = buildClaudeArgs(directorTask, schema, "sys");
  expect(a).toEqual(
    expect.arrayContaining(["-p", "--restricted", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"]),
  );
  expect(a).toContain("--tools");
  expect(after(a, "--tools")).toBe("");
  expect(a).not.toContain("--permission-mode");
  expect(a.join(" ")).not.toMatch(/bypassPermissions|dangerously/);
  expect(after(a, "--model")).toBe("opus");
  expect(JSON.parse(after(a, "--json-schema")!)).toEqual(schema);
  expect(after(a, "--max-budget-usd")).toBe("2");
  expect(after(a, "--append-system-prompt")).toBe("sys");
});

it("engineer: file tools and acceptEdits", () => {
  const e = buildClaudeArgs(engineerTask, schema, "sys");
  expect(after(e, "--tools")).toBe("Read,Write,Edit,Glob,Grep");
  expect(after(e, "--permission-mode")).toBe("acceptEdits");
  expect(after(e, "--model")).toBe("opus");
  expect(e.join(" ")).not.toMatch(/bypassPermissions|dangerously/);
});

it("read-only tools do not get acceptEdits", () => {
  const r = buildClaudeArgs({ ...directorTask, tools: ["Read", "Glob"] }, schema, "sys");
  expect(after(r, "--tools")).toBe("Read,Glob");
  expect(r).not.toContain("--permission-mode");
});

it("the prompt is not an argument: no positional args", () => {
  const a = buildClaudeArgs(directorTask, schema, "sys");
  // каждый элемент — либо флаг, либо значение сразу за флагом
  const flagsWithoutValue = new Set(["-p", "--restricted", "--strict-mcp-config", "--no-session-persistence"]);
  for (let i = 0; i < a.length; i++) {
    expect(a[i]!.startsWith("-"), `позиционный аргумент: ${a[i]}`).toBe(true);
    if (!flagsWithoutValue.has(a[i]!)) i++;
  }
});

it("empty system prompt: no --append-system-prompt", () => {
  expect(buildClaudeArgs(directorTask, schema, "")).not.toContain("--append-system-prompt");
});

it("rejects tools outside the allowlist", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad = { ...engineerTask, tools: ["Read", "Bash"] as any };
  expect(() => buildClaudeArgs(bad, schema, "sys")).toThrow(/Bash/);
});

it("rejects a non-positive budget", () => {
  expect(() => buildClaudeArgs({ ...directorTask, limits: { timeoutMs: 1, maxBudgetUsd: 0 } }, schema, "")).toThrow(/maxBudgetUsd/);
});
