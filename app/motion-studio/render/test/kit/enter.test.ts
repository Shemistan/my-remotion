import { describe, expect, it } from "vitest";
import { PRE_ALPHA, enterStyle, posterAlpha, posterStyle, splitBoxStyle, underlayFade } from "../../src/motion-kit/choreo/enter.js";
import { enterDuration } from "../../src/motion-kit/components/Enter.js";
import { EASE } from "../../src/motion-kit/easing.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

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

  it("mask: мягкая кромка mask-image (не clipPath), открывается от стороны входа; blur: (1-p)·12·amp px", () => {
    const m0 = enterStyle("mask", 0, o);
    expect(m0.clipPath).toBeUndefined();
    // снизу: градиент к верху, кромка ниже нижнего края — ничего не видно
    expect(m0.maskImage).toBe("linear-gradient(to top, #000 -40%, transparent 0%)");
    expect(m0.WebkitMaskImage).toBe(m0.maskImage);
    // кромка — 40 % высоты блока: строка не выглядит разрезанной пополам
    expect(enterStyle("mask", 0.5, o).maskImage).toBe("linear-gradient(to top, #000 30%, transparent 70%)");
    expect(enterStyle("mask", 0, { ...o, direction: "left" }).maskImage).toMatch(/^linear-gradient\(to right,/);
    expect(enterStyle("mask", 0, { ...o, direction: "up" }).maskImage).toMatch(/^linear-gradient\(to bottom,/);
    // вход закончен — маски нет: подчёркивание, свечение и выносные элементы не срезаются
    expect(enterStyle("mask", 1, o)).toEqual({});
    expect(enterStyle("mask", 1.02, o)).toEqual({});
    expect(enterStyle("blur", 0, o).filter).toBe("blur(12px)");
    expect(enterStyle("blur", 0.5, { ...o, amplitude: 1.35 }).filter).toBe("blur(8.1px)");
    expect(enterStyle("blur", 1, o).filter).toBe("blur(0px)");
  });

  it("mask: короткий подъём со стороны входа и прозрачность — без «обрезков» глифов на старте", () => {
    // 0.35 × distance × amp снизу
    expect(enterStyle("mask", 0, o).transform).toBe("translateY(14px)");
    expect(enterStyle("mask", 0, { ...o, direction: "left" }).transform).toBe("translateX(-14px)");
    expect(enterStyle("mask", 0, o).opacity).toBe(0);
    expect(enterStyle("mask", 0.25, o).opacity).toBe(0.4);
    expect(enterStyle("mask", 0.625, o).opacity).toBe(1);
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

describe("enterDuration", () => {
  const st = (intensity: "calm" | "balanced" | "energetic", fps = 30) => resolveStyle({ preset: "dark-premium", intensity, fps: { num: fps, den: 1 } });

  it("mask — 14…18 кадров при 30 fps в любой интенсивности (не 1.5 × enter_frames)", () => {
    for (const i of ["calm", "balanced", "energetic"] as const) {
      const n = enterDuration("mask", st(i));
      expect(n).toBeGreaterThanOrEqual(14);
      expect(n).toBeLessThanOrEqual(18);
    }
    expect(enterDuration("mask", st("balanced", 60))).toBeGreaterThanOrEqual(28);
  });

  it("частично открытая шторка (0 < p < 0.3) держится не дольше 6 кадров", () => {
    const n = enterDuration("mask", st("calm"));
    let partial = 0;
    for (let f = 0; f <= n; f++) {
      const p = EASE.outCubic(f / n);
      if (p > 0 && p < 0.3) partial++;
    }
    expect(partial).toBeLessThanOrEqual(6);
  });

  it("остальные виды — enter_frames, duration — свой", () => {
    expect(enterDuration("rise", st("balanced"))).toBe(24);
    expect(enterDuration("mask", st("balanced"), 30)).toBe(30);
  });
});

describe("Enter pre: слой-постер до входа (0.4.0)", () => {
  it("hidden — слоя нет", () => {
    expect(posterStyle("hidden", 0).opacity).toBe(0);
  });
  for (const pre of ["ghost", "silhouette"] as const) {
    it(`${pre}: до входа 15–30 %, гаснет за первую треть входа и не возвращается`, () => {
      const before = Number(posterStyle(pre, 0).opacity);
      expect(before).toBeGreaterThanOrEqual(0.15);
      expect(before).toBeLessThanOrEqual(0.3);
      expect(posterStyle(pre, 1 / 3).opacity).toBe(0);
      let last = before;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const v = Number(posterStyle(pre, p).opacity);
        expect(v).toBeLessThanOrEqual(last + 1e-9);
        last = v;
      }
    });
  }
  it("silhouette — каркас без текста и без размытия (глифы прозрачны), ghost — с текстом", () => {
    const sil = posterStyle("silhouette", 0);
    expect(sil.WebkitTextFillColor).toBe("transparent");
    expect(String(sil.filter)).not.toMatch(/blur/);
    expect(posterStyle("ghost", 0).WebkitTextFillColor).toBeUndefined();
  });
});

describe("S2-fix I4: слой-постер под входом (posterAlpha, splitBoxStyle)", () => {
  it("бит с кадра 0: на кадре 0 силуэт виден (PRE_ALPHA), гаснет за fade кадров", () => {
    expect(posterAlpha("silhouette", 0, 0, 8)).toBe(PRE_ALPHA.silhouette);
    expect(posterAlpha("silhouette", 4, 0, 8)).toBeCloseTo(PRE_ALPHA.silhouette / 2, 5);
    expect(posterAlpha("silhouette", 8, 0, 8)).toBe(0);
    expect(posterAlpha("hidden", 0, 0, 8)).toBe(0);
  });
  it("переход силуэт → живой элемент без провала: до старта и в кадр старта — та же прозрачность", () => {
    const start = 30;
    expect(posterAlpha("silhouette", start - 1, start, 8)).toBe(PRE_ALPHA.silhouette);
    expect(posterAlpha("silhouette", start, start, 8)).toBe(PRE_ALPHA.silhouette);
    // худший случай — линейный fade-вход длиной len: видимость max(слой, вход) не ниже PRE_ALPHA / 2
    const len = 24;
    for (let f = start; f <= start + len; f++) {
      const live = (f - start) / len;
      expect(Math.max(posterAlpha("silhouette", f, start, len / 3), live)).toBeGreaterThanOrEqual(PRE_ALPHA.silhouette / 2 - 1e-9);
    }
  });
  it("splitBoxStyle: позиция и размер — снаружи, раскладка содержимого и вид — внутри", () => {
    const { outer, inner } = splitBoxStyle({ position: "absolute", left: 10, top: 20, width: 300, display: "flex", gap: 8, padding: 4, background: "#000" });
    expect(outer).toEqual({ position: "absolute", left: 10, top: 20, width: 300 });
    expect(inner).toEqual({ display: "flex", gap: 8, padding: 4, background: "#000" });
    expect(splitBoxStyle(undefined)).toEqual({ outer: {}, inner: {} });
  });
});

describe("S2-fix2 m4: постер под сдвигающим входом гаснет быстро (без двойника)", () => {
  it("rise / slide / blur / swing — ~1/6 входа; fade / scale / pop / mask — 1/3", () => {
    expect(underlayFade("slide", 24)).toBe(4);
    expect(underlayFade("rise", 24)).toBe(4);
    expect(underlayFade("blur", 24)).toBe(4);
    expect(underlayFade("swing", 24)).toBe(4);
    expect(underlayFade("fade", 24)).toBe(8);
    expect(underlayFade("scale", 24)).toBe(8);
    expect(underlayFade("pop", 24)).toBe(8);
    expect(underlayFade("slide", 6)).toBe(1);
  });
});
