// Задача `final.reproduce` (Task 43): повтор экспорта по `final-manifest.json` и сравнение.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type FinalReproduceDeps = Phase46Deps;

export const finalReproduce: (depsOf: () => FinalReproduceDeps) => JobHandler = () => async () => notImplemented("43");
