// Бюджет сцены (rulings п. 15): оркестратор суммирует фактический `usage.costUsd`
// вызовов; новый вызов агента разрешён, пока потрачено меньше `scene.maxCostUsd`.
// Один вызов может перерасходовать (`--max-budget-usd` не режет ход) — это допустимо.
import type { AppConfig } from "../config.js";

export function canSpend(spentUsd: number, config: AppConfig): boolean {
  return spentUsd < config.scene.maxCostUsd;
}
