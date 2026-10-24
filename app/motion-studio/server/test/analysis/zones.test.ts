// Task 30: занятые области (лицо, руки) и свободные зоны.
import { describe, expect, it } from "vitest";
import { NormRectSchema } from "@ms/contracts";
import { OCCUPIED_DEFAULTS, ZONE_RECTS, freeZones, occupiedRegions, unionArea } from "../../src/analysis/zones.js";
import { framesWithFace, framesWithHands } from "./helpers.js";

const defaults = OCCUPIED_DEFAULTS;

describe("ZONE_RECTS", () => {
  it("геометрия плана; все зоны внутри кадра", () => {
    expect(ZONE_RECTS.left_third).toEqual({ x: 0.04, y: 0.08, w: 0.30, h: 0.84 });
    expect(ZONE_RECTS.right_third).toEqual({ x: 0.66, y: 0.08, w: 0.30, h: 0.84 });
    expect(ZONE_RECTS.top_band).toEqual({ x: 0.04, y: 0.04, w: 0.92, h: 0.22 });
    expect(ZONE_RECTS.lower_third).toEqual({ x: 0.04, y: 0.70, w: 0.92, h: 0.24 });
    expect(ZONE_RECTS.full).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(ZONE_RECTS.split_left).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(ZONE_RECTS.split_right).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(ZONE_RECTS.pip_tl).toEqual({ x: 0.04, y: 0.04, w: 0.3, h: 0.3 });
    expect(ZONE_RECTS.pip_br).toEqual({ x: 0.66, y: 0.66, w: 0.3, h: 0.3 });
    for (const r of Object.values(ZONE_RECTS)) expect(NormRectSchema.safeParse(r).success).toBe(true);
  });
});

describe("freeZones", () => {
  it("лицо справа: левая треть и нижняя полоса свободны", () => {
    const face = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };
    const z = Object.fromEntries(freeZones([face]).map((f) => [f.zone, f.free_ratio]));
    expect(z.left_third).toBe(1);
    expect(z.right_third).toBeCloseTo(0.75, 3);
    expect(z.top_band).toBeCloseTo(0.864, 3);
    expect(z.lower_third).toBe(1);
  });

  it("перекрывающиеся области не считаются дважды; пустой список — всё свободно; свои зоны", () => {
    const a = { x: 0, y: 0, w: 0.5, h: 1 };
    const b = { x: 0.25, y: 0, w: 0.5, h: 1 };
    expect(unionArea([a, b])).toBeCloseTo(0.75, 9);
    expect(freeZones([a, b], ["full"])[0]!.free_ratio).toBeCloseTo(0.25, 9);
    expect(freeZones([]).every((f) => f.free_ratio === 1)).toBe(true);
    expect(freeZones([], ["pip_tr"])[0]).toEqual({ zone: "pip_tr", rect: ZONE_RECTS.pip_tr, free_ratio: 1 });
  });
});

describe("occupiedRegions", () => {
  const face = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };

  it("лицо +25 % размера с каждой стороны; доля кадров; занято = лицо", () => {
    const occ = occupiedRegions(framesWithFace(face, 10), defaults);
    expect(occ.face).toEqual({ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 });
    expect(occ.faceRatio).toBe(1);
    expect(occ.occupied).toEqual([occ.face]);
    expect(occ.uncertain).toEqual([]);
  });

  it("лицо на меньшей части кадров — пометка неуверенности", () => {
    expect(occupiedRegions(framesWithFace(face, 2, { total: 10 }), defaults).uncertain).toContain("лицо найдено менее чем на 30 % кадров");
  });

  it("лицо у края: расширение обрезано кадром", () => {
    const occ = occupiedRegions(framesWithFace({ x: 0.85, y: 0.0, w: 0.15, h: 0.3 }, 3), defaults);
    expect(occ.face).toBeDefined();
    expect(NormRectSchema.safeParse(occ.face).success).toBe(true);
    expect(occ.face!.x + occ.face!.w).toBeCloseTo(1, 9);
    expect(occ.face!.y).toBe(0);
  });

  it("объединение по кадрам шота: лицо двигается — рамка покрывает все положения", () => {
    const frames = [...framesWithFace({ x: 0.2, y: 0.2, w: 0.2, h: 0.3 }, 2), ...framesWithFace({ x: 0.5, y: 0.25, w: 0.2, h: 0.3 }, 2)];
    const occ = occupiedRegions(frames, defaults);
    expect(occ.face!.x).toBeCloseTo(0.15, 9);
    expect(occ.face!.x + occ.face!.w).toBeCloseTo(0.75, 9);
  });

  it("руки без лица: руки заняты (+10 %), лица нет", () => {
    const hand = { x: 0.3, y: 0.6, w: 0.2, h: 0.2 };
    const occ = occupiedRegions(framesWithHands(hand, 4), defaults);
    expect(occ.face).toBeUndefined();
    expect(occ.faceRatio).toBe(0);
    expect(occ.hands).toEqual({ x: 0.28, y: 0.58, w: 0.24, h: 0.24 });
    expect(occ.handsRatio).toBe(1);
    expect(occ.occupied).toEqual([occ.hands]);
  });

  it("человек без лица (спиной): тело занято, пометка", () => {
    const frames = framesWithFace(face, 0, { total: 3 }).map((f) => ({ ...f, humans: [{ x: 0.3, y: 0.1, w: 0.4, h: 0.9, confidence: 0.9 }] }));
    const occ = occupiedRegions(frames, defaults);
    expect(occ.face).toBeUndefined();
    expect(occ.occupied).toEqual([{ x: 0.3, y: 0.1, w: 0.4, h: 0.9 }]);
    expect(occ.uncertain).toContain("человек в кадре без лица");
  });

  it("нет кадров — пусто, без деления на ноль", () => {
    const occ = occupiedRegions([], defaults);
    expect(occ).toMatchObject({ faceRatio: 0, handsRatio: 0, occupied: [] });
  });
});
