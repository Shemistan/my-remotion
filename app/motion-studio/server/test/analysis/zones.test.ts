// Task 30: занятые области (лицо, руки) и свободные зоны.
import { describe, expect, it } from "vitest";
import { NormRectSchema } from "@ms/contracts";
import type { VisionFrame } from "../../src/analysis/vision.js";
import { OCCUPIED_DEFAULTS, ZONE_RECTS, freeZones, handsOf, occupancyForRange, occupiedRegions, timeWindows, unionArea, windowOccupancy } from "../../src/analysis/zones.js";
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

// Task 30, прогон на реальном ролике: занятость по окнам времени и шум детектора рук
const frame = (o: Partial<VisionFrame> = {}): VisionFrame => ({ path: "f.png", width: 640, height: 360, faces: [], humans: [], hands: [], saliency: [], ...o });
const det = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, confidence: 0.8 });

describe("шум рук", () => {
  it("рамка руки < 0,25 площади лица кадра или < 0,002 кадра отбрасывается", () => {
    const f = frame({ faces: [det(0.4, 0.2, 0.2, 0.2)], hands: [det(0.1, 0.6, 0.1, 0.1), det(0.7, 0.6, 0.05, 0.1)] }); // 0,01 = 0,25·0,04 — остаётся; 0,005 — нет
    expect(handsOf(f, defaults).map((h) => h.x)).toEqual([0.1]);
    const noFace = frame({ hands: [det(0.1, 0.6, 0.03, 0.05), det(0.7, 0.6, 0.05, 0.05)] }); // 0,0015 — нет; 0,0025 — да
    expect(handsOf(noFace, defaults).map((h) => h.x)).toEqual([0.7]);
  });

  it("ложная «рука» у картины на стене (реальный ролик, 0,016×0,03) не занимает места и не считается", () => {
    const real = det(0.17, 0.6, 0.13, 0.3);
    const picture = det(0.85, 0.13, 0.016, 0.03);
    const face = det(0.45, 0.2, 0.2, 0.25);
    const frames = [frame({ faces: [face], hands: [real, picture] }), frame({ faces: [face], hands: [picture] })];
    const occ = occupiedRegions(frames, defaults);
    expect(occ.hands).toEqual({ x: 0.157, y: 0.57, w: 0.156, h: 0.36 });
    expect(occ.handsRatio).toBe(0.5);
  });
});

describe("окна времени", () => {
  it("равные окна ≈ windowUs, без зазоров, покрывают шот", () => {
    const w = timeWindows(0, 54_700_000, 4_000_000);
    expect(w).toHaveLength(14);
    expect(w[0]!.start_us).toBe(0);
    expect(w.at(-1)!.end_us).toBe(54_700_000);
    for (let k = 1; k < w.length; k++) expect(w[k]!.start_us).toBe(w[k - 1]!.end_us);
    expect(timeWindows(1_000_000, 3_000_000, 4_000_000)).toEqual([{ start_us: 1_000_000, end_us: 3_000_000 }]);
    expect(timeWindows(0, 16_000_000, 4_000_000).map((x) => x.start_us)).toEqual([0, 4_000_000, 8_000_000, 12_000_000]);
  });

  const face = { x: 0.4, y: 0.1, w: 0.2, h: 0.3 };
  const fixed = [{ x: 0.35, y: 0.025, w: 0.3, h: 0.45 }];
  const left = det(0.05, 0.4, 0.2, 0.3);
  const right = det(0.75, 0.4, 0.2, 0.3);
  // 0–16 с, кадры 1, 3, …, 15 с: левая рука — первые 4 с, правая — последние 4 с
  const timed = [1, 3, 5, 7, 9, 11, 13, 15].map((s) => ({
    us: s * 1_000_000,
    frame: frame({ faces: [{ ...face, confidence: 0.9 }], hands: s < 4 ? [left] : s > 12 ? [right] : [] }),
  }));
  const o = { ...defaults, windowUs: 4_000_000 };

  it("руки — объединение только кадров окна; лицо (fixed) — во всех окнах; зоны своего окна", () => {
    const ws = windowOccupancy({ start_us: 0, end_us: 16_000_000 }, timed, fixed, o);
    expect(ws.map((w) => [w.start_us, w.end_us])).toEqual([[0, 4_000_000], [4_000_000, 8_000_000], [8_000_000, 12_000_000], [12_000_000, 16_000_000]]);
    expect(ws[0]!.hands).toEqual({ x: 0.03, y: 0.37, w: 0.24, h: 0.36 });
    expect(ws[1]!.hands).toBeUndefined();
    for (const w of ws) expect(w.occupied).toContainEqual(fixed[0]);
    const z = (k: number, zone: string) => ws[k]!.free_zones.find((f) => f.zone === zone)!.free_ratio;
    expect(z(0, "right_third")).toBe(1);
    expect(z(0, "left_third")).toBeLessThan(0.9);
    expect(z(1, "left_third")).toBe(1);
    expect(z(3, "left_third")).toBe(1);
    expect(z(3, "right_third")).toBeLessThan(0.9);
  });

  it("окно без кадров берёт ближайшие кадры до и после (консервативно)", () => {
    const sparse = [timed[0]!, timed[7]!]; // 1 с (левая рука) и 15 с (правая)
    const ws = windowOccupancy({ start_us: 0, end_us: 16_000_000 }, sparse, fixed, o);
    expect(ws[1]!.hands).toEqual({ x: 0.03, y: 0.37, w: 0.94, h: 0.36 });
    expect(windowOccupancy({ start_us: 0, end_us: 16_000_000 }, [], fixed, o).every((w) => w.hands === undefined)).toBe(true);
  });

  it("occupancyForRange: объединение окон, пересекающих интервал; вне окон — худший случай шота", () => {
    const ws = windowOccupancy({ start_us: 0, end_us: 16_000_000 }, timed, fixed, o);
    const all = [...fixed, ws[0]!.hands!, ws[3]!.hands!];
    const shot = { windows: ws, occupied: all, free_zones: freeZones(all) };
    expect(occupancyForRange(shot, 4_000_000, 8_000_000).occupied).toEqual(fixed); // полуоткрытые интервалы
    const a = occupancyForRange(shot, 5_000_000, 13_000_000);
    expect(a.occupied).toEqual([...fixed, ws[3]!.hands!]);
    expect(a.free_zones.find((f) => f.zone === "left_third")!.free_ratio).toBe(1);
    expect(occupancyForRange(shot, 0, 16_000_000).occupied).toEqual(all);
    expect(occupancyForRange(shot, 20_000_000, 21_000_000)).toEqual({ occupied: all, free_zones: shot.free_zones });
  });
});
