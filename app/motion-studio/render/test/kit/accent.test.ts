// accentPulse: единый акцент kit — удар в начале бита и дыхание удержания.
import { describe, expect, it } from "vitest";
import { accentPulse } from "../../src/motion-kit/choreo/accent.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const BEAT = { start_frame: 30, end_frame: 90 };
const at = (f: number, o: Partial<Parameters<typeof accentPulse>[2]> = {}, s = st) => accentPulse(f, s, { beat: BEAT, ...o });

describe("accentPulse", () => {
  it("до бита — покой: нет свечения, масштаб 1", () => {
    expect(at(0)).toMatchObject({ level: 0, scale: 1, strike: 0, hold: 0 });
    expect(at(29)).toMatchObject({ level: 0, scale: 1 });
  });

  it("удар: за несколько кадров от начала бита свечение ≈ 1 и масштаб вырастает", () => {
    const peak = Math.max(...Array.from({ length: 10 }, (_, i) => at(30 + i).level));
    expect(peak).toBeGreaterThan(0.97);
    const maxScale = Math.max(...Array.from({ length: 10 }, (_, i) => at(30 + i).scale));
    expect(maxScale).toBeGreaterThan(1.04);
    expect(maxScale).toBeLessThan(1.1);
  });

  it("без скачков: соседние кадры отличаются плавно (атака — за несколько кадров)", () => {
    for (let f = 0; f < 400; f++) {
      expect(Math.abs(at(f + 1).level - at(f).level), `кадр ${f}`).toBeLessThan(0.4);
      expect(Math.abs(at(f + 1).scale - at(f).scale), `кадр ${f}`).toBeLessThan(0.02);
    }
  });

  it("loop: удержание живёт до конца сцены — свечение дышит, но не гаснет", () => {
    for (const N of [150, 240, 600]) {
      const win = Array.from({ length: 90 }, (_, i) => at(N - 90 + i).level);
      expect(Math.max(...win) - Math.min(...win), `N=${N}`).toBeGreaterThan(0.25);
      expect(Math.min(...win), `N=${N}`).toBeGreaterThan(0.25);
      // кадры N−20 и N−1 различаются (проверка «финальный акцент жив») хоть где-то в окне
    }
    const diffs = Array.from({ length: 90 }, (_, i) => Math.abs(at(200 + i).level - at(181 + i).level));
    expect(Math.max(...diffs)).toBeGreaterThan(0.2);
  });

  it("удержание заметно: размах свечения ≥ 0.5 при balanced, во впадине ≥ 0.35", () => {
    const win = Array.from({ length: 200 }, (_, i) => at(150 + i).level);
    expect(Math.max(...win) - Math.min(...win)).toBeGreaterThan(0.5);
    expect(Math.min(...win)).toBeGreaterThan(0.35);
    const sc = Array.from({ length: 200 }, (_, i) => at(150 + i).scale);
    expect(Math.max(...sc) - Math.min(...sc)).toBeGreaterThan(0.03);
    expect(Math.max(...sc)).toBeLessThan(1.025);
  });

  it("размах удержания — по интенсивности: calm < balanced < energetic", () => {
    const range = (intensity: "calm" | "balanced" | "energetic") => {
      const s = resolveStyle({ preset: "dark-premium", intensity });
      const w = Array.from({ length: 200 }, (_, i) => at(150 + i, {}, s).level);
      return Math.max(...w) - Math.min(...w);
    };
    expect(range("calm")).toBeLessThan(range("balanced"));
    expect(range("balanced")).toBeLessThan(range("energetic"));
    expect(range("calm")).toBeGreaterThan(0.3);
  });

  it("любые два кадра удержания через 19 различаются: свечение или масштаб (N−20 / N−1)", () => {
    for (let f = 120; f < 400; f++) {
      const a = at(f);
      const b = at(f + 19);
      const moved = Math.abs(a.level - b.level) > 0.08 || Math.abs(a.scale - b.scale) > 0.006;
      expect(moved, `кадры ${f} / ${f + 19}`).toBe(true);
    }
  });

  it("без loop акцент гаснет после конца бита", () => {
    expect(at(80, { loop: false }).level).toBeGreaterThan(0.25);
    const after = at(90 + 40, { loop: false });
    expect(after.level).toBe(0);
    expect(after.scale).toBe(1);
  });

  it("амплитуда — из интенсивности: energetic ударяет сильнее calm", () => {
    const peakScale = (intensity: "calm" | "balanced" | "energetic") => {
      const s = resolveStyle({ preset: "dark-premium", intensity });
      return Math.max(...Array.from({ length: 20 }, (_, i) => at(30 + i, {}, s).scale));
    };
    expect(peakScale("energetic")).toBeGreaterThan(peakScale("balanced"));
    expect(peakScale("balanced")).toBeGreaterThan(peakScale("calm"));
  });

  it("детерминирован; strength масштабирует размах", () => {
    expect(at(57)).toEqual(at(57));
    expect(at(33, { strength: 0.5 }).scale - 1).toBeCloseTo((at(33).scale - 1) * 0.5, 9);
  });

  it("ripple: кольцо удара расходится 0 → 1 и гаснет; в loop — по кольцу на цикл дыхания", () => {
    expect(at(29).ripple).toBe(-1);
    expect(at(30).ripple).toBeCloseTo(0, 5);
    expect(at(36).ripple).toBeGreaterThan(0);
    const later = Array.from({ length: 200 }, (_, i) => at(120 + i).ripple).filter((r) => r >= 0);
    expect(later.length).toBeGreaterThan(0);
    expect(at(300, { loop: false }).ripple).toBe(-1);
  });
});

describe("emphasisRingRadius: кольцо Emphasis повторяет скругление цели", () => {
  it("rounded: радиус цели + отступ кольца (концентрично), по умолчанию — радиус карточки стиля", async () => {
    const { emphasisRingRadius } = await import("../../src/motion-kit/components/Emphasis.js");
    expect(emphasisRingRadius("rounded", st, 4, 24)).toBe(28);
    expect(emphasisRingRadius("rounded", st, 30, 24)).toBe(54);
    const card = st.surfaces.radius[2]!;
    expect(card).toBeGreaterThan(8);
    expect(emphasisRingRadius("rounded", st, 4)).toBe(card + 4);
  });

  it("pill и circle — не зависят от радиуса цели", async () => {
    const { emphasisRingRadius } = await import("../../src/motion-kit/components/Emphasis.js");
    expect(emphasisRingRadius("pill", st, 4, 24)).toBe(999);
    expect(emphasisRingRadius("circle", st, 4)).toBe("50%");
  });
});

describe("кольцо акцента: по умолчанию — только на ударе (без мигания в удержании)", () => {
  it("accentPulse помечает кольцо дыхания: rippleBreath", () => {
    expect(at(32).rippleBreath).toBe(false);
    const breath = Array.from({ length: 200 }, (_, i) => at(120 + i)).filter((p) => p.ripple >= 0);
    expect(breath.length).toBeGreaterThan(0);
    expect(breath.every((p) => p.rippleBreath)).toBe(true);
  });

  it("ring: strike (по умолчанию и при true) — кольцо только на ударе; every-breath — и на вдохах; false — нет", async () => {
    const { emphasisRingVisible } = await import("../../src/motion-kit/components/Emphasis.js");
    const strike = at(32);
    const breath = Array.from({ length: 200 }, (_, i) => at(120 + i)).find((p) => p.ripple >= 0)!;
    expect(emphasisRingVisible(undefined, strike)).toBe(true);
    expect(emphasisRingVisible(undefined, breath)).toBe(false);
    expect(emphasisRingVisible(true, breath)).toBe(false);
    expect(emphasisRingVisible("strike", breath)).toBe(false);
    expect(emphasisRingVisible("every-breath", breath)).toBe(true);
    expect(emphasisRingVisible(false, strike)).toBe(false);
  });

  it("удержание без кольца остаётся живым: свечение и масштаб меняются за 19 кадров", () => {
    for (let f = 130; f < 300; f += 7) {
      const a = at(f);
      const b = at(f + 19);
      expect(Math.abs(a.level - b.level) + Math.abs(a.scale - b.scale)).toBeGreaterThan(0.004);
    }
  });
});
