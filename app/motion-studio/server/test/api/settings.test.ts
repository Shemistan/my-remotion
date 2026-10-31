// Настройки приложения: `$MS_DATA_DIR/config.json` (модели ролей, limits, defaults: Settings),
// валидация расширенным FileSchema (M12); слияние с тем, что уже в файле.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AppSettingsDtoSchema, defaultSettings } from "@ms/contracts";
import { ROLES } from "../../src/agents/runtime.js";
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
  expect(s.limits).toEqual({ maxRunning: 16, agentCalls: 16, renders: 4, exportTimeoutMs: 1_800_000 });
  expect(s.defaults).toEqual(defaultSettings());
  expect(s.agents.engineer).toMatchObject({ model: "opus" });
});

it("PUT /settings: limits и defaults → 200 и в config.json; неизвестный ключ → 400; модель роли видна в GET", async () => {
  const a = await api.inj("PUT", "/api/settings", okHeaders, { limits: { maxRunning: 1 } });
  expect(a.statusCode).toBe(200);
  expect(a.json().limits).toMatchObject({ maxRunning: 1, agentCalls: 16 });
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
  expect(inv.json().issues.map((i: { path: string }) => i.path)).toContain("body.agents.engineer.model");
  // неудачный PUT файл не трогает
  expect(file().agents).toEqual({ engineer: { model: "sonnet" } });
  // ядро живёт со старыми лимитами до перезапуска
  expect(api.core.config.limits.maxRunning).toBe(16);
});

it("PUT /settings сохраняет ключи файла, которых нет в теле (secondTake, claudeBin)", async () => {
  writeFileSync(join(api.s.root, "config.json"), JSON.stringify({ claudeBin: "/usr/local/bin/claude", scene: { secondTake: { mode: "off" } } }));
  expect((await api.inj("PUT", "/api/settings", okHeaders, { limits: { renders: 3 } })).statusCode).toBe(200);
  expect(file()).toEqual({ claudeBin: "/usr/local/bin/claude", scene: { secondTake: { mode: "off" } }, limits: { renders: 3 } });
});

it("PUT /settings: claudeBin, kb, agentRuntime, scene, бюджет и таймаут ролей через API не меняются (400, файл тот же)", async () => {
  const before = { limits: { maxRunning: 1 } };
  writeFileSync(join(api.s.root, "config.json"), JSON.stringify(before));
  const bodies: unknown[] = [
    { claudeBin: "/tmp/evil.sh" },
    { kb: { root: "/etc" } },
    { kb: { sourceRoot: "/etc" } },
    { agentRuntime: "claude-code" },
    { scene: { maxCostUsd: 1e9 } },
    { scene: { maxAutoFixes: 1 } },
    { scene: { secondTake: { mode: "off" } } },
    { agents: { engineer: { maxBudgetUsd: 1 } } },
    { agents: { engineer: { timeoutMs: 1000 } } },
    { agents: { nobody: { model: "opus" } } },
    { limits: { exportTimeoutMs: 1e12 } },
    { limits: { maxRunning: 1000 } },
    { limits: { maxRunning: 1 }, claudeBin: "/tmp/evil.sh" },
  ];
  for (const b of bodies) {
    const r = await api.inj("PUT", "/api/settings", okHeaders, b);
    expect(r.statusCode, JSON.stringify(b)).toBe(400);
    expect(r.json(), JSON.stringify(b)).toMatchObject({ error: "validation" });
  }
  expect(file()).toEqual(before);
});

it("PUT /settings: два параллельных PUT — оба изменения в файле, временных файлов не осталось", async () => {
  const [a, b] = await Promise.all([
    api.inj("PUT", "/api/settings", okHeaders, { limits: { maxRunning: 1 } }),
    api.inj("PUT", "/api/settings", okHeaders, { limits: { renders: 3 } }),
  ]);
  expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
  expect(file()).toEqual({ limits: { maxRunning: 1, renders: 3 } });
  const many = await Promise.all(
    Array.from({ length: 8 }, (_, i) => api.inj("PUT", "/api/settings", okHeaders, { agents: { [ROLES[i % ROLES.length]!]: { model: "sonnet" } } })),
  );
  expect(many.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
  expect(Object.keys(file().agents).sort()).toEqual([...new Set(Array.from({ length: 8 }, (_, i) => ROLES[i % ROLES.length]!))].sort());
  expect(readdirSync(api.s.root).filter((f) => f.startsWith("config.json."))).toEqual([]);
});

it("PUT /settings: сбой записи → 500 без абсолютных путей", async () => {
  // config.json — каталог: rename поверх него не пройдёт
  mkdirSync(join(api.s.root, "config.json"));
  const r = await api.inj("PUT", "/api/settings", okHeaders, { limits: { maxRunning: 1 } });
  expect(r.statusCode).toBeGreaterThanOrEqual(500);
  expect(r.body).not.toContain(api.s.root);
  expect(r.body).not.toMatch(/\/(Users|private|tmp|Volumes)\//);
});
