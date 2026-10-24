// S5 п. 6: два дубля одной попытки задачи зовут одну роль одновременно — каталоги журналов
// `a<attempt>-<role>-<seq>` не должны совпасть (раньше «первый свободный» выбирался гонкой).
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { spawnTracked } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { Ok, bin, fx, makeStore, makeTask, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let store: string;
let workdir: string;
beforeEach(async () => {
  tmp = await makeTmp();
  store = await makeStore(tmp);
  workdir = join(tmp, "draft");
  await mkdir(workdir);
});
afterEach(() => removeTmp(tmp));

it("4 одновременных вызова одной роли в одной попытке — 4 разных каталога журнала", async () => {
  const spawn: typeof spawnTracked = async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
  };
  const rt = new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: join(store, "logs"), spawn });
  const task = makeTask({ input: "x", run: { root: store, runId: "job_race", attempt: 1 }, workdir });
  const rs = await Promise.all([1, 2, 3, 4].map(() => rt.run(task, Ok, new AbortController().signal)));
  const dirs = rs.map((r) => dirname(r.stdoutPath));
  expect(new Set(dirs).size).toBe(4);
  // M5: выданные каталоги уже на диске — память рантайма о них не копится
  expect((rt as unknown as { claimed: Set<string> }).claimed.size).toBe(0);
  const again = await rt.run(task, Ok, new AbortController().signal);
  expect(dirs).not.toContain(dirname(again.stdoutPath));
});
