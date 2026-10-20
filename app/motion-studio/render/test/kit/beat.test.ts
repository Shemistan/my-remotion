import { describe, expect, it } from "vitest";
import { beatPhase, beatProgress } from "../../src/motion-kit/beat.js";

const b = { start_frame: 10, end_frame: 20 };

describe("beatProgress", () => {
  it("0..1 с clamp (бриф)", () => {
    expect(beatProgress(0, b)).toBe(0);
    expect(beatProgress(15, b)).toBeCloseTo(0.5);
    expect(beatProgress(99, b)).toBe(1);
  });

  it("easing применяется к доле бита", () => {
    expect(beatProgress(15, b, (t) => t * t)).toBeCloseTo(0.25);
  });

  it("вырожденный бит не делит на ноль", () => {
    expect(beatProgress(4, { start_frame: 5, end_frame: 5 })).toBe(0);
    expect(beatProgress(5, { start_frame: 5, end_frame: 5 })).toBe(1);
  });
});

describe("beatPhase", () => {
  const w = { enter: 4, exit: 3 };
  it("before / enter / hold / exit / after", () => {
    expect(beatPhase(9, b, w)).toBe("before");
    expect(beatPhase(10, b, w)).toBe("enter");
    expect(beatPhase(13, b, w)).toBe("enter");
    expect(beatPhase(14, b, w)).toBe("hold");
    expect(beatPhase(16, b, w)).toBe("hold");
    expect(beatPhase(17, b, w)).toBe("exit");
    expect(beatPhase(19, b, w)).toBe("exit");
    expect(beatPhase(20, b, w)).toBe("after");
  });

  it("короткий бит: вход и выход делят его пополам, hold нет", () => {
    const short = { start_frame: 0, end_frame: 4 };
    expect(beatPhase(1, short, { enter: 10, exit: 10 })).toBe("enter");
    expect(beatPhase(2, short, { enter: 10, exit: 10 })).toBe("exit");
  });

  it("exit 0 — элемент держится до конца бита", () => {
    expect(beatPhase(19, b, { enter: 4, exit: 0 })).toBe("hold");
  });
});

describe("ramp: вырожденные окна не бросают", () => {
  it("нулевое и обратное окно — ступенька", async () => {
    const { ramp } = await import("../../src/motion-kit/internal.js");
    expect(ramp(9, 10, 10)).toBe(0);
    expect(ramp(10, 10, 10)).toBe(1);
    expect(ramp(5, 10, 3)).toBe(0);
    expect(ramp(11, 10, 3)).toBe(1);
    expect(ramp(15, 10, 20)).toBeCloseTo(0.5);
    expect(ramp(15, 10, 20, (t) => t * t)).toBeCloseTo(0.25);
  });
});
