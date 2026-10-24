// Task 30: выбор ключевых кадров шота и общий лимит на ролик.
import { describe, expect, it } from "vitest";
import { MAX_KEYFRAMES_TOTAL, budgetKeyframes, frameDurationUs, keyframeArgs, keyframeName, sampleKeyframes } from "../../src/analysis/keyframes.js";

describe("sampleKeyframes", () => {
  it("каждые 2 с от середины первого окна", () => {
    expect(sampleKeyframes({ start_us: 0, end_us: 9_000_000 })).toEqual([1_000_000, 3_000_000, 5_000_000, 7_000_000]);
    expect(sampleKeyframes({ start_us: 4_000_000, end_us: 10_000_000 })).toEqual([5_000_000, 7_000_000, 9_000_000]);
  });

  it("меньше 3 точек — ¼, ½, ¾ шота", () => {
    expect(sampleKeyframes({ start_us: 0, end_us: 1_000_000 })).toEqual([250_000, 500_000, 750_000]);
    expect(sampleKeyframes({ start_us: 1_000_000, end_us: 6_000_000 })).toEqual([2_250_000, 3_500_000, 4_750_000]);
  });

  it("не больше max на шот, равномерно, по возрастанию, внутри шота", () => {
    const us = sampleKeyframes({ start_us: 0, end_us: 600_000_000 });
    expect(us).toHaveLength(30);
    expect(us[0]).toBe(1_000_000);
    expect(us.at(-1)).toBe(599_000_000);
    for (let i = 1; i < us.length; i++) expect(us[i]!).toBeGreaterThan(us[i - 1]!);
    expect(sampleKeyframes({ start_us: 0, end_us: 20_000_000 }, 2_000_000, 4)).toEqual([1_000_000, 7_000_000, 13_000_000, 19_000_000]);
  });
});

describe("sampleKeyframes: последний кадр шота (ревью Task 30, I2)", () => {
  const NTSC = { num: 30000, den: 1001 };
  const F = frameDurationUs(NTSC); // 33 367 µs

  it("смена сцены через 1 кадр после момента (NTSC): момент сдвинут на кадр раньше конца шота", () => {
    // кадр 150 NTSC начинается в 5 005 000 µs — смена сцены; момент 5 000 000 попал бы в кадр 150
    const shot = { start_us: 0, end_us: 5_005_000 };
    expect(sampleKeyframes(shot)).toEqual([1_000_000, 3_000_000, 5_000_000]); // без длительности кадра — следующий шот
    const us = sampleKeyframes(shot, 2_000_000, 30, F);
    expect(us).toEqual([1_000_000, 3_000_000, 4_971_633]);
    const firstFrameAtOrAfter = (t: number) => Math.ceil((t * NTSC.num) / (1e6 * NTSC.den));
    for (const t of us) expect(firstFrameAtOrAfter(t)).toBeLessThan(150);
    expect(firstFrameAtOrAfter(5_000_000)).toBe(150);
  });

  it("каждые 2 с: момент в последнем кадре шота сдвигается, остальные не меняются; дубликаты схлопываются", () => {
    expect(sampleKeyframes({ start_us: 0, end_us: 5_020_000 }, 2_000_000, 30, F)).toEqual([1_000_000, 3_000_000, 4_986_633]);
    expect(sampleKeyframes({ start_us: 0, end_us: 9_000_000 }, 2_000_000, 30, F)).toEqual([1_000_000, 3_000_000, 5_000_000, 7_000_000]);
    // шот короче кадра — один момент, его начало
    expect(sampleKeyframes({ start_us: 1_000_000, end_us: 1_020_000 }, 2_000_000, 30, F)).toEqual([1_000_000]);
  });

  it("frameDurationUs — вверх", () => {
    expect(F).toBe(33_367);
    expect(frameDurationUs({ num: 25, den: 1 })).toBe(40_000);
  });
});

describe("budgetKeyframes", () => {
  it("в пределах лимита — без изменений", () => {
    const per = [[1, 2, 3], [4, 5, 6]];
    expect(budgetKeyframes(per)).toEqual(per);
  });

  it("лимит 120 на ролик: часовой ролик одним шотом и много шотов", () => {
    const one = [sampleKeyframes({ start_us: 0, end_us: 3_600_000_000 }, 2_000_000, 10_000)];
    const b1 = budgetKeyframes(one);
    expect(b1[0]).toHaveLength(MAX_KEYFRAMES_TOTAL);
    expect(b1[0]![0]).toBe(one[0]![0]);
    expect(b1[0]!.at(-1)).toBe(one[0]!.at(-1));

    const many = Array.from({ length: 30 }, (_, k) => sampleKeyframes({ start_us: k * 20_000_000, end_us: (k + 1) * 20_000_000 }));
    const b = budgetKeyframes(many);
    expect(b.flat().length).toBeLessThanOrEqual(MAX_KEYFRAMES_TOTAL);
    expect(b.flat().length).toBeGreaterThanOrEqual(MAX_KEYFRAMES_TOTAL - 1);
    for (const s of b) expect(s.length).toBeGreaterThanOrEqual(3); // у каждого шота — минимум 3
  });

  it("шотов больше, чем 120/3: минимум не гарантируется, но лимит соблюдён, каждый шот — хотя бы кадр, пока хватает", () => {
    const many = Array.from({ length: 100 }, (_, k) => [k * 10 + 1, k * 10 + 2, k * 10 + 3]);
    const b = budgetKeyframes(many);
    expect(b.flat().length).toBeLessThanOrEqual(MAX_KEYFRAMES_TOTAL);
    expect(b.every((s) => s.length >= 1)).toBe(true);
    const tooMany = Array.from({ length: 200 }, (_, k) => [k * 10 + 1, k * 10 + 2, k * 10 + 3]);
    const c = budgetKeyframes(tooMany);
    expect(c.flat().length).toBe(MAX_KEYFRAMES_TOTAL);
    expect(c.filter((s) => s.length === 0).length).toBe(80); // шоты без кадров — пометит mergeFootage
  });
});

describe("keyframeArgs", () => {
  it("точный -ss, вход file: с белым списком, PNG по длинной стороне 640, без перезаписи", () => {
    const a = keyframeArgs("/s/proxy.mp4", 1_500_000, "/d/frames/x.png");
    expect(a).toContain("-protocol_whitelist");
    expect(a[a.indexOf("-protocol_whitelist") + 1]).toBe("file");
    expect(a[a.indexOf("-ss") + 1]).toBe("1.500000");
    expect(a[a.indexOf("-i") + 1]).toBe("file:/s/proxy.mp4");
    expect(a[a.indexOf("-i") - 2]).toBe("-f");
    expect(a.join(" ")).toMatch(/scale=.*640/);
    expect(a).toContain("-n");
    expect(a.at(-1)).toBe("file:/d/frames/x.png");
  });

  it("имя кадра — по моменту, сортируется по времени", () => {
    expect(keyframeName(1_000_000)).toBe("frames/000001000000.png");
    expect(keyframeName(12)).toBe("frames/000000000012.png");
  });
});
