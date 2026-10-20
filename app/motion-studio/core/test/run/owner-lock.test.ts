import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { OwnerBusyError, acquireOwnerLock } from "../../src/run/owner-lock.js";
import { procInfo } from "../../src/run/proc-info.js";
import { initStore } from "../../src/storage/guard.js";
import { fakeProbe, makeTmp, removeTmp } from "../helpers.js";

const CORE = fileURLToPath(new URL("../../", import.meta.url));
const HOLDER = fileURLToPath(new URL("../fixtures/hold-owner-lock.ts", import.meta.url));

let tmp: string;
let root: string;
const children: ChildProcess[] = [];
const locks: { release(): Promise<void> }[] = [];

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, fakeProbe(), {});
});

afterEach(async () => {
  for (const l of locks.splice(0)) await l.release();
  for (const c of children.splice(0)) {
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  }
  await removeTmp(tmp);
});

async function acquire(kind: "server" | "cli" = "cli") {
  const l = await acquireOwnerLock(root, kind);
  locks.push(l);
  return l;
}

/** Запускает отдельный node, который держит lock; ждёт строки "locked". */
async function spawnHolder(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", "tsx", HOLDER, root], {
    cwd: CORE,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let err = "";
  child.stderr!.on("data", (d: Buffer) => (err += d.toString()));
  await new Promise<void>((resolve, reject) => {
    child.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("locked")) resolve();
    });
    child.once("exit", (code) => reject(new Error(`holder exited ${code}: ${err}`)));
  });
  return child;
}

async function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => child.once("exit", resolve));
}

it("second acquire in the same process is owner_busy until release", async () => {
  const a = await acquire();
  await expect(acquireOwnerLock(root, "cli")).rejects.toThrow(/owner_busy/);
  await a.release();
  await expect(acquire()).resolves.toBeDefined();
});

it("writes owner.json for diagnostics and removes it on release", async () => {
  const a = await acquire("server");
  const owner = JSON.parse(readFileSync(join(root, "run/owner.json"), "utf8"));
  expect(owner).toEqual({ pid: process.pid, startedAt: (await procInfo(process.pid))!.startedAt, kind: "server" });
  await a.release();
  expect(existsSync(join(root, "run/owner.json"))).toBe(false);
  // повторный release — не ошибка
  await a.release();
});

it("lock held by another process: owner_busy with its pid; kill -9 frees the lock", { timeout: 20_000 }, async () => {
  const child = await spawnHolder();
  const err = await acquireOwnerLock(root, "cli").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(OwnerBusyError);
  expect(String((err as Error).message)).toMatch(/owner_busy/);
  expect((err as OwnerBusyError).pid).toBe(child.pid);

  // владелец убит без release — ядро снимает fcntl-lock
  child.kill("SIGKILL");
  await exited(child);
  const b = await acquire();
  expect(b).toBeDefined();
  const owner = JSON.parse(readFileSync(join(root, "run/owner.json"), "utf8"));
  expect(owner.pid).toBe(process.pid);
});

it("refuses without a store marker", async () => {
  await removeTmp(root);
  await expect(acquireOwnerLock(root, "cli")).rejects.toThrow(/storage/);
});
