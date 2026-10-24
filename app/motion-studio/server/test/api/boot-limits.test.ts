// M12: лимиты из `config.limits` доходят до раннера (задач в работе, семафоры агентов и
// рендеров) и до обработчика экспорта (таймаут) — через настоящий bootCore и registerHandlers.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { reapAttempt } from "@ms/core";
import { defaultSettings } from "@ms/contracts";
import type { ExportResult, ExportVersionRequest, exportVersion } from "@ms/render";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { JobContext } from "../../src/jobs/types.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { makeKb } from "./helpers.js";

let s: TestStore;
let core: Core | undefined;
beforeEach(async () => {
  s = await makeStore("ms-api-limits-");
});
afterEach(async () => {
  await core?.close();
  core = undefined;
  await removeStore(s);
});

it("config.limits → maxRunning, места семафоров агентов и рендеров, таймаут экспорта", async () => {
  writeFileSync(join(s.root, "config.json"), JSON.stringify({ limits: { maxRunning: 1, agentCalls: 3, renders: 1, exportTimeoutMs: 12_345 } }));
  const seen: { agents: number; renders: number }[] = [];
  const release: (() => void)[] = [];
  const hold = async (ctx: JobContext) => {
    seen.push({ agents: ctx.agents.available(), renders: ctx.renders.available() });
    await new Promise<void>((r) => {
      release.push(r);
      ctx.signal.addEventListener("abort", () => r(), { once: true });
    });
    return { status: "completed" as const, outputRefs: null };
  };
  const calls: ExportVersionRequest[] = [];
  const fakeExport = (async (req: ExportVersionRequest): Promise<ExportResult> => {
    calls.push(req);
    return { ok: false, error: { stage: "media", message: "фейк" } };
  }) as unknown as typeof exportVersion;
  core = await bootCore({
    env: { MS_DATA_DIR: s.root },
    kind: "server",
    probe,
    kb: await makeKb(s.tmp),
    agents: {} as AgentRuntimeAdapter,
    reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }),
    reapStrays: async () => [],
    runner: { pollMs: 10 },
    handlers: (svc) => registerHandlers(svc, { exportVersion: fakeExport }, { "playground.generate": hold }),
  });
  expect(core.config.limits).toEqual({ maxRunning: 1, agentCalls: 3, renders: 1, exportTimeoutMs: 12_345 });
  const a = core.repo.createScene("playground", { prompt: "a", settings: defaultSettings() });
  const b = core.repo.createScene("playground", { prompt: "b", settings: defaultSettings() });
  const ja = enqueue(core.db, { type: "playground.generate", projectId: "playground", sceneId: a.id, input: { n: 1 }, idempotencyKey: "a" }).job;
  const jb = enqueue(core.db, { type: "playground.generate", projectId: "playground", sceneId: b.id, input: { n: 2 }, idempotencyKey: "b" }).job;
  await until(() => seen.length === 1, "первая задача", 3000);
  await new Promise((r) => setTimeout(r, 100));
  // maxRunning 1: вторая ждёт, хотя сцены разные
  expect([jobs.get(core.db, ja.id)!.status, jobs.get(core.db, jb.id)!.status]).toEqual(["running", "pending"]);
  expect(seen[0]).toEqual({ agents: 3, renders: 1 });
  release.shift()!();
  await until(() => seen.length === 2, "вторая задача", 3000);
  release.shift()!();

  // таймаут экспорта — из config.limits.exportTimeoutMs
  jobs.insert(core.db, { id: "job_seed", type: "playground.generate", project_id: "playground", scene_id: a.id, input: {}, status: "completed", attempt: 1 });
  const v = await core.repo.publish(await makeDraft(core.root, { runId: "job_seed", attempt: 1, sceneId: a.id }), meta(a.id), { jobId: "job_seed", attempt: 1 });
  const je = enqueue(core.db, { type: "scene.export", projectId: "playground", versionId: v.versionId, input: { versionId: v.versionId, request: { format: "mp4", crf: 18, scale: 1 } }, idempotencyKey: "e" }).job;
  await until(() => ["failed", "completed"].includes(jobs.get(core!.db, je.id)!.status), "экспорт", 5000);
  expect(calls.map((c) => c.timeoutMs)).toEqual([12_345]);
});
