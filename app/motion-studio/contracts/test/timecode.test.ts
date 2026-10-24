import { describe, expect, it } from "vitest";
import { STANDARD_FPS, frameToUs, parseRational, snapFps, snapUsToFrame, usToFrame, usToFrameCeil } from "../src/index.js";
import { F30, NTSC } from "./video-fixtures.js";

describe("timecode", () => {
  it("STANDARD_FPS", () => {
    expect(STANDARD_FPS).toEqual([
      { num: 24000, den: 1001 }, { num: 24, den: 1 }, { num: 25, den: 1 }, NTSC, F30, { num: 50, den: 1 }, { num: 60000, den: 1001 }, { num: 60, den: 1 },
    ]);
  });

  it("snapFps: ближайший стандарт в пределах 1 %, иначе сокращённая дробь", () => {
    expect(snapFps({ num: 1199, den: 40 })).toEqual(NTSC); // 29.975
    expect(snapFps({ num: 2400, den: 100 })).toEqual({ num: 24, den: 1 });
    expect(snapFps({ num: 12, den: 1 })).toEqual({ num: 12, den: 1 });
    expect(snapFps({ num: 2997, den: 100 })).toEqual(NTSC);
    expect(snapFps({ num: 5994, den: 100 })).toEqual({ num: 60000, den: 1001 });
    expect(snapFps({ num: 24, den: 1 })).toEqual({ num: 24, den: 1 });
    // 15 fps — вне 1 % любого стандарта: дробь сокращается
    expect(snapFps({ num: 1500, den: 100 })).toEqual({ num: 15, den: 1 });
    // ровно посередине 29.97 и 30 ближе одно из них, но точно не 25
    expect([NTSC, F30]).toContainEqual(snapFps({ num: 29985, den: 1000 }));
    expect(() => snapFps({ num: 0, den: 1 })).toThrow(RangeError);
  });

  it("snapUsToFrame: ближайшая граница кадра", () => {
    expect(snapUsToFrame(1_010_000, F30)).toBe(1_000_000);
    expect(snapUsToFrame(1_000_000, NTSC)).toBe(1_001_000);
    expect(snapUsToFrame(0, NTSC)).toBe(0);
    expect(snapUsToFrame(1_020_000, F30)).toBe(1_033_334);
    // результат — всегда начало кадра
    for (const us of [1, 16_683, 16_684, 999_999, 123_456_789]) {
      const s = snapUsToFrame(us, NTSC);
      expect(frameToUs(usToFrame(s, NTSC), NTSC)).toBe(s);
      expect(Math.abs(s - us)).toBeLessThanOrEqual(Math.ceil(1_001_000 / 30 / 2) + 1);
    }
    expect(() => snapUsToFrame(-1, F30)).toThrow(RangeError);
    expect(() => snapUsToFrame(1.5, F30)).toThrow(RangeError);
  });

  it("usToFrameCeil", () => {
    expect(usToFrameCeil(4_800_000, F30)).toBe(144);
    expect(usToFrameCeil(4_810_000, F30)).toBe(145);
    expect(usToFrameCeil(0, NTSC)).toBe(0);
    for (let f = 0; f <= 5000; f++) expect(usToFrameCeil(frameToUs(f, NTSC), NTSC)).toBe(f);
    // точность на длинном ролике: 3 ч при 60000/1001 без ошибок округления
    const long = frameToUs(647_352, { num: 60000, den: 1001 });
    expect(usToFrameCeil(long, { num: 60000, den: 1001 })).toBe(647_352);
    expect(usToFrameCeil(long + 1, { num: 60000, den: 1001 })).toBe(647_353);
  });

  it("parseRational", () => {
    expect(parseRational("30000/1001")).toEqual(NTSC);
    expect(parseRational("30/1")).toEqual(F30);
    expect(parseRational("25")).toEqual({ num: 25, den: 1 });
    expect(parseRational("60/2")).toEqual({ num: 30, den: 1 });
    for (const bad of ["0/0", "30/0", "-30/1", "abc", "", "30.5/1", "1/2/3"]) expect(() => parseRational(bad), bad).toThrow(RangeError);
  });
});
