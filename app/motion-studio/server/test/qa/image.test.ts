// Пиксельные примитивы QA на синтетических PNG.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backgroundEstimate, frameDelta, inkFraction, loadPng, lumaStats, objectDelta } from "../../src/qa/image.js";
import { Canvas, H, W, card, makeTmp, removeTmp, solid } from "./helpers.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

const img = (c: Canvas) => ({ width: c.width, height: c.height, data: c.data });

describe("loadPng", () => {
  it("RGBA и RGB одинаково приводятся к RGBA", async () => {
    const c = card();
    for (const t of [6, 2] as const) {
      const p = join(tmp, `c${t}.png`);
      await writeFile(p, c.png(t));
      const i = await loadPng(p);
      expect([i.width, i.height]).toEqual([W, H]);
      expect(i.data.length).toBe(W * H * 4);
      expect(Buffer.from(i.data).equals(Buffer.from(c.data))).toBe(true);
    }
  });
});

describe("lumaStats", () => {
  it("однотонный кадр — std < 0.01; белый — mean 1; пополам — std ≈ 0.5", async () => {
    expect((await lumaStats(img(solid("#000000")))).std).toBeLessThan(0.01);
    expect(lumaStats(img(solid("#ffffff"))).mean).toBeCloseTo(1, 5);
    const half = new Canvas(W, H, "#000000").rect(0, 0, W / 2, H, "#ffffff");
    expect(lumaStats(img(half)).std).toBeCloseTo(0.5, 2);
  });
});

describe("frameDelta / objectDelta", () => {
  it("одинаковые — 0, чёрный и белый — 1", () => {
    expect(frameDelta(img(card()), img(card()))).toBe(0);
    expect(frameDelta(img(solid("#000000")), img(solid("#ffffff")))).toBeCloseTo(1, 5);
  });

  it("разный размер — ошибка", () => {
    expect(() => frameDelta(img(card()), img(new Canvas(10, 10)))).toThrow(/размер/);
  });

  it("сдвиг камеры на 2 px и дрейф фона не считаются движением; новый объект — считается", () => {
    const a = card();
    const drift = card(2).rect(0, 0, 30, 20, "#181818"); // смещённая карточка + световое пятно фона
    expect(frameDelta(img(a), img(drift))).toBeGreaterThan(0.002);
    expect(objectDelta(img(a), img(drift))).toBeLessThan(0.002);
    const moved = card().rect(20, 70, 40, 20, "#4080ff");
    expect(objectDelta(img(a), img(moved))).toBeGreaterThan(0.002);
  });
});

describe("backgroundEstimate / inkFraction", () => {
  it("фон — медиана угловых патчей; доля «чернил» в области", () => {
    const c = card().rect(0, 0, 4, 4, "#ff0000"); // пятно в одном углу медиану не сдвигает
    const i = img(c);
    const bg = backgroundEstimate(i);
    expect(bg).toEqual([16, 16, 16]);
    expect(inkFraction(i, { x: 70, y: 40, w: 50, h: 28 }, bg)).toBe(1);
    expect(inkFraction(i, { x: 70, y: 40, w: 100, h: 28 }, bg)).toBeCloseTo(0.5, 2);
    expect(inkFraction(i, { x: 130, y: 80, w: 20, h: 20 }, bg)).toBe(0);
    // область за кадром обрезается; пустая — 0
    expect(inkFraction(i, { x: 180, y: 0, w: 50, h: 10 }, bg)).toBe(0);
    expect(inkFraction(i, { x: 0, y: 0, w: 0, h: 0 }, bg)).toBe(0);
  });

  it("порог 0.12: слабое отличие от фона — не чернила", () => {
    const c = new Canvas().rect(0, 50, W, 8, "#2a2a2a"); // +26/255 ≈ 0.10
    const i = img(c);
    expect(inkFraction(i, { x: 0, y: 50, w: W, h: 8 }, backgroundEstimate(i))).toBe(0);
  });
});
