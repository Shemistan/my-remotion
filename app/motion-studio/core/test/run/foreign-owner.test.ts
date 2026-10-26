// S20: разбор реестра не трогает процессы другого живого сервера (копия хранилища).
// A — лидер записи жив и его родитель не 1, не мы и не другая наша запись → не сигналить;
// B — владелец записи (owner pid + время старта) жив и это не мы → не сигналить.
import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { procInfo, procParent } from "../../src/run/proc-info.js";
import { type ProcessRegistry, type TrackedProcess, reapAttempt } from "../../src/run/processes.js";

const pids = new Set<number>();
const kids: ChildProcess[] = [];
afterEach(() => {
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
});

/** Реестр в памяти: `markForeign` запоминает отметки. */
function memRegistry(recs: TrackedProcess[]) {
  const live = [...recs];
  const marked: [number, number][] = [];
  const reg: ProcessRegistry & { marked: typeof marked } = {
    marked,
    add: async (p) => void live.push(p),
    end: async (p) => {
      const i = live.findIndex((q) => q.pid === p.pid && q.runId === p.runId && q.attempt === p.attempt);
      if (i >= 0) live.splice(i, 1);
    },
    live: async (f = {}) => live.filter((p) => (f.runId === undefined || p.runId === f.runId) && (f.attempt === undefined || p.attempt === f.attempt)),
    markForeign: async (p, ownerPid) => void marked.push([p.pid, ownerPid]),
  };
  return reg;
}

async function waitLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    child.stdout!.setEncoding("utf8").on("data", (d: string) => {
      buf += d;
      const i = buf.indexOf("\n");
      if (i >= 0) resolve(buf.slice(0, i));
    });
    child.once("exit", () => reject(new Error(`процесс вышел раньше строки: ${buf}`)));
  });
}

/** «Чужой сервер»: node-процесс, запустивший свою группу `sleep 600` (его pid — ppid лидера). */
async function foreignServer(): Promise<{ server: number; leader: number }> {
  const code = `const c=require("child_process").spawn("sleep",["600"],{detached:true,stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1e6);`;
  const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "ignore"] });
  kids.push(child);
  pids.add(child.pid!);
  const leader = Number(await waitLine(child));
  pids.add(leader);
  return { server: child.pid!, leader };
}

async function record(pid: number, extra: Partial<TrackedProcess> = {}): Promise<TrackedProcess> {
  const startedAt = (await procInfo(pid))!.startedAt;
  return { runId: "run1", attempt: 1, pid, pgid: pid, startedAt, cmd: "sleep 600", ...extra };
}

/** Свой процесс (ppid = мы) в своей группе. */
function ownSleep(): number {
  const c = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
  c.unref();
  pids.add(c.pid!);
  return c.pid!;
}

it("procParent: ppid и время старта живого процесса, undefined для мёртвого", async () => {
  const pid = ownSleep();
  const p = await procParent(pid);
  expect(p).toEqual({ pid, ppid: process.pid, startedAt: (await procInfo(pid))!.startedAt });
  const dead = spawn("true");
  await new Promise((r) => dead.once("exit", r));
  expect(await procParent(dead.pid!)).toBeUndefined();
});

it("A: родитель лидера — другой живой процесс → сигнал не шлётся, запись помечена, clean: false", async () => {
  const f = await foreignServer();
  const rec = await record(f.leader);
  const reg = memRegistry([rec]);
  const sent: unknown[] = [];
  const r = await reapAttempt(reg, { runId: "run1", attempt: 1 }, { kill: (...a) => void sent.push(a), graceMs: 50, waitMs: 50 });
  expect(sent).toEqual([]);
  expect(r.clean).toBe(false);
  expect(r.alive).toEqual([rec]);
  expect(r.foreign).toEqual([{ process: rec, ownerPid: f.server, reason: "parent_alive" }]);
  expect(reg.marked).toEqual([[f.leader, f.server]]);
  expect(await procInfo(f.leader)).toBeDefined();
});

it("B: владелец записи — другой живой процесс → не трогать, даже если родитель — мы", async () => {
  const f = await foreignServer();
  const own = ownSleep();
  const ownerStarted = (await procInfo(f.server))!.startedAt;
  const rec = await record(own, { owner: { pid: f.server, startedAt: ownerStarted, nonce: "n-foreign" } });
  const reg = memRegistry([rec]);
  const r = await reapAttempt(reg, { runId: "run1", attempt: 1 }, { graceMs: 50, waitMs: 50 });
  expect(r.foreign).toEqual([{ process: rec, ownerPid: f.server, reason: "owner_alive" }]);
  expect(r.clean).toBe(false);
  expect(await procInfo(own)).toBeDefined();
});

it("B: владелец мёртв (время старта не совпадает), родитель — мы → процесс убит", async () => {
  const own = ownSleep();
  const rec = await record(own, { owner: { pid: process.pid, startedAt: "Thu Jan  1 00:00:00 1970", nonce: "old" } });
  const r = await reapAttempt(memRegistry([rec]), { runId: "run1", attempt: 1 }, { graceMs: 200 });
  expect(r).toEqual({ clean: true, alive: [] });
  expect(await procInfo(own)).toBeUndefined();
});

it("владелец — этот процесс (тот же pid и время старта) → свой, убивается", async () => {
  const own = ownSleep();
  const me = (await procInfo(process.pid))!.startedAt;
  const rec = await record(own, { owner: { pid: process.pid, startedAt: me, nonce: "any" } });
  const r = await reapAttempt(memRegistry([rec]), { runId: "run1", attempt: 1 }, { graceMs: 200 });
  expect(r).toEqual({ clean: true, alive: [] });
  expect(await procInfo(own)).toBeUndefined();
});

it("цепочка: родитель лидера — другая наша убиваемая запись (worker → Chrome) → убиты оба", async () => {
  // «worker» — наш sh, «Chrome» — его потомок в своей группе (как chrome-wrapper.sh у Remotion)
  const w = spawn("/bin/sh", ["-c", `perl -e 'setpgrp(0,0); exec "sleep", "600"' & echo $!; wait`], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  kids.push(w);
  pids.add(w.pid!);
  const chrome = Number(await waitLine(w));
  pids.add(chrome);
  await new Promise((r) => setTimeout(r, 100)); // setpgrp + exec
  expect((await procParent(chrome))!.ppid).toBe(w.pid);
  const worker = await record(w.pid!);
  const browser = await record(chrome);
  const r = await reapAttempt(memRegistry([worker, browser]), { runId: "run1", attempt: 1 }, { graceMs: 300 });
  expect(r).toEqual({ clean: true, alive: [] });
  expect(await procInfo(chrome)).toBeUndefined();
  expect(await procInfo(w.pid!)).toBeUndefined();
});

it("цепочка: родитель — запись чужого сервера (по владельцу) → потомок без владельца тоже чужой", async () => {
  // чужой сервер: node → sh-«worker» (своя группа) → «Chrome» в своей группе, пишет «worker_pid chrome_pid»
  const code =
    `const c=require("child_process").spawn("/bin/sh",["-c","perl -e 'setpgrp(0,0); exec \\"sleep\\", \\"600\\"' & echo $$ $!; wait"],` +
    `{detached:true,stdio:["ignore","inherit","ignore"]});setInterval(()=>{},1e6);`;
  const server = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "ignore"] });
  kids.push(server);
  pids.add(server.pid!);
  const [wPid, cPid] = (await waitLine(server)).split(" ").map(Number) as [number, number];
  pids.add(wPid);
  pids.add(cPid);
  await new Promise((r) => setTimeout(r, 100));
  expect((await procParent(cPid))!.ppid).toBe(wPid);
  const ownerStarted = (await procInfo(server.pid!))!.startedAt;
  // worker записан с владельцем (SQLite), Chrome — без (боковой реестр); родитель worker — сервер
  const worker = await record(wPid, { owner: { pid: server.pid!, startedAt: ownerStarted, nonce: "n" } });
  const browser = await record(cPid);
  const reg = memRegistry([worker, browser]);
  const r = await reapAttempt(reg, { runId: "run1", attempt: 1 }, { graceMs: 50, waitMs: 50 });
  expect(r.clean).toBe(false);
  expect(r.foreign).toEqual([
    { process: worker, ownerPid: server.pid, reason: "owner_alive" },
    { process: browser, ownerPid: server.pid, reason: "owner_alive" },
  ]);
  expect(await procInfo(wPid)).toBeDefined();
  expect(await procInfo(cPid)).toBeDefined();
});
