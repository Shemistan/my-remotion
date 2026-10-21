// E2.1 / E2.3: данные ложатся в слот узла (без угадывания px) и не перекрывают подписи;
// статус и данные — разная визуальная грамматика, цвет данных не совпадает со статусным.
import { describe, expect, it } from "vitest";
import { dataColor, dataTokenLook, dockPoint } from "../../src/motion-kit/components/DataToken.js";
import { type FlowNode, flowLabelSizes, flowSlot, flowTiming } from "../../src/motion-kit/components/FlowGraph.js";
import { statusChipLook, toneColor } from "../../src/motion-kit/components/StatusChip.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";
import { typeSize } from "../../src/motion-kit/style/type-scale.js";
import { hueDistance } from "../../src/motion-kit/tokens.js";

const PRESETS = ["dark-premium", "light-clean", "tech-neon"] as const;
const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const NODES: FlowNode[] = [
  { id: "client", label: "Клиент", caption: "GET /user/42", x: 0, y: 190, w: 320, h: 130 },
  { id: "cache", label: "Кэш", caption: "Redis · в памяти", size: "h2", x: 560, y: 160, w: 420, h: 190, slot: true },
  { id: "db", label: "База данных", caption: "PostgreSQL", x: 1220, y: 190, w: 320, h: 130 },
];

describe("flowSlot: место под данные внутри карточки", () => {
  for (const h of [540, 1080]) {
    it(`${h}p: слот внутри узла, ниже блока подписи (подпись и пояснение не перекрыты)`, () => {
      const k = h / 1080;
      const n = { ...NODES[1]!, x: 560 * k, y: 160 * k, w: 420 * k, h: 190 * k };
      const slot = flowSlot(n, st, h)!;
      expect(slot.x).toBeGreaterThanOrEqual(n.x);
      expect(slot.x + slot.w).toBeLessThanOrEqual(n.x + n.w);
      expect(slot.y + slot.h).toBeLessThanOrEqual(n.y + n.h);
      // блок подписи центрирован в карточке над слотом
      const sz = flowLabelSizes([n], st, h).get(n.id)!;
      const text = sz.label * 1.15 + 4 + sz.caption * 1.2;
      const textBottom = n.y + (n.h - slot.reserve) / 2 + text / 2;
      expect(textBottom).toBeLessThanOrEqual(slot.y);
      // токен кегля caption в слот влезает по высоте
      expect(slot.h).toBeGreaterThanOrEqual(typeSize(st, "caption", h) * 1.15);
    });
  }

  it("без slot — null (раскладка узла как в 0.3.0)", () => {
    expect(flowSlot(NODES[0]!, st, 1080)).toBeNull();
  });
});

describe("dockPoint: куда ложится токен", () => {
  const t = flowTiming(NODES, [{ id: "e-req", from: "client", to: "cache" }, { id: "e-db", from: "cache", to: "db" }], { start_frame: 0, end_frame: 40 }, st, 30);
  const flow = {
    edges: t.edges,
    nodes: new Map(NODES.map((n) => [n.id, n])),
    links: new Map([["e-req", { from: "client", to: "cache" }], ["e-db", { from: "cache", to: "db" }]]),
    slots: new Map([["cache", flowSlot(NODES[1]!, st, 1080)!]]),
  };

  it("ребро в узел со слотом: по умолчанию — центр слота (reverse — узел-источник)", () => {
    const slot = flow.slots.get("cache")!;
    const p = dockPoint(flow, "e-req", false, undefined, st, 1080);
    expect(p.issue).toBeNull();
    expect(p.at).toEqual({ x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 });
    expect(dockPoint(flow, "e-db", true, undefined, st, 1080).at).toEqual(p.at);
  });

  it("явный { dx, dy } — как в 0.3.0 (смещение от конца пути)", () => {
    const end = t.edges.get("e-db")![0];
    expect(dockPoint(flow, "e-db", true, { dx: -210, dy: 74 }, st, 1080).at).toEqual({ x: end.x - 210, y: end.y + 74 });
  });

  it("dock: \"slot\" у узла без слота — под карточкой (не на подписи) и сообщение", () => {
    const p = dockPoint(flow, "e-db", false, "slot", st, 1080);
    const db = NODES[2]!;
    expect(p.at!.y).toBeGreaterThan(db.y + db.h);
    expect(p.issue).toMatch(/db/);
  });

  it("без слота и без dock — конец пути, без сообщения", () => {
    const end = t.edges.get("e-db")![3];
    expect(dockPoint(flow, "e-db", false, undefined, st, 1080)).toEqual({ at: end, issue: null, slot: false });
  });
});

describe("статус vs данные: разная грамматика", () => {
  for (const preset of PRESETS) {
    const s = resolveStyle({ preset, intensity: "balanced" });
    it(`${preset}: форма, шрифт, регистр и маркер различаются`, () => {
      const d = dataTokenLook(s, 32);
      const c = statusChipLook(s, 32);
      expect(c.radius).toBeGreaterThanOrEqual(999);
      expect(d.radius).toBeLessThan(32 * 0.35);
      expect(d.font).toBe(s.typography.mono);
      expect(c.font).toBe(s.typography.body);
      expect(c.caps).toBe(true);
      expect(d.caps).toBe(false);
      expect(d.marker).toBe("bar");
      expect(c.marker).toBe("dot");
    });

    it(`${preset}: цвет данных по умолчанию и по любому accentIndex далёк от positive / negative (≥ 40°)`, () => {
      for (const i of [undefined, 0, 1, 2]) {
        const col = dataColor(s, undefined, i);
        expect(hueDistance(col, toneColor(s, "positive")), `accent ${i}`).toBeGreaterThanOrEqual(40);
        expect(hueDistance(col, toneColor(s, "negative")), `accent ${i}`).toBeGreaterThanOrEqual(40);
      }
    });
  }
});
