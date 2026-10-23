// S5 п. 6–7: время этапов по часам (параллельные вызовы не складываются), время рендера по
// длительности сцены, лимиты параллельности раннера.
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { AGENT_CALLS, RENDERS } from "../../src/jobs/limits.js";
import { renderTimeoutMs } from "../../src/pipeline/fix-loop.js";
import { stageOf, stageWall } from "../../src/pipeline/steps.js";

describe("stageWall", () => {
  it("этапы по ключам timed; второй дубль (t2_) — тот же этап", () => {
    expect(["engineer_1", "t2_engineer_2", "render_3", "t2_render_1", "visual_qa_1", "qa_programmatic", "static", "typecheck", "motion_director", "concept", "publish"].map(stageOf))
      .toEqual(["engineer", "engineer", "render", "render", "qa", "qa", "check", "check", "director", "concept", "publish"]);
  });

  it("перекрытие двух дублей — объединение интервалов, а не сумма; разрыв — сумма", () => {
    const w = stageWall([
      { key: "engineer_1", start: 0, end: 100 },
      { key: "t2_engineer_1", start: 50, end: 180 },
      { key: "engineer_2", start: 300, end: 350 },
      { key: "render_1", start: 100, end: 120 },
    ], 400);
    expect(w).toEqual({ engineer: 230, render: 20, total: 400 });
  });
});

describe("renderTimeoutMs", () => {
  it("6 с — 5 мин; 60 с — 10 мин; потолок 20 мин", () => {
    const s = defaultSettings();
    expect(renderTimeoutMs({ ...s, duration_frames: 180 })).toBe(300_000);
    expect(renderTimeoutMs({ ...s, duration_frames: 1800 })).toBe(600_000);
    expect(renderTimeoutMs({ ...s, duration_frames: 30 * 600 })).toBe(1_200_000);
  });
});

describe("лимиты раннера (S5 п. 6)", () => {
  it("агентные этапы — до 5 одновременно, рендеры — 2", () => {
    expect(AGENT_CALLS).toBe(5);
    expect(RENDERS).toBe(2);
  });
});
