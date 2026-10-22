// 0.4.0: токен едет по ребру и встаёт перед портом, текст в кадре один (без «призраков»),
// поглощается узлом или ложится в полосу; зоны узла (подпись, полоса, статус) не пересекаются.
import { describe, expect, it } from "vitest";
import { tokenBox, tokenMode, tokenShot, tokenSpan, tokenStop } from "../../src/motion-kit/components/DataToken.js";
import { cacheFill, flowTiming } from "../../src/motion-kit/components/FlowGraph.js";
import { FLOW_KINDS, type FlowBox, edgePath, flowLabelZone, flowSlot, flowStatusSlot, queueCellCenter, queueCellIssue, queueCells, usedSides } from "../../src/motion-kit/components/flow-layout.js";
import type { Rect } from "../../src/motion-kit/choreo/safe-area.js";
import { pathLUT, pointAtLength } from "../../src/motion-kit/geometry.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const cross = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("tokenShot: одна карточка на кадр", () => {
  const modes = ["slot", "consume", "rest", "offset"] as const;
  for (const mode of modes) {
    it(`${mode}: в полёте — на пути, после — по режиму; шлейф только в полёте`, () => {
      for (let f = 0; f < 120; f++) {
        const t = tokenShot(f, 10, 30, st, { mode });
        if (f < 10) expect(t.visible).toBe(false);
        if (f >= 10 && f < 40) {
          expect(t.at).toBe("path");
          expect(t.tail).not.toBeNull();
          expect(t.tail!).toBeLessThanOrEqual(t.progress);
        } else expect(t.tail).toBeNull();
      }
    });
  }
  it("slot: карточка гаснет у порта и лишь потом проявляется в полосе (две копии текста не видны)", () => {
    let seenDock = false;
    let minBetween = 1;
    for (let f = 40; f < 90; f++) {
      const t = tokenShot(f, 10, 30, st, { mode: "slot" });
      if (t.at === "dock") seenDock = true;
      else minBetween = Math.min(minBetween, t.visible ? t.opacity : 0);
    }
    expect(seenDock).toBe(true);
    expect(minBetween).toBeLessThan(0.05);
    expect(tokenShot(119, 10, 30, st, { mode: "slot" })).toMatchObject({ at: "dock", opacity: 1 });
  });
  it("consume: после прихода поглощается — к концу сцены токена нет", () => {
    expect(tokenShot(41, 10, 30, st, { mode: "consume" }).visible).toBe(true);
    for (let f = 52; f < 180; f++) expect(tokenShot(f, 10, 30, st, { mode: "consume" }).visible).toBe(false);
  });
});

describe("tokenMode: по умолчанию хвостов нет", () => {
  it("в графе без полосы — consume, с полосой — slot, stay — остаётся, dock — смещение", () => {
    expect(tokenMode({ inGraph: true, hasSlot: false })).toBe("consume");
    expect(tokenMode({ inGraph: true, hasSlot: true })).toBe("slot");
    expect(tokenMode({ inGraph: true, hasSlot: false, stay: true })).toBe("rest");
    expect(tokenMode({ inGraph: true, hasSlot: true, stay: false })).toBe("consume");
    expect(tokenMode({ inGraph: true, hasSlot: true, consume: true })).toBe("consume");
    expect(tokenMode({ inGraph: true, hasSlot: false, dock: { dx: 0, dy: 40 } })).toBe("offset");
    expect(tokenMode({ inGraph: false, hasSlot: false })).toBe("rest");
  });
});

describe("tokenStop: токен на линии ребра и не заходит на карточку цели", () => {
  const a: FlowBox = { id: "a", x: 0, y: 200, w: 300, h: 140 };
  for (const b of [{ id: "b", x: 700, y: 120, w: 320, h: 160 }, { id: "b", x: 40, y: 600, w: 320, h: 160 }]) {
    it(`цель ${b.x},${b.y}: карточка токена в точке остановки не пересекает узел`, () => {
      const seg = edgePath(a, b);
      const lut = pathLUT([seg], 40);
      const box = tokenBox("GET /user/42", 32);
      const stop = tokenStop(lut, false, box, 6);
      const p = pointAtLength(lut, stop);
      expect(cross({ x: p.x - box.w / 2, y: p.y - box.h / 2, w: box.w, h: box.h }, b)).toBe(false);
      // обратный путь — к узлу-источнику
      const back = pointAtLength(lut, lutLen(lut) - tokenStop(lut, true, box, 6));
      expect(cross({ x: back.x - box.w / 2, y: back.y - box.h / 2, w: box.w, h: box.h }, a)).toBe(false);
      // старт — целиком снаружи источника (в обе стороны)
      const s0 = pointAtLength(lut, tokenSpan(lut, false, box, 6).from);
      expect(cross({ x: s0.x - box.w / 2, y: s0.y - box.h / 2, w: box.w, h: box.h }, a)).toBe(false);
      const s1 = pointAtLength(lut, lutLen(lut) - tokenSpan(lut, true, box, 6).from);
      expect(cross({ x: s1.x - box.w / 2, y: s1.y - box.h / 2, w: box.w, h: box.h }, b)).toBe(false);
    });
  }
});
const lutLen = (l: ReturnType<typeof pathLUT>) => l.lengths.at(-1)!;

describe("зоны узла: подпись, полоса данных и статус не пересекаются", () => {
  for (const kind of FLOW_KINDS) {
    for (const slot of [false, true]) {
      it(`${kind}${slot ? " + slot" : ""}`, () => {
        const n: FlowBox = { id: "n", x: 400, y: 300, w: 420, h: 220, kind, slot };
        const zone = flowLabelZone(n, st, 1080);
        const band = flowSlot(n, st, 1080);
        if (["queue", "store", "cache"].includes(kind) || slot) expect(band).not.toBeNull();
        if (band) {
          expect(cross(zone, band)).toBe(false);
          expect(band.y + band.h).toBeLessThanOrEqual(n.y + n.h);
        }
        const status = flowStatusSlot(n, new Set(), st, 1080);
        expect(cross(zone, status.rect)).toBe(false);
        expect(cross(n, status.rect)).toBe(false);
      });
    }
  }
  it("статус уходит вниз, если сверху в узел входит ребро; вправо — если заняты обе", () => {
    const top: FlowBox = { id: "t", x: 400, y: 0, w: 300, h: 120 };
    const mid: FlowBox = { id: "m", x: 400, y: 300, w: 300, h: 120 };
    const low: FlowBox = { id: "l", x: 400, y: 600, w: 300, h: 120 };
    const used = usedSides([top, mid, low], [{ from: "t", to: "m" }, { from: "m", to: "l" }]);
    expect(flowStatusSlot(top, used.get("t")!, st, 1080).side).toBe("top");
    expect(flowStatusSlot(low, used.get("l")!, st, 1080).side).toBe("bottom");
    expect(flowStatusSlot(mid, used.get("m")!, st, 1080).side).toBe("right");
  });
});

describe("queue и cache", () => {
  it("ячейка 0 буфера — у выхода (справа), дальше — к входу", () => {
    const band = flowSlot({ id: "q", x: 0, y: 0, w: 640, h: 200, kind: "queue" }, st, 1080)!;
    const c0 = queueCellCenter(band, 0);
    const c1 = queueCellCenter(band, 1);
    expect(c0.x).toBeGreaterThan(c1.x);
    expect(c0.x).toBeLessThan(band.x + band.w);
    expect(c1.x).toBeGreaterThan(band.x);
  });
  it("cacheFill: filled с начала + записи до кадра, последняя загорается за ~8 кадров", () => {
    expect(cacheFill(10, [20, 40], 2, st)).toEqual({ lit: 2, last: 1 });
    expect(cacheFill(20, [20, 40], 2, st).lit).toBe(3);
    expect(cacheFill(20, [20, 40], 2, st).last).toBe(0);
    expect(cacheFill(60, [20, 40], 0, st)).toEqual({ lit: 2, last: 1 });
  });
  it("flowTiming не зависит от kind (роль — облик, не тайминг)", () => {
    const n = [{ id: "a", label: "A", x: 0, y: 0, w: 200, h: 100 }, { id: "b", label: "B", x: 400, y: 0, w: 200, h: 100 }];
    const t1 = flowTiming(n, [{ id: "e", from: "a", to: "b" }], { start_frame: 0, end_frame: 60 }, st, 30);
    const t2 = flowTiming(n.map((x) => ({ ...x, kind: "queue" as const })), [{ id: "e", from: "a", to: "b" }], { start_frame: 0, end_frame: 60 }, st, 30);
    expect([...t2.ready]).toEqual([...t1.ready]);
  });
});

describe("S2-fix I1: переполнение очереди не молчит", () => {
  const node = (cells?: number): FlowBox & { cells?: number } => ({ id: "q", x: 0, y: 0, w: 640, h: 200, kind: "queue", ...(cells ? { cells } : {}) });
  it("cells узла задаёт ёмкость буфера: ячейки уже, все в полосе", () => {
    const fit = queueCells(flowSlot(node(), st, 1080)!).count;
    const band = flowSlot(node(fit + 2), st, 1080)!;
    const c = queueCells(band);
    expect(c.count).toBe(fit + 2);
    expect(queueCellCenter(band, fit + 1).x - c.w / 2).toBeGreaterThanOrEqual(band.x - 1e-6);
  });
  it("cell ≥ ёмкости: ошибка kit (blocking) с подсказкой cells, позиция не совпадает с занятой ячейкой", () => {
    const band = flowSlot(node(), st, 1080)!;
    const n = queueCells(band).count;
    expect(queueCellIssue("q", band, n - 1)).toBeNull();
    const msg = queueCellIssue("q", band, n);
    expect(msg).toMatch(/cells: ?3|cells: ?\d/);
    expect(msg).toMatch(/"q"/);
    expect(queueCellCenter(band, n).x).not.toBeCloseTo(queueCellCenter(band, n - 1).x, 0);
  });
});
