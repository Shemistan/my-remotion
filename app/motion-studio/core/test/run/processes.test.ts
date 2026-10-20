import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { procInfo } from "../../src/run/proc-info.js";
import { type TrackedProcess, fileProcessRegistry, reapStale } from "../../src/run/processes.js";
import { spawnTracked } from "../../src/run/spawn-tracked.js";
import { initStore } from "../../src/storage/guard.js";
import { safeMkdir } from "../../src/storage/safe-mkdir.js";
import { fakeProbe, makeTmp, removeTmp } from "../helpers.js";

const BIN = fileURLToPath(new URL("../fixtures/bin/", import.meta.url));
const sleepy = join(BIN, "sleepy.sh");
const ignoreTerm = join(BIN, "ignore-term.sh");
const ref = { runId: "run1", attempt: 1 };

let tmp: string;
let root: string;
// Всё, что тест мог оставить живым: группы и отдельные pid; afterEach добивает их.
const groups = new Set<number>();
const pids = new Set<number>();

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, fakeProbe(), {});
});

afterEach(async () => {
  const dir = join(root, "run/processes");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const p = JSON.parse(readFileSync(join(dir, f), "utf8")) as TrackedProcess;
      groups.add(p.pgid);
    }
  }
  for (const g of groups) kill(-g);
  for (const p of pids) kill(p);
  groups.clear();
  pids.clear();
  await removeTmp(tmp);
});

function kill(target: number): void {
  try {
    process.kill(target, "SIGKILL");
  } catch {
    /* уже нет */
  }
}

function opts(signal: AbortSignal = new AbortController().signal) {
  return { cwd: tmp, env: process.env, signal };
}

async function waitFor<T>(fn: () => T | undefined, ms = 5000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error("waitFor: timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
}

function readPid(file: string): number | undefined {
  if (!existsSync(file)) return undefined;
  const pid = Number(readFileSync(file, "utf8").trim());
  pids.add(pid);
  return pid;
}

/** Ждёт, пока в реестре появится ровно одна запись, и запоминает её группу для очистки. */
async function trackedRecord(): Promise<TrackedProcess> {
  const dir = join(root, "run/processes");
  const name = await waitFor(() =>
    existsSync(dir) ? readdirSync(dir).find((n) => n.endsWith(".json")) : undefined,
  );
  const rec = JSON.parse(readFileSync(join(dir, name), "utf8")) as TrackedProcess;
  groups.add(rec.pgid);
  return rec;
}

it("procInfo returns start time for a live pid and undefined for a dead one", async () => {
  const me = await procInfo(process.pid);
  expect(me?.pid).toBe(process.pid);
  expect(me?.startedAt).toMatch(/\d{4}$/);
  const child = spawn("true");
  await new Promise((r) => child.once("exit", r));
  expect(await procInfo(child.pid!)).toBeUndefined();
});

it("runs a command, captures output, passes stdin and leaves no record", async () => {
  const res = await spawnTracked(root, ref, "/bin/sh", ["-c", "cat; echo err >&2; exit 3"], {
    ...opts(),
    stdin: "hello",
  });
  expect(res).toEqual({ code: 3, signal: null, stdout: "hello", stderr: "err\n", orphaned: false });
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("registers the process before it starts working, in its own group", async () => {
  const ctrl = new AbortController();
  const marker = join(tmp, "ready");
  const p = spawnTracked(root, ref, ignoreTerm, [marker], { ...opts(ctrl.signal), killGraceMs: 200 });
  const rec = await trackedRecord();
  expect(rec).toMatchObject({ runId: "run1", attempt: 1, pgid: rec.pid });
  expect(rec.cmd).toContain("ignore-term.sh");
  expect(rec.startedAt).toBe((await procInfo(rec.pid))?.startedAt);
  expect(readdirSync(join(root, "run/processes"))).toEqual([`run1-a1-${rec.pid}.json`]);
  await waitFor(() => (existsSync(marker) ? true : undefined));
  ctrl.abort();
  await p;
});

function memoryRegistry(addImpl: (p: TrackedProcess) => Promise<void>) {
  const added: TrackedProcess[] = [];
  const removed: TrackedProcess[] = [];
  const registry = {
    add: async (p: TrackedProcess) => {
      added.push(p);
      groups.add(p.pgid);
      await addImpl(p);
    },
    remove: async (p: TrackedProcess) => void removed.push(p),
    list: async () => [],
  };
  return { registry, added, removed };
}

it("command does not start until registry.add resolves (custom registry)", async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const { registry, added, removed } = memoryRegistry(() => gate);
  const marker = join(tmp, "touched");
  const p = spawnTracked(root, ref, "/bin/sh", ["-c", `touch "${marker}"`], { ...opts(), registry });
  await waitFor(() => (added.length ? true : undefined));
  await new Promise((r) => setTimeout(r, 300));
  expect(existsSync(marker)).toBe(false);
  open();
  expect((await p).code).toBe(0);
  expect(existsSync(marker)).toBe(true);
  expect(removed).toEqual(added);
  // файловый реестр не тронут
  expect(existsSync(join(root, "run/processes"))).toBe(false);
});

it("registry.add failure: the command never runs, the group is killed, error propagates", async () => {
  const { registry, added } = memoryRegistry(async () => {
    throw new Error("storage: диск отключён");
  });
  const marker = join(tmp, "touched");
  await expect(
    spawnTracked(root, ref, "/bin/sh", ["-c", `touch "${marker}"`], { ...opts(), registry }),
  ).rejects.toThrow(/диск отключён/);
  expect(existsSync(marker)).toBe(false);
  expect(await procInfo(added[0]!.pid)).toBeUndefined();
});

it("abort kills the whole process group, record removed after exit", async () => {
  const ctrl = new AbortController();
  const pidFile = join(tmp, "grandchild.pid");
  const p = spawnTracked(root, ref, sleepy, [pidFile], opts(ctrl.signal));
  const rec = await trackedRecord();
  const grandchildPid = await waitFor(() => readPid(pidFile));
  expect(await procInfo(grandchildPid)).toBeDefined();
  ctrl.abort();
  const res = await p;
  expect(res.signal).toBe("SIGTERM");
  expect(await procInfo(grandchildPid)).toBeUndefined();
  expect(await procInfo(rec.pid)).toBeUndefined();
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("a process ignoring SIGTERM is killed with SIGKILL after killGraceMs", async () => {
  const ctrl = new AbortController();
  const marker = join(tmp, "ready");
  const p = spawnTracked(root, ref, ignoreTerm, [marker], { ...opts(ctrl.signal), killGraceMs: 300 });
  const rec = await trackedRecord();
  await waitFor(() => (existsSync(marker) ? true : undefined));
  const t0 = Date.now();
  ctrl.abort();
  const res = await p;
  expect(res.signal).toBe("SIGKILL");
  expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
  expect(await procInfo(rec.pid)).toBeUndefined();
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("already aborted signal: nothing is spawned", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await expect(spawnTracked(root, ref, "/bin/sh", ["-c", "touch x"], opts(ctrl.signal))).rejects.toThrow(/abort/i);
  expect(existsSync(join(tmp, "x"))).toBe(false);
});

it("rejects a runId that is not a safe file name", async () => {
  await expect(spawnTracked(root, { runId: "../x", attempt: 1 }, "/bin/true", [], opts())).rejects.toThrow(
    /runId/,
  );
});

/** Живой процесс «прошлой попытки», запущенный мимо spawnTracked, но записанный в реестр. */
async function staleAlive(script: string, arg: string): Promise<TrackedProcess> {
  const child = spawn(script, [arg], { detached: true, stdio: "ignore" });
  child.unref();
  groups.add(child.pid!);
  const startedAt = (await procInfo(child.pid!))!.startedAt;
  const rec: TrackedProcess = { runId: "run1", attempt: 1, pid: child.pid!, pgid: child.pid!, startedAt, cmd: script };
  await fileProcessRegistry(root).add(rec);
  return rec;
}

it("reapStale kills a live process of a previous attempt and reports clean", async () => {
  const pidFile = join(tmp, "grandchild.pid");
  const rec = await staleAlive(sleepy, pidFile);
  const grandchildPid = await waitFor(() => readPid(pidFile));
  const res = await reapStale(root, "run1");
  expect(res).toEqual({ clean: true, alive: [] });
  expect(await procInfo(rec.pid)).toBeUndefined();
  expect(await procInfo(grandchildPid)).toBeUndefined();
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("reapStale kills leftovers of a group whose leader already exited", async () => {
  const pidFile = join(tmp, "orphan.pid");
  const leader = spawn("/bin/sh", ["-c", `sleep 600 & echo $! > "${pidFile}.tmp" && mv "${pidFile}.tmp" "${pidFile}"; read -r _`], {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
  });
  groups.add(leader.pid!);
  const startedAt = (await procInfo(leader.pid!))!.startedAt;
  await fileProcessRegistry(root).add({ runId: "run1", attempt: 1, pid: leader.pid!, pgid: leader.pid!, startedAt, cmd: "sh" });
  const orphan = await waitFor(() => readPid(pidFile));
  leader.stdin!.end("\n");
  await new Promise((r) => leader.once("exit", r));
  expect(await procInfo(orphan)).toBeDefined();
  expect(await reapStale(root, "run1")).toEqual({ clean: true, alive: [] });
  expect(await procInfo(orphan)).toBeUndefined();
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});

it("reapStale with a kill that does not kill reports clean: false", async () => {
  const rec = await staleAlive(ignoreTerm, join(tmp, "ready"));
  const sent: [number, string][] = [];
  const res = await reapStale(root, "run1", {
    kill: (pid, sig) => void sent.push([pid, sig]),
    graceMs: 100,
    waitMs: 200,
  });
  expect(res.clean).toBe(false);
  expect(res.alive.length).toBe(1);
  expect(res.alive[0]).toEqual(rec);
  expect(sent).toEqual([
    [-rec.pgid, "SIGTERM"],
    [-rec.pgid, "SIGKILL"],
  ]);
  // запись живого процесса остаётся
  expect(readdirSync(join(root, "run/processes"))).toEqual([`run1-a1-${rec.pid}.json`]);
});

it("reapStale drops dead records and records with another startedAt, ignores other runs", async () => {
  const reg = fileProcessRegistry(root);
  const dead = spawn("true");
  await new Promise((r) => dead.once("exit", r));
  await reg.add({ runId: "run1", attempt: 1, pid: dead.pid!, pgid: dead.pid!, startedAt: "x", cmd: "true" });
  // pid жив (это мы), но время старта другое — pid переиспользован, процесс не наш
  await reg.add({ runId: "run1", attempt: 2, pid: process.pid, pgid: process.pid, startedAt: "Thu Jan  1 00:00:00 1970", cmd: "x" });
  const other: TrackedProcess = { runId: "run2", attempt: 1, pid: process.pid, pgid: process.pid, startedAt: "y", cmd: "y" };
  await reg.add(other);
  const sent: unknown[] = [];
  const res = await reapStale(root, "run1", { kill: (...a) => void sent.push(a) });
  expect(res).toEqual({ clean: true, alive: [] });
  expect(sent).toEqual([]);
  expect(await reg.list()).toEqual([other]);
  expect(await reg.list({ runId: "run1" })).toEqual([]);
});

it("file registry: run-scoped list, remove, missing dir is empty, vanished root throws", async () => {
  const reg = fileProcessRegistry(root);
  expect(await reg.list()).toEqual([]);
  const a: TrackedProcess = { runId: "r-a1", attempt: 1, pid: 11, pgid: 11, startedAt: "s", cmd: "c" };
  const b: TrackedProcess = { runId: "r", attempt: 1, pid: 12, pgid: 12, startedAt: "s", cmd: "c" };
  await reg.add(a);
  await reg.add(b);
  // фильтр по содержимому записи, а не по префиксу имени файла
  expect(await reg.list({ runId: "r" })).toEqual([b]);
  await reg.remove(b);
  await reg.remove(b);
  expect(await reg.list()).toEqual([a]);
  // мусор рядом не мешает
  await writeFile(join(await safeMkdir(root, "run/processes"), ".x.tmp"), "{");
  expect(await reg.list()).toEqual([a]);
  await removeTmp(root);
  await expect(reg.list()).rejects.toThrow(/storage/);
});

// --- fix round 1 ---

/** Временно подменяет переменные окружения текущего процесса. */
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const env = process.env;
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, env[k]]));
  Object.assign(env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
}

it("startedAt does not depend on the caller's locale and TZ: reap under another env keeps a live record", async () => {
  const child = spawn(ignoreTerm, [join(tmp, "ready")], { detached: true, stdio: "ignore" });
  child.unref();
  groups.add(child.pid!);
  // запись пишет «сервер» в одной локали и поясе…
  const rec = await withEnv({ LC_ALL: "ru_RU.UTF-8", LANG: "ru_RU.UTF-8", TZ: "Asia/Tokyo" }, async () => {
    const r: TrackedProcess = {
      runId: "run1",
      attempt: 1,
      pid: child.pid!,
      pgid: child.pid!,
      startedAt: (await procInfo(child.pid!))!.startedAt,
      cmd: ignoreTerm,
    };
    await fileProcessRegistry(root).add(r);
    return r;
  });
  // …а разбирает «CLI» в другой
  const res = await withEnv({ LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8", TZ: "America/New_York" }, async () => {
    expect((await procInfo(child.pid!))?.startedAt).toBe(rec.startedAt);
    return reapStale(root, "run1", { kill: () => undefined, graceMs: 50, waitMs: 50 });
  });
  expect(res.clean).toBe(false);
  expect(res.alive).toEqual([rec]);
  expect(readdirSync(join(root, "run/processes"))).toEqual([`run1-a1-${rec.pid}.json`]);
});

it("procInfo throws when ps fails for a reason other than 'no such process'", async () => {
  const bin = join(tmp, "fake-bin");
  await mkdir(bin);
  await writeFile(join(bin, "ps"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
  await withEnv({ PATH: bin }, async () => {
    await expect(procInfo(process.pid)).rejects.toThrow();
  });
});

it("spawnTracked keeps the record and reports orphaned when the group does not die after the leader", async () => {
  const res = await spawnTracked(root, ref, "/bin/sh", ["-c", "exit 0"], {
    ...opts(),
    groupAlive: () => true,
    groupWaitMs: 200,
  });
  expect(res.code).toBe(0);
  expect(res.orphaned).toBe(true);
  const rec = await trackedRecord();
  expect(rec).toMatchObject({ runId: "run1", attempt: 1 });
});

it("abort path: orphaned group keeps the record too", async () => {
  const ctrl = new AbortController();
  const marker = join(tmp, "ready");
  const p = spawnTracked(root, ref, ignoreTerm, [marker], {
    ...opts(ctrl.signal),
    killGraceMs: 100,
    groupAlive: () => true,
    groupWaitMs: 200,
  });
  const rec = await trackedRecord();
  await waitFor(() => (existsSync(marker) ? true : undefined));
  ctrl.abort();
  const res = await p;
  expect(res.signal).toBe("SIGKILL");
  expect(res.orphaned).toBe(true);
  expect(readdirSync(join(root, "run/processes"))).toEqual([`run1-a1-${rec.pid}.json`]);
});

it("normal exit with a dead group reports orphaned: false and removes the record", async () => {
  const res = await spawnTracked(root, ref, "/bin/sh", ["-c", "exit 0"], opts());
  expect(res.orphaned).toBe(false);
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
});
