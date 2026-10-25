// S5 п. 8: лимиты Engineer растут с длительностью сцены (60-с сцены упирались в 10 мин / $2).
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { ENGINEER_LIMIT_CAP, buildEngineerTask, engineerLimits } from "../../src/pipeline/steps.js";
import { directorOutput } from "./helpers.js";

const base = { model: "opus", timeoutMs: 600_000, maxBudgetUsd: 2 };

describe("engineerLimits: лимит Engineer по длительности сцены", () => {
  it("короткая сцена (6 с, 20 с) — базовый лимит", () => {
    expect(engineerLimits(base, 6)).toEqual({ timeoutMs: 600_000, maxBudgetUsd: 2 });
    expect(engineerLimits(base, 20)).toEqual({ timeoutMs: 600_000, maxBudgetUsd: 2 });
  });

  it("30 с — ×1.5 по времени; 60 с — ×3 (30 мин), бюджет — не больше ×1.5", () => {
    expect(engineerLimits(base, 30)).toEqual({ timeoutMs: 900_000, maxBudgetUsd: 3 });
    expect(engineerLimits(base, 60)).toEqual({ timeoutMs: 1_800_000, maxBudgetUsd: 3 });
  });

  it("потолок: 120 с — не больше ×3 базового времени", () => {
    expect(engineerLimits(base, 120).timeoutMs).toBe(base.timeoutMs * ENGINEER_LIMIT_CAP);
    expect(engineerLimits(base, 120).maxBudgetUsd).toBe(3);
  });

  it("монотонно не убывает по длительности", () => {
    let prev = 0;
    for (let s = 1; s <= 180; s += 1) {
      const t = engineerLimits(base, s).timeoutMs;
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it("buildEngineerTask: лимиты задачи — по spec (1800 кадров при 30 fps = 60 с)", () => {
    const config = loadConfig({ MS_DATA_DIR: "/tmp/x" }, {});
    const spec = { ...directorOutput().spec, duration_frames: 1800, fps: { num: 30, den: 1 } };
    const run = { root: "/tmp/x", runId: "r", attempt: 1, registry: undefined, config };
    const t = buildEngineerTask({ draftDir: "/tmp/x/d", spec }, run);
    expect(t.limits.timeoutMs).toBe(config.agents.engineer.timeoutMs * 3);
    const short = buildEngineerTask({ draftDir: "/tmp/x/d", spec: { ...spec, duration_frames: 180 } }, run);
    expect(short.limits.timeoutMs).toBe(config.agents.engineer.timeoutMs);
  });
});
