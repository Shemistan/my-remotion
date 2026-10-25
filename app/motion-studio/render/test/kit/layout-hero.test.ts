// Проба 0.5.8 (S15b): клетки содержимого кадра (временной проход, empty_half / dead_air) и
// кандидаты героя (одна крупная графика из данных — no_hero / hero_split).
import { describe, expect, it } from "vitest";
import { type LayoutBox, type LayoutItem, contentCells, gridDims, heroCandidates, packCells, summarizeSweep } from "../../src/motion-kit/layout-probe.js";

const FRAME = { w: 1920, h: 1080 };
const item = (text: string, rect: LayoutItem["rect"], role = "scene", fontPx = 32): LayoutItem => ({ id: `${role}#${text}`, role, text, rect, fontPx, opacity: 1 });
const box = (o: Partial<LayoutBox> & Pick<LayoutBox, "rect">): LayoutBox => ({ id: "card::0", kind: "card", filled: true, graphic: false, ...o });
const share = (cells: Uint8Array) => cells.reduce((a, c) => a + c, 0) / cells.length;

describe("gridDims / contentCells / packCells", () => {
  it("сетка 96 × 54 у 16:9 и 96 × 171 у 9:16", () => {
    expect(gridDims(FRAME)).toEqual({ gw: 96, gh: 54 });
    expect(gridDims({ w: 1080, h: 1920 })).toEqual({ gw: 96, gh: 171 });
  });

  it("клетки содержимого — текст, заполненные контейнеры и графика; пустой контейнер — нет", () => {
    const cells = contentCells(
      [item("подпись", { x: 0, y: 0, w: 960, h: 540 })],
      [box({ rect: { x: 960, y: 540, w: 960, h: 540 }, filled: false })],
      [{ x: 960, y: 0, w: 960, h: 540 }],
      FRAME,
    );
    expect(share(cells)).toBeCloseTo(0.5, 2);
  });

  it("упаковка в hex: 4 клетки на знак, длина по сетке", () => {
    const cells = new Uint8Array(8);
    cells[0] = 1;
    cells[5] = 1;
    expect(packCells(cells)).toBe("84");
    expect(packCells(new Uint8Array(96 * 54))).toHaveLength((96 * 54) / 4);
  });
});

describe("heroCandidates", () => {
  it("svg — по объединению фигур, а не по холсту: столбики графика — один кандидат своей площади", () => {
    // три столбика одного svg на расстоянии друг от друга: одна графика, площадь — только фигуры
    const bars = [0, 1, 2].map((k) => ({ x: 400 + k * 400, y: 300, w: 200, h: 600 }));
    const h = heroCandidates({ items: [], boxes: [], graphics: [bars], accents: [] }, FRAME);
    expect(h).toHaveLength(1);
    expect(h[0]!.kind).toBe("graphic");
    expect(h[0]!.share).toBeCloseTo((3 * 200 * 600) / (1920 * 1080), 1);
    expect(h[0]!.share).toBeLessThan(0.25);
  });

  it("две равные карточки с графикой — два кандидата вида box; узлы графа с рёбрами — один кластер graph", () => {
    const two = heroCandidates({
      items: [], graphics: [], accents: [],
      boxes: [box({ id: "a", rect: { x: 100, y: 200, w: 700, h: 600 }, graphic: true }), box({ id: "b", rect: { x: 1100, y: 200, w: 700, h: 600 }, graphic: true })],
    }, FRAME);
    expect(two.map((c) => c.kind)).toEqual(["box", "box"]);
    expect(two[0]!.share).toBeCloseTo(two[1]!.share, 2);
    const graph = heroCandidates({
      items: [], accents: [],
      boxes: [box({ id: "n1", kind: "node", rect: { x: 100, y: 400, w: 300, h: 200 } }), box({ id: "n2", kind: "node", rect: { x: 1500, y: 400, w: 300, h: 200 } })],
      graphics: [[{ x: 400, y: 495, w: 1100, h: 10 }]],
    }, FRAME);
    expect(graph).toHaveLength(1);
    expect(graph[0]!.kind).toBe("graph");
  });

  it("крупное число (кегль ≥ 10 % высоты) — кандидат number; подпись — нет; акцент отмечается", () => {
    const h = heroCandidates({
      items: [item("256", { x: 700, y: 300, w: 500, h: 260 }, "number", 240), item("подпись", { x: 100, y: 900, w: 300, h: 40 })],
      boxes: [], graphics: [], accents: [{ x: 750, y: 350, w: 100, h: 100 }],
    }, FRAME);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ kind: "number", accent: true });
  });

  it("кандидаты — по убыванию площади, мелочь (< 0,5 % кадра) отброшена", () => {
    const h = heroCandidates({ items: [], boxes: [], accents: [], graphics: [[{ x: 0, y: 0, w: 40, h: 40 }], [{ x: 200, y: 200, w: 800, h: 600 }], [{ x: 1200, y: 200, w: 400, h: 300 }]] }, FRAME);
    expect(h.map((c) => Math.round(c.share * 100))).toEqual([23, 6]);
  });
});

describe("summarizeSweep", () => {
  it("кадр прохода: клетки, доля содержимого, кандидаты героя (не больше 4), тексты без кегля", () => {
    const s = summarizeSweep(42, FRAME, {
      items: [item("Swiss Table", { x: 100, y: 100, w: 400, h: 60 })],
      boxes: [],
      graphics: [{ x: 960, y: 0, w: 960, h: 1080 }],
      groups: [[{ x: 960, y: 0, w: 960, h: 1080 }]],
      accents: [],
      areas: { text: 0.01, graphic: 0.5 },
    });
    expect(s.frame).toBe(42);
    expect(s.size).toEqual({ w: 1920, h: 1080 });
    expect(s.cells).toHaveLength((96 * 54) / 4);
    expect(s.content).toBeGreaterThan(0.5);
    expect(s.heroes).toHaveLength(1);
    expect(s.items[0]).toEqual({ id: "scene#Swiss Table", role: "scene", text: "Swiss Table", rect: { x: 100, y: 100, w: 400, h: 60 } });
  });
});
