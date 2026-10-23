// Настройки приложения — `$MS_DATA_DIR/config.json` (модели ролей, лимиты, настройки сцены по
// умолчанию). PUT сливает тело с файлом (объекты — глубоко, прочие значения заменяются), проверяет
// итог расширенным FileSchema (M12) и пишет атомарно. Ядро читает config.json при старте: новые
// значения действуют после перезапуска; GET показывает файл, а не память процесса.
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { AppSettingsDtoSchema, type AppSettingsDto } from "@ms/contracts";
import { z } from "zod";
import { type AppConfig, configFileIssues, loadConfig, readConfigFile } from "../../config.js";
import { fsyncWrite } from "../../scenes/store.js";
import type { ApiContext, ZApp } from "../context.js";
import { ApiError } from "../errors.js";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** Глубокое слияние объектов JSON: `patch` поверх `base`. */
export function mergeJson(base: Json, patch: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? mergeJson(out[k] as Json, v) : v;
  return out;
}

const toDto = (c: AppConfig): AppSettingsDto => ({
  agents: c.agents,
  scene: { maxCostUsd: c.scene.maxCostUsd, maxAutoFixes: c.scene.maxAutoFixes },
  limits: c.limits,
  defaults: c.defaults,
});

export function settingsRoutes(app: ZApp, { core }: ApiContext): void {
  const env = { MS_DATA_DIR: core.root };
  const fileNow = async (): Promise<Json> => {
    const f = await readConfigFile(core.root);
    return isObj(f) ? f : {};
  };

  app.get("/api/settings", { schema: { response: { 200: AppSettingsDtoSchema } } }, async () => toDto(loadConfig(env, await fileNow())));

  app.put("/api/settings", { schema: { body: z.record(z.unknown()), response: { 200: AppSettingsDtoSchema } } }, async (req) => {
    const next = mergeJson(await fileNow(), req.body);
    const issues = configFileIssues(next);
    if (issues.length > 0) throw new ApiError(400, "validation", issues.map((i) => `${i.path}: ${i.message}`).join("; "), { issues });
    const config = loadConfig(env, next);
    const path = join(core.root, "config.json");
    const tmp = `${path}.tmp-${process.pid}`;
    await fsyncWrite(tmp, `${JSON.stringify(next, null, 2)}\n`);
    await rename(tmp, path);
    return toDto(config);
  });
}
