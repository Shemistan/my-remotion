// Задача `final.render` (Task 43): финальный рендер: гейт, master, звук, композиция, проверка, публикация.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type FinalRenderDeps = Phase46Deps;

export const finalRender: (depsOf: () => FinalRenderDeps) => JobHandler = () => async () => notImplemented("43");
