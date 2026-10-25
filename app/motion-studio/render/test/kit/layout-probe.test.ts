// Реестр раскладки: свод кадра по владельцам и «призраки» (один текст дважды друг на друге).
import { describe, expect, it } from "vitest";
import { type RawText, VISIBLE_OPACITY, summarizeLayout } from "../../src/motion-kit/layout-probe.js";
import { statusSwapOpacity } from "../../src/motion-kit/components/StatusChip.js";

const raw = (o: Partial<RawText> & Pick<RawText, "text" | "rect">): RawText => ({ owner: null, role: "scene", fontPx: 32, opacity: 1, ...o });

describe("summarizeLayout", () => {
  it("текст одного владельца — один элемент: объединение прямоугольников, наименьший кегль", () => {
    const f = summarizeLayout(12, 1080, [
      raw({ owner: "number::1", role: "number", text: "68", rect: { x: 100, y: 100, w: 120, h: 90 }, fontPx: 120 }),
      raw({ owner: "number::1", role: "number", text: "%", rect: { x: 225, y: 140, w: 40, h: 45 }, fontPx: 60 }),
      raw({ text: "подпись", rect: { x: 100, y: 300, w: 200, h: 30 }, fontPx: 18 }),
    ]);
    expect(f.frame).toBe(12);
    expect(f.items).toHaveLength(2);
    const n = f.items.find((i) => i.role === "number")!;
    expect(n.rect).toEqual({ x: 100, y: 100, w: 165, h: 90 });
    expect(n.fontPx).toBe(60);
    expect(f.ghosts).toEqual([]);
  });
  it("Task 37′ fix 2: у text/number — части по строкам (слова, строки) для word_gap; у подписей — нет", () => {
    const f = summarizeLayout(5, 1080, [
      raw({ owner: "text::0", role: "text", text: "не", rect: { x: 100, y: 100, w: 80, h: 100 }, fontPx: 88, opacity: 0.5 }),
      raw({ owner: "text::0", role: "text", text: "прерывая", rect: { x: 200, y: 100, w: 300, h: 100 }, fontPx: 88 }),
      raw({ owner: "label::0", role: "label", text: "ось", rect: { x: 100, y: 400, w: 80, h: 30 }, fontPx: 24 }),
    ]);
    expect(f.items.find((i) => i.role === "text")!.lines).toEqual([
      { text: "не", rect: { x: 100, y: 100, w: 80, h: 100 }, fontPx: 88, opacity: 0.5 },
      { text: "прерывая", rect: { x: 200, y: 100, w: 300, h: 100 }, fontPx: 88, opacity: 1 },
    ]);
    expect(f.items.find((i) => i.role === "label")!.lines).toBeUndefined();
  });
  it("невидимое (силуэт, приглушённый кикер, уходящий статус) не считается", () => {
    const f = summarizeLayout(0, 1080, [raw({ text: "РУБРИКА", rect: { x: 0, y: 0, w: 300, h: 30 }, opacity: 0.3 })]);
    expect(f.items).toEqual([]);
  });
  it("копии текста друг на друге — призрак (след из копий карточки)", () => {
    const at = (x: number, o: number) => raw({ text: "#4821", rect: { x, y: 200, w: 120, h: 40 }, opacity: o });
    const f = summarizeLayout(72, 1080, [at(300, 1), at(280, 0.6), at(262, 0.4)]);
    expect(f.ghosts).toEqual([{ text: "#4821", count: 3 }]);
    // тот же текст в разных местах кадра — не призрак
    expect(summarizeLayout(72, 1080, [at(100, 1), at(700, 1)]).ghosts).toEqual([]);
  });
});

describe("S2-fix M2: смена текста StatusChip", () => {
  it("уходящий и новый текст не видны вместе (порог реестра) — смена «переворотом»", () => {
    for (let k = 0; k <= 1.0001; k += 0.02) {
      const o = statusSwapOpacity(k);
      expect(Math.min(o.prev, o.cur)).toBeLessThan(VISIBLE_OPACITY);
    }
    expect(statusSwapOpacity(0)).toEqual({ prev: 1, cur: 0 });
    expect(statusSwapOpacity(1)).toEqual({ prev: 0, cur: 1 });
  });
  it("тексты разных владельцев (уходящая строка — свой data-ms-layout) не склеиваются", () => {
    const f = summarizeLayout(10, 1080, [
      { owner: "status::0", role: "status", text: "ПОПАДАНИЕ", rect: { x: 0, y: 0, w: 200, h: 30 }, fontPx: 24, opacity: 1 },
      { owner: "status::1", role: "status", text: "ЗАПИСЬ", rect: { x: 10, y: 0, w: 150, h: 30 }, fontPx: 24, opacity: 0.6 },
    ]);
    expect(f.items).toHaveLength(2);
  });
});
