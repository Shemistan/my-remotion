// Cold-open — крючок, а не спойлер (S3-fix2): итог в полную силу с кадра 0, уходит целиком к
// концу бита-крючка, на объяснении его нет (ни кадра «призрака»), возвращается на ударе.
// Постер с текстом — только у текста открытия.
import { describe, expect, it } from "vitest";
import { coldOpenAt, coldOpenStyle, coldOpenTiming } from "../../src/motion-kit/choreo/cold-open.js";
import { TEXT_POSTER_S, textPosterOk } from "../../src/motion-kit/choreo/enter.js";
import { planBeats } from "../../src/motion-kit/choreo/plan.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

describe("coldOpenAt: крючок → уход → нет → возврат", () => {
  for (const intensity of ["calm", "balanced", "energetic"] as const) {
    for (const fps of [24, 30, 60]) {
      it(`${intensity}, ${fps} fps: на объяснении итога нет совсем, в крючке и после удара — в полную силу`, () => {
        const s = resolveStyle({ preset: "dark-premium", intensity, fps: { num: fps, den: 1 } });
        const D = 6 * fps;
        const p = planBeats({
          structure: "cold-open", duration: D, fps, intensity, seed: "x", phases: [
            { id: "setup", role: "setup", weight: 1, elements: 2 }, { id: "act", role: "action", weight: 3, elements: 3 },
            { id: "pay", role: "payoff", weight: 1, chars: 12 }, { id: "hold", role: "hold", weight: 1, chars: 12 },
          ],
        });
        const open = p.beats.find((b) => b.kind === "open")!;
        const T = coldOpenTiming(s, open);
        // крючок читается в полную силу не меньше 0,7 с
        expect(open.end_frame - T.exit).toBeGreaterThanOrEqual(Math.round(0.7 * fps));
        for (let f = 0; f < D; f++) {
          const c = coldOpenAt(f, open, p.strike, s);
          if (f < open.end_frame - T.exit) expect(c, `кадр ${f}`).toMatchObject({ phase: "hook", opacity: 1 });
          else if (f < open.end_frame) expect(c.phase).toBe("exit");
          else if (f < p.strike) expect(c, `кадр ${f}: призрак итога на объяснении`).toMatchObject({ phase: "gone", opacity: 0 });
          else expect(c.phase).toBe("return");
        }
        // уход доходит почти до нуля, возврат — до полной силы за вход
        expect(coldOpenAt(open.end_frame - 1, open, p.strike, s).opacity).toBeLessThan(0.2);
        expect(coldOpenAt(p.strike + T.back, open, p.strike, s)).toMatchObject({ opacity: 1, scale: 1 });
        // кадр 0 — сам итог (собранный постер); крючок не стоп-кадр: наезд
        expect(coldOpenAt(0, open, p.strike, s).opacity).toBe(1);
        expect(coldOpenAt(open.end_frame - T.exit - 1, open, p.strike, s).scale).toBeGreaterThan(coldOpenAt(0, open, p.strike, s).scale + 0.02);
        expect(coldOpenStyle(coldOpenAt(open.end_frame + 1, open, p.strike, s)).visibility).toBe("hidden");
      });
    }
  }
});

describe("постер с текстом — только у текста открытия", () => {
  it(`вход до ${TEXT_POSTER_S} с — можно (кикер), позже — нет (вывод)`, () => {
    expect(textPosterOk(0, 30)).toBe(true);
    expect(textPosterOk(45, 30)).toBe(true);
    expect(textPosterOk(46, 30)).toBe(false);
    expect(textPosterOk(96, 30)).toBe(false);
    expect(textPosterOk(90, 60)).toBe(true);
  });
});
