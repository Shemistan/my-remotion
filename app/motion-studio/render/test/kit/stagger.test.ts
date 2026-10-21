import { describe, expect, it } from "vitest";
import { staggerBeat } from "../../src/motion-kit/choreo/stagger.js";

describe("staggerBeat", () => {
  it("старт сдвигается на index × stagger, конец бита общий (бриф)", () => {
    expect(staggerBeat({ start_frame: 0, end_frame: 30 }, 2, 4, 4)).toEqual({ start_frame: 8, end_frame: 30 });
    expect(staggerBeat({ start_frame: 10, end_frame: 40 }, 0, 4, 4)).toEqual({ start_frame: 10, end_frame: 40 });
  });

  it("разбег сжимается до половины бита, последний элемент успевает войти", () => {
    const b = { start_frame: 0, end_frame: 20 };
    const last = staggerBeat(b, 9, 10, 6);
    expect(last.start_frame).toBeLessThanOrEqual(10);
    expect(last.end_frame).toBe(20);
    // порядок сохраняется
    const starts = Array.from({ length: 10 }, (_, i) => staggerBeat(b, i, 10, 6).start_frame);
    expect([...starts].sort((a, c) => a - c)).toEqual(starts);
  });

  it("вырожденный бит и один элемент — без сдвига, старт не позже конца", () => {
    expect(staggerBeat({ start_frame: 5, end_frame: 5 }, 3, 4, 4)).toEqual({ start_frame: 5, end_frame: 5 });
    expect(staggerBeat({ start_frame: 0, end_frame: 30 }, 0, 1, 4)).toEqual({ start_frame: 0, end_frame: 30 });
  });
});
