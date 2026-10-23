// checkPreserve (Task 18): что правка обещала сохранить — композиция (± 2 % кадра), палитра,
// тексты, тайминги.
import { describe, expect, it } from "vitest";
import type { LayoutFrame } from "../../src/qa/layout.js";
import { checkPreserve, compareHoldLayout } from "../../src/pipeline/preserve.js";
import { moved, props180, spec180 } from "./edit-fixtures.js";

const p = props180;

describe("checkPreserve", () => {
  it("composition: сдвиг на 3 % — blocking composition_changed, на 1,5 % — норма", () => {
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.03 }), p, p, ["composition"])[0]).toMatchObject({ code: "composition_changed", severity: "blocking", area: "orch" });
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.015 }), p, p, ["composition"])).toEqual([]);
    expect(checkPreserve(spec180, moved(spec180, "user", { y: -0.025 }), p, p, ["composition"])).toHaveLength(1);
    // без preserve composition сдвиг не проверяется
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.1 }), p, p, [])).toEqual([]);
  });

  it("palette: другая разрешённая палитра — blocking palette_changed; та же — норма", () => {
    const purple = { ...p, style: { ...p.style, palette_overrides: { accent: ["#a06bff"] } } };
    expect(checkPreserve(spec180, spec180, p, purple, ["palette"])[0]).toMatchObject({ code: "palette_changed", severity: "blocking" });
    expect(checkPreserve(spec180, spec180, p, { ...p, style: { ...p.style, depth: 3 } }, ["palette"])).toEqual([]);
  });

  it("text: content текстовых элементов", () => {
    const next = { ...spec180, elements: spec180.elements.map((e) => (e.id === "title" ? { ...e, content: { text: "Другой" } } : e)) };
    expect(checkPreserve(spec180, next, p, p, ["text"])[0]).toMatchObject({ code: "text_changed", area: "title" });
    expect(checkPreserve(spec180, spec180, p, p, ["text"])).toEqual([]);
  });

  it("timing: длительность и границы битов", () => {
    const next = { ...spec180, duration_frames: 240 };
    expect(checkPreserve(spec180, next, p, p, ["timing"])[0]).toMatchObject({ code: "timing_changed" });
  });

  it("composition (M1): элемент spec пропал или изменил размер > 2 % — blocking", () => {
    const gone = { ...spec180, elements: spec180.elements.filter((e) => e.id !== "user") };
    expect(checkPreserve(spec180, gone, p, p, ["composition"])[0]).toMatchObject({ code: "composition_changed", severity: "blocking", area: "user" });
    const bigger = { ...spec180, elements: spec180.elements.map((e) => (e.id === "orch" && e.layout ? { ...e, layout: { ...e.layout, w: e.layout.w * 2 } } : e)) };
    expect(checkPreserve(spec180, bigger, p, p, ["composition"])[0]).toMatchObject({ code: "composition_changed", area: "orch" });
  });

  it("composition (I1): раскладка props.content — сдвиг узла > 2 %, размер, пропавший узел — blocking; ± 1,5 % — норма", () => {
    const withNodes = (nodes: { id: string; layout: { x: number; y: number; w: number; h: number } }[]) => ({ ...p, content: { title: "AI-агент", nodes, quote: { text: "…", layout: { x: 0, y: 0.03, w: 0.33, h: 0.24 } } } });
    const base = withNodes([{ id: "node-user", layout: { x: 0, y: 0.29, w: 0.24, h: 0.42 } }, { id: "node-orch", layout: { x: 0.365, y: 0.32, w: 0.27, h: 0.36 } }]);
    const shifted = withNodes([{ id: "node-user", layout: { x: 0, y: 0.29, w: 0.24, h: 0.42 } }, { id: "node-orch", layout: { x: 0.415, y: 0.32, w: 0.27, h: 0.36 } }]);
    const issues = checkPreserve(spec180, spec180, base, shifted, ["composition"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "composition_changed", severity: "blocking", area: "content.nodes[node-orch].layout" });
    const near = withNodes([{ id: "node-user", layout: { x: 0.015, y: 0.29, w: 0.24, h: 0.42 } }, { id: "node-orch", layout: { x: 0.365, y: 0.305, w: 0.27, h: 0.36 } }]);
    expect(checkPreserve(spec180, spec180, base, near, ["composition"])).toEqual([]);
    const resized = withNodes([{ id: "node-user", layout: { x: 0, y: 0.29, w: 0.3, h: 0.42 } }, { id: "node-orch", layout: { x: 0.365, y: 0.32, w: 0.27, h: 0.36 } }]);
    expect(checkPreserve(spec180, spec180, base, resized, ["composition"])[0]).toMatchObject({ area: "content.nodes[node-user].layout" });
    const removed = withNodes([{ id: "node-orch", layout: { x: 0.365, y: 0.32, w: 0.27, h: 0.36 } }]);
    expect(checkPreserve(spec180, spec180, base, removed, ["composition"])[0]).toMatchObject({ area: "content.nodes[node-user].layout" });
    // порядок узлов в массиве не важен — сверка по id
    expect(checkPreserve(spec180, spec180, base, withNodes([...base.content.nodes].reverse()), ["composition"])).toEqual([]);
    // раскладка в px — доля кадра по размеру кадра
    const px = (x: number) => ({ ...p, content: { box: { x, y: 540, w: 300, h: 200 } } });
    expect(checkPreserve(spec180, spec180, px(960), px(980), ["composition"], 0.02, { size: { width: 1920, height: 1080 } })).toEqual([]);
    expect(checkPreserve(spec180, spec180, px(960), px(1040), ["composition"], 0.02, { size: { width: 1920, height: 1080 } })).toHaveLength(1);
  });
});

const item = (id: string, role: string, text: string, x: number, y: number, w = 200, h = 40) => ({ id, role, text, rect: { x, y, w, h }, fontPx: 30, opacity: 1 });
const frame = (f: number, items: ReturnType<typeof item>[]): LayoutFrame => ({ frame: f, height: 1080, items, ghosts: [] });
const size = { width: 1920, height: 1080 };

describe("compareHoldLayout (кадр hold базы и новой версии по реестру раскладки)", () => {
  const base = frame(179, [
    item("label:node-orch:0", "label", "Оркестратор", 800, 500),
    item("label:node-user:1", "label", "Пользователь", 100, 500),
    item("text::2", "text", "Бронь готова", 900, 900),
    item("scene#7", "scene", "AI-агент", 860, 60, 300, 60),
    item("token:t1:3", "token", "12 рейсов", 1200, 300),
  ]);

  it("те же позиции (палитра и глубина не важны), токены в пути не сверяются, порядок владельцев другой — норма", () => {
    const next = frame(239, [
      item("label:node-user:0", "label", "Пользователь", 105, 500),
      item("label:node-orch:1", "label", "Оркестратор", 800, 510),
      item("text::2", "text", "Бронь готова", 900, 900),
      item("scene#3", "scene", "AI-агент", 860, 60, 300, 60),
      item("token:t1:4", "token", "12 рейсов", 1500, 700),
    ]);
    expect(compareHoldLayout(base, next, size)).toEqual([]);
  });

  it("подпись узла сдвинута на 5 % ширины — blocking composition_changed с кадрами; пропавший текст — тоже", () => {
    const next = frame(239, [
      item("label:node-orch:0", "label", "Оркестратор", 900, 500),
      item("text::2", "text", "Бронь готова", 900, 900),
      item("scene#7", "scene", "AI-агент", 860, 60, 300, 60),
    ]);
    const issues = compareHoldLayout(base, next, size);
    expect(issues.map((x) => x.area).sort()).toEqual(["label:node-orch", "label:node-user"]);
    expect(issues[0]).toMatchObject({ code: "composition_changed", severity: "blocking", source: "programmatic", frame: 239 });
    expect(issues.find((x) => x.area === "label:node-orch")!.description).toMatch(/179.*239|hold/);
  });

  it("размер текста того же содержания вырос > 2 % — blocking; текст сменился на месте — норма", () => {
    const next = frame(239, [
      item("label:node-orch:0", "label", "Оркестратор", 800, 500, 300, 60),
      item("label:node-user:1", "label", "Пользователь", 100, 500),
      item("text::2", "text", "Бронь оформлена", 900, 900, 260),
      item("scene#7", "scene", "AI-агент", 860, 60, 300, 60),
    ]);
    const issues = compareHoldLayout(base, next, size);
    expect(issues.map((x) => x.area)).toEqual(["label:node-orch"]);
  });
});

describe("compareHoldLayout: законная смена текста — не сдвиг (I-R1)", () => {
  const withEl = (it: ReturnType<typeof item>, el: string) => ({ ...it, el });

  it("длинная замена подписи, выровненной влево: левый край и верх на месте — норма (было 18,2 % ложно)", () => {
    const base = frame(179, [item("label:title:0", "label", "Бронь", 100, 60, 200, 60)]);
    const next = frame(239, [item("label:title:0", "label", "Бронирование отеля за три шага", 100, 60, 900, 60)]);
    expect(compareHoldLayout(base, next, size)).toEqual([]);
  });

  it("выравнивание по центру и вправо: центр или правый край на месте — норма", () => {
    const base = frame(179, [item("label:a:0", "label", "Итог", 860, 500, 200, 40), item("label:b:1", "label", "12", 1600, 700, 100, 40)]);
    const next = frame(239, [item("label:a:0", "label", "Итог за квартал по всем рынкам", 560, 500, 800, 40), item("label:b:1", "label", "12 000 000", 1300, 700, 400, 40)]);
    expect(compareHoldLayout(base, next, size)).toEqual([]);
  });

  it("новый текст перенёсся на вторую строку (верх тот же или центр по вертикали тот же) — норма", () => {
    const base = frame(179, [item("label:title:0", "label", "Бронь", 100, 60, 200, 60), item("label:node:1", "label", "Оплата", 800, 500, 200, 60)]);
    const next = frame(239, [
      item("label:title:0", "label", "Бронирование отеля за три простых шага", 100, 60, 700, 120),
      item("label:node:1", "label", "Оплата картой или по счёту", 800, 470, 220, 120),
    ]);
    expect(compareHoldLayout(base, next, size)).toEqual([]);
  });

  it("текст без id (сцена, владелец без data-ms-id) сменился на длинный — на том же месте не «пропал»", () => {
    const base = frame(179, [item("scene#7", "scene", "AI-агент", 860, 60, 300, 60), item("text::2", "text", "Бронь готова", 900, 900, 200, 40)]);
    const next = frame(239, [item("scene#3", "scene", "AI-агент: путь запроса от пользователя", 860, 60, 1000, 60), item("text::2", "text", "Бронирование подтверждено и оплачено", 900, 900, 700, 40)]);
    expect(compareHoldLayout(base, next, size)).toEqual([]);
  });

  it("текст сцены переносится: строки одного элемента — разные записи реестра; лишняя или ушедшая строка — норма", () => {
    const base = frame(179, [withEl(item("scene#0", "scene", "Короткая", 100, 300, 300, 50), "e0"), withEl(item("scene#1", "scene", "подпись", 100, 350, 200, 50), "e0")]);
    const one = frame(239, [withEl(item("scene#0", "scene", "Одна строка", 100, 300, 400, 50), "e0")]);
    expect(compareHoldLayout(base, one, size)).toEqual([]);
    const three = frame(239, [
      withEl(item("scene#0", "scene", "Теперь очень длинная", 100, 300, 600, 50), "e0"),
      withEl(item("scene#1", "scene", "подпись в три", 100, 350, 500, 50), "e0"),
      withEl(item("scene#2", "scene", "строки", 100, 400, 200, 50), "e0"),
    ]);
    expect(compareHoldLayout(base, three, size)).toEqual([]);
  });

  it("настоящий сдвиг по-прежнему blocking: сменился текст и подпись уехала; текст без id уехал; тот же текст сдвинут", () => {
    const base = frame(179, [item("label:title:0", "label", "Бронь", 100, 60, 200, 60), item("scene#7", "scene", "AI-агент", 860, 60, 300, 60), item("label:n:1", "label", "Оплата", 800, 500, 200, 40)]);
    const next = frame(239, [
      item("label:title:0", "label", "Бронирование отеля", 400, 60, 500, 60),
      item("scene#2", "scene", "AI-агент: путь", 860, 400, 500, 60),
      item("label:n:1", "label", "Оплата", 800, 600, 200, 40),
    ]);
    const issues = compareHoldLayout(base, next, size);
    expect(issues.map((x) => x.area).sort()).toEqual(["label:n", "label:title", "scene"]);
    expect(issues.every((x) => x.code === "composition_changed" && x.severity === "blocking")).toBe(true);
    // подпись сменилась по правке — подсказка не велит вернуть старый текст
    const title = issues.find((x) => x.area === "label:title")!;
    expect(title.fix_hint).toContain("Бронирование отеля");
    expect(title.fix_hint).not.toMatch(/верни «Бронь»/);
  });

  it("текст элемента, убранного по плану (M-R1), из кадра hold не ждём; прочие пропажи — blocking", () => {
    const base = frame(179, [item("text::0", "text", "beta", 1300, 980, 120, 40), item("label:n:1", "label", "Оплата", 800, 500, 200, 40)]);
    const next = frame(239, []);
    expect(compareHoldLayout(base, next, size, 0.02, { removed: ["beta"] }).map((x) => x.area)).toEqual(["label:n"]);
  });
});
