// S14: проверки сцены сценария по реестру раскладки финального кадра (kit 0.5.5: контейнеры и
// доли площади): пустой контейнер и подписи-заглушки — blocking (исправление Engineer), текст
// вместо графики — warning с подсказкой «визуальный герой».
import { describe, expect, it } from "vitest";
import { type LayoutFrame, type LayoutItem, scriptLayoutIssues } from "../../src/qa/layout.js";

const item = (id: string, text: string, x: number, y: number, role = "scene"): LayoutItem => ({ id, role, text, rect: { x, y, w: 200, h: 40 }, fontPx: 32, opacity: 1 });
const frame = (over: Partial<LayoutFrame>): LayoutFrame => ({ frame: 320, height: 1080, items: [], ghosts: [], boxes: [], areas: { text: 0.05, graphic: 0.3 }, ...over });
const codes = (f: LayoutFrame[]) => scriptLayoutIssues(f).map((i) => `${i.code}:${i.severity}`);

describe("scriptLayoutIssues", () => {
  it("пустая карточка в финальном кадре — blocking empty_container (ss_001 до S14)", () => {
    const f = frame({ boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 600, w: 300, h: 200 }, filled: false, graphic: false }] });
    const out = scriptLayoutIssues([f]);
    expect(out.map((i) => i.code)).toEqual(["empty_container"]);
    expect(out[0]!.severity).toBe("blocking");
    expect(out[0]!.frame).toBe(320);
  });

  it("пустая карточка только на раннем кадре (вход) — не брак: смотрим финальный кадр", () => {
    const early = frame({ frame: 40, boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 600, w: 300, h: 200 }, filled: false, graphic: false }] });
    expect(codes([early, frame({})])).toEqual([]);
  });

  it("«вопрос» ×3 в узлах и «?» в трёх карточках — blocking placeholder_label", () => {
    const nodes = frame({ items: [item("label:q1:0", "вопрос", 0, 0), item("label:q2:1", "вопрос", 0, 100), item("label:q3:2", "вопрос", 0, 200)] });
    expect(codes([nodes])).toEqual(["placeholder_label:blocking"]);
    const glyphs = frame({ items: [item("scene#1", "?", 0, 0), item("scene#2", "?", 300, 0), item("scene#3", "?", 600, 0)] });
    expect(codes([glyphs])).toEqual(["placeholder_label:blocking"]);
  });

  it("подпись-тип в карточке со своим именем («Веб-поиск» · «инструмент» ×3) — не заглушка", () => {
    const cards = [0, 1, 2].map((k) => ({ id: `card::${k}`, kind: "card", rect: { x: k * 400, y: 0, w: 360, h: 200 }, filled: true, graphic: false }));
    const items = ["Веб-поиск", "База знаний", "Калькулятор"].flatMap((t, k) => [item(`t${k}`, t, k * 400 + 20, 20), item(`c${k}`, "инструмент", k * 400 + 20, 100)]);
    expect(codes([frame({ boxes: cards, items })])).toEqual([]);
  });

  it("статусы («актуален» ×3) и подписи с числом — не заглушки", () => {
    const ok = frame({ items: [item("status::0", "актуален", 0, 0, "status"), item("status::1", "актуален", 0, 100, "status"), item("status::2", "актуален", 0, 200, "status"), item("a", "Шаг 1", 0, 300), item("b", "Шаг 1", 0, 400), item("c", "Шаг 1", 0, 500)] });
    expect(codes([ok])).toEqual([]);
  });

  it("текст ≫ графики в hold — warning text_dominant с долями; график на треть кадра — норма", () => {
    const out = scriptLayoutIssues([frame({ areas: { text: 0.22, graphic: 0.03 } })]);
    expect(out.map((i) => `${i.code}:${i.severity}`)).toEqual(["text_dominant:warning"]);
    expect(out[0]!.description).toMatch(/22 %/);
    expect(out[0]!.fix_hint).toMatch(/визуальный герой/);
    expect(codes([frame({ areas: { text: 0.2, graphic: 0.32 } })])).toEqual([]);
  });

  it("проба старого kit (без boxes и areas) — проверок нет", () => {
    expect(codes([{ frame: 10, height: 1080, items: [], ghosts: [] }])).toEqual([]);
  });
});
