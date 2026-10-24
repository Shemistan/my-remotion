// Время Video Workspace: слово под курсором, таймкоды, время плеера в целые µs (m7).
import { buildTimeline } from "@ms/contracts";
import { expect, it } from "vitest";
import { cutAt, formatTimecode, frameOf, playerUs, toEdited, toSource } from "../../src/video/use-timeline.js";
import { wordAt } from "../../src/video/word-index.js";

const words = [
  { start_us: 0, end_us: 400_000 },
  { start_us: 500_000, end_us: 900_000 },
  { start_us: 1_000_000, end_us: 1_200_000 },
];

it("wordAt: бинарный поиск; пауза — предыдущее слово; до первого — -1", () => {
  expect(wordAt(words, 600_000)).toBe(1);
  expect(wordAt(words, 950_000)).toBe(1);
  expect(wordAt(words, 0)).toBe(0);
  expect(wordAt(words, 5_000_000)).toBe(2);
  expect(wordAt([{ start_us: 100 }], 50)).toBe(-1);
  expect(wordAt([], 50)).toBe(-1);
});

it("таймкод чч:мм:сс.кк и кадр timeline_fps", () => {
  expect(formatTimecode(4_000_000)).toBe("00:00:04.00");
  expect(formatTimecode(2_509_999)).toBe("00:00:02.50");
  expect(formatTimecode(3_723_450_000)).toBe("01:02:03.45");
  expect(frameOf(2_500_000, { num: 30, den: 1 })).toBe(75);
  expect(frameOf(1_001_000, { num: 30000, den: 1001 })).toBe(30);
});

it("время плеера → целые µs в пределах длительности; source↔edited не бросает на дробях и краях", () => {
  expect(playerUs(2.5000004, 10_000_000)).toBe(2_500_000);
  expect(playerUs(-0.1, 10_000_000)).toBe(0);
  expect(playerUs(10.0333, 10_000_000)).toBe(10_000_000);
  expect(playerUs(Number.NaN, 10_000_000)).toBe(0);
  const tl = buildTimeline(10_000_000, [{ start_us: 1_000_000, end_us: 2_500_000 }], { num: 30, den: 1 });
  expect(toSource(tl, 2_500_000.7)).toBe(4_000_001);
  expect(toSource(tl, 99_000_000)).toBe(10_000_000);
  expect(toEdited(tl, 1_500_000)).toEqual({ us: 1_000_000, inCut: true });
  expect(toEdited(tl, 12_000_000.2)).toEqual({ us: 8_500_000, inCut: false });
  expect(cutAt(tl, 1_200_000)).toEqual({ start_us: 1_000_000, end_us: 2_500_000 });
  expect(cutAt(tl, 3_000_000)).toBeUndefined();
});
