import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { lockKeyFor, resourceBusy } from "../../src/jobs/locks.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import { idle, job, setupDb, teardownDb, type JobsEnv } from "./helpers.js";

describe("resource_locks (V8)", () => {
  let env: JobsEnv;
  beforeEach(async () => { env = await setupDb("ms-jobs-locks-"); });
  afterEach(async () => { await teardownDb(env); });

  // Типы Phase 1 замков ресурсов не берут; ключи задаёт Phase 2 (Task 24) через lockKeyFor.
  const byProject = (j: Job): string | undefined => (j.type === "scene.export" ? `project:${j.project_id}:media` : undefined);
  const busy5 = { running: 0, maxRunning: 5 };

  it("типы Phase 1 ключа ресурса не имеют", () => {
    const { db } = env;
    for (const t of ["playground.generate", "playground.edit", "scene.restore", "scene.export"] as const) {
      expect(lockKeyFor(enqueue(db, job(t, "scn_1", t)).job)).toBeUndefined();
    }
  });

  it("задачи с одним ключом не идут параллельно; finish снимает замок", () => {
    const { db } = env;
    const x1 = enqueue(db, job("scene.export", "scn_1", "x1")).job;
    enqueue(db, job("scene.export", "scn_2", "x2"));
    enqueue(db, job("playground.edit", "scn_2", "e1"));
    expect(claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject })!.job.id).toBe(x1.id);
    expect(resourceBusy(db, "project:playground:media")).toEqual({ jobId: x1.id });
    // x2 ждёт ресурс, правка без ключа идёт
    expect(claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject })!.job.idempotency_key).toBe("e1");
    expect(claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject })).toBeUndefined();
    finish(db, x1.id, 1, { status: "completed", outputRefs: {} });
    expect(resourceBusy(db, "project:playground:media")).toBeUndefined();
    expect(claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject })!.job.idempotency_key).toBe("x2");
  });

  it("awaiting_input и отмена pending снимают замок ресурса", () => {
    const { db } = env;
    const x1 = enqueue(db, job("scene.export", "scn_1", "x1")).job;
    claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject });
    finish(db, x1.id, 1, { status: "awaiting_input", questions: [] });
    expect(resourceBusy(db, "project:playground:media")).toBeUndefined();
    requestCancel(db, x1.id);
    expect(jobs.get(db, x1.id)!.status).toBe("cancelled");
  });

  it("устаревшая попытка замок не снимает", () => {
    const { db } = env;
    const x1 = enqueue(db, job("scene.export", "scn_1", "x1")).job;
    claimNext(db, "srv", 0, busy5, { lockKeyFor: byProject });
    db.prepare("UPDATE jobs SET attempt = 2 WHERE id = ?").run(x1.id);
    expect(finish(db, x1.id, 1, { status: "completed", outputRefs: {} })).toBe(false);
    expect(resourceBusy(db, "project:playground:media")).toEqual({ jobId: x1.id });
  });

  it("нет свободного слота — замок ресурса не берётся", () => {
    const { db } = env;
    enqueue(db, job("scene.export", "scn_1", "x1"));
    expect(claimNext(db, "srv", 0, { ...idle, running: 2 }, { lockKeyFor: byProject })).toBeUndefined();
    expect(resourceBusy(db, "project:playground:media")).toBeUndefined();
  });
});

describe("Semaphore", () => {
  it("Semaphore(1): второй acquire ждёт release; FIFO", async () => {
    const s = new Semaphore(1);
    const order: string[] = [];
    const r1 = await s.acquire();
    const p2 = s.acquire().then((r) => { order.push("2"); return r; });
    const p3 = s.acquire().then((r) => { order.push("3"); return r; });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]);
    r1();
    r1(); // повторный release ничего не делает
    const r2 = await p2;
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["2"]);
    r2();
    (await p3)();
    expect(order).toEqual(["2", "3"]);
    expect(s.available()).toBe(1);
  });

  it("abort ожидания → reject, место в очереди освобождается", async () => {
    const s = new Semaphore(1);
    const r1 = await s.acquire();
    const ac = new AbortController();
    const p2 = s.acquire(ac.signal);
    const p3 = s.acquire();
    ac.abort(new Error("отмена"));
    await expect(p2).rejects.toThrow("отмена");
    r1();
    (await p3)();
    expect(s.available()).toBe(1);
    const done = new AbortController();
    done.abort();
    await expect(s.acquire(done.signal)).rejects.toThrow();
    expect(s.available()).toBe(1);
  });

  it("Semaphore(2): два держателя сразу, третий ждёт", async () => {
    const s = new Semaphore(2);
    const a = await s.acquire();
    await s.acquire();
    let got = false;
    const p = s.acquire().then((r) => { got = true; return r; });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toBe(false);
    a();
    (await p)();
    expect(got).toBe(true);
    expect(() => new Semaphore(0)).toThrow();
  });
});

describe("AttemptPermits", () => {
  it("releaseAll возвращает забытые места; release идемпотентен; выданное после закрытия — сразу обратно", async () => {
    const s = new Semaphore(1);
    const a = new AttemptPermits(s);
    const r = await a.acquire();
    r();
    r();
    expect(s.available()).toBe(1);
    await a.acquire(); // забыли отдать
    expect(s.available()).toBe(0);
    const b = new AttemptPermits(s);
    const late = b.acquire(); // ждёт место
    expect(a.releaseAll()).toBe(1);
    expect(a.releaseAll()).toBe(0);
    const rb = await late;
    expect(s.available()).toBe(0);
    const waiting = b.acquire(); // попытка b ещё ждёт второе место
    expect(b.releaseAll()).toBe(1);
    await expect(waiting).resolves.toBeTypeOf("function");
    expect(s.available()).toBe(1); // выданное после releaseAll вернулось сразу
    rb();
    expect(s.available()).toBe(1);
  });
});
