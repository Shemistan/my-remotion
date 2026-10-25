// Задача `cache.gc` (Task 49a): уборка кэша кадров и мастеров до `cache.maxBytes`.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type CacheGcDeps = Phase46Deps;

export const cacheGc: (depsOf: () => CacheGcDeps) => JobHandler = () => async () => notImplemented("49a");
