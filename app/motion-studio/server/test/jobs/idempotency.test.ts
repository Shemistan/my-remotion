import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { tx } from "../../src/db/tx.js";
import { IdempotencyKeyReusedError, canonicalJson, enqueue, inputHash } from "../../src/jobs/queue.js";
import { req, setupDb, teardownDb, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
beforeEach(async () => { env = await setupDb("ms-jobs-idem-"); });
afterEach(async () => { await teardownDb(env); });

it("тот же ключ и тот же вход → существующая задача, created: false", () => {
  const { db } = env;
  const a = enqueue(db, req({ idempotencyKey: "k" }));
  const b = enqueue(db, req({ idempotencyKey: "k" }));
  expect(a.created).toBe(true);
  expect(a.job).toMatchObject({ status: "pending", attempt: 0, max_attempts: 3, interrupts: 0, idempotency_key: "k", scene_id: "scn_1" });
  expect(a.job.id).toMatch(/^job_/);
  expect(b).toMatchObject({ created: false, job: { id: a.job.id } });
  expect(jobs.list(db)).toHaveLength(1);
});

it("тот же ключ, другой вход или тип → idempotency_key_reused (M15)", () => {
  const { db } = env;
  enqueue(db, req({ idempotencyKey: "k" }));
  expect(() => enqueue(db, req({ idempotencyKey: "k", input: { other: 1 } }))).toThrow(/idempotency_key_reused/);
  expect(() => enqueue(db, req({ idempotencyKey: "k", type: "playground.edit" }))).toThrow(IdempotencyKeyReusedError);
  expect(jobs.list(db)).toHaveLength(1);
});

it("input_hash не зависит от порядка ключей; зависит от типа", () => {
  expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
  expect(inputHash("scene.export", { a: 1, b: 2 })).toBe(inputHash("scene.export", { b: 2, a: 1 }));
  expect(inputHash("scene.export", { a: 1 })).not.toBe(inputHash("scene.restore", { a: 1 }));
  const { db } = env;
  const a = enqueue(db, req({ idempotencyKey: "k", input: { a: 1, b: 2 } }));
  expect(enqueue(db, req({ idempotencyKey: "k", input: { b: 2, a: 1 } }))).toMatchObject({ created: false, job: { id: a.job.id } });
  expect(a.job.input_hash).toBe(inputHash("playground.generate", { a: 1, b: 2 }));
});

it("сцена и задача — одной транзакцией: сбой после enqueue откатывает обе (M15)", () => {
  const { db } = env;
  expect(() => tx(db, () => {
    scenes.create(db, { id: "scn_new", project_id: "playground", title: "Новая" });
    enqueue(db, req({ sceneId: "scn_new", idempotencyKey: "k2" }));
    throw new Error("сбой");
  })).toThrow("сбой");
  expect(scenes.get(db, "scn_new")).toBeUndefined();
  expect(jobs.findByIdempotencyKey(db, "k2")).toBeUndefined();
});

it("задача, пишущая в сцену, без sceneId — ошибка; maxAttempts и parent пишутся", () => {
  const { db } = env;
  expect(() => enqueue(db, req({ sceneId: undefined, idempotencyKey: "x" }))).toThrow(/scene_id/);
  const p = enqueue(db, req({ idempotencyKey: "p" })).job;
  const c = enqueue(db, { type: "scene.export", projectId: "playground", sceneId: "scn_1", parentJobId: p.id, input: {}, idempotencyKey: "c", maxAttempts: 5 }).job;
  expect(c).toMatchObject({ parent_job_id: p.id, max_attempts: 5, type: "scene.export" });
});
