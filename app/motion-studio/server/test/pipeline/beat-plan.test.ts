// Шаг пайплайна после Director (S3a): кадры битов — из фаз и структуры (planBeats kit),
// Director кадров не пишет. Счётчики по приходам — в окне потока, старые spec — как были.
import { describe, expect, it } from "vitest";
import { type Beat, type DirectorSpec, type MotionSpec, MotionSpecSchema, type SceneStructure, defaultSettings } from "@ms/contracts";
import { planBeats } from "@ms/render";
import { alignArrivalCounters, planSpecBeats } from "../../src/pipeline/beat-plan.js";
import { specChecks } from "../../src/qa/spec-checks.js";
import { directorOutput } from "./helpers.js";

const settings = defaultSettings();

/** Схема запрос → ответ: узлы, граф с потоком, счётчик приходов, итог. */
function phasedSpec(structure?: SceneStructure): DirectorSpec {
  return {
    title: "Ответ из кэша",
    purpose: "кэш отвечает в 10 раз быстрее",
    duration_frames: 180,
    fps: { num: 30, den: 1 },
    style_preset: "dark-premium",
    composition: { archetype: "network-centric", idea: "x", focus: "y", transitions: "z", ...(structure ? { structure } : {}) },
    elements: [
      { id: "client", kind: "card", role: "node: клиент", entrance: "slide", content: { label: "Клиент" } },
      { id: "cache", kind: "card", role: "node: кэш", entrance: "pop", content: { label: "Кэш" } },
      { id: "graph", kind: "graph", role: "схема", entrance: "draw", content: { edges: [{ id: "e1", from: "client", to: "cache" }], flows: [{ edge: "e1", direction: "forward", beat: "b-flow" }] } },
      { id: "hits", kind: "number", role: "счётчик ответов", entrance: "count", content: { from: 0, to: 12, bound_to: "graph.arrivals.e1" } },
      { id: "verdict", kind: "text", role: "акцент: вывод", entrance: "mask", content: { text: "В 10 раз быстрее" } },
    ],
    phases: [
      { id: "p-setup", role: "setup", weight: 1, element_ids: ["client", "cache", "graph"] },
      { id: "p-flow", role: "action", weight: 3, element_ids: ["graph", "hits"] },
      { id: "p-pay", role: "payoff", weight: 1, element_ids: ["verdict"] },
      { id: "p-hold", role: "hold", weight: 1, element_ids: ["verdict", "graph"], hold_mode: "steady-flow" },
    ],
    beats: [
      { id: "b-client", phase: "p-setup", action: "client-in", description: "", element_ids: ["client"] },
      { id: "b-cache", phase: "p-setup", action: "cache-in", description: "", element_ids: ["cache"] },
      { id: "b-edges", phase: "p-setup", action: "edges-draw", description: "", element_ids: ["graph"] },
      { id: "b-flow", phase: "p-flow", action: "requests-flow", description: "", element_ids: ["graph"] },
      { id: "b-hits", phase: "p-flow", action: "hits-count", description: "", element_ids: ["hits"] },
      { id: "b-verdict", phase: "p-pay", action: "verdict-emphasis", description: "", element_ids: ["verdict"] },
      { id: "b-hold", phase: "p-hold", action: "hold", description: "потоки идут тише", element_ids: ["verdict", "graph"] },
    ],
  };
}
const beat = (s: MotionSpec, id: string) => s.beats.find((b) => b.id === id)!;
const ok = (r: ReturnType<typeof planSpecBeats>) => {
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe("planSpecBeats", () => {
  it("spec без фаз — биты Director как есть (build-strike по умолчанию)", () => {
    const legacy = directorOutput().spec;
    const r = ok(planSpecBeats(legacy, settings));
    expect(r.spec.beats).toEqual(legacy.beats);
    expect(r.plan).toBeUndefined();
    expect(r.changes).toEqual([]);
  });

  it("фазы → окна planBeats; биты фазы — по порядку внутри окна, валидная MotionSpec", () => {
    const d = phasedSpec("build-strike");
    const r = ok(planSpecBeats(d, settings));
    expect(MotionSpecSchema.safeParse(r.spec).success).toBe(true);
    const plan = planBeats({ structure: "build-strike", phases: r.phases!, duration: 180, fps: 30, intensity: settings.animation_intensity, density: 5, seed: "Ответ из кэша|кэш отвечает в 10 раз быстрее" });
    const win = (id: string) => plan.beats.find((b) => b.phase === id && b.kind === "main")!;
    // setup: три бита по порядку, старт первого — старт фазы
    const setup = ["b-client", "b-cache", "b-edges"].map((id) => beat(r.spec, id));
    expect(setup[0]!.start_frame).toBe(win("p-setup").start_frame);
    expect(setup[0]!.start_frame).toBeLessThan(setup[1]!.start_frame);
    expect(setup[1]!.start_frame).toBeLessThan(setup[2]!.start_frame);
    for (const b of setup) expect(b.end_frame).toBeLessThanOrEqual(win("p-setup").end_frame);
    // рисование — до конца окна фазы (span phase по действию draw)
    expect(beat(r.spec, "b-edges").end_frame).toBe(win("p-setup").end_frame);
    // удар и удержание: payoff в окне payoff, hold до последнего кадра
    expect([beat(r.spec, "b-verdict").start_frame, beat(r.spec, "b-verdict").end_frame]).toEqual([win("p-pay").start_frame, win("p-pay").end_frame]);
    expect(beat(r.spec, "b-hold").end_frame).toBe(180);
    expect(r.spec.beats.map((b) => b.start_frame)).toEqual([...r.spec.beats.map((b) => b.start_frame)].sort((a, b) => a - b));
  });

  it("текст вывода → время чтения: от входа текста до конца ≥ plan.reading", () => {
    const r = ok(planSpecBeats(phasedSpec(), settings));
    expect(r.phases!.find((p) => p.id === "p-pay")!.chars).toBe("В 10 раз быстрее".length);
    expect(180 - beat(r.spec, "b-verdict").start_frame).toBeGreaterThanOrEqual(r.plan!.reading);
  });

  it("payoff: текст вывода входит первым, остальные — каскадом по 6 кадров до конца фазы (s3a-review I2)", () => {
    const d = phasedSpec();
    // Director поставил текст последним: final-glow → bars-in → verdict-in
    d.beats = d.beats.flatMap((b) => (b.id === "b-verdict"
      ? [{ ...b, id: "b-glow", action: "final-glow", element_ids: ["cache"] }, { ...b, id: "b-bars", action: "bars-in", element_ids: ["client"] }, { ...b, action: "verdict-in" }]
      : [b]));
    d.phases = d.phases!.map((p) => (p.id === "p-pay" ? { ...p, element_ids: ["cache", "client", "verdict"] } : p));
    const r = ok(planSpecBeats(d, settings));
    const pay = r.plan!.beats.find((b) => b.phase === "p-pay" && b.kind === "main")!;
    expect(beat(r.spec, "b-verdict").start_frame).toBe(pay.start_frame);
    expect(beat(r.spec, "b-glow").start_frame - pay.start_frame).toBe(6);
    expect(beat(r.spec, "b-bars").start_frame - pay.start_frame).toBe(12);
    for (const id of ["b-verdict", "b-glow", "b-bars"]) expect(beat(r.spec, id).end_frame).toBe(pay.end_frame);
    expect(180 - beat(r.spec, "b-verdict").start_frame).toBeGreaterThanOrEqual(r.plan!.reading);
  });

  it("два акцента в payoff — передача: второстепенный по окну входа, главный (с текстом) после него; specChecks без accent_conflict (s3a-review I1)", () => {
    for (const structure of ["build-strike", "continuous-flow", "cold-open", "split-reveal", "count-up", "call-response"] as const) {
      const d = phasedSpec(structure);
      d.beats = d.beats.flatMap((b) => (b.id === "b-verdict"
        ? [{ ...b, id: "b-cacheglow", action: "cache-emphasis", element_ids: ["cache"] }, { ...b, id: "b-graph", action: "graph-accent", element_ids: ["graph"] }, { ...b, action: "verdict-in" }]
        : [b]));
      d.phases = d.phases!.map((p) => (p.id === "p-pay" ? { ...p, element_ids: ["cache", "graph", "verdict"] } : p));
      const r = ok(planSpecBeats(d, settings));
      const conflicts = specChecks(r.spec, settings).filter((x) => x.code === "accent_conflict" && x.severity === "blocking");
      expect(conflicts, structure).toEqual([]);
      const [a, b] = [beat(r.spec, "b-cacheglow"), beat(r.spec, "b-graph")].sort((x, y) => x.start_frame - y.start_frame) as [Beat, Beat];
      expect(a.end_frame, structure).toBeLessThanOrEqual(b.start_frame);
      expect(b.end_frame).toBe(r.plan!.beats.find((x) => x.phase === "p-pay" && x.kind === "main")!.end_frame);
      // текст вывода — с удара, читается ≥ чтения
      expect(beat(r.spec, "b-verdict").start_frame).toBe(r.plan!.strike);
    }
  });

  it("акцент с текстом вывода — главный: второстепенный акцент перед ним, чтение — от входа текста", () => {
    const d = phasedSpec();
    d.beats = d.beats.flatMap((b) => (b.id === "b-verdict" ? [b, { ...b, id: "b-glow", action: "final-emphasis", element_ids: ["cache"] }] : [b]));
    d.phases = d.phases!.map((p) => (p.id === "p-pay" ? { ...p, element_ids: ["cache", "verdict"] } : p));
    const r = ok(planSpecBeats(d, settings));
    const glow = beat(r.spec, "b-glow");
    const verdict = beat(r.spec, "b-verdict");
    expect(glow.start_frame).toBe(r.plan!.strike);
    expect(verdict.start_frame).toBe(glow.end_frame);
    expect(r.phases!.find((p) => p.id === "p-pay")!.delay).toBe(verdict.start_frame - glow.start_frame);
    expect(180 - verdict.start_frame).toBeGreaterThanOrEqual(r.plan!.reading);
    expect(specChecks(r.spec, settings).filter((x) => x.code === "accent_conflict" && x.severity === "blocking")).toEqual([]);
  });

  it("фаза с длящимся битом: входы — коротко (≤ 2 входов), длящийся стартует сразу за ними (smoke s3a-039646a, test1)", () => {
    const d = phasedSpec("count-up");
    // count-up test1: вход числа, рисование, счёт — в одной ведущей фазе
    d.beats = d.beats.map((b) => (b.id === "b-hits" ? { ...b, phase: "p-flow" } : b));
    d.beats = [{ id: "b-num", phase: "p-flow", action: "number-entrance", description: "", element_ids: ["hits"] }, ...d.beats];
    const r = ok(planSpecBeats(d, settings));
    const num = beat(r.spec, "b-num");
    const flow = beat(r.spec, "b-flow");
    expect(num.start_frame).toBe(0);
    expect(num.end_frame - num.start_frame).toBeLessThanOrEqual(24);
    expect(flow.start_frame).toBe(num.end_frame);
  });

  it("continuous-flow: поток идёт до конца, а рисование и счёт кончаются к выводу (smoke s3a-ae70d94, gen-timeline)", () => {
    const d = phasedSpec("continuous-flow");
    d.beats = [...d.beats, { id: "b-draw", phase: "p-flow", action: "chart-draw", description: "", element_ids: ["graph"] }];
    const r = ok(planSpecBeats(d, settings));
    expect(beat(r.spec, "b-flow").end_frame).toBe(180);
    expect(beat(r.spec, "b-draw").end_frame).toBe(r.plan!.takeaway);
    // счётчик приходов идёт за потоком — до конца (тали приходов, а не удар)
    expect(beat(r.spec, "b-hits").end_frame).toBe(180);
  });

  it("counter-entrance — вход, а не счёт: не тянется на всю фазу", () => {
    const d = phasedSpec();
    d.beats = d.beats.map((b) => (b.id === "b-client" ? { ...b, action: "counter-entrance" } : b));
    const r = ok(planSpecBeats(d, settings));
    expect(beat(r.spec, "b-client").end_frame).toBeLessThan(beat(r.spec, "b-edges").end_frame);
  });

  it("span: phase растягивает бит на всё окно фазы, slot — своя доля", () => {
    const d = phasedSpec();
    d.beats = d.beats.map((b) => (b.id === "b-client" ? { ...b, span: "phase" as const } : b));
    const r = ok(planSpecBeats(d, settings));
    expect(beat(r.spec, "b-client").end_frame).toBe(beat(r.spec, "b-edges").end_frame);
  });

  it("счётчик приходов идёт в окне своего потока", () => {
    const r = ok(planSpecBeats(phasedSpec(), settings));
    const flow = beat(r.spec, "b-flow");
    expect([beat(r.spec, "b-hits").start_frame, beat(r.spec, "b-hits").end_frame]).toEqual([flow.start_frame, flow.end_frame]);
  });

  it("cold-open: бит-постер итога с кадра 0 до объяснения", () => {
    const r = ok(planSpecBeats(phasedSpec("cold-open"), settings));
    const open = beat(r.spec, "p-pay-open");
    expect(open.start_frame).toBe(0);
    expect(open.element_ids).toEqual(["verdict"]);
    expect(open.action).toMatch(/cold-open/);
    expect(open.end_frame).toBeLessThanOrEqual(beat(r.spec, "b-client").start_frame);
  });

  it("фаза без битов получает свой бит; hold без слова hold — добавляется бит hold", () => {
    const d = phasedSpec();
    d.beats = d.beats.filter((b) => b.id !== "b-verdict").map((b) => (b.id === "b-hold" ? { ...b, action: "steady" } : b));
    const r = ok(planSpecBeats(d, settings));
    const pay = r.spec.beats.find((b) => b.phase === "p-pay")!;
    expect(pay.element_ids).toEqual(["verdict"]);
    expect(pay.action).toMatch(/emphasis/);
    const holds = r.spec.beats.filter((b) => /hold/.test(b.action));
    expect(holds).toHaveLength(1);
    expect(holds[0]!.end_frame).toBe(180);
  });

  it("структуры дают разные кадры удара; одна и та же spec — один и тот же план", () => {
    const at = (s?: SceneStructure) => beat(ok(planSpecBeats(phasedSpec(s), settings)).spec, "b-verdict").start_frame;
    expect(new Set([at(), at("count-up"), at("call-response"), at("split-reveal")]).size).toBeGreaterThan(1);
    expect(ok(planSpecBeats(phasedSpec("count-up"), settings)).spec).toEqual(ok(planSpecBeats(phasedSpec("count-up"), settings)).spec);
  });

  it("идемпотентно: план поверх спланированной spec (чекпоинт) — тот же результат", () => {
    const once = ok(planSpecBeats(phasedSpec("cold-open"), settings)).spec;
    const twice = ok(planSpecBeats(once, settings)).spec;
    expect(twice).toEqual(once);
  });
});

describe("alignArrivalCounters (spec без фаз)", () => {
  it("бит счёта только числа → окно потока ребра; общий бит не трогается", () => {
    const d = phasedSpec();
    const legacy: MotionSpec = MotionSpecSchema.parse({
      ...d,
      phases: undefined,
      beats: [
        { id: "b-in", start_frame: 0, end_frame: 30, action: "nodes-in", description: "", element_ids: ["client", "cache", "graph", "verdict"] },
        { id: "b-flow", start_frame: 40, end_frame: 120, action: "flow", description: "", element_ids: ["graph"] },
        { id: "b-hits", start_frame: 30, end_frame: 90, action: "hits-count", description: "", element_ids: ["hits"] },
        { id: "b-hold", start_frame: 120, end_frame: 180, action: "hold", description: "", element_ids: ["graph", "verdict"] },
      ],
    });
    const r = alignArrivalCounters(legacy);
    expect([beat(r.spec, "b-hits").start_frame, beat(r.spec, "b-hits").end_frame]).toEqual([40, 120]);
    expect(r.changes).toEqual([expect.stringContaining("hits")]);
    const shared = { ...legacy, beats: legacy.beats.map((b) => (b.id === "b-hits" ? { ...b, element_ids: ["hits", "verdict"] } : b)) };
    expect(alignArrivalCounters(shared).spec).toEqual(shared);
  });
});

describe("planSpecBeats: S3a-fix", () => {
  it("имена действий — целыми словами: upstream-in и account-card-in — входы (не тянутся на фазу); kind: sustain — тянется", () => {
    const d = phasedSpec();
    d.beats = d.beats.map((b) => (b.id === "b-client" ? { ...b, action: "upstream-in" } : b.id === "b-cache" ? { ...b, action: "account-card-in" } : b));
    const r = ok(planSpecBeats(d, settings));
    const end = beat(r.spec, "b-edges").end_frame;
    expect(beat(r.spec, "b-client").end_frame).toBeLessThan(end);
    expect(beat(r.spec, "b-cache").end_frame).toBeLessThan(end);
    const k = phasedSpec();
    k.beats = k.beats.map((b) => (b.id === "b-client" ? { ...b, action: "client-shows", kind: "sustain" as const } : b));
    expect(beat(ok(planSpecBeats(k, settings)).spec, "b-client").end_frame).toBe(end);
  });

  it("фаза hold без hold_mode, две payoff у call-response, split-reveal без setup — замечание Director (раунд исправления)", () => {
    const noMode = phasedSpec();
    noMode.phases = noMode.phases!.map((p) => (p.role === "hold" ? { id: p.id, role: p.role, weight: p.weight, element_ids: p.element_ids } : p));
    const a = planSpecBeats(noMode, settings);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).toMatch(/hold_mode/);
    const two = phasedSpec("call-response");
    two.phases = [...two.phases!, { id: "p-pay2", role: "payoff", weight: 1, element_ids: ["verdict"] }];
    const b = planSpecBeats(two, settings);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.message).toMatch(/call-response/);
    const sides = phasedSpec("split-reveal");
    sides.phases = sides.phases!.map((p) => (p.role === "setup" ? { ...p, role: "action" as const } : p));
    const c = planSpecBeats(sides, settings);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.message).toMatch(/split-reveal/);
  });

  it("веер вызовов: потоки одной фазы стартуют через 4 кадра (при 30 fps)", () => {
    const d = phasedSpec();
    d.beats = d.beats.flatMap((b) => (b.id === "b-flow" ? [b, { ...b, id: "b-flow2", action: "calls-flow" }, { ...b, id: "b-flow3", action: "requests-flow" }] : [b]));
    const r = ok(planSpecBeats(d, settings));
    const [f1, f2, f3] = ["b-flow", "b-flow2", "b-flow3"].map((id) => beat(r.spec, id).start_frame);
    expect(f2! - f1!).toBe(4);
    expect(f3! - f2!).toBe(4);
  });

  it("счётчик: «от» видно ≥ 15 кадров после входа числа", () => {
    const d = phasedSpec();
    // число без bound_to: его счёт ставит только планировщик
    d.elements = d.elements.map((e) => (e.id === "hits" ? { ...e, content: { from: 0, to: 12 } } : e));
    d.beats = [...d.beats.filter((b) => b.id !== "b-hits"), { id: "b-num", phase: "p-flow", action: "hits-in", description: "", element_ids: ["hits"] }, { id: "b-hits", phase: "p-flow", action: "hits-count", description: "", element_ids: ["hits"] }];
    const r = ok(planSpecBeats(d, settings));
    expect(beat(r.spec, "b-hits").start_frame - beat(r.spec, "b-num").start_frame).toBeGreaterThanOrEqual(15);
  });

  it("бит ведёт элемент вне element_ids своей фазы — предупреждение", () => {
    const d = phasedSpec();
    d.beats = d.beats.map((b) => (b.id === "b-client" ? { ...b, element_ids: ["client", "verdict"] } : b));
    const r = ok(planSpecBeats(d, settings));
    expect(r.warnings).toContainEqual(expect.stringMatching(/p-setup.*verdict/));
  });

  describe("свойства на синтетических spec", () => {
    // фазы × структуры × число акцентов/текстов в payoff × длительность и интенсивность
    const cases: { d: DirectorSpec; label: string }[] = [];
    const STRUCTS: SceneStructure[] = ["build-strike", "cold-open", "continuous-flow", "split-reveal", "call-response", "count-up"];
    const payoffs: { action: string; el: string }[][] = [
      [{ action: "verdict-emphasis", el: "verdict" }],
      [{ action: "cache-emphasis", el: "cache" }, { action: "graph-accent", el: "graph" }, { action: "verdict-in", el: "verdict" }],
      [{ action: "final-emphasis", el: "cache" }, { action: "verdict-emphasis", el: "verdict" }],
      [{ action: "glow", el: "client" }, { action: "bars-in", el: "graph" }, { action: "note-in", el: "hits" }, { action: "verdict-in", el: "verdict" }],
      [{ action: "a-accent", el: "client" }, { action: "b-accent", el: "cache" }, { action: "c-accent", el: "graph" }, { action: "verdict-emphasis", el: "verdict" }],
    ];
    for (const structure of STRUCTS) {
      for (const [pi, pay] of payoffs.entries()) {
        for (const [duration, fps] of [[180, 30], [150, 30], [360, 60], [240, 30]] as const) {
          for (const w of [[1, 3, 1, 1], [2, 2, 1, 3], [1, 5, 2, 1]]) {
            const d = phasedSpec(structure);
            d.duration_frames = duration;
            d.fps = { num: fps, den: 1 };
            d.phases = d.phases!.map((p, i) => ({ ...p, weight: w[i]!, ...(p.role === "payoff" ? { element_ids: [...new Set(pay.map((x) => x.el))] } : {}) }));
            d.beats = [...d.beats.filter((b) => b.phase !== "p-pay"), ...pay.map((x, k) => ({ id: `b-pay${k}`, phase: "p-pay", action: x.action, description: "", element_ids: [x.el] }))];
            cases.push({ d, label: `${structure} p${pi} ${duration}/${fps} ${w.join("/")}` });
          }
        }
      }
    }

    it(`${cases.length} spec: каждый бит в окне своей фазы, текст вывода читается ≥ plan.reading, планировщик не создаёт blocking accent_conflict`, () => {
      for (const { d, label } of cases) {
        for (const intensity of ["calm", "balanced", "energetic"] as const) {
          const s = { ...settings, animation_intensity: intensity, duration_frames: d.duration_frames, fps: d.fps };
          const r = ok(planSpecBeats(d, s));
          const D = d.duration_frames;
          for (const b of r.spec.beats.filter((x) => x.phase !== undefined)) {
            const w = r.plan!.beats.find((x) => x.phase === b.phase && x.kind === "main")!;
            expect(b.start_frame, `${label} ${b.id}`).toBeGreaterThanOrEqual(w.start_frame);
            expect(b.end_frame, `${label} ${b.id}`).toBeLessThanOrEqual(w.end_frame);
          }
          for (const b of r.spec.beats.filter((x) => x.phase === "p-pay" && x.element_ids.includes("verdict"))) {
            expect(D - b.start_frame, `${label} ${intensity} ${b.id}`).toBeGreaterThanOrEqual(r.plan!.reading);
          }
          const blocking = specChecks(r.spec, s).filter((x) => x.code === "accent_conflict" && x.severity === "blocking");
          expect(blocking.map((x) => x.description), `${label} ${intensity}`).toEqual([]);
        }
      }
    });
  });
});
