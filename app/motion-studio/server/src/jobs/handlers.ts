import type { Handlers } from "./types.js";

/**
 * Точка регистрации обработчиков пайплайнов: Task 17–19 дописывают сюда по строке
 * (`"playground.generate": playgroundGenerate` и т. д.); `extra` — для тестов и CLI.
 */
export function registerHandlers(extra: Handlers = {}): Handlers {
  return {
    ...extra,
  };
}
