// Счётчик событий по приходам импульсов: useArrivalCount / arrivalCount / pathArrivals.
import { describe, expect, it } from "vitest";
import { arrivalCount, arrivalInPass, pathArrivals, pulsePass, pulseStarts } from "../../src/motion-kit/choreo/pulse.js";
import { edgeSegment, lutLength, pathLUT } from "../../src/motion-kit/geometry.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const SEG = [edgeSegment({ x: 0, y: 0 }, { x: 600, y: 0 }, "h")];
const BEAT = { start_frame: 20, end_frame: 120 };

describe("pathArrivals: приходы по пути вне графа — то же расписание, что у PulseAlongPath", () => {
  it("кадры = pulseStarts + arrivalInPass", () => {
    const len = lutLength(pathLUT(SEG, 40));
    const pass = pulsePass(len, 24, 30, st);
    const want = pulseStarts({ start: 20, end: 120, pass, count: 2 }).map((t) => arrivalInPass(t, pass, len));
    expect(pathArrivals(SEG, { beat: BEAT, travel: 24, count: 2 }, st, 30)).toEqual(want);
  });

  it("ready сдвигает старт (ребро ещё рисуется)", () => {
    const a = pathArrivals(SEG, { beat: BEAT, travel: 24 }, st, 30, 50);
    expect(a[0]).toBeGreaterThan(50);
  });
});

describe("arrivalCount: число = число пришедших импульсов", () => {
  const at = [30, 54.5, 78];

  it("до первого прихода 0; ступенька ровно в кадр прихода (дробный — следующий целый)", () => {
    expect(arrivalCount(at, 29, st).count).toBe(0);
    expect(arrivalCount(at, 30, st).count).toBe(1);
    expect(arrivalCount(at, 54, st).count).toBe(1);
    expect(arrivalCount(at, 55, st).count).toBe(2);
    expect(arrivalCount(at, 200, st).count).toBe(3);
  });

  it("per — единиц на приход; from — стартовое значение", () => {
    expect(arrivalCount(at, 200, st, { per: 8 }).value).toBe(24);
    expect(arrivalCount(at, 31, st, { per: 8, from: 2 }).value).toBe(10);
    expect(arrivalCount(at, 0, st, { from: 5 }).value).toBe(5);
  });

  it("pop: 1 в кадр прихода, гаснет за ~10 кадров, на следующем приходе снова 1", () => {
    expect(arrivalCount(at, 29, st).pop).toBe(0);
    expect(arrivalCount(at, 30, st).pop).toBe(1);
    const mid = arrivalCount(at, 34, st).pop;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(arrivalCount(at, 45, st).pop).toBe(0);
    expect(arrivalCount(at, 55, st).pop).toBeGreaterThan(0.9);
    expect(arrivalCount(at, 55, st).last).toBe(54.5);
  });
});
