// Task 48: stderr вызова claude — в журнал (`stderr.log`) и в сообщение ошибки без токенов и ключей.
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { spawnTracked } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { Ok, bin, makeStore, makeTask, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let store: string;
let workdir: string;
beforeEach(async () => {
  tmp = await makeTmp();
  store = await makeStore(tmp);
  workdir = join(tmp, "draft");
  await mkdir(workdir);
});
afterEach(async () => {
  await removeTmp(tmp);
});

it("stderr.log и текст ошибки — через redact", async () => {
  const spawn: typeof spawnTracked = async () => ({
    code: 1, signal: null, stdout: "", stderr: "auth failed: Bearer abc.def ANTHROPIC_API_KEY=sk-ant-api03-XYZ", orphaned: false,
  });
  const r = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: join(store, "logs"), spawn })
    .run(makeTask({ input: "x", run: { root: store, runId: "r1", attempt: 1 }, workdir }), Ok, new AbortController().signal);
  expect(r.status).toBe("failed");
  expect(r.error?.message).toContain("Bearer [скрыто]");
  expect(r.error?.message).not.toMatch(/sk-ant-|abc\.def/);
  const log = await readFile(r.stderrPath, "utf8");
  expect(log).toBe("auth failed: Bearer [скрыто] ANTHROPIC_API_KEY=[скрыто]");
});
