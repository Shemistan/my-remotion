// Реестр раскладки motion-kit → проблемы QA: наложение текста, токен на подписи, призраки, кегль.
import { describe, expect, it } from "vitest";
import { summarizeLayout, textLineItems } from "@ms/render";
import { layoutIssues, parseLayout } from "../../src/qa/layout.js";

const item = (id: string, role: string, text: string, x: number, y: number, w: number, h: number, fontPx = 32) => ({ id, role, text, rect: { x, y, w, h }, fontPx, opacity: 1 });
const line = (frame: number, items: unknown[], ghosts: unknown[] = [], height = 1080) => `[log] [motion-kit:layout] ${JSON.stringify({ frame, height, items, ghosts })}`;

describe("parseLayout", () => {
  it("берёт только строки реестра, битый JSON пропускает", () => {
    const f = parseLayout(["[error] boom", line(12, [item("a", "label", "Кэш", 0, 0, 100, 30)]), "[log] [motion-kit:layout] {не json"]);
    expect(f).toHaveLength(1);
    expect(f[0]!.frame).toBe(12);
    expect(f[0]!.items[0]!.text).toBe("Кэш");
  });
});

describe("layoutIssues", () => {
  it("токен поверх подписи узла — token_on_label (blocking), кадры одной пары — одна проблема", () => {
    const fr = (f: number) => ({ frame: f, height: 1080, ghosts: [], items: [item("label:db", "label", "База данных", 1000, 400, 260, 40), item("token::3", "token", "user:42", 1080, 395, 150, 50)] });
    const r = layoutIssues([fr(72), fr(84)]);
    expect(r.filter((i) => i.code === "token_on_label")).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: "token_on_label", severity: "blocking", frame: 72 });
    expect(r[0]!.description).toMatch(/user:42/);
    expect(r[0]!.description).toMatch(/База данных/);
    expect(r[0]!.description).toMatch(/72, 84/);
  });
  it("два текста сцены друг на друге — text_overlap (blocking); касание краями — нет", () => {
    const r = layoutIssues([{ frame: 30, height: 1080, ghosts: [], items: [item("a", "scene", "12 релизов", 100, 100, 300, 60), item("b", "number", "×12", 200, 110, 200, 80)] }]);
    expect(r.map((i) => i.code)).toEqual(["text_overlap"]);
    expect(r[0]!.severity).toBe("blocking");
    const touch = layoutIssues([{ frame: 30, height: 1080, ghosts: [], items: [item("a", "scene", "А", 100, 100, 100, 40), item("b", "scene", "Б", 200, 100, 100, 40)] }]);
    expect(touch).toEqual([]);
  });
  it("S2-fix2 N3: строки одного элемента (перенос, несколько текстовых узлов) друг с другом не сравниваются", () => {
    // <div>В {n} раз быстрее, чем база</div>: узел «быстрее, чем база» начат в первой строке и перенесён;
    // его прямоугольник целиком (старый замер) накрывает соседний узел «В 3 раза» той же строки
    const own = (id: string, text: string, x: number, y: number, w: number, h: number) => ({ ...item(id, "scene", text, x, y, w, h), el: "e7" });
    const r = layoutIssues([{ frame: 90, height: 1080, ghosts: [], items: [own("scene#0", "В 3 раза", 0, 0, 200, 40), own("scene#1", "быстрее, чем база", 0, 0, 600, 84)] }]);
    expect(r).toEqual([]);
    // чужой элемент на том же месте — по-прежнему наложение
    const other = layoutIssues([{ frame: 90, height: 1080, ghosts: [], items: [own("scene#0", "В 3 раза", 0, 0, 200, 40), { ...item("scene#2", "scene", "x2", 20, 4, 120, 40), el: "e8" }] }]);
    expect(other.map((i) => i.code)).toEqual(["text_overlap"]);
  });
  it("S2-fix2 N3: перенесённая подпись рядом с соседом — построчные прямоугольники не дают ложного text_overlap", () => {
    const wrap = textLineItems({ owner: null, role: "scene", el: "e1", fontPx: 32, opacity: 1 }, "быстрее, чем база", [
      { left: 200, top: 0, width: 400, height: 40 },
      { left: 0, top: 44, width: 300, height: 40 },
      { left: 0, top: 0, width: 0, height: 40 },
    ], { x: 0, y: 0 });
    expect(wrap.map((w) => w.rect)).toEqual([{ x: 200, y: 0, w: 400, h: 40 }, { x: 0, y: 44, w: 300, h: 40 }]);
    const sibling = { owner: null, role: "scene", el: "e2", text: "×3", rect: { x: 340, y: 44, w: 120, h: 40 }, fontPx: 32, opacity: 1 };
    const f = summarizeLayout(90, 1080, [...wrap, sibling]);
    expect(layoutIssues([f])).toEqual([]);
  });
  it("призраки — ghost_text (blocking)", () => {
    const r = layoutIssues([{ frame: 48, height: 1080, items: [], ghosts: [{ text: "GET /user/42", count: 3 }] }]);
    expect(r).toMatchObject([{ code: "ghost_text", severity: "blocking", frame: 48 }]);
  });
  it("кегль меньше 22 px при 1080 — min_font (warning); на 540p предел 11 px", () => {
    const small = layoutIssues([{ frame: 60, height: 1080, ghosts: [], items: [item("a", "scene", "800 тыс.", 0, 0, 80, 16, 15)] }]);
    expect(small).toMatchObject([{ code: "min_font", severity: "warning" }]);
    expect(small[0]!.description).toMatch(/15/);
    expect(layoutIssues([{ frame: 60, height: 540, ghosts: [], items: [item("a", "scene", "ок", 0, 0, 40, 14, 11)] }])).toEqual([]);
  });
});
