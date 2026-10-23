// Настройки приложения: `$MS_DATA_DIR/config.json` (модели ролей, limits, defaults: Settings),
// валидация расширенным FileSchema (M12); слияние с тем, что уже в файле.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AppSettingsDtoSchema, defaultSettings } from "@ms/contracts";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

const file = () => JSON.parse(readFileSync(join(api.s.root, "config.json"), "utf8"));

it("GET /settings — действующие настройки с умолчаниями", async () => {
  const r = await api.inj("GET", "/api/settings", getHeaders);
  expect(r.statusCode).toBe(200);
  const s = AppSettingsDtoSchema.parse(r.json());
  expect(s.limits).toEqual({ maxRunning: 2, agentCalls: 5, renders: 2, exportTimeoutMs: 1_800_000 });
  expect(s.defaults).toEqual(defaultSettings());
  expect(s.agents.engineer).toMatchObject({ model: "opus" });
});

it("PUT /settings: limits и defaults → 200 и в config.json; неизвестный ключ → 400; модель роли видна в GET", async () => {
  const a = await api.inj("PUT", "/api/settings", okHeaders, { limits: { maxRunning: 1 } });
  expect(a.statusCode).toBe(200);
  expect(a.json().limits).toMatchObject({ maxRunning: 1, agentCalls: 5 });
  const d = { ...defaultSettings(), duration_frames: 240 };
  expect((await api.inj("PUT", "/api/settings", okHeaders, { defaults: d })).statusCode).toBe(200);
  // слияние: прежние limits сохранились
  expect(file()).toEqual({ limits: { maxRunning: 1 }, defaults: d });
  const bad = await api.inj("PUT", "/api/settings", okHeaders, { limits: { nope: 1 } });
  expect(bad.statusCode).toBe(400);
  expect(JSON.stringify(bad.json())).toContain("limits");
  expect((await api.inj("PUT", "/api/settings", okHeaders, { limits: { renders: 0 } })).statusCode).toBe(400);
  expect((await api.inj("PUT", "/api/settings", okHeaders, { defaults: { ...defaultSettings(), aspect_ratio: "9:16" } })).statusCode).toBe(400);

  expect((await api.inj("PUT", "/api/settings", okHeaders, { agents: { engineer: { model: "sonnet" } } })).statusCode).toBe(200);
  expect((await api.inj("GET", "/api/settings", getHeaders)).json().agents.engineer.model).toBe("sonnet");
  const inv = await api.inj("PUT", "/api/settings", okHeaders, { agents: { engineer: { model: "bad model!" } } });
  expect(inv.statusCode).toBe(400);
  expect(inv.json().issues.map((i: { path: string }) => i.path)).toContain("agents.engineer.model");
  // неудачный PUT файл не трогает
  expect(file().agents).toEqual({ engineer: { model: "sonnet" } });
  // ядро живёт со старыми лимитами до перезапуска
  expect(api.core.config.limits.maxRunning).toBe(2);
});

it("PUT /settings сохраняет ключи файла, которых нет в теле (secondTake, claudeBin)", async () => {
  writeFileSync(join(api.s.root, "config.json"), JSON.stringify({ claudeBin: "/usr/local/bin/claude", scene: { secondTake: { mode: "off" } } }));
  expect((await api.inj("PUT", "/api/settings", okHeaders, { scene: { maxCostUsd: 4 } })).statusCode).toBe(200);
  expect(file()).toEqual({ claudeBin: "/usr/local/bin/claude", scene: { secondTake: { mode: "off" }, maxCostUsd: 4 } });
});
