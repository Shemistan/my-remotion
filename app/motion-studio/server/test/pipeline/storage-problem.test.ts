// H2: разовая проверка хранилища между шагами (`storageProblem`) не принимает медленную
// пробу тома за пропажу диска: неокончательный отказ перепроверяется, окончательный — сразу.
import { INCONCLUSIVE_LIMIT, type StorageStatus } from "@ms/core";
import { expect, it, vi } from "vitest";
import { RunCtx, type StepDeps } from "../../src/pipeline/steps.js";

const ok: StorageStatus = { ok: true, root: "/r", marker: { schema_version: 1, store_id: "s", volume_uuid: "v", created_at: "t" }, freeBytes: 1 };
const slow: StorageStatus = { ok: false, reason: "volume_probe_failed", detail: "том: Command failed: diskutil info -plist" };
const gone: StorageStatus = { ok: false, reason: "not_found", detail: "каталог не найден: /r" };

const ctx = (storage: () => Promise<StorageStatus>) => new RunCtx({ storage } as unknown as StepDeps, undefined, "/r", "run", 1, undefined);

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
