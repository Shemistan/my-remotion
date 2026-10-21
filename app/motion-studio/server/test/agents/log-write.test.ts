// Сбой записи журнала вызова (prompt.md, stdout.json) — StorageError(not_writable), а не
// сырая ошибка fs: журнал лежит в хранилище, пайплайн трактует это как хранилище.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { StorageError, type spawnTracked } from "@ms/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { Ok, bin, fx, makeStore, makeTask, makeTmp, removeTmp } from "./helpers.js";

const failOn = vi.hoisted(() => ({ suffix: "" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    writeFile: (async (path: unknown, ...rest: unknown[]) => {
      if (failOn.suffix && String(path).endsWith(failOn.suffix)) {
        throw Object.assign(new Error(`EIO: i/o error, open '${String(path)}'`), { code: "EIO" });
      }
      return (real.writeFile as (...a: unknown[]) => Promise<void>)(path, ...rest);
    }) as typeof real.writeFile,
  };
});

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
  failOn.suffix = "";
  await removeTmp(tmp);
});

const task = (runId: string) => makeTask({ input: "x", run: { root: store, runId, attempt: 1 }, workdir });

it("prompt.md not writable → StorageError not_writable, nothing spawned", async () => {
  failOn.suffix = "prompt.md";
  let spawned = false;
  const spawn: typeof spawnTracked = async () => {
    spawned = true;
    return { code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false };
  };
  const err = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: join(store, "logs"), spawn })
    .run(task("p1"), Ok, new AbortController().signal)
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(StorageError);
  expect((err as StorageError).reason).toBe("not_writable");
  expect((err as Error).message).toMatch(/prompt\.md/);
  expect(spawned).toBe(false);
});

it("stdout.json not writable after the call → StorageError not_writable", async () => {
  failOn.suffix = "stdout.json";
  const spawn: typeof spawnTracked = async () => ({ code: 0, signal: null, stdout: fx("success.json"), stderr: "", orphaned: false });
  const err = await new ClaudeCodeRuntime({ bin: bin("fake-claude.sh"), logRoot: join(store, "logs"), spawn })
    .run(task("p2"), Ok, new AbortController().signal)
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(StorageError);
  expect((err as StorageError).reason).toBe("not_writable");
});
