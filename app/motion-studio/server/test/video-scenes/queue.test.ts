// Task 38-39: позиция задачи в очереди («в очереди за …»): задачи над одной сценой идут по
// очереди замка сцены, над разными — параллельно.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { JobHandler } from "../../src/jobs/types.js";
import { queuePosition } from "../../src/video-scenes/queue.js";
import { removeStore } from "../db/helpers.js";
import { deferred, edit, setupDb, until, type JobsEnv } from "../jobs/helpers.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-queue-pos-");
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  env.db.close();
  await removeStore(env.s);
});

describe("queuePosition", () => {
  it("две правки одной сцены: вторая ahead = 1 за первой; правка другой сцены — ahead 0; интервалы одной сцены не пересекаются", async () => {
    const a = enqueue(env.db, edit("scn_1", "k1")).job;
    const b = enqueue(env.db, edit("scn_1", "k2")).job;
    const c = enqueue(env.db, edit("scn_2", "k3")).job;
    expect(queuePosition(env.db, a.id)).toEqual({ ahead: 0 });
    expect(queuePosition(env.db, b.id)).toEqual({ ahead: 1, blockingJobId: a.id });
    expect(queuePosition(env.db, c.id)).toEqual({ ahead: 0 });

    const spans: Record<string, [number, number]> = {};
    const gate = deferred();
    const handler: JobHandler = async (ctx) => {
      const t0 = performance.now();
      if (ctx.job.id === a.id) await gate.promise;
      else await new Promise((r) => setTimeout(r, 20));
      spans[ctx.job.id] = [t0, performance.now()];
      return { status: "completed", outputRefs: null };
    };
    runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.edit": handler }, pollMs: 5, maxRunning: 2 });
    runner.start();
    await until(() => jobs.get(env.db, a.id)!.status === "running" && jobs.get(env.db, c.id)!.status !== "pending", "a и c взяты", 5_000);
    expect(jobs.get(env.db, b.id)!.status).toBe("pending");
    expect(queuePosition(env.db, b.id)).toEqual({ ahead: 1, blockingJobId: a.id });
    gate.resolve();
    await until(() => [a, b, c].every((j) => jobs.get(env.db, j.id)!.status === "completed"), "все завершены", 5_000);
    expect(spans[b.id]![0]).toBeGreaterThanOrEqual(spans[a.id]![1]);
    expect(queuePosition(env.db, b.id)).toEqual({ ahead: 0 });
  });

  it("три задачи одной сцены: третья — за двумя (держит замок первая)", () => {
    const a = enqueue(env.db, edit("scn_1", "q1")).job;
    enqueue(env.db, edit("scn_1", "q2"));
    const c = enqueue(env.db, edit("scn_1", "q3")).job;
    expect(queuePosition(env.db, c.id)).toEqual({ ahead: 2, blockingJobId: a.id });
    expect(queuePosition(env.db, "job_нет")).toEqual({ ahead: 0 });
  });
});
