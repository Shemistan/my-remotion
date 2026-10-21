// CLI generate на настоящем bootCore (Task 13): старт ядра в tmp-хранилище, сцена и
// задача playground.generate, обработчик interimGenerate; generateScene подменён (без LLM).
import { afterEach, beforeEach, expect, it } from "vitest";
import { acquireOwnerLock, procInfo, reapAttempt } from "@ms/core";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type CliSteps, bootCli, runGenerate } from "../../src/cli/generate.js";
import { openDb } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { SqliteProcessRegistry } from "../../src/jobs/process-registry.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import type { GenerateDeps, GenerateResult } from "../../src/pipeline/generate.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { killLeftovers, spawnOrphan } from "../jobs/procs.js";

let s: TestStore;
beforeEach(async () => { s = await makeStore("ms-cli-boot-"); });
afterEach(async () => {
  killLeftovers();
  await removeStore(s);
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

function cliSteps(seen: { deps?: GenerateDeps }[], result: Partial<GenerateResult> = {}): CliSteps {
  return {
    boot: (env, log) =>
      bootCli(env, log, {
        probe,
        kb: {} as KnowledgeAdapter,
        agents: {} as AgentRuntimeAdapter,
        reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }),
        generate: async (_p, _s, deps) => {
          seen.push({ deps });
          return { status: "ready", runId: deps.run!.runId, sceneId: deps.sceneId, versionDir: "/v", previewPath: "/v/preview.mp4", costUsd: 0.25, engineerCalls: 1, warnings: [], timings: {}, ...result };
        },
      }),
    ensureBrowser: async () => ({ path: "/chrome" }),
  };
}

it("boots the core, runs one playground.generate job in-process, prints the result, releases the store", async () => {
  const seen: { deps?: GenerateDeps }[] = [];
  const o = io();
  expect(await runGenerate(["Рост выручки"], { MS_DATA_DIR: s.root }, o.io, cliSteps(seen))).toBe(0);
  expect(o.out).toContain("status: ready");
  expect(o.out).toContain("preview: /v/preview.mp4");
  expect(o.out.join("\n")).toContain("cost: $0.25");
  // задача в БД завершена, сцена создана, generateScene получил контекст попытки
  const db = openDb(s.root);
  const [j] = jobs.list(db);
  expect(j).toMatchObject({ type: "playground.generate", status: "completed", attempt: 1 });
  expect(seen[0]!.deps!.run).toMatchObject({ runId: j!.id, attempt: 1 });
  expect(seen[0]!.deps!.sceneId).toBe(j!.scene_id);
  db.close();
  await (await acquireOwnerLock(s.root, "cli")).release();
});

it("failed pipeline → exit 1 with the stage; the job is failed", async () => {
  const o = io();
  const code = await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps([], { status: "failed", failure: { stage: "typecheck", message: "TS2322" }, previewPath: undefined, versionDir: undefined }));
  expect(code).toBe(1);
  expect(o.out).toContain("failure: typecheck: TS2322");
});

it("leftover process of an earlier CLI run (grandchild ignores SIGTERM) is killed at boot, then generation runs", async () => {
  const db = openDb(s.root);
  migrate(db);
  const orphan = await spawnOrphan(new SqliteProcessRegistry(db), { runId: "run_old", attempt: 1 }, s.tmp);
  db.close();
  const o = io();
  expect(await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps([]))).toBe(0);
  expect(await procInfo(orphan.grandchild)).toBeUndefined();
});

it("second owner: CLI refuses with owner_busy while another process holds the store", async () => {
  const lock = await acquireOwnerLock(s.root, "server");
  const o = io();
  expect(await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps([]))).toBe(1);
  expect(o.err.join("\n")).toContain("owner_busy");
  await lock.release();
});
