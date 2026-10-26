// Отчёт старта (Task 47): после аварийного завершения — `crashed: true`, итог восстановления
// (возобновлено, заблокировано, в карантине) сохраняется в `boot_reports`; черновик в карантине
// автоматически не удаляется; человек отмечает отчёт прочитанным.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reapAttempt } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type BootOptions, type Core, bootCore } from "../../src/boot.js";
import { migrate } from "../../src/db/migrate.js";
import { openDb } from "../../src/db/open.js";
import * as bootReports from "../../src/db/repos/boot-reports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { BOOT_REPORTS_KEEP, acknowledgeBootReport, bootSummary, latestBootReport, persistBootReport } from "../../src/recovery/boot-report.js";
import { listQuarantined } from "../../src/recovery/quarantine.js";
import { SHUTDOWN_MARKER } from "../../src/recovery/shutdown-marker.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";

let s: TestStore;
let core: Core | undefined;
beforeEach(async () => { s = await makeStore("ms-boot-report-"); });
afterEach(async () => {
  await core?.close();
  core = undefined;
  await removeStore(s);
});

const opts = (): BootOptions => ({
  env: { MS_DATA_DIR: s.root }, kind: "server", probe, kb: {} as KnowledgeAdapter, agents: {} as AgentRuntimeAdapter,
  reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }), reapStrays: async () => [], handlers: {},
  runner: { pollMs: 60_000 },
});

/** Ядро после прежнего запуска: штатно остановленного или «убитого» (маркера нет). */
async function bootFixture(o: { cleanShutdown: boolean }): Promise<Core> {
  const first = await bootCore(opts());
  await first.close();
  if (!o.cleanShutdown) rmSync(join(s.root, SHUTDOWN_MARKER));
  // состояние «после сбоя»: задача в работе без процессов и черновик в карантине
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  jobs.insert(db, { id: "job_old", type: "playground.generate", project_id: "playground", scene_id: "scn_1", input: {}, status: "blocked", attempt: 2 });
  jobs.insert(db, { id: "job_run", type: "playground.generate", project_id: "playground", scene_id: "scn_1", input: {}, status: "running", attempt: 1 });
  db.close();
  const draft = join(s.root, "workspace/drafts/job_old-a2");
  mkdirSync(draft, { recursive: true });
  writeFileSync(join(draft, "props.json"), "{}");
  writeFileSync(join(draft, ".quarantined"), JSON.stringify({ reason: "stale_process: render: процесс не завершился", at: "2026-10-25T10:00:00.000Z" }));
  core = await bootCore(opts());
  return core;
}

it("аварийный старт: crashed, задача возобновлена, черновик в карантине не удалён", async () => {
  const c = await bootFixture({ cleanShutdown: false });
  expect(c.bootReport.crashed).toBe(true);
  expect(bootSummary(c.bootReport.report)).toEqual({ recovered: 1, blocked: 0, quarantined: 1, failed: 0 });
  expect(c.bootReport.report.requeued).toEqual(["job_run"]);
  expect(listQuarantined(s.root, c.db)).toHaveLength(1);
  expect(listQuarantined(s.root, c.db)[0]).toMatchObject({ dir: "workspace/drafts/job_old-a2", job_id: "job_old", attempt: 2, reason: "stale_process: render: процесс не завершился" });
  expect(bootReports.latest(c.db)!.id).toBe(c.bootReport.id);
});

it("штатный старт: crashed false", async () => {
  const c = await bootFixture({ cleanShutdown: true });
  expect(c.bootReport.crashed).toBe(false);
});

it("persist/ack/prune: хранится не больше BOOT_REPORTS_KEEP отчётов, ack — один раз", async () => {
  const db = openDb(s.root);
  await migrate(db);
  const empty = { requeued: [], failed: [], blocked: [], foreign: [], draftsRemoved: [], completed: [], cancelled: [], locksReleased: [], warnings: [] };
  let last;
  for (let i = 0; i < BOOT_REPORTS_KEEP + 5; i++) last = persistBootReport(db, { ...empty, crashed: i % 2 === 0, quarantined: [] });
  expect(bootReports.count(db)).toBe(BOOT_REPORTS_KEEP);
  expect(bootReports.latest(db)!.id).toBe(last!.id);
  const acked = acknowledgeBootReport(db, last!.id);
  expect(acked.acknowledged_at).not.toBeNull();
  expect(acknowledgeBootReport(db, last!.id).acknowledged_at).toBe(acked.acknowledged_at);
  expect(() => acknowledgeBootReport(db, "nope")).toThrow(/boot_report_not_found/);
  db.close();
});

it("центр восстановления: последний неподтверждённый отчёт со сбоем виден после штатных стартов и не удаляется по лимиту", async () => {
  const db = openDb(s.root);
  await migrate(db);
  const empty = { requeued: [], failed: [], blocked: [], foreign: [], draftsRemoved: [], completed: [], cancelled: [], locksReleased: [], warnings: [] };
  const crash = persistBootReport(db, { ...empty, crashed: true, quarantined: [] });
  for (let i = 0; i < BOOT_REPORTS_KEEP + 5; i++) persistBootReport(db, { ...empty, crashed: false, quarantined: [] });
  expect(bootReports.get(db, crash.id)).toBeDefined();
  expect(bootReports.count(db)).toBe(BOOT_REPORTS_KEEP + 1);
  expect(latestBootReport(db)!.id).toBe(crash.id);
  acknowledgeBootReport(db, crash.id);
  expect(latestBootReport(db)!.crashed).toBe(false);
  persistBootReport(db, { ...empty, crashed: false, quarantined: [] });
  expect(bootReports.get(db, crash.id)).toBeUndefined(); // подтверждённый — снова под лимитом
  db.close();
});
