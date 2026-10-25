// Зависимости обработчиков Phase 4–6 (Task 35′): реестр `handlers.ts` правит только 35′, поэтому
// фабрики заглушек получают всё сразу — службы ядра, опции регистрации (подмены тестов) и экспорт
// версии. Задача, заменяющая заглушку, берёт отсюда нужное; сигнатуру фабрики не меняет.
import type { CoreServices } from "../boot.js";
import type { HandlerOptions } from "../jobs/handlers.js";
import type { HandlerResult } from "../jobs/types.js";
import type { SceneExportDeps } from "./scene-export.js";

export interface Phase46Deps {
  svc: CoreServices;
  options: HandlerOptions;
  /** Экспорт версии (как у `scene.export` и `script.package`). */
  exporter: SceneExportDeps;
}

/** Ответ заглушки: задача честно падает с номером задачи плана, которая её реализует. */
export function notImplemented(task: string): HandlerResult {
  return { status: "failed", error: { code: "pipeline", stage: "prepare", message: `не реализовано: Task ${task}` } };
}
