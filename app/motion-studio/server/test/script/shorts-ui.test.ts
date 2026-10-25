// S10 fix I1: интерфейс Shorts в кадре 9:16 — по реестру раскладки kit (`[motion-kit:layout]`).
// Текст или число ниже 80 % высоты — `shorts_ui_bottom` (blocking: исправляет Engineer);
// прямоугольник в правой колонке кнопок (x + w > 0,87·W, по высоте 0,52–0,80·H) —
// `shorts_ui_right` (warning, подсказка). Синтетическая проба.
import { describe, expect, it } from "vitest";
import { defaultSettings, type Settings } from "@ms/contracts";
import type { LayoutFrame, LayoutItem } from "../../src/qa/layout.js";
import { shortsUiIssues } from "../../src/script/overlay-check.js";

const vertical: Settings = { ...defaultSettings(), aspect_ratio: "9:16", width: 1080, height: 1920, safe_area: { x: 0.06, y: 0.15 } };
const item = (id: string, text: string, rect: LayoutItem["rect"], over: Partial<LayoutItem> = {}): LayoutItem => ({ id, role: "label", text, rect, fontPx: 40, opacity: 1, ...over });
const frame = (n: number, items: LayoutItem[], extra: Partial<LayoutFrame> = {}, height = 1920): LayoutFrame => ({ frame: n, height, items, ghosts: [], ...extra });

describe("shortsUiIssues", () => {
  it("текст ниже 80 % высоты — shorts_ui_bottom (blocking); выше — нет", () => {
    const ok = frame(10, [item("title", "1 к 256", { x: 100, y: 300, w: 600, h: 200 }), item("cap", "подпись", { x: 100, y: 1400, w: 600, h: 130 })]); // 1530 < 1536
    expect(shortsUiIssues([ok], vertical)).toEqual([]);
    const low = frame(20, [item("cap", "6,2 из 8", { x: 100, y: 1450, w: 600, h: 120 })]); // 1570 > 1536
    const issues = shortsUiIssues([ok, low], vertical);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "shorts_ui_bottom", severity: "blocking", source: "programmatic", frame: 20, area: "cap" });
    expect(issues[0]!.description).toContain("«6,2 из 8»");
    expect(issues[0]!.fix_hint).toMatch(/80 %/);
  });

  it("проба в половинном разрешении — доли от её высоты; прозрачный текст не считается", () => {
    const half = frame(5, [item("a", "низ", { x: 50, y: 780, w: 200, h: 10 }), item("b", "уходит", { x: 50, y: 900, w: 200, h: 40 }, { opacity: 0 })], {}, 960); // 790 > 768
    expect(shortsUiIssues([half], vertical).map((x) => [x.code, x.area])).toEqual([["shorts_ui_bottom", "a"]]);
  });

  it("правая колонка кнопок: текст или контейнер с x + w > 0,87·W на высоте 0,52–0,80·H — shorts_ui_right (warning)", () => {
    const right = frame(30, [item("val", "256", { x: 700, y: 1100, w: 300, h: 100 })], { boxes: [{ id: "card", kind: "card", rect: { x: 600, y: 1200, w: 400, h: 200 }, filled: true, graphic: false }] }); // 1000 > 939.6
    const issues = shortsUiIssues([right], vertical);
    expect(issues.map((x) => [x.code, x.severity])).toEqual([["shorts_ui_right", "warning"]]);
    expect(issues[0]!.area).toBe("val, card");
    // выше колонки (до 0,52·H) или левее — не мешает
    const clear = frame(31, [item("top", "заголовок", { x: 700, y: 300, w: 340, h: 100 }), item("left", "слева", { x: 100, y: 1200, w: 600, h: 100 })]);
    expect(shortsUiIssues([clear], vertical)).toEqual([]);
  });

  it("не 9:16 — проверки нет", () => {
    const low = frame(20, [item("cap", "низ", { x: 100, y: 1000, w: 1800, h: 70 })], {}, 1080);
    expect(shortsUiIssues([low], defaultSettings())).toEqual([]);
  });
});
