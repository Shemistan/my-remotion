// Ритмы kit в секундах, а не в кадрах (Task 19 F3): та же секунда при 30 и 60 fps даёт то же
// состояние. Иначе экспорт в 60 fps ускоряет их вдвое.
import { describe, expect, it } from "vitest";
import { countStartOf, speedBlurOf } from "../../src/motion-kit/components/AnimatedNumber.js";
import { axisFadeEnd } from "../../src/motion-kit/components/BarChart.js";
import { cardAccentLine } from "../../src/motion-kit/components/Card.js";
import { llmEdgeAngle } from "../../src/motion-kit/components/FlowGraph.js";
import { toResolved } from "../../src/motion-kit/style.js";

const st = { preset: "dark-premium", intensity: "balanced" } as const;
const s30 = toResolved(st, 30);
const s60 = toResolved(st, 60);

describe("kit: кадровые константы масштабируются по fps", () => {
  it("кромка LLM-узла FlowGraph: угол — функция секунды", () => {
    expect(llmEdgeAngle(30, s30)).toBeCloseTo(36, 6);
    expect(llmEdgeAngle(60, s60)).toBeCloseTo(36, 6);
    expect(llmEdgeAngle(310, s30)).toBeCloseTo(372 % 360, 6);
  });

  it("линия акцента Card: +6…+26 кадров при 30 fps — те же секунды при 60", () => {
    expect(cardAccentLine(s30, 10)).toEqual([16, 36]);
    expect(cardAccentLine(s60, 20)).toEqual([32, 72]);
  });

  it("ось BarChart проявляется за 8 кадров при 30 fps — за 16 при 60", () => {
    expect(axisFadeEnd(s30, 10)).toBe(18);
    expect(axisFadeEnd(s60, 20)).toBe(36);
  });

  it("AnimatedNumber: старт счёта и смаз цифр не зависят от fps", () => {
    expect(countStartOf(s30, 0, 300)).toBe(6);
    expect(countStartOf(s60, 0, 600)).toBe(12);
    // приращение за кадр вдвое меньше при 60 fps — скорость та же, смаз тот же
    expect(speedBlurOf(s60, 0.005)).toBeCloseTo(speedBlurOf(s30, 0.01), 6);
  });
});
