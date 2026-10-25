// Проба 0.5.6 (S15a): клип предков и акценты. Смоук S14, сц. 5 — лента шагов в двух копиях под
// `clip-path: inset()` давала 9 ложных ghost_text / text_overlap: текст за клипом не виден.
import { describe, expect, it } from "vitest";
import { CLIP_VISIBLE_MIN, clipLine, insetClipRect, summarizeAccents } from "../../src/motion-kit/layout-probe.js";

describe("insetClipRect", () => {
  const box = { x: 100, y: 50, w: 1000, h: 200 };
  it("проценты как в сцене смоука: inset(-20% 75% -20% -10%) — левая четверть", () => {
    const r = insetClipRect("inset(-20% 75% -20% -10%)", box)!;
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.w).toBeCloseTo(1000 - 750 + 100, 5);
    expect(r.y).toBeCloseTo(10, 5);
    expect(r.h).toBeCloseTo(280, 5);
  });
  it("одно значение, px с масштабом, round игнорируется", () => {
    expect(insetClipRect("inset(10px)", box)).toEqual({ x: 110, y: 60, w: 980, h: 180 });
    expect(insetClipRect("inset(10px 20px round 8px)", box, 2)).toEqual({ x: 140, y: 70, w: 920, h: 160 });
  });
  it("не inset — клипа по прямоугольнику нет", () => {
    expect(insetClipRect("none", box)).toBeNull();
    expect(insetClipRect("circle(50%)", box)).toBeNull();
    expect(insetClipRect("url(#c)", box)).toBeNull();
  });
});

describe("clipLine", () => {
  it("строка за клипом — доля 0; наполовину — видимая часть", () => {
    const line = { x: 800, y: 100, w: 200, h: 40 };
    expect(clipLine(line, [{ x: 0, y: 0, w: 500, h: 300 }]).share).toBe(0);
    const half = clipLine(line, [{ x: 0, y: 0, w: 900, h: 300 }]);
    expect(half.share).toBeCloseTo(0.5, 5);
    expect(half.rect).toEqual({ x: 800, y: 100, w: 100, h: 40 });
    expect(clipLine(line, []).share).toBe(1);
    expect(CLIP_VISIBLE_MIN).toBe(0.3);
  });
});

describe("summarizeAccents", () => {
  it("активные (> 0.5), видимые и не вложенные", () => {
    expect(summarizeAccents([
      { id: "a", level: 0.9, nested: false, opacity: 1 },
      { id: "b", level: 0.4, nested: false, opacity: 1 },
      { id: "c", level: 0.9, nested: true, opacity: 1 },
      { id: "d", level: 0.9, nested: false, opacity: 0.1 },
    ])).toEqual([{ id: "a", level: 0.9 }]);
  });
});
