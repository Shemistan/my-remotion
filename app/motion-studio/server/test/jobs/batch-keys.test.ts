// Task 38-39: общие ключи пакетов сцен. Снимок id пакетов и ключей задач сценария снят ДО выноса
// помощников из `script/batch.ts` — после выноса те же строки (сценарный трек не меняется).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { finish } from "../../src/jobs/queue.js";
import { enqueue } from "../../src/jobs/queue.js";
import { keyPrefix, nextTryKey, requestTag } from "../../src/jobs/batch-keys.js";
import { SCRIPT_BATCH_PREFIX, reframeRequestTag, sceneJobKey, scriptRequestTag } from "../../src/script/batch.js";
import { removeStore } from "../db/helpers.js";
import { type JobsEnv, setupDb } from "../jobs/helpers.js";

describe("ключи пакетов сценария — снимок до выноса", () => {
  it("id пакетов генерации и двойников, ключ задачи сцены — прежние строки", () => {
    const kp = (k: string) => keyPrefix("p_batch", k, SCRIPT_BATCH_PREFIX);
    expect(kp("k1")).toBe("sb_85c68e42d90aa1c9a345");
    expect(`${kp("k1")}${scriptRequestTag({ revision: 3 }, "16:9")}`).toBe("sb_85c68e42d90aa1c9a345ee87a136d0");
    expect(`${kp("q1")}${scriptRequestTag({ revision: 3, itemIds: ["ss_002", "ss_001", "ss_001"], regenerate: true }, "16:9")}`).toBe("sb_5d73015b87a95479cb5dd379b53494");
    expect(`${kp("r1")}${reframeRequestTag(undefined)}`).toBe("sb_cd9f0f336ab38c075ec89090a7d76f");
    expect(`${kp("r2")}${reframeRequestTag(["ss_002", "ss_001"])}`).toBe("sb_61ce359b9286479e85334ccc66f455");
    expect(sceneJobKey({ planId: "pln_b", revision: 3, itemId: "ss_001", aspect: "16:9", styleRevision: 2, tryN: 1, regenK: 2 })).toBe("script:pln_b@r3:ss_001:16:9:s2:try-1:regen-2");
  });

  it("requestTag — sha256 тела как есть (порядок полей — часть отпечатка)", () => {
    expect(requestTag({ a: 1, b: 2 })).toHaveLength(10);
    expect(requestTag({ a: 1, b: 2 })).not.toBe(requestTag({ b: 2, a: 1 }));
    expect(keyPrefix("p", "k", "vb")).toMatch(/^vb_[0-9a-f]{20}$/);
    expect(keyPrefix("p", "k", "vb").slice(3)).toBe(keyPrefix("p", "k", "sb").slice(3));
  });
});

describe("nextTryKey", () => {
  let env: JobsEnv;
  beforeEach(async () => {
    env = await setupDb("ms-batch-keys-");
    projects.create(env.db, { id: "p1", kind: "video", title: "т" });
  });
  afterEach(async () => {
    env.db.close();
    await removeStore(env.s);
  });
  const keyOf = (n: number | undefined) => `k${n ? `:try-${n}` : ""}`;
  const put = (key: string, status?: "failed" | "completed") => {
    const j = enqueue(env.db, { type: "scene.preview_context", projectId: "p1", input: { key }, idempotencyKey: key }).job;
    if (status) {
      env.db.prepare("UPDATE jobs SET status = 'running', attempt = 1 WHERE id = ?").run(j.id);
      finish(env.db, j.id, 1, status === "failed" ? { status: "failed", error: { code: "pipeline", message: "x" } } : { status: "completed", outputRefs: null });
    }
    return j;
  };

  it("первая задача — ключ без номера; повтор после упавшей — :try-<prior>; занятый завершённой — следующий номер", () => {
    expect(nextTryKey(env.db, keyOf, 0, { retry: false })).toBe("k");
    put("k", "failed");
    expect(nextTryKey(env.db, keyOf, 1, { retry: true })).toBe("k:try-1");
    put("k:try-1", "completed");
    expect(nextTryKey(env.db, keyOf, 2, { retry: true })).toBe("k:try-2");
    // ключ без номера занят завершённой задачей без версии — номер появляется и без retry
    expect(nextTryKey(env.db, keyOf, 2, { retry: false })).toBe("k:try-3");
  });

  it("идущая задача по ключу — тот же ключ (очередь вернёт её); supersede — следующий номер", () => {
    const j = put("k");
    expect(jobsRepo.get(env.db, j.id)!.status).toBe("pending");
    expect(nextTryKey(env.db, keyOf, 1, { retry: false })).toBe("k");
    expect(nextTryKey(env.db, keyOf, 1, { retry: false, supersede: true })).toBe("k:try-1");
  });
});
