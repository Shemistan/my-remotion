import { describe, expect, it } from "vitest";
import { type Rect, gridColumns, layoutLayered } from "../../src/motion-kit/choreo/layout.js";
import { safeRect } from "../../src/motion-kit/choreo/safe-area.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const s1080 = { width: 1920, height: 1080, safe_area: { x: 0.05, y: 0.05 } };
const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const noOverlaps = (rs: Rect[]) => rs.every((a, i) => rs.every((b, j) => i === j || !overlap(a, b)));
const allInside = (rs: Rect[], r: Rect) => rs.every((a) => a.x >= r.x && a.y >= r.y && a.x + a.w <= r.x + r.w && a.y + a.h <= r.y + r.h);

const agentNodes = [
  { id: "user", w: 260, h: 100 },
  { id: "orch", w: 280, h: 130 },
  { id: "tool1", w: 220, h: 96 },
  { id: "tool2", w: 220, h: 96 },
  { id: "tool3", w: 220, h: 96 },
];
const agentEdges = [
  { from: "user", to: "orch" },
  { from: "orch", to: "tool1" },
  { from: "orch", to: "tool2" },
  { from: "orch", to: "tool3" },
];

describe("safeRect", () => {
  it("доли кадра → px (бриф)", () => {
    expect(safeRect({ width: 1920, height: 1080, safe_area: { x: 0.05, y: 0.05 } })).toEqual({ x: 96, y: 54, w: 1728, h: 972 });
    expect(safeRect({ width: 1080, height: 1920, safe_area: { x: 0.06, y: 0.08 } })).toEqual({ x: 65, y: 154, w: 950, h: 1612 });
  });
});

describe("gridColumns", () => {
  it("n колонок с gutter стиля во всю ширину", () => {
    const r = { x: 100, y: 0, w: 1000, h: 500 };
    const cols = gridColumns(st, r, 4);
    expect(cols).toHaveLength(4);
    expect(cols[0]!.x).toBe(100);
    const last = cols.at(-1)!;
    expect(last.x + last.w).toBeCloseTo(1100, 6);
    expect(cols[1]!.x - (cols[0]!.x + cols[0]!.w)).toBeCloseTo(st.grid.gutter, 6);
    expect(new Set(cols.map((c) => c.w.toFixed(6))).size).toBe(1);
  });
});

describe("layoutLayered", () => {
  const rect = safeRect(s1080);
  const l = layoutLayered(agentNodes, agentEdges, rect, { x: 120, y: 48 });

  it("агентная схема: без пересечений, внутри safe area, слои слева направо (бриф)", () => {
    expect(noOverlaps(Object.values(l))).toBe(true);
    expect(allInside(Object.values(l), rect)).toBe(true);
    expect(l.tool1!.x).toBe(l.tool3!.x);
    expect(l.user!.x).toBeLessThan(l.orch!.x);
    expect(l.orch!.x).toBeLessThan(l.tool1!.x);
  });

  it("размеры узлов сохраняются, слой центрирован по вертикали, зазоры не меньше gap", () => {
    expect(l.orch).toMatchObject({ w: 280, h: 130 });
    const cy = rect.y + rect.h / 2;
    expect(l.orch!.y + l.orch!.h / 2).toBeCloseTo(cy, 6);
    const tools = [l.tool1!, l.tool2!, l.tool3!].sort((a, b) => a.y - b.y);
    expect(tools[1]!.y - (tools[0]!.y + tools[0]!.h)).toBeGreaterThanOrEqual(48 - 1e-9);
    expect((tools[0]!.y + tools[2]!.y + tools[2]!.h) / 2).toBeCloseTo(cy, 6);
    expect(l.orch!.x - (l.user!.x + l.user!.w)).toBeGreaterThanOrEqual(120 - 1e-9);
  });

  it("цикл не зацикливает раскладку; неизвестный узел в ребре — ошибка", () => {
    const c = layoutLayered(agentNodes.slice(0, 2), [{ from: "user", to: "orch" }, { from: "orch", to: "user" }], rect, { x: 120, y: 48 });
    expect(c.user!.x).toBeLessThan(c.orch!.x);
    expect(() => layoutLayered(agentNodes, [{ from: "user", to: "ghost" }], rect, { x: 120, y: 48 })).toThrow(/ghost/);
  });

  it("не влезает по ширине — понятная ошибка, а не наложение", () => {
    const wide = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, w: 400, h: 80 }));
    const chain = wide.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }));
    expect(() => layoutLayered(wide, chain, rect, { x: 120, y: 48 })).toThrow(/ширин/);
  });
});
