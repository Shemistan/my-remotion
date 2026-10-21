// lineChartHead: один источник движения для графика и привязанного к нему счётчика.
import { describe, expect, it } from "vitest";
import { lineChartHead, xLabelIndices } from "../../src/motion-kit/components/LineChart.js";
import { lineDrawWindow } from "../../src/motion-kit/line-window.js";

const POINTS = [
  { label: "a", value: 10_000 },
  { label: "b", value: 50_000 },
  { label: "c", value: 200_000 },
  { label: "d", value: 1_000_000 },
];
const BEAT = { start_frame: 20, end_frame: 120 };

describe("lineChartHead", () => {
  it("до прорисовки — первая точка, после — последняя; endFrame — конец окна 80 %", () => {
    expect(lineChartHead(POINTS, BEAT, 0)).toEqual({ progress: 0, value: 10_000, startFrame: 32, endFrame: 100 });
    expect(lineChartHead(POINTS, BEAT, 110)).toMatchObject({ progress: 1, value: 1_000_000 });
  });
  it("startFrame — последний кадр, где голова ещё на первой точке: число до него держит «от»", () => {
    const { startFrame } = lineChartHead(POINTS, BEAT, 0);
    expect(lineChartHead(POINTS, BEAT, startFrame).value).toBe(10_000);
    expect(lineChartHead(POINTS, BEAT, startFrame + 2).value).toBeGreaterThan(10_000);
  });
  it("startFrame = start_frame + ⌈12 % длины⌉ (формула Director) — и в этом кадре голова на первой точке", () => {
    const beat = { start_frame: 12, end_frame: 132 };
    const { startFrame } = lineChartHead(POINTS, beat, 0);
    expect(startFrame).toBe(12 + Math.ceil(0.12 * 120));
    expect(lineChartHead(POINTS, beat, startFrame).value).toBe(10_000);
  });
  it("startFrame / endFrame — те же, что lineDrawWindow (сервер привязывает по нему бит счётчика)", () => {
    for (const beat of [BEAT, { start_frame: 10, end_frame: 130 }, { start_frame: 0, end_frame: 7 }, { start_frame: 33, end_frame: 101 }]) {
      const { startFrame, endFrame } = lineChartHead(POINTS, beat, 0);
      expect({ startFrame, endFrame }).toEqual({ startFrame: lineDrawWindow(beat).startFrame, endFrame: lineDrawWindow(beat).endFrame });
    }
  });
  it("значение под головой растёт монотонно и остаётся в диапазоне", () => {
    let prev = -Infinity;
    for (let f = 20; f <= 120; f++) {
      const { value } = lineChartHead(POINTS, BEAT, f, { width: 900, height: 500 });
      expect(value).toBeGreaterThanOrEqual(prev);
      expect(value).toBeGreaterThanOrEqual(10_000);
      expect(value).toBeLessThanOrEqual(1_000_000);
      prev = value;
    }
  });
});

describe("xLabelIndices: подписи X не налезают друг на друга", () => {
  it("помещаются — все", () => {
    expect(xLabelIndices(["янв", "мар", "май", "июл", "сен", "ноя"], 120, 32)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("тесно — через одну, первая и последняя всегда видны", () => {
    const labels = ["янв 22", "июл 22", "янв 23", "июл 23", "янв 24", "июл 24", "янв 25"];
    expect(xLabelIndices(labels, 100, 32)).toEqual([0, 2, 4, 6]);
  });
  it("последняя слишком близко к предыдущей видимой — предыдущая скрывается", () => {
    const labels = ["a 2020", "b 2021", "c 2022", "d 2023", "e 2024", "f 2025"];
    const shown = xLabelIndices(labels, 100, 32);
    expect(shown[0]).toBe(0);
    expect(shown.at(-1)).toBe(5);
    for (let i = 1; i < shown.length; i++) expect((shown[i]! - shown[i - 1]!) * 100).toBeGreaterThanOrEqual(6 * 0.56 * 32);
  });
});

describe("lineHighlight: выноска и акцент конечной точки независимы", () => {
  it("по умолчанию — и выноска, и акцент (удар в конце прорисовки, дыхание до конца сцены)", async () => {
    const { lineHighlight } = await import("../../src/motion-kit/components/LineChart.js");
    expect(lineHighlight({}, BEAT)).toEqual({ callout: true, emphasis: { beat: { start_frame: 100, end_frame: 120 }, loop: true } });
  });
  it("акцент без выноски: значение показывает герой-число, точка всё равно живая", async () => {
    const { lineHighlight } = await import("../../src/motion-kit/components/LineChart.js");
    expect(lineHighlight({ callout: false }, BEAT)).toEqual({ callout: false, emphasis: { beat: { start_frame: 100, end_frame: 120 }, loop: true } });
    const own = { start_frame: 104, end_frame: 130 };
    expect(lineHighlight({ callout: false, endpointEmphasis: { beat: own, loop: false } }, BEAT)).toEqual({ callout: false, emphasis: { beat: own, loop: false } });
  });
  it("highlightLast (устарел) — прежнее поведение, явные callout / endpointEmphasis важнее", async () => {
    const { lineHighlight } = await import("../../src/motion-kit/components/LineChart.js");
    expect(lineHighlight({ highlightLast: false }, BEAT)).toEqual({ callout: false, emphasis: null });
    expect(lineHighlight({ highlightLast: false, endpointEmphasis: true }, BEAT).emphasis).not.toBeNull();
    expect(lineHighlight({ endpointEmphasis: false }, BEAT)).toEqual({ callout: true, emphasis: null });
  });
});
