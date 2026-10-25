// Шкала таймлайна (0.5.5, S14): ось с делениями и подписями лет. Смоук S11: «Go 1.24 — февраль
// 2025» одной вехой давал точку без оси — теперь веха стоит на оси лет с делениями вокруг.
import { describe, expect, it } from "vitest";
import { datePosition, timelineLayoutFor, timelineScale, yearTickShown } from "../../src/motion-kit/timeline-layout.js";

describe("datePosition", () => {
  it("год и месяц из даты: «февраль 2025», «Feb 2025», «2019», «03.2024»", () => {
    expect(datePosition("февраль 2025")).toBeCloseTo(2025 + 1 / 12, 5);
    expect(datePosition("Feb 2025")).toBeCloseTo(2025 + 1 / 12, 5);
    expect(datePosition("в феврале 2025 года")).toBeCloseTo(2025 + 1 / 12, 5);
    expect(datePosition("2019")).toBe(2019);
    expect(datePosition("03.2024")).toBeCloseTo(2024 + 2 / 12, 5);
  });
  it("без года — нет позиции: «Go 1.24», «сейчас», «v2»", () => {
    expect(datePosition("Go 1.24")).toBeUndefined();
    expect(datePosition("сейчас")).toBeUndefined();
    expect(datePosition("v2")).toBeUndefined();
  });
});

describe("timelineScale", () => {
  it("одна дата — ось лет вокруг неё: деления с подписями, веха внутри, не на краю", () => {
    const sc = timelineScale(["февраль 2025"]);
    expect(sc.mode).toBe("years");
    const labels = sc.ticks.filter((t) => t.label).map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["2024", "2025", "2026"]));
    expect(sc.pos[0]!).toBeGreaterThan(0.2);
    expect(sc.pos[0]!).toBeLessThan(0.8);
    // деление «2025» стоит левее вехи февраля 2025
    const t2025 = sc.ticks.find((t) => t.label === "2025")!;
    expect(t2025.u).toBeLessThan(sc.pos[0]!);
  });

  it("даты 2019–2023 — по году, деления по году, порядок вех сохранён", () => {
    const sc = timelineScale(["2019", "2021", "2023"]);
    expect(sc.pos[0]!).toBeLessThan(sc.pos[1]!);
    expect(sc.pos[1]!).toBeLessThan(sc.pos[2]!);
    // 2021 — ровно посередине между 2019 и 2023
    expect(sc.pos[1]! - sc.pos[0]!).toBeCloseTo(sc.pos[2]! - sc.pos[1]!, 5);
    expect(sc.ticks.filter((t) => t.label).length).toBeGreaterThanOrEqual(5);
  });

  it("длинный период — деления реже (шаг 5 или 10 лет), подписей не больше 9", () => {
    const sc = timelineScale(["1970", "2025"]);
    expect(sc.ticks.filter((t) => t.label).length).toBeLessThanOrEqual(9);
  });

  it("не все даты с годом — равномерно, как раньше, с тихими делениями без подписей", () => {
    const sc = timelineScale(["Go 1.21", "Go 1.22", "Go 1.24"]);
    expect(sc.mode).toBe("even");
    expect(sc.pos).toEqual([0, 0.5, 1]);
    expect(sc.ticks.length).toBeGreaterThanOrEqual(8);
    expect(sc.ticks.every((t) => t.label === undefined)).toBe(true);
    expect(timelineScale(["Go 1.24"]).pos).toEqual([0.5]);
  });

  it("одна веха (S15a) — шкала симметрична: веха в центре, её год подписан рядом", () => {
    const sc = timelineScale(["февраль 2025"]);
    expect(sc.pos[0]!).toBeCloseTo(0.5, 5);
    const labels = sc.ticks.filter((t) => t.label).map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["2024", "2025", "2026"]));
    // года по обе стороны поровну
    const before = sc.ticks.filter((t) => t.label && t.u < 0.5).length;
    const after = sc.ticks.filter((t) => t.label && t.u > 0.5).length;
    expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
  });

  it("скученные вехи (S15a): 1990/2020/2022/2024 на 1600 px — равномерно, без подписей лет", () => {
    const fit = { width: 1600, node: 26, label: 240 };
    const sc = timelineScale(["1990", "2020", "2022", "2024"], fit);
    expect(sc.mode).toBe("even");
    expect(sc.pos).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(sc.ticks.every((t) => t.label === undefined)).toBe(true);
    // просторные — шкала лет остаётся
    expect(timelineScale(["2019", "2021", "2023"], fit).mode).toBe("years");
    // без размеров — как раньше (шкала лет)
    expect(timelineScale(["1990", "2020", "2022", "2024"]).mode).toBe("years");
  });

  it("одинаковые годы не сливаются в одну точку", () => {
    const sc = timelineScale(["2024", "2024", "2025"], { width: 1600, node: 26, label: 240 });
    const px = sc.pos.map((u) => u * 1600);
    for (let i = 1; i < px.length; i++) expect(Math.abs(px[i]! - px[i - 1]!)).toBeGreaterThanOrEqual(52);
  });

  it("timelineLayoutFor — позиции вех по шкале на rect", () => {
    const pts = timelineLayoutFor(["2019", "2021", "2023"], { x: 100, y: 0, w: 1000, h: 200 }, "h");
    expect(pts.map((p) => p.y)).toEqual([100, 100, 100]);
    expect(pts[0]!.x).toBeGreaterThan(100);
    expect(pts[2]!.x).toBeLessThan(1100);
  });
});

// 0.5.7 (ревью S15a, M-5): год под осью рядом с вехой остаётся только у одиночной вехи;
// при двух и больше вехах год у вехи скрыт, как в 0.5.5 (стебель и дата вехи там).
describe("yearTickShown", () => {
  it("одна веха — год под ней подписан", () => {
    expect(yearTickShown(500, [{ x: 500 }], 80)).toBe(true);
  });
  it("несколько вех — год рядом с любой вехой скрыт (и с чётной), вдали — подписан", () => {
    const pts = [{ x: 100 }, { x: 600 }, { x: 1100 }];
    expect(yearTickShown(110, pts, 80)).toBe(false);
    expect(yearTickShown(610, pts, 80)).toBe(false);
    expect(yearTickShown(350, pts, 80)).toBe(true);
  });
});
