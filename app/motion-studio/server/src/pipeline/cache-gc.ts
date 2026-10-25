// Задача `cache.gc` (Task 49a): уборка кэша кадров, бандлов и мастеров до `cache.maxBytes`
// (`gcCache`, что удаляется и что защищено — в `perf/cache-gc.ts`). Вход `{ maxBytes? }` — вместо
// лимита из config.json (кнопка «Убрать кэш» шлёт без него). Ставится кнопкой
// (`POST /api/cache/gc`) и раз в сутки при простое (`startCacheGcSchedule`). Хранилище недоступно —
// отказ до любого удаления.
import { z } from "zod";
import type { JobHandler } from "../jobs/types.js";
import { gcCache } from "../perf/cache-gc.js";
import type { Phase46Deps } from "./phase46-deps.js";

export type CacheGcDeps = Phase46Deps;

const InputSchema = z.object({ maxBytes: z.number().int().min(0).optional() }).passthrough();

export const cacheGc: (depsOf: () => CacheGcDeps) => JobHandler = (depsOf) => async (ctx) => {
  const parsed = InputSchema.safeParse(ctx.job.input ?? {});
  if (!parsed.success) return { status: "failed", error: { code: "pipeline", stage: "prepare", message: `cache.gc: неверный вход: ${parsed.error.message}` } };
  const { svc } = depsOf();
  const status = await svc.storageCheck().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: (e as Error).message }));
  if (!status.ok) {
    return { status: "failed", error: { code: "storage_unavailable", stage: "storage", message: `cache.gc: хранилище недоступно — кэш не трогается` } };
  }
  const maxBytes = parsed.data.maxBytes ?? svc.config.cache.maxBytes;
  ctx.progress(0.05, "scan");
  const r = await gcCache(svc.root, ctx.db, { maxBytes, selfJobId: ctx.job.id, signal: ctx.signal, onProgress: (p) => ctx.progress(0.1 + 0.9 * p, "remove") });
  if (ctx.signal.aborted) return { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "задача отменена" } };
  ctx.emit("cache_gc", `уборка кэша: удалено ${r.removed.length}, освобождено ${r.freedBytes} байт, осталось ${r.keptBytes} из лимита ${maxBytes}`, {
    count: r.removed.length, freed_bytes: r.freedBytes, kept_bytes: r.keptBytes, total_bytes: r.totalBytes, max_bytes: maxBytes,
    protected_count: r.protected.length, packages_bytes: r.packagesBytes, leftovers: r.leftovers,
  });
  ctx.progress(1, "done");
  return {
    status: "completed",
    outputRefs: {
      removed: r.removed.length, freed_bytes: r.freedBytes, kept_bytes: r.keptBytes, total_bytes: r.totalBytes, max_bytes: maxBytes,
      protected: r.protected.length, packages_bytes: r.packagesBytes, leftovers: r.leftovers,
    },
  };
};
