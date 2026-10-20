import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StorageStatus } from "../../src/storage/guard.js";
import { watchStorage } from "../../src/storage/watch.js";

const okStatus: StorageStatus = {
  ok: true,
  root: "/r",
  marker: { schema_version: 1, store_id: "s", volume_uuid: "v", created_at: "t" },
  freeBytes: 1,
};
const failStatus: StorageStatus = { ok: false, reason: "not_found", detail: "диск отключён" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("watchStorage aborts on first failure", async () => {
  const failingOnSecondCall = vi
    .fn<() => Promise<StorageStatus>>()
    .mockResolvedValueOnce(okStatus)
    .mockResolvedValue(failStatus);
  const w = watchStorage(failingOnSecondCall, 20);
  await vi.advanceTimersByTimeAsync(60);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ ok: false });
  expect(w.signal.reason).toBeInstanceOf(Error);
  expect(String(w.signal.reason)).toMatch(/storage: not_found/);
  // после сбоя сторож больше не проверяет
  expect(failingOnSecondCall).toHaveBeenCalledTimes(2);
});

it("keeps watching while checks pass and stops on demand", async () => {
  const check = vi.fn<() => Promise<StorageStatus>>().mockResolvedValue(okStatus);
  const w = watchStorage(check, 20);
  await vi.advanceTimersByTimeAsync(100);
  expect(check).toHaveBeenCalledTimes(5);
  expect(w.signal.aborted).toBe(false);
  expect(w.lastFailure()).toBeUndefined();
  w.stop();
  await vi.advanceTimersByTimeAsync(100);
  expect(check).toHaveBeenCalledTimes(5);
});

it("treats a throwing check as a failure", async () => {
  const w = watchStorage(() => Promise.reject(new Error("boom")), 20);
  await vi.advanceTimersByTimeAsync(20);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ ok: false, detail: expect.stringMatching(/boom/) });
});

it("does not overlap slow checks that finish within the deadline", async () => {
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const slow = async (): Promise<StorageStatus> => {
    calls++;
    maxRunning = Math.max(maxRunning, ++running);
    await new Promise((r) => setTimeout(r, 50)); // дольше интервала, короче дедлайна
    running--;
    return okStatus;
  };
  const w = watchStorage(slow, 20);
  await vi.advanceTimersByTimeAsync(200);
  w.stop();
  expect(maxRunning).toBe(1);
  expect(calls).toBeGreaterThan(1);
  expect(w.signal.aborted).toBe(false);
});

it("aborts when a check never settles", async () => {
  const hung = vi.fn(() => new Promise<StorageStatus>(() => undefined));
  const w = watchStorage(hung, 20);
  await vi.advanceTimersByTimeAsync(20 + 3 * 20);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ ok: false, detail: expect.stringMatching(/не ответила/) });
  expect(hung).toHaveBeenCalledTimes(1);
});

it("an in-flight check cannot abort after stop()", async () => {
  let settle: (s: StorageStatus) => void = () => undefined;
  const w = watchStorage(() => new Promise<StorageStatus>((r) => (settle = r)), 20);
  await vi.advanceTimersByTimeAsync(20);
  w.stop();
  settle(failStatus);
  await vi.advanceTimersByTimeAsync(200);
  expect(w.signal.aborted).toBe(false);
  expect(w.lastFailure()).toBeUndefined();
});
