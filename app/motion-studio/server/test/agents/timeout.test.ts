import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { StorageError, type spawnTracked } from "@ms/core";
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
  // logRoot ещё не существует: каталоги журнала создаёт safeMkdir внутри хранилища
  logRoot = join(store, "logs", "agent-runs");
  workdir = join(tmp, "draft");
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
  expect(await readdir(join(store, "run", "processes"))).toEqual([]);
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
    expect(r.stdoutPath).toBe(join(logRoot, "run2", "a1-engineer-1", "stdout.json"));
    expect(r.stderrPath).toBe(join(logRoot, "run2", "a1-engineer-1", "stderr.log"));
    expect(readFileSync(r.stdoutPath, "utf8")).toBe(fx("success.json"));
    expect(Date.parse(r.finishedAt)).toBeGreaterThanOrEqual(Date.parse(r.startedAt));

    const prompt = readFileSync(join(logRoot, "run2", "a1-engineer-1", "prompt.md"), "utf8");
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

it("orphaned call keeps its run tmp as *.quarantined", async () => {
  const spawn: typeof spawnTracked = async () => ({ code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: true });
  await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000, "orph"), Ok, new AbortController().signal);
  const left = await readdir(join(store, "run", "tmp"));
  expect(left).toHaveLength(1);
  expect(left[0]).toMatch(/^orph-a1-motion_director-.+\.quarantined$/);
});

it("TMPDIR of the child is a per-call dir in run/tmp of the store, removed after the call", async () => {
  let seen = "";
  const spawn: typeof spawnTracked = async (_root, _ref, _cmd, _args, opts) => {
    seen = opts.env.TMPDIR ?? "";
    expect(existsSync(seen)).toBe(true);
    return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
  };
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000, "tmpd"), Ok, new AbortController().signal);
  expect(r.status).toBe("completed");
  expect(seen.startsWith(join(store, "run", "tmp", "tmpd-a1-motion_director-"))).toBe(true);
  expect(existsSync(seen)).toBe(false);
  expect(await readdir(join(store, "run", "tmp"))).toEqual([]);
});

it("spawnTracked throws (registry not written / child error): run() rethrows, no failed/cli; run tmp quarantined", async () => {
  const boom = new StorageError("not_found", "корень хранилища недоступен");
  const spawn: typeof spawnTracked = async () => {
    throw boom;
  };
  await expect(new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000, "thr"), Ok, new AbortController().signal)).rejects.toBe(boom);
  const plain = new Error("spawn EAGAIN");
  const spawn2: typeof spawnTracked = async () => {
    throw plain;
  };
  await expect(new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn: spawn2 }).run(task(60_000, "thr2"), Ok, new AbortController().signal)).rejects.toBe(plain);
  const left = await readdir(join(store, "run", "tmp"));
  expect(left.filter((n) => n.endsWith(".quarantined"))).toHaveLength(2);
});

it("real spawnTracked: registry write fails (run/processes is a file) → StorageError is thrown", async () => {
  await rm(join(store, "run", "processes"), { recursive: true, force: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(store, "run", "processes"), "not a dir");
  const err = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot }).run(task(60_000, "reg"), Ok, new AbortController().signal).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(StorageError);
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
  expect(await readdir(join(store, "run", "processes"))).toEqual([]);
});

it("capabilities: missing binary is unavailable", async () => {
  const c = await new ClaudeCodeRuntime({ bin: join(tmp, "no-such-claude"), logRoot }).capabilities();
  expect(c.available).toBe(false);
  expect(c.reason).toBeTruthy();
});

it("R12: same runId/attempt/role twice gives two log dirs (seq 1 and 2)", async () => {
  const rt = new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot });
  const a = await rt.run(task(60_000, "same"), Ok, new AbortController().signal);
  const b = await rt.run(task(60_000, "same"), Ok, new AbortController().signal);
  expect(a.stdoutPath).toBe(join(logRoot, "same", "a1-motion_director-1", "stdout.json"));
  expect(b.stdoutPath).toBe(join(logRoot, "same", "a1-motion_director-2", "stdout.json"));
  expect((await readdir(join(logRoot, "same"))).sort()).toEqual(["a1-motion_director-1", "a1-motion_director-2"]);
  expect(existsSync(join(logRoot, "same", "a1-motion_director-2", "prompt.md"))).toBe(true);
});

it("logRoot outside the storage root: failed, nothing written", async () => {
  const outside = join(tmp, "elsewhere");
  const r = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: outside }).run(task(60_000), Ok, new AbortController().signal);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli", message: expect.stringMatching(/logRoot вне хранилища/) } });
  expect(existsSync(outside)).toBe(false);
  // сам корень тоже не годится
  const r2 = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: store }).run(task(60_000), Ok, new AbortController().signal);
  expect(r2.status).toBe("failed");
});

it("buildClaudeArgs error: failed result, no prompt.md, no spawn", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad = { ...task(60_000, "bad"), tools: ["Bash"] as any };
  const r = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot }).run(bad, Ok, new AbortController().signal);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli", message: expect.stringMatching(/Bash/) } });
  expect(existsSync(join(logRoot, "bad", "a1-motion_director-1", "prompt.md"))).toBe(false);
  expect(existsSync(join(workdir, "args.txt"))).toBe(false);
  const badModel = { ...task(60_000, "bad2"), model: "opus --dangerously-skip-permissions" };
  const r2 = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot }).run(badModel, Ok, new AbortController().signal);
  expect(r2).toMatchObject({ status: "failed", error: { kind: "cli" } });
});

it("is_error JSON without session_id keeps usage and permission denials", async () => {
  const j = JSON.parse(fx("is-error.json"));
  delete j.session_id;
  j.permission_denials = [{ tool_name: "Read", tool_input: { file_path: "/x" } }];
  const spawn: typeof spawnTracked = async () => ({ code: 1, signal: null, stdout: JSON.stringify(j), stderr: "", orphaned: false });
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(task(60_000), Ok, new AbortController().signal);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli", message: expect.stringMatching(/529/) } });
  expect(r.usage.costUsd).toBeGreaterThan(0);
  expect(r.permissionDenials).toHaveLength(1);
});

it("relative bin is resolved to an absolute path once", async () => {
  const rel = relative(process.cwd(), bin("fake-claude.sh"));
  let seen = "";
  const spawn: typeof spawnTracked = async (_root, _ref, cmd) => {
    seen = cmd;
    return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
  };
  const r = await new ClaudeCodeRuntime({ bin: rel, logRoot, spawn }).run(task(60_000), Ok, new AbortController().signal);
  expect(r.status).toBe("completed");
  expect(isAbsolute(seen)).toBe(true);
  expect(seen).toBe(bin("fake-claude.sh"));
});

it("object input is embedded in a 4-backtick fence", async () => {
  const t = { ...task(60_000, "obj"), input: { code: "```ts\nx\n```" } };
  await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot }).run(t, Ok, new AbortController().signal);
  const prompt = readFileSync(join(logRoot, "obj", "a1-motion_director-1", "prompt.md"), "utf8");
  expect(prompt.startsWith("````json\n")).toBe(true);
  expect(prompt.trimEnd().endsWith("````")).toBe(true);
  expect(JSON.parse(prompt.slice("````json\n".length, prompt.lastIndexOf("\n````")))).toEqual(t.input);
});

it("task.run.registry is handed to spawnTracked (Task 13: no file registry for the server)", async () => {
  const registry = { add: async () => undefined, end: async () => undefined, live: async () => [] };
  let seen: unknown;
  const spawn: typeof spawnTracked = async (_root, _ref, _cmd, _args, opts) => {
    seen = opts.registry;
    return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
  };
  const t = makeTask({ input: "x", run: { root: store, runId: "regs", attempt: 2, registry }, workdir, limits: { timeoutMs: 60_000, maxBudgetUsd: 1 } });
  const r = await new ClaudeCodeRuntime({ bin: sleepy, logRoot, spawn }).run(t, Ok, new AbortController().signal);
  expect(r.status).toBe("completed");
  expect(seen).toBe(registry);
});
