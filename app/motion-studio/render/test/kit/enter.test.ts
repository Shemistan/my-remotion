import { describe, expect, it } from "vitest";
import { enterStyle } from "../../src/motion-kit/choreo/enter.js";

const o = { amplitude: 1, distancePx: 40 };

describe("enterStyle", () => {
  it("none и виды, которые рисует сам компонент, — пустой стиль", () => {
    expect(enterStyle("none", 0, o)).toEqual({});
    expect(enterStyle("type", 0.3, o)).toEqual({});
    expect(enterStyle("count", 0.3, o)).toEqual({});
    expect(enterStyle("draw", 0.3, o)).toEqual({});
  });

  it("fade — только opacity (бриф)", () => {
    expect(enterStyle("fade", 0.5, o)).toEqual({ opacity: 0.5 });
    expect(enterStyle("fade", 1, o)).toEqual({ opacity: 1 });
  });

  it("rise: translateY((1-p)·distance·amp), в конце — на месте", () => {
    expect(enterStyle("rise", 0, o).transform).toBe("translateY(40px)");
    expect(enterStyle("rise", 0, { ...o, amplitude: 0.5 }).transform).toBe("translateY(20px)");
    expect(enterStyle("rise", 1, o)).toMatchObject({ opacity: 1, transform: "translateY(0px)" });
    expect(enterStyle("rise", 0, o).opacity).toBe(0);
  });

  it("slide: translateX по direction (сторона, откуда элемент входит)", () => {
    expect(enterStyle("slide", 0, { ...o, direction: "left" }).transform).toBe("translateX(-40px)");
    expect(enterStyle("slide", 0, { ...o, direction: "right" }).transform).toBe("translateX(40px)");
    expect(enterStyle("slide", 1, { ...o, direction: "left" }).transform).toBe("translateX(0px)");
  });

  it("scale: 0.92 + 0.08p при amp = 1", () => {
    expect(enterStyle("scale", 0, o).transform).toBe("scale(0.92)");
    expect(enterStyle("scale", 0.5, o).transform).toBe("scale(0.96)");
    expect(enterStyle("scale", 1, o).transform).toBe("scale(1)");
  });

  it("mask: clipPath inset открывается от края; blur: (1-p)·12·amp px", () => {
    expect(enterStyle("mask", 0, o).clipPath).toBe("inset(100% 0% 0% 0%)");
    expect(enterStyle("mask", 0.25, o).clipPath).toBe("inset(75% 0% 0% 0%)");
    // вход закончен — клипа нет: подчёркивание, свечение и выносные элементы не срезаются
    expect(enterStyle("mask", 1, o).clipPath).toBeUndefined();
    expect(enterStyle("mask", 1.02, o).clipPath).toBeUndefined();
    expect(enterStyle("mask", 0, { ...o, direction: "left" }).clipPath).toBe("inset(0% 100% 0% 0%)");
    expect(enterStyle("blur", 0, o).filter).toBe("blur(12px)");
    expect(enterStyle("blur", 0.5, { ...o, amplitude: 1.35 }).filter).toBe("blur(8.1px)");
    expect(enterStyle("blur", 1, o).filter).toBe("blur(0px)");
  });

  it("pop: перелёт пружины (p > 1) даёт масштаб больше 1", () => {
    expect(enterStyle("pop", 0, o).transform).toBe("scale(0.5)");
    expect(enterStyle("pop", 1, o).transform).toBe("scale(1)");
    expect(Number(/scale\(([\d.]+)\)/.exec(String(enterStyle("pop", 1.1, o).transform))![1])).toBeGreaterThan(1);
    expect(enterStyle("pop", 1.1, o).opacity).toBe(1);
  });

  it("виды входа различаются в середине входа", () => {
    const kinds = ["fade", "rise", "scale", "mask", "blur", "pop", "slide"] as const;
    const seen = new Set(kinds.map((k) => JSON.stringify(enterStyle(k, 0.5, o))));
    expect(seen.size).toBe(kinds.length);
  });
});
