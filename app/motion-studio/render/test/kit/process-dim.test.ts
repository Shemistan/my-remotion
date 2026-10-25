// ProcessSteps 0.5.6 (S15a): пройденные шаги приглушаются одной лентой — без второй копии
// компонента под clipPath (смоук S14, сц. 5: копии давали ghost_text / text_overlap).
import { describe, expect, it } from "vitest";
import { STEP_DIM, stepDim } from "../../src/motion-kit/components/ProcessSteps.js";

describe("stepDim", () => {
  const starts = [10, 40, 70, 100];
  it("без dimBefore — 1 всегда", () => {
    for (const f of [0, 50, 120]) for (let i = 0; i < 4; i++) expect(stepDim(f, starts, i, { enter: 20 })).toBe(1);
  });
  it("dimBefore: шаги до активного уходят к 0.5 за enter кадров, активный и будущие — 1", () => {
    expect(stepDim(70, starts, 0, { dim: true, enter: 20 })).toBe(1);
    expect(stepDim(80, starts, 0, { dim: true, enter: 20 })).toBeCloseTo(0.75, 5);
    expect(stepDim(120, starts, 1, { dim: true, enter: 20 })).toBe(STEP_DIM);
    expect(stepDim(120, starts, 3, { dim: true, enter: 20 })).toBe(1);
  });
  it("focusIndex: приглушение только с фокуса; уровень числом", () => {
    expect(stepDim(80, starts, 0, { dim: 0.3, focus: 3, enter: 20 })).toBe(1);
    expect(stepDim(130, starts, 2, { dim: 0.3, focus: 3, enter: 20 })).toBeCloseTo(0.3, 5);
  });
});
