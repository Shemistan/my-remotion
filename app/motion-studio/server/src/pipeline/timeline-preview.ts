// Задача `timeline.preview` (Task 42): превью ревизии таймлайна одной композицией `ProjectTimeline`.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type TimelinePreviewDeps = Phase46Deps;

export const timelinePreview: (depsOf: () => TimelinePreviewDeps) => JobHandler = () => async () => notImplemented("42");
