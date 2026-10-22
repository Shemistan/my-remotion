// Hold engine в примитивах: потоки после итога стоят (кроме steady-flow), повтор и блик
// финала у графа, гонка в удержании, наезд settle-push камеры, дыхание акцента.
import { describe, expect, it } from "vitest";
import { cameraAt, cameraHoldAt } from "../../src/motion-kit/choreo/camera.js";
import { HOLD_RATE, type Hold, holdTiming } from "../../src/motion-kit/choreo/hold.js";
import { pathStarts } from "../../src/motion-kit/choreo/pulse.js";
import { holdAccent } from "../../src/motion-kit/components/Emphasis.js";
import { type FlowEdge, type FlowNode, flowHoldPlan, flowTiming } from "../../src/motion-kit/components/FlowGraph.js";
import { latencyTiming } from "../../src/motion-kit/components/LatencyRace.js";
import { accentPulse } from "../../src/motion-kit/choreo/accent.js";
import { edgeSegment } from "../../src/motion-kit/geometry.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const s = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
const seg = [edgeSegment({ x: 0, y: 0 }, { x: 500, y: 0 }, "h")];
const H = (mode: Hold["mode"], start = 120): Hold => ({ mode, beat: { start_frame: start, end_frame: 180 } });

describe("pathStarts: поток в удержании", () => {
  const flow = { beat: { start_frame: 20, end_frame: 180 } };
  it("без hold — проходы до конца бита (как раньше)", () => {
    expect(pathStarts(seg, flow, s, 30).starts.at(-1)!).toBeGreaterThan(150);
  });
  it.each(["now-pulse", "data-shimmer", "repeat-result", "settle-push"] as const)("%s: после начала удержания новых проходов нет", (mode) => {
    const { starts } = pathStarts(seg, flow, s, 30, 0, { hold: H(mode), end: 180 });
    expect(starts.every((t) => t < 120)).toBe(true);
  });
  it("steady-flow: поток идёт дальше тише — шаг pass / 0.6, импульс в пути в N−1", () => {
    const { starts, pass } = pathStarts(seg, flow, s, 30, 0, { hold: H("steady-flow"), end: 180 });
    const calm = starts.filter((t) => t >= 120);
    expect(calm.length).toBeGreaterThanOrEqual(1);
    const seq = [...starts.filter((t) => t < 120).slice(-1), ...calm];
    for (let i = 1; i < seq.length; i++) expect(seq[i]! - seq[i - 1]!).toBeGreaterThanOrEqual((pass / HOLD_RATE) * 0.65 - 1e-9);
    expect(starts.some((t) => t <= 179 && 179 < t + pass)).toBe(true);
  });
  it("steady-flow не перезапускает давно кончившийся поток (запрос в начале сцены)", () => {
    const early = { beat: { start_frame: 10, end_frame: 50 } };
    const { starts } = pathStarts(seg, early, s, 30, 0, { hold: H("steady-flow"), end: 180 });
    expect(starts.every((t) => t < 50)).toBe(true);
    // явный список рёбер — продолжает
    const listed = pathStarts(seg, early, s, 30, 0, { hold: H("steady-flow"), end: 180, edges: ["e"], edgeId: "e" });
    expect(listed.starts.some((t) => t >= 120)).toBe(true);
  });
  it("steady-flow: repeat:false — один проход, не продолжается", () => {
    const { starts } = pathStarts(seg, { ...flow, repeat: false }, s, 30, 0, { hold: H("steady-flow"), end: 180 });
    expect(starts).toEqual([20]);
  });
});

describe("FlowGraph: финал", () => {
  const nodes: FlowNode[] = [
    { id: "a", label: "Клиент", x: 0, y: 100, w: 200, h: 90 },
    { id: "b", label: "Кэш", x: 400, y: 100, w: 200, h: 90 },
    { id: "c", label: "БД", x: 800, y: 300, w: 200, h: 90 },
  ];
  const edges: FlowEdge[] = [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" }, { id: "ca", from: "c", to: "a" }];
  const t = flowTiming(nodes, edges, { start_frame: 0, end_frame: 60 }, s, 30);
  it("герой по умолчанию — самый правый узел; hold.node — свой", () => {
    expect(flowHoldPlan(nodes, edges, t.edges, H("now-pulse"), s, 30, 180)!.hero.id).toBe("c");
    expect(flowHoldPlan(nodes, edges, t.edges, { ...H("now-pulse"), node: "b" }, s, 30, 180)!.hero.id).toBe("b");
  });
  it("repeat-result: импульс по ребру в героя приходит ровно в кадр тика, тики — в удержании", () => {
    const p = flowHoldPlan(nodes, edges, t.edges, { ...H("repeat-result", 100), node: "b" }, s, 30, 180)!;
    expect(p.repeat).not.toBeNull();
    expect(p.repeat!.starts.every((x) => x >= 100)).toBe(true);
    expect(p.repeat!.ticks.length).toBeGreaterThanOrEqual(2);
    const T = holdTiming(s);
    for (let i = 1; i < p.repeat!.ticks.length; i++) expect(p.repeat!.ticks[i]! - p.repeat!.ticks[i - 1]!).toBe(T.tick);
  });
  it("data-shimmer: блик по рёбрам, ведущим к герою", () => {
    const p = flowHoldPlan(nodes, edges, t.edges, { ...H("data-shimmer"), node: "b" }, s, 30, 180)!;
    // в b ведёт ab; в a ведёт ca, в c — bc: все три лежат на путях к b
    expect(p.shimmer.length).toBe(3);
  });
  it("flowTiming с hold: приходы потока режутся на удержании", () => {
    const th = flowTiming(nodes, edges, { start_frame: 0, end_frame: 60 }, s, 30, { hold: H("now-pulse", 100), end: 180 });
    const at = th.arrivals({ edgeId: "ab", beat: { start_frame: 40, end_frame: 180 } });
    expect(at.length).toBeGreaterThan(0);
    expect(Math.max(...at)).toBeLessThan(100 + 40);
  });
});

describe("LatencyRace: гонка в удержании", () => {
  const lanes = [{ ms: 180 }, { ms: 15 }];
  const beat = { start_frame: 20, end_frame: 180 };
  it("now-pulse: новых проходов нет ни у одной дорожки", () => {
    const tm = latencyTiming(lanes, beat, s, { hold: H("now-pulse"), end: 180 });
    for (const l of tm) expect(l.starts.every((x) => x < 120)).toBe(true);
  });
  it("repeat-result: быстрая отвечает дальше (приход в кадр тика), медленная стоит", () => {
    const tm = latencyTiming(lanes, beat, s, { hold: H("repeat-result"), end: 180 });
    expect(tm[0]!.starts.every((x) => x < 120)).toBe(true);
    expect(tm[1]!.arrivals.filter((a) => a >= 120).length).toBeGreaterThanOrEqual(1);
    expect(tm[1]!.arrivals.some((a) => a > 160)).toBe(true);
  });
  it("steady-flow: дорожки идут дальше реже (шаг ≈ (проход + пауза) / 0.6)", () => {
    const tm = latencyTiming(lanes, beat, s, { hold: H("steady-flow"), end: 180 });
    expect(tm[1]!.starts.some((x) => x >= 120)).toBe(true);
    for (const l of tm) {
      const calm = l.starts.filter((x) => x >= 120);
      const prev = l.starts.filter((x) => x < 120).at(-1)!;
      if (calm.length > 0) expect(calm[0]! - prev).toBeGreaterThanOrEqual(((l.trip + l.rest) / HOLD_RATE) * 0.65 - 1e-9);
    }
  });
});

describe("Camera: settle-push", () => {
  const size = { width: 1920, height: 1080 };
  const keys = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 60, scale: 1.02, x: 0, y: 0 }];
  it("в удержании камера наезжает дальше до последнего кадра, не дальше предела стиля", () => {
    const at = (f: number) => cameraHoldAt(f, keys, s, size, H("settle-push"), 180).scale;
    expect(at(110)).toBeCloseTo(cameraAt(110, keys, s, size).scale, 6);
    expect(at(179) - at(160)).toBeGreaterThan(0.004);
    expect(at(179)).toBeLessThanOrEqual(s.camera.max_scale + 1e-9);
  });
  it("другие режимы камеру не трогают; без zoom (light-clean) — стоит", () => {
    expect(cameraHoldAt(170, keys, s, size, H("now-pulse"), 180)).toEqual(cameraAt(170, keys, s, size));
    const light = resolveStyle({ preset: "light-clean", intensity: "balanced" });
    expect(cameraHoldAt(170, keys, light, size, H("settle-push"), 180).scale).toBe(1);
  });
});

describe("holdAccent: дыхание финала", () => {
  it("уровень держится и дышит, удар бита не гасится", () => {
    const p = accentPulse(200, s, { beat: { start_frame: 100, end_frame: 180 } });
    const lo = holdAccent(p, 1, -1);
    const hi = holdAccent(p, 1, 1);
    expect(hi.level - lo.level).toBeGreaterThan(0.3);
    const strike = accentPulse(102, s, { beat: { start_frame: 100, end_frame: 180 } });
    expect(holdAccent(strike, 0.1, 0).level).toBeGreaterThanOrEqual(strike.strike);
  });
});
