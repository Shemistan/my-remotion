// Задача `script.plan` (трек A, S3): Script Director → проверки → стиль → ревизия плана сценария.
// S1 — заглушка: обработчик зарегистрирован, тело не реализовано.
import type { JobHandler } from "../jobs/types.js";

/** Зависимости обработчика (поля задаёт S3). */
export type ScriptPlanDeps = Record<string, unknown>;

export const scriptPlan: (depsOf: () => ScriptPlanDeps) => JobHandler = () => async () => ({
  status: "failed", error: { code: "pipeline", stage: "prepare", message: "not_implemented" },
});
