// H2: разовая проверка хранилища между шагами (`storageProblem`) не принимает медленную
// пробу тома за пропажу диска: неокончательный отказ перепроверяется, окончательный — сразу.
import { INCONCLUSIVE_LIMIT, type StorageStatus } from "@ms/core";
import { expect, it, vi } from "vitest";
import { RunCtx, type StepDeps } from "../../src/pipeline/steps.js";

const ok: StorageStatus = { ok: true, root: "/r", marker: { schema_version: 1, store_id: "s", volume_uuid: "v", created_at: "t" }, freeBytes: 1 };
const slow: StorageStatus = { ok: false, reason: "volume_probe_failed", detail: "том: Command failed: diskutil info -plist" };
const gone: StorageStatus = { ok: false, reason: "not_found", detail: "каталог не найден: /r" };

const ctx = (storage: () => Promise<StorageStatus>, storageRetryBackoffMs = 0) => new RunCtx({ storage, storageRetryBackoffMs } as unknown as StepDeps, undefined, "/r", "run", 1, undefined);

it("inconclusive failures below the limit are re-checked, not reported", async () => {
  const storage = vi.fn<() => Promise<StorageStatus>>().mockResolvedValueOnce(slow).mockResolvedValueOnce(slow).mockResolvedValue(ok);
  expect(await ctx(storage).storageProblem()).toBeUndefined();
  expect(storage).toHaveBeenCalledTimes(3);
});

it("INCONCLUSIVE_LIMIT inconclusive failures in a row are a problem", async () => {
  const storage = vi.fn<() => Promise<StorageStatus>>().mockResolvedValue(slow);
  expect(await ctx(storage).storageProblem()).toMatch(/volume_probe_failed/);
  expect(storage).toHaveBeenCalledTimes(INCONCLUSIVE_LIMIT);
});

it("a conclusive failure is reported at once", async () => {
  const storage = vi.fn<() => Promise<StorageStatus>>().mockResolvedValueOnce(slow).mockResolvedValue(gone);
  expect(await ctx(storage).storageProblem()).toMatch(/not_found/);
  expect(storage).toHaveBeenCalledTimes(2);
});

it("re-checks are separated by the backoff, not fired back to back", async () => {
  vi.useFakeTimers();
  try {
    const storage = vi.fn<() => Promise<StorageStatus>>().mockResolvedValueOnce(slow).mockResolvedValueOnce(slow).mockResolvedValue(ok);
    const p = ctx(storage, 1500).storageProblem();
    await vi.advanceTimersByTimeAsync(0);
    expect(storage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499);
    expect(storage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(storage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toBeUndefined();
    expect(storage).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

it("a conclusive failure is not delayed by the backoff", async () => {
  vi.useFakeTimers();
  try {
    const storage = vi.fn<() => Promise<StorageStatus>>().mockResolvedValue(gone);
    expect(await ctx(storage, 1500).storageProblem()).toMatch(/not_found/);
  } finally {
    vi.useRealTimers();
  }
});
