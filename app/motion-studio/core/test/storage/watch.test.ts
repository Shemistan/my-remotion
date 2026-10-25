import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StorageStatus } from "../../src/storage/guard.js";
import { INCONCLUSIVE_LIMIT, watchStorage } from "../../src/storage/watch.js";

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

it("a hung check is inconclusive: aborts after INCONCLUSIVE_LIMIT deadlines, not the first", async () => {
  const hung = vi.fn(() => new Promise<StorageStatus>(() => undefined));
  const w = watchStorage(hung, 20);
  // первый дедлайн (раньше — сразу offline) уже не прерывает
  await vi.advanceTimersByTimeAsync(20 + 3 * 20 + 10);
  expect(w.signal.aborted).toBe(false);
  // бюджет: интервал + 3 дедлайна + 2 интервала до следующих тиков
  await vi.advanceTimersByTimeAsync(20 + 3 * (3 * 20) + 2 * 20 - 90);
  expect(w.signal.aborted).toBe(true);
  // повисшая проверка (diskutil) — своя причина, не «диск не найден»
  expect(w.lastFailure()).toMatchObject({ ok: false, reason: "storage_watch_timeout", detail: expect.stringMatching(/не ответила/) });
  expect(String(w.signal.reason)).toMatch(/storage: storage_watch_timeout/);
  expect(hung).toHaveBeenCalledTimes(INCONCLUSIVE_LIMIT);
});

const slowProbe: StorageStatus = { ok: false, reason: "volume_probe_failed", detail: "diskutil не ответил за 20000 мс" };

it("inconclusive failures below the limit never abort; a passing check resets the streak", async () => {
  const seq = [slowProbe, slowProbe, okStatus, slowProbe, slowProbe, okStatus];
  let i = 0;
  const check = vi.fn(async () => seq[i++ % seq.length]!);
  const w = watchStorage(check, 20);
  await vi.advanceTimersByTimeAsync(20 * 60);
  expect(check).toHaveBeenCalledTimes(60);
  expect(w.signal.aborted).toBe(false);
  expect(w.lastFailure()).toBeUndefined();
  w.stop();
});

it("INCONCLUSIVE_LIMIT consecutive inconclusive failures abort with the last one", async () => {
  const check = vi.fn<() => Promise<StorageStatus>>().mockResolvedValueOnce(okStatus).mockResolvedValue(slowProbe);
  const w = watchStorage(check, 20);
  await vi.advanceTimersByTimeAsync(20 * INCONCLUSIVE_LIMIT);
  expect(w.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(20);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ reason: "volume_probe_failed" });
  expect(check).toHaveBeenCalledTimes(1 + INCONCLUSIVE_LIMIT);
});

it("a conclusive failure aborts at once, even after inconclusive ones", async () => {
  const check = vi.fn<() => Promise<StorageStatus>>().mockResolvedValueOnce(slowProbe).mockResolvedValue(failStatus);
  const w = watchStorage(check, 20);
  await vi.advanceTimersByTimeAsync(40);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ reason: "not_found" });
  expect(check).toHaveBeenCalledTimes(2);
});

it("a changed st_dev of the root is conclusive (volume remounted under running jobs)", async () => {
  const check = vi
    .fn<() => Promise<StorageStatus>>()
    .mockResolvedValueOnce({ ...okStatus, dev: 7 })
    .mockResolvedValueOnce({ ...slowProbe, dev: 7 })
    .mockResolvedValue({ ...slowProbe, dev: 9 });
  const w = watchStorage(check, 20);
  await vi.advanceTimersByTimeAsync(60);
  expect(w.signal.aborted).toBe(true);
  expect(w.lastFailure()).toMatchObject({ reason: "volume_mismatch", detail: expect.stringMatching(/st_dev 7 → 9/) });
  expect(check).toHaveBeenCalledTimes(3);
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
