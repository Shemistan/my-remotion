// Метрики eval: согласие судьи с оценками дизайнера, агрегация прогонов, кадровые числа.
import { describe, expect, it } from "vitest";
import {
  type JudgeScores,
  agreement,
  aggregateRuns,
  frameMetrics,
  mae,
  mean,
  median,
  pairOrder,
  ranks,
  sheetFrames,
  spearman,
} from "../../src/eval/metrics.js";
import { Canvas } from "../qa/helpers.js";

const img = (c: Canvas) => ({ width: c.width, height: c.height, data: c.data });

describe("базовая статистика", () => {
  it("mean и median; median чётной длины — среднее двух средних", () => {
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => mean([])).toThrow();
    expect(() => median([])).toThrow();
  });

  it("ranks: связи получают средний ранг", () => {
    expect(ranks([10, 30, 20])).toEqual([1, 3, 2]);
    expect(ranks([5, 6, 5, 7])).toEqual([1.5, 3, 1.5, 4]);
  });

  it("mae — средняя абсолютная ошибка; длины должны совпадать", () => {
    expect(mae([6, 5, 4], [5, 5, 6])).toBeCloseTo(1);
    expect(() => mae([1], [1, 2])).toThrow();
  });

  it("spearman: монотонная связь — 1, обратная — −1, со связями — Пирсон по рангам", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 100])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    // ранги a: 1,2,3,4; ранги b: 1.5,1.5,3,4 → Пирсон 0.9487
    expect(spearman([1, 2, 3, 4], [5, 5, 6, 7])).toBeCloseTo(0.9487, 3);
  });

  it("spearman без разброса (все равны) — 0, а не NaN", () => {
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("agreement", () => {
  it("MAE, Spearman, смещение и худшая ошибка по сценам", () => {
    const a = agreement([
      { id: "a", judge: 6, ref: 6.5 },
      { id: "b", judge: 4, ref: 4.5 },
      { id: "c", judge: 7, ref: 6 },
    ]);
    expect(a.n).toBe(3);
    expect(a.mae).toBeCloseTo(2 / 3);
    expect(a.bias).toBeCloseTo(0);
    expect(a.spearman).toBeCloseTo(0.5);
    expect(a.worst).toEqual({ id: "c", err: 1 });
  });
});

describe("pairOrder: порядок R1/R2 одной сцены", () => {
  it("засчитывает пару, если судья упорядочил её как дизайнер; равенство у судьи — мимо", () => {
    const r = pairOrder([
      { id: "x", judge: [5, 6], ref: [4.5, 6] },
      { id: "y", judge: [6, 5], ref: [6.5, 6] },
      { id: "z", judge: [5, 5], ref: [5, 5.5] },
      { id: "w", judge: [6, 5], ref: [5, 6] },
    ]);
    expect(r).toEqual({ correct: 2, total: 4, wrong: ["z", "w"] });
  });
});

const run = (overall: number, hold: number): JudgeScores => ({
  overall,
  criteria: { meaning: 6, hierarchy: 5, composition: 5, entrance: 4, choreography: 5, hold, legibility: 5, distinctiveness: 4 },
});

describe("aggregateRuns", () => {
  it("медиана по прогонам для итога и каждого критерия; разброс итога — max − min", () => {
    const a = aggregateRuns([run(6, 3), run(5, 5), run(5.5, 4)]);
    expect(a.overall).toBe(5.5);
    expect(a.criteria.hold).toBe(4);
    expect(a.criteria.meaning).toBe(6);
    expect(a.spread).toBeCloseTo(1);
    expect(a.runs).toEqual([6, 5, 5.5]);
  });

  it("без прогонов — ошибка", () => {
    expect(() => aggregateRuns([])).toThrow();
  });
});

describe("sheetFrames: раскладка листов R2", () => {
  it("180 кадров — ровно как в motion-review-2", () => {
    expect(sheetFrames(180)).toEqual({
      a: [0, 8, 16, 24, 36, 48],
      b: [60, 72, 84, 96, 108, 120],
      c: [125, 130, 135, 140, 145, 150],
      d: [155, 160, 165, 170, 175, 179],
    });
  });

  it("другая длительность — пропорционально, последний кадр N−1, без повторов и в пределах", () => {
    const s = sheetFrames(300);
    const all = [...s.a, ...s.b, ...s.c, ...s.d];
    expect(all.length).toBe(24);
    expect(new Set(all).size).toBe(24);
    expect(s.d.at(-1)).toBe(299);
    expect(Math.max(...all)).toBeLessThan(300);
    expect([...all].sort((x, y) => x - y)).toEqual(all);
  });
});

describe("frameMetrics", () => {
  const empty = () => new Canvas(192, 108, "#101010");
  const busy = () => {
    const c = new Canvas(192, 108, "#101010");
    for (let x = 4; x < 188; x += 12) for (let y = 4; y < 104; y += 12) c.rect(x, y, 4, 4, "#f0f0f0");
    return c;
  };

  it("пустой кадр 0 — нулевое содержимое; заполненный — заметное", () => {
    const m = frameMetrics(new Map([[0, img(empty())], [4, img(busy())], [160, img(busy())], [179, img(busy())]]), 180);
    expect(m.frame0Content).toBe(0);
    expect(m.frame4Content).toBeGreaterThan(0.05);
  });

  it("holdDelta — разница кадров N−20 и N−1; застывший финал — 0", () => {
    const frozen = frameMetrics(new Map([[160, img(busy())], [179, img(busy())]]), 180);
    expect(frozen.holdDelta).toBe(0);
    const alive = frameMetrics(new Map([[160, img(empty())], [179, img(busy())]]), 180);
    expect(alive.holdDelta).toBeGreaterThan(0);
  });

  it("emptyThirdShare — доля кадров с почти пустой третью или четвертью", () => {
    const half = new Canvas(192, 108, "#101010");
    for (let x = 4; x < 90; x += 12) for (let y = 4; y < 104; y += 12) half.rect(x, y, 4, 4, "#f0f0f0");
    const m = frameMetrics(new Map([[24, img(half)], [60, img(busy())], [120, img(busy())], [179, img(busy())]]), 180);
    expect(m.emptyThirdShare).toBeCloseTo(0.25);
  });

  it("нет нужных кадров — null, а не ошибка", () => {
    const m = frameMetrics(new Map(), 180);
    expect(m).toEqual({ frame0Content: null, frame4Content: null, holdDelta: null, emptyThirdShare: null });
  });
});
