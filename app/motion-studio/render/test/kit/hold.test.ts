// Hold engine (S3b): режимы удержания — живой финал без мигания и без противоречия итогу.
import type { HoldMode } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { HOLD_MODES, HOLD_PROBE, HOLD_RATE, type Hold, anchoredStarts, holdAt, holdTicks, holdTiming, steadyStarts } from "../../src/motion-kit/choreo/hold.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = (intensity: "calm" | "balanced" | "energetic" = "balanced", fps = 30) => resolveStyle({ preset: "dark-premium", intensity, fps: { num: fps, den: 1 } });
const hold = (mode: HoldMode, start: number, end: number): Hold => ({ mode, beat: { start_frame: start, end_frame: end } });

/** Признак кадра удержания: всё, что режим рисует, одним вектором. */
function sig(f: ReturnType<typeof holdAt>): number[] {
  return [f.sweep < 0 ? -1 : f.sweep, f.sweepAlpha, f.ripple < 0 ? -1 : f.ripple, f.rippleAlpha, f.breath, f.push * 20, f.tick ? f.tick.age / 10 : -1];
}
const dist = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

describe("anchoredStarts", () => {
  it("кадр last стоит на сдвиге offset от старта последнего цикла, старты — с шагом period и не раньше from", () => {
    expect(anchoredStarts(100, 179, 40, 10)).toEqual([129, 169]);
    expect(anchoredStarts(100, 179, 40, 10).every((t) => t >= 100)).toBe(true);
  });
  it("удержание короче сдвига — один цикл (начат до from): финал всё равно движется", () => {
    expect(anchoredStarts(170, 179, 40, 30)).toEqual([149]);
  });
});

// Пробел свойства (s3b-review m8): у steady-flow `holdAt` двигает только дыхание — потоки
// удержания живут в `pathStarts` / `steadyStarts`; их «жив в N−20…N−1» проверяют
// hold-wiring.test.ts (pathStarts) и e2e галереи (тайловая мера), а не это свойство.
describe("holdAt: каждый режим жив между N−20 и N−1", () => {
  const cases: [number, number, "calm" | "balanced" | "energetic", number][] = [];
  for (const fps of [24, 30, 60]) {
    for (const intensity of ["calm", "balanced", "energetic"] as const) {
      for (const sec of [5, 6, 8, 12]) for (const holdS of [1, 1.6, 2.5, 4]) cases.push([fps, sec, intensity, holdS]);
    }
  }
  it.each(HOLD_MODES)("%s", (mode) => {
    for (const [fps, sec, intensity, holdS] of cases) {
      const s = st(intensity, fps);
      const N = Math.round(sec * fps);
      const h = hold(mode, N - Math.round(holdS * fps), N);
      const a = holdAt(N - HOLD_PROBE, h, s, N);
      const b = holdAt(N - 1, h, s, N);
      expect(dist(sig(a), sig(b)), `${mode} fps=${fps} ${sec}s ${intensity} hold ${holdS}s`).toBeGreaterThan(0.05);
    }
  });

  it.each(HOLD_MODES)("%s: до удержания покой, вход в живость плавный (без рывка)", (mode) => {
    const s = st();
    const h = hold(mode, 120, 180);
    expect(holdAt(119, h, s, 180)).toMatchObject({ on: false, live: 0, sweep: -1, ripple: -1, push: 0, tick: null });
    for (let f = 110; f < 179; f++) {
      const [a, b] = [holdAt(f, h, s, 180), holdAt(f + 1, h, s, 180)];
      expect(Math.abs(b.live - a.live), `кадр ${f}`).toBeLessThan(0.15);
      expect(Math.abs(b.breath - a.breath), `кадр ${f}`).toBeLessThan(0.3);
      expect(Math.abs(b.push - a.push), `кадр ${f}`).toBeLessThan(0.05);
      expect(Math.abs(b.sweepAlpha - a.sweepAlpha), `кадр ${f}`).toBeLessThan(0.35);
    }
  });
});

describe("режимы", () => {
  const s = st();
  it("data-shimmer: блик идёт от начала к концу пути (позиция растёт в проходе), в N−1 — в пути", () => {
    const h = hold("data-shimmer", 110, 180);
    const end = holdAt(179, h, s, 180);
    expect(end.sweep).toBeGreaterThan(0.3);
    expect(end.sweep).toBeLessThan(1);
    let prev = -1;
    for (let f = 160; f < 180; f++) {
      const x = holdAt(f, h, s, 180).sweep;
      if (x >= 0 && prev >= 0) expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it("now-pulse: в N−1 волна идёт, дыхание непрерывно", () => {
    const h = hold("now-pulse", 120, 180);
    expect(holdAt(179, h, s, 180).ripple).toBeGreaterThan(0.2);
  });

  it("repeat-result: тики подписаны и не налезают друг на друга; последний — свежий к N−1", () => {
    const h = hold("repeat-result", 90, 180);
    const T = holdTiming(s);
    const ticks = holdTicks(h, s, 180, 20);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(T.label);
    expect(ticks[0]!).toBeGreaterThanOrEqual(90 + 20);
    const last = holdAt(179, h, s, 180).tick!;
    expect(last.age).toBeGreaterThanOrEqual(0);
    expect(last.age).toBeLessThan(T.label);
    expect(last.index).toBe(ticks.length - 1);
  });

  it("repeat-result: блик к итогу приходит в кадр тика (LineChart — «блик и подпись тика», S3-fix m3)", () => {
    const h = hold("repeat-result", 90, 180);
    const ticks = holdTicks(h, s, 180);
    for (const tk of ticks) {
      const before = holdAt(tk - 1, h, s, 180);
      expect(before.sweep, `тик ${tk}`).toBeGreaterThan(0.9);
      expect(holdAt(tk - 10, h, s, 180).sweep).toBeLessThan(before.sweep);
    }
    // в N−20…N−1 блик идёт хотя бы в одном кадре
    expect([...Array(20).keys()].some((i) => holdAt(160 + i, h, s, 180).sweep >= 0)).toBe(true);
  });

  it("settle-push: наезд растёт до последнего кадра и не тормозит в ноль", () => {
    const h = hold("settle-push", 120, 180);
    const p = (f: number) => holdAt(f, h, s, 180).push;
    expect(p(119)).toBe(0);
    expect(p(179)).toBeCloseTo(1, 5);
    expect(p(179) - p(160)).toBeGreaterThan(0.2);
    for (let f = 120; f < 179; f++) expect(p(f + 1)).toBeGreaterThanOrEqual(p(f));
  });

  it("steady-flow: темп ≈ 60 %, ряд от прошлого прохода, в N−1 импульс на середине пути", () => {
    expect(HOLD_RATE).toBe(0.6);
    const h = hold("steady-flow", 100, 180);
    const pass = 30;
    const step0 = pass / HOLD_RATE;
    for (const after of [undefined, 70, 85, 95]) {
      const starts = steadyStarts(h, pass, s, 180, after === undefined ? {} : { after });
      expect(starts.length, `after ${after}`).toBeGreaterThan(0);
      expect(starts.every((t) => t >= 100 && t <= 179)).toBe(true);
      const seq = after === undefined ? starts : [after, ...starts];
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]! - seq[i - 1]!, `after ${after}`).toBeGreaterThanOrEqual(step0 * 0.65 - 1e-9);
        expect(seq[i]! - seq[i - 1]!, `after ${after}`).toBeLessThanOrEqual(step0 * 1.4 + 1e-9);
      }
      // в N−1 импульс в пути (10…90 % — фаза потока сохраняется, S3-fix m1)
      expect(starts.at(-1)!, `after ${after}`).toBeGreaterThanOrEqual(179 - pass * 0.9 - 1e-9);
      expect(starts.at(-1)!, `after ${after}`).toBeLessThanOrEqual(179 - pass * 0.1 + 1e-9);
    }
    // каскад потоков (старты через 4 кадра) не сходится в ногу: порядок и зазор сохраняются
    for (const a0 of [60, 64, 72, 76, 81]) {
      const x = steadyStarts(h, pass, s, 180, { after: a0 }).at(-1)!;
      const y = steadyStarts(h, pass, s, 180, { after: a0 + 4 }).at(-1)!;
      const gap = ((y - x) % pass + pass) % pass;
      expect(gap, `каскад от ${a0}`).toBeGreaterThanOrEqual(2.5);
      expect(gap, `каскад от ${a0}`).toBeLessThanOrEqual(pass / 2);
    }
    // два импульса на пути — шаг вдвое меньше
    const two = steadyStarts(h, pass, s, 180, { count: 2 });
    expect(two[1]! - two[0]!).toBeLessThanOrEqual((step0 / 2) * 1.4);
  });
});
