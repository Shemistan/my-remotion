// FlowGraph: входы узлов по одному, приход импульса (pulseArrival) и вспышка узла.
import { describe, expect, it } from "vitest";
import { ARRIVAL_PX, EASE_PASS, pulseArrival, pulseStarts } from "../../src/motion-kit/choreo/pulse.js";
import { type CardEnter, cardEnterStyle } from "../../src/motion-kit/components/Card.js";
import { flowTiming, nodeFlash } from "../../src/motion-kit/components/FlowGraph.js";
import { lutLength, pathLUT } from "../../src/motion-kit/geometry.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const NODES = [
  { id: "a", label: "A", x: 0, y: 100, w: 200, h: 90 },
  { id: "b", label: "B", x: 600, y: 0, w: 200, h: 90 },
  { id: "c", label: "C", x: 600, y: 300, w: 200, h: 90, enterAt: 50 },
];
const EDGES = [
  { id: "ab", from: "a", to: "b" },
  { id: "ac", from: "a", to: "c" },
];
const BEAT = { start_frame: 10, end_frame: 70 };

describe("flowTiming", () => {
  const t = flowTiming(NODES, EDGES, BEAT, st, 30);

  it("каскад слева направо; enterAt узла важнее каскада; ребро ждёт оба конца", () => {
    expect(t.nodeStart.get("a")).toBeGreaterThanOrEqual(10);
    expect(t.nodeStart.get("b")!).toBeGreaterThan(t.nodeStart.get("a")!);
    expect(t.nodeStart.get("c")).toBe(50);
    expect(t.edgeStart.get("ac")!).toBeGreaterThan(50);
    expect(t.ready.get("ac")!).toBeGreaterThan(t.edgeStart.get("ac")!);
  });

  it("приход импульса: голова в пределах ARRIVAL_PX от конца ребра — не раньше", () => {
    const beat = { start_frame: 90, end_frame: 150 };
    const got = t.arrivals(pulseArrival("ab", beat, 20));
    const starts = pulseStarts({ start: 90, end: 150, pass: 20 });
    expect(starts).toEqual([90, 110, 130]);
    expect(got).toHaveLength(3);
    const len = lutLength(pathLUT([t.edges.get("ab")!], 40));
    got.forEach((f, i) => {
      const t0 = starts[i]!;
      expect(f).toBeGreaterThan(t0);
      expect(f).toBeLessThanOrEqual(t0 + 20);
      expect(EASE_PASS((f - t0) / 20) * len).toBeGreaterThanOrEqual(len - ARRIVAL_PX - 1e-6);
      expect(EASE_PASS((f - 0.25 - t0) / 20) * len).toBeLessThan(len - ARRIVAL_PX);
    });
  });

  it("импульс не стартует раньше, чем ребро дорисовано; repeat / count как у PulseAlongPath", () => {
    const early = t.arrivals(pulseArrival("ac", { start_frame: 0, end_frame: 200 }, 20, { repeat: false }));
    expect(early).toHaveLength(1);
    expect(early[0]!).toBeGreaterThan(t.ready.get("ac")!);
    expect(t.arrivals(pulseArrival("ab", { start_frame: 90, end_frame: 150 }, 20, { count: 2 }))).toHaveLength(6);
    expect(t.arrivals(pulseArrival("нет", { start_frame: 90, end_frame: 150 }, 20))).toEqual([]);
  });
});

describe("nodeFlash: вспышка узла по приходу импульса", () => {
  it("до прихода — ничего; пик за несколько кадров после прихода; затем гаснет", () => {
    const at = (f: number) => nodeFlash(f, st, [100]);
    expect(at(99).level).toBe(0);
    expect(at(100).level).toBeGreaterThan(0);
    const peak = Math.max(...[100, 101, 102, 103, 104, 105].map((f) => at(f).level));
    expect(peak).toBeGreaterThan(0.95);
    expect(at(150).level).toBe(0);
  });
  it("несколько приходов — вспышка на каждом", () => {
    const at = (f: number) => nodeFlash(f, st, [60, 120]);
    expect(at(110).level).toBe(0);
    expect(at(124).level).toBeGreaterThan(0.9);
  });
});

describe("FlowNode.emphasis: акцент удержания узла (тот же accentPulse, что Emphasis)", () => {
  it("удар в начале бита, затем дыхание до конца сцены (loop по умолчанию), без бита — как раньше", () => {
    const at = (f: number) => nodeFlash(f, st, [], { start_frame: 140, end_frame: 156 });
    expect(at(139).level).toBe(0);
    expect(Math.max(...[140, 141, 142, 143, 144, 145].map((f) => at(f).level))).toBeGreaterThan(0.95);
    const hold = Array.from({ length: 80 }, (_, i) => at(180 + i).level);
    expect(Math.min(...hold)).toBeGreaterThan(0.35);
    expect(Math.max(...hold) - Math.min(...hold)).toBeGreaterThan(0.4);
    expect(nodeFlash(200, st, [])).toMatchObject({ level: 0, scale: 1 });
  });
  it("loop: false — гаснет после бита; вспышка и акцент — сильнейший в кадре", () => {
    expect(nodeFlash(200, st, [], { start_frame: 140, end_frame: 156, loop: false }).level).toBe(0);
    const both = nodeFlash(101, st, [100], { start_frame: 20, end_frame: 40 });
    expect(both.level).toBeGreaterThan(nodeFlash(101, st, [], { start_frame: 20, end_frame: 40 }).level);
  });
});

describe("входы узлов: разные по характеру", () => {
  const KINDS: CardEnter[] = ["rise", "scale", "flip", "pop", "slide", "swing", "blur", "fade"];

  it("в середине входа стили попарно различаются, к концу — все на месте", () => {
    const mid = KINDS.map((k) => JSON.stringify(cardEnterStyle(st, 14, 30, 10, k)));
    expect(new Set(mid).size).toBe(KINDS.length);
    for (const k of KINDS) {
      const end = cardEnterStyle(st, 100, 30, 10, k);
      expect(Number(end.opacity ?? 1), k).toBeCloseTo(1, 2);
    }
  });

  it("трансформации входов различаются по сути: ось, сторона, масштаб", () => {
    const tf = (k: CardEnter) => String(cardEnterStyle(st, 14, 30, 10, k).transform ?? "");
    expect(tf("rise")).toMatch(/translateY\(\d/);
    expect(tf("slide")).toMatch(/translateX\(-/);
    expect(tf("flip")).toMatch(/rotateX/);
    expect(tf("swing")).toMatch(/rotateY/);
    expect(tf("pop")).toMatch(/scale/);
    expect(String(cardEnterStyle(st, 14, 30, 10, "blur").filter)).toMatch(/blur/);
  });
});
