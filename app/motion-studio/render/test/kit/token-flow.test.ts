// 0.4.0: токен едет по ребру и встаёт перед портом, текст в кадре один (без «призраков»),
// поглощается узлом или ложится в полосу; зоны узла (подпись, полоса, статус) не пересекаются.
import { describe, expect, it } from "vitest";
import { type TokenMode, captionPoint, captionShot, slotFit, tokenBox, tokenLateIssue, tokenMode, tokenShot, tokenSpan, tokenStop } from "../../src/motion-kit/components/DataToken.js";
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

describe("S2-fix I2: токен не уезжает за свой бит молча", () => {
  it("ребро готово к началу бита (или на 2 кадра позже) — норма; позже — ошибка с числами и подсказкой", () => {
    expect(tokenLateIssue("GET /a", "e-a", 30, undefined)).toBeNull();
    expect(tokenLateIssue("GET /a", "e-a", 30, 20)).toBeNull();
    expect(tokenLateIssue("GET /a", "e-a", 30, 32)).toBeNull();
    const m = tokenLateIssue("GET /a", "e-a", 28, 37);
    expect(m).toMatch(/«GET \/a»/);
    expect(m).toMatch(/e-a/);
    expect(m).toMatch(/37/);
    expect(m).toMatch(/9 кадр/);
    expect(m).toMatch(/enterAt/);
  });
});

describe("S2-fix eval: текст токена в полосе не режется многоточием молча", () => {
  it("влезает — кегль как есть; не влезает — мельчает до предела; ниже предела — ошибка с шириной", () => {
    const px = 32;
    const label = "Анна К., Premium";
    const w = tokenBox(label, px).w;
    expect(slotFit(label, px, w + 10, 1080)).toEqual({ px, issue: null });
    const fit = slotFit(label, px, w * 0.85, 1080);
    expect(fit.issue).toBeNull();
    expect(fit.px).toBeLessThan(px);
    expect(fit.px).toBeGreaterThanOrEqual(22);
    expect(tokenBox(label, fit.px).w).toBeLessThanOrEqual(w * 0.85);
    const bad = slotFit(label, px, w * 0.4, 1080);
    expect(bad.px).toBe(22);
    expect(bad.issue).toMatch(/«Анна К\., Premium»/);
    expect(bad.issue).toMatch(/Расширь узел/);
    expect(bad.issue).toMatch(/\d+ px/);
  });
});

describe("S2-fix I5: ярлык токена виден в каждом режиме, и у компактного", () => {
  // ярлык виден в кадре: компактная капсула в полёте — без текста, текст — в подписи связи
  // (captionShot) или в полосе после записи; иначе — карточка токена
  const label = (f: number, start: number, pass: number, end: number, mode: TokenMode, compact: boolean) => {
    const t = tokenShot(f, start, pass, st, { mode });
    const card = t.visible && !(compact && t.at === "path") ? t.opacity : 0;
    const cap = compact ? captionShot(f, start, pass, end, st, { mode }).opacity : 0;
    return { card, cap, shown: Math.max(card, cap) };
  };
  for (const mode of ["slot", "consume", "rest"] as const) {
    for (const compact of [false, true]) {
      it(`${mode}${compact ? " (компактный)" : ""}: в середине бита ярлык виден`, () => {
        const [start, end, pass] = [28, 46, 14];
        const mid = Math.round((start + end) / 2);
        expect(label(mid, start, pass, end, mode, compact).shown).toBeGreaterThanOrEqual(0.5);
      });
    }
  }
  it("компактный в полосу: подпись связи гаснет до записи в полосу — текст в кадре один", () => {
    const [start, end, pass] = [28, 60, 14];
    for (let f = start; f < 120; f++) {
      const t = tokenShot(f, start, pass, st, { mode: "slot" });
      const inSlot = t.at === "dock" ? t.opacity : 0;
      const cap = captionShot(f, start, pass, end, st, { mode: "slot" }).opacity;
      expect(Math.min(inSlot, cap)).toBeLessThan(0.05);
    }
  });
  it("компактный consume и rest: подпись держится до конца бита и гаснет (объект rest — капсула у порта)", () => {
    const [start, end, pass] = [28, 70, 14];
    expect(captionShot(end - 1, start, pass, end, st, { mode: "consume" }).opacity).toBe(1);
    expect(captionShot(end + 20, start, pass, end, st, { mode: "consume" }).opacity).toBe(0);
    expect(captionShot(end - 1, start, pass, end, st, { mode: "rest" }).opacity).toBe(1);
    expect(captionShot(end + 20, start, pass, end, st, { mode: "rest" }).opacity).toBe(0);
    expect(captionShot(start - 1, start, pass, end, st, { mode: "rest" }).opacity).toBe(0);
  });
  it("подпись связи — снаружи обоих узлов: под целью (над, если снизу статус); у вертикального ребра — справа", () => {
    const a = { x: 0, y: 100, w: 200, h: 120 };
    const b = { x: 260, y: 90, w: 200, h: 150 };
    const box = { w: 300, h: 40 };
    const mid = { x: 230, y: 160 };
    const below = captionPoint(mid, b, a, box, 12, false);
    expect(below.y - box.h / 2).toBeGreaterThanOrEqual(240);
    expect(below.x).toBe(360);
    // запрос (цель b) и ответ (цель a) по одной связи — подписи не совпадают
    expect(captionPoint(mid, a, b, box, 12, false).x).toBe(100);
    const above = captionPoint(mid, a, b, box, 12, true);
    expect(above.y + box.h / 2).toBeLessThanOrEqual(90);
    const c = { x: 0, y: 0, w: 200, h: 100 };
    const d = { x: 0, y: 140, w: 200, h: 100 };
    const side = captionPoint({ x: 100, y: 120 }, c, d, box, 12, false);
    expect(side.x - box.w / 2).toBeGreaterThanOrEqual(100);
    expect(side.y).toBe(120);
  });
  it("S2-fix eval: у буфера queue подпись — под своей ячейкой, подписи соседних сообщений не совпадают", () => {
    const orders = { x: 0, y: 200, w: 340, h: 300 };
    const q = { id: "q", x: 520, y: 140, w: 600, h: 440, kind: "queue" as const, cells: 3 };
    const band = flowSlot(q, st, 1080)!;
    const box = tokenBox("#1043", 32);
    const mid = { x: 430, y: 350 };
    const xs = [0, 1, 2].map((c) => captionPoint(mid, q, orders, box, 12, false, queueCellCenter(band, c).x).x);
    expect(xs[0]).toBeCloseTo(queueCellCenter(band, 0).x, 6);
    for (let i = 1; i < 3; i++) expect(Math.abs(xs[i]! - xs[i - 1]!)).toBeGreaterThanOrEqual(box.w);
    expect(captionPoint(mid, q, orders, box, 12, false).x).toBe(q.x + q.w / 2);
  });
});
