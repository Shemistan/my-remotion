// Задача `scene.preview_context` (Task 38-39): превью версии сцены поверх исходника с полями `video.contextPadFrames`.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type ScenePreviewContextDeps = Phase46Deps;

export const scenePreviewContext: (depsOf: () => ScenePreviewContextDeps) => JobHandler = () => async () => notImplemented("38-39");
