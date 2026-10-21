import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import { SCENE_WRITING_TYPES, claimNext, enqueue, fenceOk, finish, heartbeat, provideInput } from "../../src/jobs/queue.js";
import { LEASE_MS } from "../../src/jobs/limits.js";
import { edit, idle, job, req, setupDb, teardownDb, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
beforeEach(async () => { env = await setupDb("ms-jobs-queue-"); });
afterEach(async () => { await teardownDb(env); });

describe("claimNext", () => {
  it("берёт самую старую pending: running, attempt 1, lease, started_at, замок сцены", () => {
    const { db } = env;
    const a = enqueue(db, req({ idempotencyKey: "a", sceneId: "scn_1" })).job;
    enqueue(db, req({ idempotencyKey: "b", sceneId: "scn_2" }));
    const c1 = claimNext(db, "srv", 1_000, idle)!;
    expect(c1).toMatchObject({ attempt: 1, job: { id: a.id, status: "running", attempt: 1, lease_owner: "srv" } });
    expect(c1.job.lease_until).toBe(new Date(1_000 + LEASE_MS).toISOString());
    expect(c1.job.started_at).toBe(new Date(1_000).toISOString());
    expect(sceneLocks.holder(db, "scn_1")).toBe(a.id);
    expect(jobs.get(db, a.id)).toEqual(c1.job);
  });

  it("пустая очередь и занятые слоты → undefined", () => {
    const { db } = env;
    expect(claimNext(db, "srv", 0, idle)).toBeUndefined();
    enqueue(db, req());
    expect(claimNext(db, "srv", 0, { running: 2, maxRunning: 2 })).toBeUndefined();
    expect(jobs.list(db)[0]!.status).toBe("pending");
  });

  it("SCENE_WRITING_TYPES — generate, edit, restore", () => {
    expect([...SCENE_WRITING_TYPES]).toEqual(["playground.generate", "playground.edit", "scene.restore"]);
  });

  it("две правки одной сцены: вторая ждёт замок; export той же сцены не ждёт", () => {
    const { db } = env;
    const e1 = enqueue(db, edit("scn_1", "e1")).job;
    enqueue(db, edit("scn_1", "e2"));
    enqueue(db, job("scene.export", "scn_1", "x1"));
    expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("e1");
    // e2 пропущена из-за замка — следующей берётся export той же сцены
    expect(claimNext(db, "srv", 0, idle)!.job.type).toBe("scene.export");
    expect(claimNext(db, "srv", 0, idle)).toBeUndefined();
    expect(finish(db, e1.id, 1, { status: "completed", outputRefs: {} })).toBe(true);
    expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
    const e2 = claimNext(db, "srv", 0, idle)!;
    expect(e2.job.idempotency_key).toBe("e2");
    expect(sceneLocks.holder(db, "scn_1")).toBe(e2.job.id);
  });

  it("правка и откат одной сцены не идут параллельно; другая сцена свободна", () => {
    const { db } = env;
    enqueue(db, edit("scn_1", "e1"));
    enqueue(db, job("scene.restore", "scn_1", "r1"));
    enqueue(db, edit("scn_2", "e3"));
    expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("e1");
    expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("e3");
    expect(claimNext(db, "srv", 0, { running: 0, maxRunning: 5 })).toBeUndefined();
  });

  it("export не берёт замок сцены — правка той же сцены идёт параллельно", () => {
    const { db } = env;
    enqueue(db, job("scene.export", "scn_1", "x1"));
    enqueue(db, edit("scn_1", "e1"));
    expect(claimNext(db, "srv", 0, idle)!.job.type).toBe("scene.export");
    expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
    expect(claimNext(db, "srv", 0, idle)!.job.type).toBe("playground.edit");
  });

  it("types: берёт только задачи с обработчиком", () => {
    const { db } = env;
    enqueue(db, edit("scn_1", "e1"));
    enqueue(db, job("scene.export", "scn_2", "x1"));
    expect(claimNext(db, "cli", 0, idle, { types: ["scene.export"] })!.job.type).toBe("scene.export");
    expect(claimNext(db, "cli", 0, idle, { types: ["scene.export"] })).toBeUndefined();
  });
});

describe("fencing", () => {
  it("heartbeat продлевает lease; устаревшая попытка — false, ничего не пишет", () => {
    const { db } = env;
    enqueue(db, req());
    const c1 = claimNext(db, "srv", 0, idle)!;
    expect(heartbeat(db, c1.job.id, 1, 5_000)).toBe(true);
    expect(jobs.get(db, c1.job.id)!.lease_until).toBe(new Date(5_000 + LEASE_MS).toISOString());
    expect(fenceOk(db, c1.job.id, 1)).toBe(true);
    db.prepare("UPDATE jobs SET attempt = 2 WHERE id = ?").run(c1.job.id);
    expect(fenceOk(db, c1.job.id, 1)).toBe(false);
    expect(heartbeat(db, c1.job.id, 1, 10)).toBe(false);
    expect(jobs.get(db, c1.job.id)!.lease_until).toBe(new Date(5_000 + LEASE_MS).toISOString());
    expect(finish(db, c1.job.id, 1, { status: "completed", outputRefs: {} })).toBe(false);
    expect(jobs.get(db, c1.job.id)!.status).toBe("running");
    expect(sceneLocks.holder(db, "scn_1")).toBe(c1.job.id);
    expect(fenceOk(db, "job_nope", 1)).toBe(false);
  });

  it("finish не проходит для задачи не в running (попытка снята восстановлением)", () => {
    const { db } = env;
    enqueue(db, req());
    const c1 = claimNext(db, "srv", 0, idle)!;
    jobs.update(db, c1.job.id, { status: "pending" });
    expect(fenceOk(db, c1.job.id, 1)).toBe(false);
    expect(finish(db, c1.job.id, 1, { status: "failed", error: { code: "pipeline", message: "x" } })).toBe(false);
    expect(jobs.get(db, c1.job.id)!.status).toBe("pending");
  });
});

describe("finish", () => {
  it("completed: output_refs, progress 1, finished_at, lease снят", () => {
    const { db } = env;
    enqueue(db, req());
    const c = claimNext(db, "srv", 0, idle)!;
    expect(finish(db, c.job.id, 1, { status: "completed", outputRefs: { versionId: "ver_1" } })).toBe(true);
    const j = jobs.get(db, c.job.id)!;
    expect(j).toMatchObject({ status: "completed", output_refs: { versionId: "ver_1" }, progress: 1, lease_owner: null, lease_until: null, error: null });
    expect(j.finished_at).not.toBeNull();
    expect(finish(db, c.job.id, 1, { status: "completed", outputRefs: {} })).toBe(false);
  });

  it("failed: ошибка пишется, замок снят", () => {
    const { db } = env;
    enqueue(db, req());
    const c = claimNext(db, "srv", 0, idle)!;
    expect(finish(db, c.job.id, 1, { status: "failed", error: { code: "pipeline", stage: "engineer", message: "нет кода" } })).toBe(true);
    expect(jobs.get(db, c.job.id)).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "engineer" } });
    expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
  });
});

describe("awaiting_input", () => {
  const questions = [{ question: "Какой акцент?", default_if_skipped: "синий" }];

  it("замок снят, вопросы в output_refs; provideInput → pending, ответы в input; новый захват — attempt 2, interrupts 0", () => {
    const { db } = env;
    enqueue(db, req({ input: { prompt: "p" } }));
    const c1 = claimNext(db, "srv", 0, idle)!;
    expect(finish(db, c1.job.id, 1, { status: "awaiting_input", questions })).toBe(true);
    expect(jobs.get(db, c1.job.id)).toMatchObject({ status: "awaiting_input", output_refs: { questions }, finished_at: null, lease_owner: null });
    expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
    // сцена свободна: правка той же сцены может идти
    enqueue(db, edit("scn_1", "e1"));
    const e = claimNext(db, "srv", 0, idle)!;
    expect(e.job.idempotency_key).toBe("e1");
    finish(db, e.job.id, 1, { status: "completed", outputRefs: {} });

    const p = provideInput(db, c1.job.id, { "0": "красный" });
    expect(p).toMatchObject({ status: "pending", input: { prompt: "p", answers: { "0": "красный" } } });
    const c2 = claimNext(db, "srv", 0, idle)!;
    expect(c2).toMatchObject({ attempt: 2, job: { id: c1.job.id, attempt: 2, interrupts: 0, max_attempts: 3, status: "running" } });
  });

  it("skip; provideInput не для awaiting_input — ошибка", () => {
    const { db } = env;
    enqueue(db, req());
    const c1 = claimNext(db, "srv", 0, idle)!;
    expect(() => provideInput(db, c1.job.id, "skip")).toThrow(/job_not_awaiting_input/);
    finish(db, c1.job.id, 1, { status: "awaiting_input", questions });
    expect(provideInput(db, c1.job.id, "skip").input).toMatchObject({ answers: "skip" });
    expect(() => provideInput(db, "job_nope", "skip")).toThrow(/job_not_found/);
  });
});
