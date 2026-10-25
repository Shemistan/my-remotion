// Задача `video.package` (Task 5L): папка клипов видеопроекта (MP4 + ProRes 4444 с альфой + шпаргалка таймкодов), механизм `script.package`/`exportOne`.
// Task 35′ — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";
import { type Phase46Deps, notImplemented } from "./phase46-deps.js";

export type VideoPackageDeps = Phase46Deps;

export const videoPackage: (depsOf: () => VideoPackageDeps) => JobHandler = () => async () => notImplemented("5L");
