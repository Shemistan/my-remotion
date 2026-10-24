import { describe, expect, it } from "vitest";
import { formatNumber, pluralForm } from "../../src/motion-kit/format.js";

describe("formatNumber", () => {
  it("группирует разряды по локали (бриф)", () => {
    expect(formatNumber(1_000_000, { locale: "ru" })).toBe("1 000 000");
    expect(formatNumber(10_000, { locale: "en" })).toBe("10,000");
  });

  it("дробная часть: запятая в ru, точка в en", () => {
    expect(formatNumber(12345.5, { locale: "ru", decimals: 1 })).toBe("12 345,5");
    expect(formatNumber(1234.5, { locale: "en", decimals: 2 })).toBe("1,234.50");
  });

  it("округляет до целого без decimals и не печатает -0", () => {
    expect(formatNumber(999.6, { locale: "en" })).toBe("1,000");
    expect(formatNumber(-0.2, { locale: "ru" })).toBe("0");
    expect(formatNumber(-12_500, { locale: "ru" })).toBe("−12 500");
  });

  it("четырёхзначные в ru не группируются, в en — да", () => {
    expect(formatNumber(1500, { locale: "ru" })).toBe("1500");
    expect(formatNumber(1500, { locale: "en" })).toBe("1,500");
  });

  it("compact: тыс./млн/млрд и K/M/B", () => {
    expect(formatNumber(1_000_000, { locale: "ru", compact: true })).toBe("1 млн");
    expect(formatNumber(12_500, { locale: "ru", compact: true, decimals: 1 })).toBe("12,5 тыс.");
    expect(formatNumber(2_400_000_000, { locale: "en", compact: true, decimals: 1 })).toBe("2.4B");
    expect(formatNumber(10_000, { locale: "en", compact: true })).toBe("10K");
    expect(formatNumber(950, { locale: "en", compact: true })).toBe("950");
  });

  it("compact не печатает 1000 тыс. — переходит на следующую ступень", () => {
    expect(formatNumber(999_960, { locale: "ru", compact: true, decimals: 1 })).toBe("1 млн");
  });

  it("не число — ошибка", () => {
    expect(() => formatNumber(Number.NaN, { locale: "ru" })).toThrow(RangeError);
  });
});

describe("pluralForm: согласование существительного с числом", () => {
  const RU = ["релиз", "релиза", "релизов"] as const;
  it("ru: 1 релиз, 2–4 релиза, 5–20 релизов, 21 релиз, 111 релизов, дробное — родительный ед.", () => {
    const at = (n: number) => pluralForm(n, RU, { locale: "ru" });
    expect([1, 2, 4, 5, 11, 12, 14, 20, 21, 22, 25, 101, 111, 112, 0].map(at)).toEqual([
      "релиз", "релиза", "релиза", "релизов", "релизов", "релизов", "релизов", "релизов", "релиз", "релиза", "релизов", "релиз", "релизов", "релизов", "релизов",
    ]);
    expect(at(2.5)).toBe("релиза");
    expect(at(-1)).toBe("релиз");
  });

  it("форма — по показанному значению: округление decimals и compact («1,2 тыс. релизов»)", () => {
    expect(pluralForm(1.4, RU, { locale: "ru" })).toBe("релиз");
    expect(pluralForm(1.4, RU, { locale: "ru", decimals: 1 })).toBe("релиза");
    expect(pluralForm(1_200, RU, { locale: "ru", compact: true })).toBe("релизов");
    expect(pluralForm(1_001, RU, { locale: "ru", compact: true })).toBe("релизов");
  });

  it("en: one / other", () => {
    expect(pluralForm(1, ["release", "releases"], { locale: "en" })).toBe("release");
    expect(pluralForm(2, ["release", "releases"], { locale: "en" })).toBe("releases");
    expect(pluralForm(1.5, ["release", "releases"], { locale: "en", decimals: 1 })).toBe("releases");
  });
});
