// Hold engine в примитивах: потоки после итога стоят (кроме steady-flow), повтор и блик
// финала у графа, гонка в удержании, наезд settle-push камеры, дыхание акцента.
import { describe, expect, it } from "vitest";
import { cameraAt, cameraHoldAt, settlePushHeadroom } from "../../src/motion-kit/choreo/camera.js";
import { HOLD_RATE, type Hold, holdAt, holdTicks, holdTiming, repeatTick } from "../../src/motion-kit/choreo/hold.js";
import { pathStarts } from "../../src/motion-kit/choreo/pulse.js";
import { emphasisHold, haloLevel, holdAccent } from "../../src/motion-kit/components/Emphasis.js";
import { type FlowEdge, type FlowNode, flowHoldPlan, flowTiming, shimmerPaths } from "../../src/motion-kit/components/FlowGraph.js";
import { latencyTiming } from "../../src/motion-kit/components/LatencyRace.js";
import { accentPulse } from "../../src/motion-kit/choreo/accent.js";
import { edgeSegment } from "../../src/motion-kit/geometry.js";
import { holdMarks, markHold, resetHoldMarks } from "../../src/motion-kit/layout-probe.js";
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
  it("steady-flow: поток, чей бит начинается в удержании, идёт (held-queue frozen@179)", () => {
    // Engineer дал потокам бит hold и перечислил их рёбра в hold.edges — раньше база до
    // удержания пуста, и поток не шёл вовсе: схема стояла
    for (const listed of [true, false]) {
      const inHold = { beat: { start_frame: 134, end_frame: 180 }, travel: 16 };
      const ctx = { hold: H("steady-flow", 134), end: 180, ...(listed ? { edges: ["e"], edgeId: "e" } : {}) };
      const { starts, pass } = pathStarts(seg, inHold, s, 30, 0, ctx);
      expect(starts.length, `listed ${listed}`).toBeGreaterThanOrEqual(1);
      expect(starts.every((t) => t >= 134)).toBe(true);
      expect(starts.some((t) => t <= 179 && 179 < t + pass), `listed ${listed}: импульс в пути в N−1`).toBe(true);
      expect(starts.some((t) => t <= 160 && 160 < t + pass) || starts.some((t) => t > 160), `listed ${listed}: N−20 и N−1 различаются`).toBe(true);
    }
    // ready позже начала бита (ребро ещё рисуется) — не раньше ready
    const late = pathStarts(seg, { beat: { start_frame: 134, end_frame: 180 } }, s, 30, 150, { hold: H("steady-flow", 134), end: 180 });
    expect(late.starts.every((t) => t >= 150)).toBe(true);
    // прочие режимы: поток с бита удержания не стартует (итог готов)
    expect(pathStarts(seg, { beat: { start_frame: 134, end_frame: 180 } }, s, 30, 0, { hold: H("now-pulse", 134), end: 180 }).starts).toEqual([]);
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
  it("repeat-result (S3-fix I1): подпись тика — по тем же тикам, что импульс и вспышка; импульс не стартует до удержания", () => {
    for (let hs = 100; hs <= 176; hs++) {
      const h = { ...H("repeat-result", hs), node: "b", label: "2 мс" };
      const p = flowHoldPlan(nodes, edges, t.edges, h, s, 30, 180)!;
      const r = p.repeat;
      if (!r) continue;
      expect(r.starts.every((x) => x >= hs), `удержание с ${hs}`).toBe(true);
      expect(r.ticks.length).toBe(r.starts.length);
      for (let f = hs; f < 180; f++) {
        const tk = repeatTick(r.ticks, f);
        const want = [...r.ticks].reverse().find((x) => x <= f);
        expect(tk?.at ?? null, `удержание с ${hs}, кадр ${f}`).toBe(want ?? null);
      }
    }
    // удержание с кадра «тик − 10»: тик удержания без задержки прохода (lead 0) лёг бы в
    // удержание раньше, чем импульс успел дойти, — у подписи он был, у импульса нет
    const early = holdTicks(H("repeat-result", 100), s, 180)[0]!;
    const hs = early - 10;
    const p1 = flowHoldPlan(nodes, edges, t.edges, { ...H("repeat-result", hs), node: "b" }, s, 30, 180)!;
    expect(holdTicks(H("repeat-result", hs), s, 180)).toContain(early);
    expect(p1.repeat!.ticks).not.toContain(early);
    for (let f = hs; f < p1.repeat!.ticks[0]!; f++) expect(repeatTick(p1.repeat!.ticks, f), `кадр ${f}`).toBeNull();
    expect(p1.repeat!.starts.every((x) => x >= hs)).toBe(true);
  });
  it("герой дышит только там, где он — носитель финала (S3-fix I2): не в steady-flow и data-shimmer", () => {
    const breathe = (mode: Hold["mode"]) => flowHoldPlan(nodes, edges, t.edges, { ...H(mode), node: "b" }, s, 30, 180)!.breathe;
    expect(breathe("steady-flow")).toBe(false);
    expect(breathe("data-shimmer")).toBe(false);
    expect(breathe("now-pulse")).toBe(true);
    expect(breathe("repeat-result")).toBe(true);
    expect(breathe("settle-push")).toBe(true);
  });
  it("data-shimmer: блик по рёбрам, ведущим к герою", () => {
    const p = flowHoldPlan(nodes, edges, t.edges, { ...H("data-shimmer"), node: "b" }, s, 30, 180)!;
    // цикл a→b→c→a, герой b: одна цепочка c→a→b — блик одним проходом через два ребра
    expect(shimmerPaths(edges, t.edges, "b")).toEqual([["ca", "ab"]]);
    // окна рёбер в доле прохода: подряд, от 0 до 1 — блик по ca, затем по ab
    expect(p.shimmer.length).toBe(2);
    expect(p.shimmer[0]!.from).toBe(0);
    expect(p.shimmer[0]!.to).toBeCloseTo(p.shimmer[1]!.from, 9);
    expect(p.shimmer[1]!.to).toBeCloseTo(1, 9);
    // цепочка и ветвь: x→y→h, z→h — два пути, оба кончаются в герое
    const g = [{ id: "xy", from: "x", to: "y" }, { id: "yh", from: "y", to: "h" }, { id: "zh", from: "z", to: "h" }];
    const geo = new Map(g.map((e) => [e.id, edgeSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, "h")]));
    expect(shimmerPaths(g, geo, "h")).toEqual([["xy", "yh"], ["zh"]]);
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

describe("settlePushHeadroom (S3-fix m7)", () => {
  const size = { width: 1920, height: 1080 };
  it("есть запас — ~4 %; без zoom или у предела max_scale — ~0", () => {
    expect(settlePushHeadroom([{ frame: 0, scale: 1, x: 0, y: 0 }], s, size, H("settle-push"), 180)).toBeGreaterThan(0.03);
    const light = resolveStyle({ preset: "light-clean", intensity: "balanced" });
    expect(settlePushHeadroom([], light, size, H("settle-push"), 180)).toBeLessThan(0.01);
    expect(settlePushHeadroom([{ frame: 0, scale: s.camera.max_scale, x: 0, y: 0 }], s, size, H("settle-push"), 180)).toBeLessThan(0.01);
    expect(settlePushHeadroom([], s, size, H("now-pulse"), 180)).toBe(0);
  });
});

describe("holdAccent: вход в удержание без скачка ореола (S3-fix C1)", () => {
  // payoff стартует за 10/30/60/90 кадров до удержания; кадр за кадром через вход и всё
  // удержание ореол меняется плавно — не гаснет на кадр и не вспыхивает. До правки скачок
  // на входе — 0.6…1.0 за кадр. Вход (±2 кадра) — < 0.08; всё удержание — < 0.08 у спокойных
  // режимов при calm/balanced, < 0.13 у прочих (свой спад удара energetic и задуманная
  // вспышка в такт тику/блику — это наклон волны, не ступенька)
  const HS = 128;
  for (const intensity of ["calm", "balanced", "energetic"] as const) {
    const st = resolveStyle({ preset: "dark-premium", intensity });
    for (const lead of [10, 30, 60, 90]) {
      for (const mode of ["now-pulse", "settle-push", "repeat-result", "data-shimmer", "steady-flow"] as const) {
        it(`${intensity}, payoff за ${lead} кадров, ${mode}`, () => {
          const beat = { start_frame: HS - lead, end_frame: HS };
          const h = H(mode, HS);
          const flare = mode === "now-pulse" || mode === "settle-push" ? 0 : 1;
          const at = (f: number) => {
            const hf = holdAt(f, h, st, 180);
            const p = accentPulse(f, st, { beat });
            return haloLevel(emphasisHold(p, hf, mode, st));
          };
          const bar = flare === 0 && intensity !== "energetic" ? 0.08 : 0.13;
          for (let f = HS - 6; f < 179; f++) {
            const d = Math.abs(at(f + 1) - at(f));
            expect(d, `кадр ${f}→${f + 1}`).toBeLessThan(f >= HS - 2 && f <= HS + 2 ? 0.08 : bar);
          }
        });
      }
    }
  }
});

describe("метки hold engine для пробы QA (S3-fix I3)", () => {
  it("сброс → метки режимов → список без повторов; сброс очищает", () => {
    resetHoldMarks();
    expect(holdMarks()).toEqual([]);
    markHold("steady-flow");
    markHold("now-pulse");
    markHold("steady-flow");
    expect(holdMarks()).toEqual(["now-pulse", "steady-flow"]);
    resetHoldMarks();
    expect(holdMarks()).toEqual([]);
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
