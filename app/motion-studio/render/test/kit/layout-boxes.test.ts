// Реестр раскладки 0.5.5 (S14): контейнеры kit (`data-ms-box`: карточка, узел, панель) с
// признаком «есть содержимое» и доли кадра под текстом и под графикой — данные для QA
// `empty_container` и `text_dominant` сцены сценария.
import { describe, expect, it } from "vitest";
import { type LayoutItem, type RawBox, areaShares, summarizeBoxes } from "../../src/motion-kit/layout-probe.js";

const item = (text: string, rect: LayoutItem["rect"], role = "scene", fontPx = 32): LayoutItem => ({ id: `${role}#${text}`, role, text, rect, fontPx, opacity: 1 });
const box = (o: Partial<RawBox> & Pick<RawBox, "rect">): RawBox => ({ id: "c", kind: "card", opacity: 1, graphic: false, ...o });
const FRAME = { w: 1920, h: 1080 };

describe("summarizeBoxes", () => {
  it("карточка без текста и графики внутри — пустая; с подписью или графикой — нет", () => {
    const boxes = summarizeBoxes([
      box({ id: "empty", rect: { x: 100, y: 600, w: 300, h: 200 } }),
      box({ id: "label", rect: { x: 500, y: 600, w: 300, h: 200 } }),
      box({ id: "chart", rect: { x: 900, y: 600, w: 300, h: 200 }, graphic: true }),
    ], [item("Swiss Table", { x: 540, y: 680, w: 200, h: 40 })], FRAME);
    expect(boxes.map((b) => [b.id, b.filled])).toEqual([["empty", false], ["label", true], ["chart", true]]);
  });

  it("невидимый и крошечный контейнер в реестр не попадает", () => {
    const boxes = summarizeBoxes([
      box({ id: "ghost", rect: { x: 0, y: 0, w: 300, h: 200 }, opacity: 0.2 }),
      box({ id: "dot", rect: { x: 0, y: 0, w: 20, h: 20 } }),
    ], [], FRAME);
    expect(boxes).toEqual([]);
  });
});

describe("areaShares", () => {
  it("подписи без графики — текст есть, графики нет", () => {
    const a = areaShares([item("Заголовок сцены", { x: 200, y: 200, w: 1200, h: 120 })], [], [], FRAME);
    expect(a.graphic).toBe(0);
    expect(a.text).toBeGreaterThan(0.05);
  });

  it("график на полкадра — графика больше текста; крупное число героя — графика", () => {
    const a = areaShares([item("подпись", { x: 100, y: 900, w: 300, h: 40 })], [], [{ x: 160, y: 200, w: 1600, h: 600 }], FRAME);
    expect(a.graphic).toBeGreaterThan(0.4);
    expect(a.text).toBeLessThan(a.graphic);
    const n = areaShares([item("256", { x: 700, y: 300, w: 500, h: 260 }, "number", 240)], [], [], FRAME);
    expect(n.graphic).toBeGreaterThan(0.05);
    expect(n.text).toBe(0);
  });

  it("карточка только с текстом — площадь текста, с графикой — графики; перекрытия не удваиваются", () => {
    const card = { id: "c", kind: "card", rect: { x: 0, y: 0, w: 960, h: 540 }, filled: true, graphic: false };
    const a = areaShares([item("строка", { x: 10, y: 10, w: 200, h: 40 })], [card], [], FRAME);
    expect(a.text).toBeCloseTo(0.25, 1);
    const b = areaShares([], [{ ...card, graphic: true }], [{ x: 0, y: 0, w: 960, h: 540 }], FRAME);
    expect(b.graphic).toBeCloseTo(0.25, 1);
    expect(b.text).toBe(0);
  });
});
