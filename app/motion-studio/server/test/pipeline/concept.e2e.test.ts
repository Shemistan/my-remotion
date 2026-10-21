// Concept по-настоящему: реальный `claude` (модель роли concept из config — sonnet),
// системный промпт через loadPrompt. Хранилище — в tmp/ репозитория (журналы вызовов).
// Запуск: `make e2e`.
import { join } from "node:path";
import { type ConceptOutput, defaultSettings } from "@ms/contracts";
import { type VolumeProbe, initStore, readMarker } from "@ms/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { loadPrompt } from "../../src/agents/prompts.js";
import { loadConfig } from "../../src/config.js";
import { RunCtx, conceptStep } from "../../src/pipeline/steps.js";
import { makeTmp, removeTmp } from "./helpers.js";

const T = 10 * 60_000;
const TEST1 =
  "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении";
const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";
const EN = "Animated architecture of an AI agent with light pulses";

const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

let tmp: string;
let root: string;
const costs: Record<string, number> = {};

beforeAll(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, probe, {});
}, T);
afterAll(async () => {
  console.log("Concept, $:", JSON.stringify(costs));
  if (tmp) await removeTmp(tmp);
});

async function concept(name: string, prompt: string): Promise<ConceptOutput> {
  const config = loadConfig({ MS_DATA_DIR: root });
  const marker = await readMarker(root);
  const agents = new ClaudeCodeRuntime({ bin: config.claudeBin, logRoot: join(root, "logs", "agent-runs"), promptLoader: loadPrompt });
  const rc = new RunCtx({ storage: async () => ({ ok: true, root, marker, freeBytes: 1 }), agents, config }, undefined, root, `concept-${name}`, 1, undefined);
  const r = await conceptStep(rc, { prompt, settings: defaultSettings() });
  costs[name] = rc.spent;
  if (!r.ok) throw new Error(`${r.stage}: ${r.message}`);
  console.log(name, JSON.stringify(r.concept, null, 1));
  return r.concept;
}

describe("Concept: реальный claude", () => {
  it("Test 1: паттерны роста/количеств, уточнений нет", async () => {
    const c = await concept("test1", TEST1);
    expect(c.patterns.some((p) => ["growth-decline", "quantities"].includes(p))).toBe(true);
    expect(c.needs_clarification).toEqual([]);
    expect(c.kb_queries.en.length).toBeGreaterThan(0);
  }, T);

  it("Test 2: паттерн system-structure", async () => {
    const c = await concept("test2", TEST2);
    expect(c.patterns).toContain("system-structure");
  }, T);

  it("запрос на английском — ключи поиска и по-русски", async () => {
    const c = await concept("en", EN);
    expect(c.kb_queries.ru.length).toBeGreaterThan(0);
    expect(c.kb_queries.en.length).toBeGreaterThan(0);
  }, T);
});
