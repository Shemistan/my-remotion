// S8: подписи времени и приёмов сценария — по-русски, без сырых кодов.
import { TECHNIQUES } from "@ms/contracts";
import { expect, it } from "vitest";
import { formatClock, formatDuration, formatSeconds, generateEstimate, readingSummary, techniqueLabel } from "../../src/script/format.js";

const F30 = { num: 30, den: 1 };

it("длительность сцены: «речь + запас = итого»", () => {
  expect(formatDuration({ lead: 15, speech: 192, tail: 30, total: 237 }, F30)).toBe("речь 6,4 с + запас 1,5 с = 7,9 с");
  expect(formatSeconds(90, F30)).toBe("3 с");
  expect(formatSeconds(91, { num: 30000, den: 1001 })).toBe("3 с");
});

it("время чтения текста: «205 слов · 1:22»", () => {
  expect(formatClock(82)).toBe("1:22");
  expect(formatClock(5)).toBe("0:05");
  const R = { wps: 2.5, lead_s: 0.5, tail_s: 1 };
  expect(readingSummary(205, R, F30)).toBe("205 слов · 1:22");
  expect(readingSummary(1, R, F30)).toBe("1 слово · 0:01");
  expect(readingSummary(3, R, F30)).toBe("3 слова · 0:02");
  expect(readingSummary(0, R, F30)).toBe("0 слов · 0:00");
  // как сервер (readingFrames, целые кадры): 113 слов при 1,13 слова/с — ровно 100 с, не 101
  expect(readingSummary(113, { ...R, wps: 1.13 }, F30)).toBe("113 слов · 1:40");
});

it("у каждого приёма — русское название без кода", () => {
  for (const x of TECHNIQUES) {
    const label = techniqueLabel(x.slug);
    expect(label).not.toContain(x.slug);
    expect(label).toMatch(/[а-яё]/i);
  }
  expect(techniqueLabel("hero-number")).toBe("Ключевое число");
});

it("оценка пакета генерации — минуты и справочная стоимость", () => {
  expect(generateEstimate(4)).toEqual({ minutes: expect.any(Number), usd: expect.any(String) });
  expect(generateEstimate(4).minutes).toBeGreaterThan(generateEstimate(1).minutes);
});
