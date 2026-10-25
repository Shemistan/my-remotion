// Задача `timeline.build` (Task 42): сборка ревизии таймлайна из EDL, плана и утверждённых версий (`composeTimeline`).
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type TimelineBuildDeps = Phase46Deps;

export const timelineBuild: (depsOf: () => TimelineBuildDeps) => JobHandler = () => async () => notImplemented("42");
