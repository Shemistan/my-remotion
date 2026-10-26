// S20 (инцидент 2026-10-26): сервер на КОПИИ хранилища при старте убил процессы сервера,
// работавшего на оригинале, — реестр копии содержит их живые pid. Теперь разбор шлёт сигнал
// только осиротевшим процессам мёртвого владельца; чужие — foreign_owner, задача blocked.
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fileProcessRegistry, procInfo, reapAttempt } from "@ms/core";
import { type BootOptions, type Core, bootCore } from "../../src/boot.js";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { getMeta } from "../../src/db/meta.js";
import { migrate } from "../../src/db/migrate.js";
import { openDb } from "../../src/db/open.js";
import * as jobProcesses from "../../src/db/repos/job-processes.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { storeCopyRow } from "../../src/diagnostics/doctor-checks.js";
import { acknowledgeBootReport } from "../../src/recovery/boot-report.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { req } from "./helpers.js";

let s: TestStore;
let core: Core | undefined;
const kids: ChildProcess[] = [];
const pids = new Set<number>();
beforeEach(async () => { s = await makeStore("ms-jobs-foreign-"); });
afterEach(async () => {
  await core?.close();
  core = undefined;
  for (const p of pids) {
    for (const t of [-p, p]) {
      try {
        process.kill(t, "SIGKILL");
      } catch {
        /* уже нет */
      }
    }
  }
  pids.clear();
  for (const k of kids.splice(0)) k.kill("SIGKILL");
  await removeStore(s);
});

const kb = {} as KnowledgeAdapter;
const agents = {} as AgentRuntimeAdapter;
const fastReap: typeof reapAttempt = (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 3000 });
const opts = (root: string, over: Partial<BootOptions> = {}): BootOptions => ({ env: { MS_DATA_DIR: root }, kind: "server", probe, kb, agents, reap: fastReap, ...over });

/** «Сервер оригинала»: другой node-процесс со своим дочерним процессом (группа `sleep 600`). */
async function originalServer(): Promise<{ server: number; serverStartedAt: string; child: number }> {
  const code = `const c=require("child_process").spawn("sleep",["600"],{detached:true,stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1e6);`;
  const server = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "ignore"] });
  kids.push(server);
  pids.add(server.pid!);
  const child = await new Promise<number>((resolve, reject) => {
    let buf = "";
    server.stdout!.setEncoding("utf8").on("data", (d: string) => {
      buf += d;
      if (buf.includes("\n")) resolve(Number(buf.trim()));
    });
    server.once("exit", () => reject(new Error("сервер оригинала вышел")));
  });
  pids.add(child);
  return { server: server.pid!, serverStartedAt: (await procInfo(server.pid!))!.startedAt, child };
}

/** Реестр «копии»: задача running, её процесс — живой ребёнок сервера оригинала. */
async function seedCopy(o: Awaited<ReturnType<typeof originalServer>>, withOwner: boolean): Promise<string> {
  const db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  const j = enqueue(db, req()).job;
  jobs.update(db, j.id, { status: "running", attempt: 1, lease_owner: `server:${o.server}`, lease_until: new Date().toISOString() });
  jobProcesses.insert(db, {
    job_id: j.id, attempt: 1, pid: o.child, pgid: o.child, started_at: (await procInfo(o.child))!.startedAt, cmd: "sleep 600",
    ...(withOwner ? { owner_pid: o.server, owner_started_at: o.serverStartedAt, owner_nonce: "orig-nonce" } : {}),
  });
  db.close();
  return j.id;
}

for (const withOwner of [true, false]) {
  it(`живой дочерний процесс другого node-процесса в реестре копии (${withOwner ? "строка с owner_*" : "старая строка без owner_*"}) → жив, foreign_owner, задача blocked`, async () => {
    const o = await originalServer();
    const jobId = await seedCopy(o, withOwner);
    core = await bootCore(opts(s.root));
    // процесс оригинала жив
    expect(await procInfo(o.child)).toBeDefined();
    // строка помечена, но не закрыта
    expect(core.db.prepare("SELECT foreign_owner, ended_at FROM job_processes WHERE pid = ?").get(o.child)).toEqual({ foreign_owner: o.server, ended_at: null });
    // задача — blocked(stale_process) с понятным сообщением, без автоповтора
    const j = jobs.get(core.db, jobId)!;
    expect(j.status).toBe("blocked");
    expect(j.error).toMatchObject({ code: "stale_process", pids: [o.child] });
    expect(j.error!.message).toContain(`процесс принадлежит другому живому серверу (pid ${o.server})`);
    expect(core.recovery.requeued).toEqual([]);
    expect(core.recovery.foreign).toEqual([{ jobId, pids: [o.child], ownerPids: [o.server] }]);
    // warn в отчёте старта (центр восстановления) и в журнале задачи
    expect(core.bootReport.report.warnings).toContainEqual(expect.objectContaining({ kind: "foreign_process", job_id: jobId, message: expect.stringContaining(`pid ${o.server}`) }));
    const ev = core.db.prepare("SELECT level, kind FROM job_events WHERE job_id = ? AND kind = 'foreign_process'").all(jobId);
    expect(ev).toEqual([{ level: "warn", kind: "foreign_process" }]);
    // уборка замков не снимает их, пока чужой процесс жив; раннер задачу не берёт
    await new Promise((r) => setTimeout(r, 100));
    expect(jobs.get(core.db, jobId)!.status).toBe("blocked");
    expect(await procInfo(o.child)).toBeDefined();
  });
}

it("I1: Chrome оригинала в боковом реестре (без владельца, ppid 1), worker уже вышел, сервер оригинала жив → Chrome жив", async () => {
  const o = await originalServer();
  const db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  const j = enqueue(db, req()).job;
  jobs.update(db, j.id, { status: "running", attempt: 1 });
  // строка worker'а завершена (вышел), но несёт владельца попытки
  jobProcesses.insert(db, { job_id: j.id, attempt: 1, pid: 999_999, pgid: 999_999, started_at: "x", cmd: "worker", owner_pid: o.server, owner_started_at: o.serverStartedAt, owner_nonce: "orig" });
  jobProcesses.end(db, { job_id: j.id, attempt: 1, pid: 999_999 });
  db.close();
  // «Chrome»: осиротевшая группа (ppid 1), записанная chrome-wrapper.sh в run/processes
  const sh = spawn("/bin/sh", ["-c", `perl -e 'setpgrp(0,0); exec "sleep", "600"' & echo $!`], { stdio: ["ignore", "pipe", "ignore"] });
  const chrome = await new Promise<number>((resolve) => sh.stdout!.setEncoding("utf8").on("data", (d: string) => resolve(Number(d.trim()))));
  pids.add(chrome);
  await new Promise((r) => setTimeout(r, 150));
  await fileProcessRegistry(s.root).add({ runId: j.id, attempt: 1, pid: chrome, pgid: chrome, startedAt: (await procInfo(chrome))!.startedAt, cmd: "chrome-headless-shell (render) /x" });
  core = await bootCore(opts(s.root));
  expect(await procInfo(chrome)).toBeDefined();
  expect(jobs.get(core.db, j.id)!.status).toBe("blocked");
  expect(core.recovery.foreign).toEqual([{ jobId: j.id, pids: [chrome], ownerPids: [o.server] }]);
});

it("владелец мёртв, процесс осиротел (ppid 1) → убит, задача снова в очереди (как прежде)", async () => {
  const o = await originalServer();
  const jobId = await seedCopy(o, true);
  // «сервер оригинала» падает: ребёнок (своя группа) осиротел
  process.kill(o.server, "SIGKILL");
  pids.delete(o.server);
  for (let i = 0; i < 100 && (await procInfo(o.server)); i++) await new Promise((r) => setTimeout(r, 20));
  core = await bootCore(opts(s.root));
  expect(await procInfo(o.child)).toBeUndefined();
  expect(core.recovery.requeued).toEqual([jobId]);
  expect(core.recovery.foreign).toEqual([]);
});

it("I2: тот же корень в другом регистре (APFS без учёта регистра) — не копия, предупреждения нет", async () => {
  core = await bootCore(opts(s.root));
  await core.close();
  core = undefined;
  const upper = join(s.tmp, "STORE");
  expect(realpathSync.native(upper)).toBe(realpathSync.native(s.root)); // том без учёта регистра
  core = await bootCore(opts(upper));
  expect(core.bootReport.report.warnings).toEqual([]);
  expect(storeCopyRow(core.db, upper)).toBeUndefined();
});

it("I2: «Понятно» снимает метку копии: root_realpath = текущий путь, doctor больше не предупреждает", async () => {
  core = await bootCore(opts(s.root));
  await core.close();
  core = undefined;
  const copy = join(s.tmp, "copy");
  cpSync(s.root, copy, { recursive: true });
  core = await bootCore(opts(copy));
  expect(storeCopyRow(core.db, copy)).toBeDefined();
  acknowledgeBootReport(core.db, core.bootReport.id, copy);
  expect(storeCopyRow(core.db, copy)).toBeUndefined();
  expect(getMeta(core.db, "root_copied_from")).toBeUndefined();
  expect(getMeta(core.db, "root_realpath")).toBe(realpathSync.native(copy));
});

it("C: корень хранилища в meta; на копии — предупреждение в отчёте старта и doctor, без отказа", async () => {
  core = await bootCore(opts(s.root));
  const orig = realpathSync.native(s.root);
  expect(getMeta(core.db, "root_realpath")).toBe(orig);
  expect(core.bootReport.report.warnings).toEqual([]);
  await core.close();
  core = undefined;

  const copy = join(s.tmp, "copy");
  cpSync(s.root, copy, { recursive: true });
  core = await bootCore(opts(copy));
  const text = `хранилище скопировано из ${orig}; процессы оригинала не трогаются`;
  expect(core.bootReport.report.warnings).toEqual([{ kind: "store_copied", level: "warn", message: text, copied_from: orig }]);
  expect(getMeta(core.db, "root_realpath")).toBe(realpathSync.native(copy));
  // doctor: строка-предупреждение (ok: true) — и по базе сервера, и по закрытой базе (CLI)
  const row = { name: "store_copy", ok: true, status: "warning", detail: text };
  expect(storeCopyRow(core.db, copy)).toEqual(row);
  await core.close();
  core = undefined;
  const db = openDb(copy);
  try {
    expect(storeCopyRow(db, copy)).toEqual(row);
  } finally {
    db.close();
  }
  // у оригинала предупреждения нет
  const odb = openDb(s.root);
  try {
    expect(storeCopyRow(odb, s.root)).toBeUndefined();
  } finally {
    odb.close();
  }
});
