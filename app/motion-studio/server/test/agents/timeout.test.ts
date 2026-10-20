import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { spawnTracked } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { Ok, bin, fx, makeTask, makeStore, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let store: string;
let logRoot: string;
let workdir: string;
beforeEach(async () => {
  tmp = await makeTmp();
  store = await makeStore(tmp);
  logRoot = join(tmp, "agent-runs");
  workdir = join(tmp, "draft");
  await mkdir(logRoot);
  await mkdir(workdir);
});
afterEach(() => removeTmp(tmp));

const sleepy = bin("sleepy-claude.sh");
const task = (timeoutMs: number, runId = "run1") =>
  makeTask({ input: "Ответь ok=true", run: { root: store, runId, attempt: 1 }, workdir, limits: { timeoutMs, maxBudgetUsd: 1 } });

it("timeout: status timeout, the process group is gone and the registry is empty", async () => {
  const ctrl = new AbortController();
  const t0 = Date.now();
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot }).run(task(300), Ok, ctrl.signal);
  expect(r.status).toBe("timeout");
  expect(r.error?.kind).toBe("timeout");
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(await readdir(join(store, "run", "processes"))).toEqual([]);
});

it("external abort: status cancelled", async () => {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 200);
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot }).run(task(60_000), Ok, ctrl.signal);
  expect(r.status).toBe("cancelled");
});

it("already aborted signal: cancelled without spawning", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot }).run(task(60_000), Ok, ctrl.signal);
  expect(r.status).toBe("cancelled");
  expect(existsSync(join(store, "run", "processes"))).toBe(false);
});

it("happy path: prompt via stdin, allowlisted env, logs written", async () => {
  process.env.MS_TEST_SECRET = "s3cr3t";
  try {
    const t = makeTask({
      role: "engineer",
      model: "opus",
      tools: ["Read", "Write", "Edit", "Glob", "Grep"],
      input: { brief: "Сделай сцену" },
      run: { root: store, runId: "run2", attempt: 1 },
      workdir,
    });
    const r = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot }).run(t, Ok, new AbortController().signal);
    expect(r).toMatchObject({ status: "completed", output: { ok: true }, sessionId: expect.any(String) });
    expect(r.stdoutPath).toBe(join(logRoot, "run2", "stdout.json"));
    expect(r.stderrPath).toBe(join(logRoot, "run2", "stderr.log"));
    expect(readFileSync(r.stdoutPath, "utf8")).toBe(fx("success.json"));
    expect(Date.parse(r.finishedAt)).toBeGreaterThanOrEqual(Date.parse(r.startedAt));

    const prompt = readFileSync(join(logRoot, "run2", "prompt.md"), "utf8");
    expect(prompt).toContain("Сделай сцену");
    expect(readFileSync(join(workdir, "stdin.txt"), "utf8")).toBe(prompt);
    const args = readFileSync(join(workdir, "args.txt"), "utf8");
    expect(args).not.toContain("Сделай сцену");
    expect(args).toContain("acceptEdits");
    const env = readFileSync(join(workdir, "env.txt"), "utf8");
    expect(env).not.toContain("s3cr3t");
    expect(env).toMatch(/^HOME=/m);
  } finally {
    delete process.env.MS_TEST_SECRET;
  }
});

it("system prompt is read from promptsDir/<role>.md", async () => {
  const promptsDir = join(tmp, "prompts");
  await mkdir(promptsDir);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(promptsDir, "motion-director.md"), "Ты — Motion Director.");
  const r = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot, promptsDir }).run(
    task(60_000, "run3"),
    Ok,
    new AbortController().signal,
  );
  expect(r.status).toBe("completed");
  const args = readFileSync(join(workdir, "args.txt"), "utf8").split("\n");
  expect(args[args.indexOf("--append-system-prompt") + 1]).toBe("Ты — Motion Director.");
});

it("orphaned process group: a distinct failure even with a valid answer", async () => {
  const spawn: typeof spawnTracked = async () => ({ code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: true });
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000), Ok, new AbortController().signal);
  expect(r.status).toBe("failed");
  expect(r.error?.kind).toBe("orphaned");
  expect(r.output).toBeUndefined();
});

it("non-zero exit with a non-error answer is a failure", async () => {
  const spawn: typeof spawnTracked = async () => ({ code: 1, signal: null, stdout: fx("success.json"), stderr: "boom", orphaned: false });
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000), Ok, new AbortController().signal);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli" } });
});

it("missing binary: failed cli without spawning", async () => {
  const r = await new ClaudeCodeRuntime({ bin: join(tmp, "no-such-claude"), logRoot }).run(task(60_000), Ok, new AbortController().signal);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli" } });
  expect(r.error!.message).toMatch(/не найден/);
  expect(existsSync(join(store, "run", "processes"))).toBe(false);
});

it("capabilities: missing binary is unavailable", async () => {
  const c = await new ClaudeCodeRuntime({ bin: join(tmp, "no-such-claude"), logRoot }).capabilities();
  expect(c.available).toBe(false);
  expect(c.reason).toBeTruthy();
});
