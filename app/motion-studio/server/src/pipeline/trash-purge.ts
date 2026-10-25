// Задача `trash.purge` (Task 47): очистка корзины после второго подтверждения.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type TrashPurgeDeps = Phase46Deps;

export const trashPurge: (depsOf: () => TrashPurgeDeps) => JobHandler = () => async () => notImplemented("47");
