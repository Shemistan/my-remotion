// CLI generate на настоящем bootCore (Task 13 → 17): старт ядра в tmp-хранилище, сцена и
// задача playground.generate с настоящим обработчиком `playgroundGenerate` (тот же, что у
// сервера); агенты, KB и рендер — фейки (без LLM и Chrome), static check — настоящий.
import { afterEach, beforeEach, expect, it } from "vitest";
import { acquireOwnerLock, procInfo, reapAttempt } from "@ms/core";
import { defaultSettings } from "@ms/contracts";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type CliSteps, bootCli, runGenerate } from "../../src/cli/generate.js";
import { openDb } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { SqliteProcessRegistry } from "../../src/jobs/process-registry.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { killLeftovers, spawnOrphan } from "../jobs/procs.js";
import { conceptOutput, fakeAgents, fakeKb, fakeRender, makeSkills } from "../pipeline/helpers.js";

let s: TestStore;
let skills: string;
beforeEach(async () => {
  s = await makeStore("ms-cli-boot-");
  skills = await makeSkills(s.tmp);
});
afterEach(async () => {
  killLeftovers();
  await removeStore(s);
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

function cliSteps(agents: AgentRuntimeAdapter = fakeAgents({}), typecheck = async () => [] as { file: string; line: number; message: string }[]): CliSteps {
  return {
    boot: (env, log) =>
      bootCli(env, log, {
        probe,
        kb: fakeKb() as unknown as KnowledgeAdapter,
        agents,
        reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }),
        pipeline: { render: fakeRender({ png: true }).render, typecheck, skillsRoot: skills },
      }),
    ensureBrowser: async () => ({ path: "/chrome" }),
  };
}

it("boots the core, runs playground.generate with the real handler in-process, prints the result, releases the store", async () => {
  const agents = fakeAgents({});
  const o = io();
  expect(await runGenerate(["Рост выручки"], { MS_DATA_DIR: s.root }, o.io, cliSteps(agents))).toBe(0);
  expect(o.out).toContain("status: ready");
  expect(o.out.find((l) => l.startsWith("preview: "))).toMatch(/preview\.mp4$/);
  // Concept → Director → Engineer → Visual QA: тот же обработчик, что у сервера
  expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
  const db = openDb(s.root);
  const [j] = jobs.list(db);
  expect(j).toMatchObject({ type: "playground.generate", status: "completed", attempt: 1 });
  const [v] = versions.listByScene(db, j!.scene_id!);
  expect(v).toMatchObject({ status: "ready", created_by_job_id: j!.id });
  expect(agents.tasks[0]!.run).toMatchObject({ runId: j!.id, attempt: 1 });
  db.close();
  await (await acquireOwnerLock(s.root, "cli")).release();
});

it("Concept asks a question → the CLI skips it (defaults) and the job completes", async () => {
  const agents = fakeAgents({ concept: async (n) => (n === 1 ? { output: conceptOutput({ needs_clarification: [{ question: "Какой период?", default_if_skipped: "три года" }] }) } : {}) });
  const o = io();
  expect(await runGenerate(["Рост"], { MS_DATA_DIR: s.root }, o.io, cliSteps(agents))).toBe(0);
  expect(o.err.join("\n")).toContain("уточнение пропущено: Какой период? → три года");
  expect(String(agents.tasks.filter((t) => t.role === "concept")[1]!.input)).toContain("Ответы пользователя");
});

it("failed pipeline → exit 1 with the stage; the job is failed", async () => {
  const o = io();
  const code = await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps(fakeAgents({}), async () => [{ file: "src/Scene.tsx", line: 1, message: "TS2322" }]));
  expect(code).toBe(1);
  expect(o.out.find((l) => l.startsWith("failure: "))).toMatch(/^failure: typecheck: .*TS2322/);
});

it("leftover process of an earlier CLI run (grandchild ignores SIGTERM) is killed at boot, then generation runs", async () => {
  const db = openDb(s.root);
  await migrate(db);
  const orphan = await spawnOrphan(new SqliteProcessRegistry(db), { runId: "run_old", attempt: 1 }, s.tmp);
  db.close();
  const o = io();
  expect(await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps())).toBe(0);
  expect(await procInfo(orphan.grandchild)).toBeUndefined();
});

it("second owner: CLI refuses with owner_busy while another process holds the store", async () => {
  const lock = await acquireOwnerLock(s.root, "server");
  const o = io();
  expect(await runGenerate(["x"], { MS_DATA_DIR: s.root }, o.io, cliSteps())).toBe(1);
  expect(o.err.join("\n")).toContain("owner_busy");
  await lock.release();
});

it("fix 1: a requeued leftover playground.generate job is not claimed by the CLI — it stays pending", async () => {
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_old", project_id: "playground", title: "old" });
  const old = enqueue(db, { type: "playground.generate", projectId: "playground", sceneId: "scn_old", input: { sceneId: "scn_old", prompt: "old", settings: defaultSettings() }, idempotencyKey: "old" }).job;
  // прежний процесс умер посреди попытки — при старте CLI восстановление вернёт её в очередь
  jobs.update(db, old.id, { status: "running", attempt: 1 });
  db.close();
  const agents = fakeAgents({});
  const o = io();
  expect(await runGenerate(["новая"], { MS_DATA_DIR: s.root }, o.io, cliSteps(agents))).toBe(0);
  expect(new Set(agents.tasks.map((t) => t.run.runId)).size).toBe(1);
  expect(agents.tasks[0]!.run.runId).not.toBe(old.id);
  const db2 = openDb(s.root);
  expect(jobs.get(db2, old.id)).toMatchObject({ status: "pending", attempt: 1, interrupts: 1 });
  db2.close();
});
