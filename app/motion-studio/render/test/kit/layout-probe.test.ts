// Реестр раскладки: свод кадра по владельцам и «призраки» (один текст дважды друг на друге).
import { describe, expect, it } from "vitest";
import { type RawText, summarizeLayout } from "../../src/motion-kit/layout-probe.js";

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
