import { describe, expect, it } from "vitest";
import { type CubicSegment, cubicPoint, edgeSegment, pathD, pathLUT, pointAtLength, smoothSegments } from "../../src/motion-kit/geometry.js";

const straight0to3: CubicSegment = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
];

describe("cubicPoint / pathLUT / pointAtLength", () => {
  it("бриф", () => {
    expect(cubicPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.5)).toEqual({ x: 1.5, y: 0 });
    expect(pointAtLength(pathLUT([straight0to3], 64), 1.5).x).toBeCloseTo(1.5, 2);
  });

  it("LUT: длины возрастают от 0 до длины пути", () => {
    const lut = pathLUT([straight0to3], 16);
    expect(lut.lengths[0]).toBe(0);
    expect(lut.lengths.at(-1)).toBeCloseTo(3, 6);
    expect(lut.points).toHaveLength(lut.lengths.length);
    for (let i = 1; i < lut.lengths.length; i++) expect(lut.lengths[i]!).toBeGreaterThanOrEqual(lut.lengths[i - 1]!);
  });

  it("несколько сегментов: длина складывается, точка на втором сегменте", () => {
    const second: CubicSegment = [
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ];
    const lut = pathLUT([straight0to3, second], 64);
    expect(lut.lengths.at(-1)).toBeCloseTo(6, 4);
    const p = pointAtLength(lut, 4.5);
    expect(p.x).toBeCloseTo(3, 4);
    expect(p.y).toBeCloseTo(1.5, 2);
  });

  it("s за пределами пути зажимается к концам", () => {
    const lut = pathLUT([straight0to3], 32);
    expect(pointAtLength(lut, -5)).toEqual({ x: 0, y: 0 });
    expect(pointAtLength(lut, 99).x).toBeCloseTo(3, 6);
  });

  it("pathD: SVG-путь из сегментов", () => {
    expect(pathD([straight0to3])).toBe("M0 0 C1 0 2 0 3 0");
  });

  it("smoothSegments: кривая проходит через все точки", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    const segs = smoothSegments(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]![0]).toEqual(pts[0]);
    expect(segs[0]![3]).toEqual(pts[1]);
    expect(segs[1]![3]).toEqual(pts[2]);
  });

  it("edgeSegment: горизонтальная S-кривая между портами", () => {
    const s = edgeSegment({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[3]).toEqual({ x: 100, y: 50 });
    expect(s[1].y).toBe(0);
    expect(s[2].y).toBe(50);
  });
});

describe("niceTicks", () => {
  it("круглые шаги, покрывающие диапазон", async () => {
    const { niceTicks } = await import("../../src/motion-kit/geometry.js");
    expect(niceTicks(0, 1_000_000, 5)).toEqual([0, 200_000, 400_000, 600_000, 800_000, 1_000_000]);
    expect(niceTicks(0, 87, 4)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });
});
