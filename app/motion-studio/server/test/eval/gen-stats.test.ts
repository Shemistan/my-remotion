// S5 п. 7: время генерации по этапам и стоимость p50/p90 — постоянные метрики отчёта прогона;
// «опубликованная оценка ≥ первой попытки» — по журналу попыток.
import { describe, expect, it } from "vitest";
import { genStats, percentile, publishedVsFirst, stageWallOf } from "../../src/eval/gen-stats.js";

describe("percentile", () => {
  it("p50 и p90 линейной интерполяцией; пусто — null", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("stageWallOf", () => {
  it("stage_wall_ms из pipeline-log (S5) как есть", () => {
    expect(stageWallOf({ stage_wall_ms: { engineer: 10, total: 20 } })).toEqual({ engineer: 10, total: 20 });
  });
  it("старый журнал без stage_wall_ms — сумма timings по этапам (total — из timings.total или сумма)", () => {
    expect(stageWallOf({ timings: { concept: 5, motion_director: 7, engineer_1: 10, engineer_2: 4, render_2: 3, visual_qa_2: 2, qa_programmatic: 1 } }))
      .toEqual({ concept: 5, director: 7, engineer: 14, render: 3, qa: 3, total: 32 });
  });
  it("нет журнала — null", () => expect(stageWallOf(undefined)).toBeNull());
});

describe("publishedVsFirst", () => {
  it("опубликованная оценка против первой оценённой попытки", () => {
    expect(publishedVsFirst([{ n: 1, overall: 6, published: false }, { n: 2, overall: 7, published: true }])).toEqual({ first: 6, published: 7, ok: true });
    expect(publishedVsFirst([{ n: 1, overall: 6, published: true }])).toEqual({ first: 6, published: 6, ok: true });
    expect(publishedVsFirst([{ n: 1, overall: 7, published: false }, { n: 2, overall: 6.5, published: true }])).toEqual({ first: 7, published: 6.5, ok: false });
    expect(publishedVsFirst([{ n: 1, published: true }])).toBeNull();
    expect(publishedVsFirst(undefined)).toBeNull();
  });
});

describe("genStats", () => {
  it("стоимость p50/p90, время этапов p50/среднее по сценам, доля «не хуже первой»", () => {
    const s = genStats([
      { cost_usd: 2, stage_wall_ms: { engineer: 60_000, render: 10_000, total: 120_000 }, attempts: [{ n: 1, overall: 6, published: false }, { n: 2, overall: 7, published: true }] },
      { cost_usd: 4, stage_wall_ms: { engineer: 120_000, render: 30_000, total: 240_000 }, attempts: [{ n: 1, overall: 7, published: true }] },
      { cost_usd: 3, stage_wall_ms: null, attempts: undefined },
    ]);
    expect(s.cost_p50).toBe(3);
    expect(s.cost_p90).toBeCloseTo(3.8);
    expect(s.stages.engineer).toEqual({ p50: 90_000, mean: 90_000, n: 2 });
    expect(s.stages.total).toEqual({ p50: 180_000, mean: 180_000, n: 2 });
    expect(s.published_ge_first).toEqual({ ok: 2, of: 2, misses: [] });
  });
});
