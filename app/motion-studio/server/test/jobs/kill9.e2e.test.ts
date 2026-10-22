// 09 §5 п. 1–2, 7, 8 (e2e, `make e2e`): настоящий дочерний «сервер» (node + bootCore)
// запускает задачу, чей обработчик стартует orphan-render.sh через spawnTracked (внук
// игнорирует SIGTERM); тест убивает сервер `kill -9`. Новый bootCore в том же хранилище
// берёт owner-lock (ядро сняло fcntl), добивает внука и возвращает задачу в очередь.
// Второй bootCore при живом первом — owner_busy.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { OwnerBusyError, procInfo, reapAttempt } from "@ms/core";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { ORPHAN_RENDER, killLeftovers, killStrays, readPid, track, waitFor } from "./procs.js";

const APP = fileURLToPath(new URL("../../../", import.meta.url));
const src = (rel: string) => JSON.stringify(pathToFileURL(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url))).href);
const CORE_SPAWN = JSON.stringify(pathToFileURL(fileURLToPath(new URL("../../../core/src/run/spawn-tracked.ts", import.meta.url))).href);
const T = 60_000;

let s: TestStore;
let core: Core | undefined;
const children: ChildProcess[] = [];
beforeEach(async () => { s = await makeStore("ms-jobs-kill9-"); });
afterEach(async () => {
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  try {
    await core?.close();
  } finally {
    core = undefined;
    killLeftovers();
    // лидер фикстуры запускает дочерний сервер, track() его не знает: если тест упал до
    // track(внук), без этого orphan-render.sh и внук живут после теста
    killStrays(s.tmp);
    await removeStore(s);
  }
});

/** Дочерний сервер: bootCore, сцена, задача; печатает `ready <jobId>` после старта внука. */
function startServer(pidFile: string): Promise<{ child: ChildProcess; jobId: string }> {
  const script = join(s.tmp, "server-child.mts");
  writeFileSync(
    script,
    `import { spawnTracked } from ${CORE_SPAWN};
import { bootCore } from ${src("boot.ts")};
import * as scenes from ${src("db/repos/scenes.ts")};
import { enqueue } from ${src("jobs/queue.ts")};
const [root, pidFile, orphan] = process.argv.slice(2);
const probe = { volumeUuid: async () => "VOL-A", deviceId: async () => 2, systemDeviceId: async () => 1, freeBytes: async () => 100 * 1024 ** 3 };
const core = await bootCore({
  env: { MS_DATA_DIR: root },
  kind: "server",
  probe,
  kb: {},
  agents: {},
  handlers: {
    "playground.generate": async (ctx) => {
      await spawnTracked(ctx.run.root, ctx.run, orphan, [pidFile], { cwd: root, env: { PATH: process.env.PATH }, signal: ctx.signal, registry: ctx.run.registry });
      return { status: "completed", outputRefs: {} };
    },
  },
});
scenes.create(core.db, { id: "scn_1", project_id: "playground", title: "kill9" });
const job = enqueue(core.db, { type: "playground.generate", projectId: "playground", sceneId: "scn_1", input: {}, idempotencyKey: "kill9" }).job;
const { existsSync } = await import("node:fs");
const t = setInterval(() => {
  if (existsSync(pidFile)) { clearInterval(t); process.stdout.write("ready " + job.id + "\\n"); }
}, 20);
`,
  );
  const child = spawn(process.execPath, ["--import", "tsx", script, s.root, pidFile, ORPHAN_RENDER], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let err = "";
  child.stderr!.on("data", (d: Buffer) => (err += d.toString()));
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout!.on("data", (d: Buffer) => {
      out += d.toString();
      const m = /ready (\S+)/.exec(out);
      if (m) resolve({ child, jobId: m[1]! });
    });
    child.once("exit", (c) => reject(new Error(`дочерний сервер вышел (${c}): ${err}`)));
  });
}

const boot = () =>
  bootCore({ env: { MS_DATA_DIR: s.root }, kind: "server", probe, kb: {} as KnowledgeAdapter, agents: {} as AgentRuntimeAdapter, reap: (r, f) => reapAttempt(r, f, { graceMs: 500, waitMs: 10_000 }) });

it("server killed with -9 mid-render: new boot takes the lock, kills the SIGTERM-ignoring grandchild, requeues the job", async () => {
  const pidFile = join(s.tmp, "grandchild.pid");
  const { child, jobId } = await startServer(pidFile);
  const grandchild = readPid(pidFile)!;
  track(grandchild);
  child.kill("SIGKILL");
  await new Promise((r) => child.once("exit", r));
  // сервер мёртв, внук — жив и всё ещё «рендерит»
  expect(await procInfo(grandchild)).toBeDefined();

  core = await boot();
  expect(core.recovery.requeued).toEqual([jobId]);
  expect(await procInfo(grandchild)).toBeUndefined();
  expect(jobs.get(core.db, jobId)).toMatchObject({ status: "pending", interrupts: 1, attempt: 1 });
  expect(await core.processes.live()).toEqual([]);
  expect(existsSync(join(s.root, "workspace/drafts", `${jobId}-a1`))).toBe(false);
}, T);

it("second bootCore while the first is alive → owner_busy; after kill -9 of the owner the store is free", async () => {
  const { child } = await startServer(join(s.tmp, "gc2.pid"));
  const err = await boot().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(OwnerBusyError);
  expect(String(err)).toMatch(/owner_busy.*server, pid \d+/);
  child.kill("SIGKILL");
  await new Promise((r) => child.once("exit", r));
  core = await waitFor(() => boot().catch(() => undefined), "owner-lock после kill -9", 10_000);
  expect(core.storage.mode()).toBe("online");
}, T);
