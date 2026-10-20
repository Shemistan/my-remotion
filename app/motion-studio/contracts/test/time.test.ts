import { describe, expect, it } from "vitest";
import { frameToUs, usToFrame } from "../src/index.js";

describe("время", () => {
  it("usToFrame округляет вниз", () => {
    expect(usToFrame(1_000_000, { num: 30000, den: 1001 })).toBe(29);
    expect(usToFrame(0, { num: 30, den: 1 })).toBe(0);
    expect(usToFrame(33_333, { num: 30, den: 1 })).toBe(0);
    expect(usToFrame(33_334, { num: 30, den: 1 })).toBe(1);
  });
  it("frameToUs округляет к ближайшему", () => {
    expect(frameToUs(30, { num: 30, den: 1 })).toBe(1_000_000);
    expect(frameToUs(1, { num: 30, den: 1 })).toBe(33_333);
    expect(frameToUs(1, { num: 30000, den: 1001 })).toBe(33_367);
  });
  it("круговой переход точен для fps с целым периодом кадра (25)", () => {
    const fps = { num: 25, den: 1 };
    for (const f of [0, 1, 29, 1000, 54321]) expect(usToFrame(frameToUs(f, fps), fps)).toBe(f);
  });
  it("отвергает неверные входы", () => {
    expect(() => usToFrame(1, { num: 0, den: 1 })).toThrow();
    expect(() => frameToUs(1, { num: 30, den: 0 })).toThrow();
    expect(() => usToFrame(-1, { num: 30, den: 1 })).toThrow();
    expect(() => frameToUs(1.5, { num: 30, den: 1 })).toThrow();
  });
});
