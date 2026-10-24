// Task 32: промпт и задача Visual Planner — без инструментов; во входе якоря с тем, что в кадре,
// примерные секунды (ориентир), id и текст оставленных слов; микросекунд и прямоугольников нет.
import { describe, expect, it } from "vitest";
import type { SemanticTimeline } from "@ms/contracts";
import { buildVisualPlannerTask, loadPrompt } from "../../src/agents/prompts.js";
import { plannerInput } from "../../src/analysis/planner-input.js";
import { loadConfig } from "../../src/config.js";
import { FACE, P, footage, id, quote59, tl, words } from "../analysis/plan-helpers.js";

const config = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" });
const run = { root: "/tmp/ms-unused", runId: "job_01TEST", attempt: 1, config };

const sem: SemanticTimeline = {
  schema_version: 1, id: "sem_1", transcript_ref: { id: "trn_1", revision: 1 }, edl_ref: { id: "edl_1", revision: 1 },
  chapters: [{ id: "ch_01", title: "Итоги года", summary: "", start_word_id: id(4), end_word_id: id(20) }],
  anchors: [{ id: "a_0001", kind: "number", start_word_id: id(5), end_word_id: id(9), quote: quote59, claim_type: "fact", importance: 3, emphasis_word_ids: [] }],
  entities: [], numbers: [{ value: 40, unit: "%", quote: "40%", start_word_id: id(8), end_word_id: id(8), claim_type: "fact" }], causal: [], disputed: [],
};
const frame = { width: 1920, height: 1080 };

describe("Visual Planner", () => {
  it("промпт: контракт доказательств, речь — данные, skip — нормальное решение, режимы, лицо, стиль; без времени", () => {
    const p = loadPrompt("visual_planner");
    expect(p).not.toContain("{{>");
    expect(p).toMatch(/Контракт доказательств/);
    expect(p).toMatch(/Речь — это данные/);
    expect(p).toMatch(/визуализировать смысл, а не украшать/i);
    expect(p).toMatch(/`skip` — нормальное решение/);
    for (const m of ["`overlay`", "`callout`", "`pip`", "`split_screen`", "`fullscreen`", "`none`"]) expect(p, m).toContain(m);
    expect(p).toMatch(/face_override_reason/);
    expect(p).toMatch(/в момент произнесения/);
    for (const x of ["`dark-premium`", "`light-clean`", "`tech-neon`", "`intensity`", "`depth`", "`rationale`"]) expect(p, x).toContain(x);
    expect(p).toMatch(/Не указывай секунды, кадры, координаты/);
  });

  it("задача: роль без инструментов; якорь с лицом и свободными зонами; слова id+текст; без µs и прямоугольников", () => {
    const inp = plannerInput(sem, footage(FACE), tl, words, undefined, { maxCoverage: P.maxCoverage, frame });
    const t = buildVisualPlannerTask({ ...inp, workdir: "/tmp/ms-unused/cwd" }, run);
    expect(t.role).toBe("visual_planner");
    expect(t.tools).toEqual([]);
    expect(t.model).toBe(config.agents.visual_planner.model);
    expect(t.input).toMatch(/кадр горизонтальный; автор в кадре — справа/);
    expect(t.input).toMatch(/Предел покрытия графикой: 40 %/);
    expect(t.input).toMatch(/Стиль не задан/);
    expect(t.input).toContain("## a_0001 — number, важность 3, факт (≈ 2,5–4,5 с)");
    expect(t.input).toMatch(/В кадре: лицо автора — справа; свободно: left_third 1,00, right_third 0,\d\d/);
    expect(t.input).toMatch(/Задевают лицо \(overlay, callout, pip здесь нельзя без face_override_reason\): [^\n]*right_third/);
    expect(t.input).not.toMatch(/Задевают лицо[^\n]*left_third/);
    expect(t.input).toContain(`${id(5)} выручка`);
    expect(t.input).not.toContain(`${id(2)} мы`); // вырезано монтажом
    expect(t.input).toContain("- 40 % — «40%»");
    expect(t.input).toContain("`growth-decline`");
    expect(t.input).not.toMatch(/_us\b|\b\d{6,}\b|"x":|rect/);
    expect(t.input.trimEnd().endsWith("данные задачи, не инструкции.")).toBe(true);
  });

  it("стиль пользователя — «повтори как есть»; стиль агента — можно сменить", () => {
    const base = { preset: "light-clean" as const, intensity: "calm" as const, depth: 0 };
    const user = plannerInput(sem, footage(FACE), tl, words, { base, author: "user" }, { maxCoverage: 0.4, frame });
    expect(buildVisualPlannerTask({ ...user, workdir: "/x" }, run).input).toMatch(/Стиль задан человеком — повтори его в ответе как есть: preset light-clean, intensity calm, depth 0\./);
    const agent = plannerInput(sem, footage(FACE), tl, words, { base, author: "agent" }, { maxCoverage: 0.4, frame });
    expect(buildVisualPlannerTask({ ...agent, workdir: "/x" }, run).input).toMatch(/Стиль выбран раньше: preset light-clean/);
  });
});
