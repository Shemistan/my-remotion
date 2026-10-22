// Планировщик ритма (S3a): веса фаз → кадры битов по структуре сцены. Чистая функция:
// у каждой структуры своя форма времени, вывод держится ≥ времени чтения, сдвиг от seed.
import { describe, expect, it } from "vitest";
import { type BeatPlan, type PlanInput, type PlanPhase, STRUCTURES, planBeats, readingFrames } from "../../src/motion-kit/choreo/plan.js";

const phases: PlanPhase[] = [
  { id: "setup", role: "setup", weight: 1, elements: 2 },
  { id: "act", role: "action", weight: 3, elements: 3 },
  { id: "pay", role: "payoff", weight: 1, chars: 12 },
  { id: "hold", role: "hold", weight: 1, chars: 12 },
];
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  structure: "build-strike", phases, duration: 180, fps: 30, intensity: "balanced", density: 6, seed: "scene-a", ...over,
});
const main = (p: BeatPlan, id: string) => p.beats.find((b) => b.phase === id && b.kind === "main")!;
const span = (p: BeatPlan, id: string) => [main(p, id).start_frame, main(p, id).end_frame];

describe("время чтения", () => {
  it("≥ 2 с, растёт с длиной текста, не больше 4 с", () => {
    expect(readingFrames(0, 30)).toBe(60);
    expect(readingFrames(12, 30)).toBe(60);
    expect(readingFrames(40, 30)).toBeGreaterThan(60);
    expect(readingFrames(500, 30)).toBe(120);
    expect(readingFrames(0, 60)).toBe(120);
  });
});

describe("формы времени по структурам", () => {
  it("build-strike: фазы друг за другом, удар после действия, удержание до конца", () => {
    const p = planBeats(input());
    expect(p.beats.map((b) => b.phase)).toEqual(["setup", "act", "pay", "hold"]);
    expect(main(p, "setup").start_frame).toBe(0);
    expect(main(p, "act").start_frame).toBe(main(p, "setup").end_frame);
    expect(main(p, "pay").start_frame).toBe(main(p, "act").end_frame);
    expect(main(p, "hold").start_frame).toBe(main(p, "pay").end_frame);
    expect(main(p, "hold").end_frame).toBe(180);
    expect(p.takeaway).toBe(main(p, "pay").start_frame);
    // действие с весом 3 — главная фаза до удара
    const len = (id: string) => main(p, id).end_frame - main(p, id).start_frame;
    expect(len("act")).toBeGreaterThan(2 * len("setup"));
  });

  it("cold-open: итог-постер с кадра 0, затем объяснение, затем возврат к итогу", () => {
    const p = planBeats(input({ structure: "cold-open" }));
    const open = p.beats.find((b) => b.kind === "open")!;
    expect(open).toMatchObject({ phase: "pay", start_frame: 0 });
    expect(open.end_frame).toBeGreaterThanOrEqual(24);
    expect(open.end_frame).toBeLessThanOrEqual(45);
    expect(main(p, "setup").start_frame).toBe(open.end_frame);
    expect(main(p, "pay").start_frame).toBeGreaterThan(main(p, "act").start_frame);
    expect(main(p, "hold").end_frame).toBe(180);
  });

  it("continuous-flow: удара нет — действие идёт до конца сцены, вывод едет поверх", () => {
    const p = planBeats(input({ structure: "continuous-flow" }));
    expect(main(p, "act").end_frame).toBe(180);
    expect(main(p, "pay").start_frame).toBeLessThan(main(p, "act").end_frame);
    // вывод входит раньше, чем удар build-strike тех же фаз (без сдвига от seed)
    const bs = planBeats(input());
    expect(p.takeaway - p.offset).toBeLessThan(bs.takeaway - bs.offset);
  });

  it("split-reveal: обе стороны с кадра 0 параллельно, вердикт растёт долго", () => {
    const two: PlanPhase[] = [
      { id: "left", role: "setup", weight: 1, elements: 2 },
      { id: "right", role: "setup", weight: 1, elements: 2 },
      { id: "race", role: "action", weight: 2 },
      { id: "verdict", role: "payoff", weight: 1, chars: 10 },
      { id: "hold", role: "hold", weight: 1 },
    ];
    const p = planBeats(input({ structure: "split-reveal", phases: two }));
    expect(span(p, "left")).toEqual(span(p, "right"));
    expect(main(p, "left").start_frame).toBe(0);
    expect(main(p, "race").start_frame).toBe(main(p, "left").end_frame);
    const verdict = main(p, "verdict").end_frame - main(p, "verdict").start_frame;
    expect(verdict).toBeGreaterThanOrEqual(Math.round(0.25 * 180));
  });

  it("call-response: запрос, пауза без новых событий, ответ — короткое событие, долгое удержание", () => {
    const p = planBeats(input({ structure: "call-response" }));
    expect(p.pause).toBeDefined();
    expect(p.pause!.start_frame).toBe(main(p, "act").end_frame);
    expect(p.pause!.end_frame).toBe(main(p, "pay").start_frame);
    expect(p.pause!.end_frame - p.pause!.start_frame).toBeGreaterThanOrEqual(9);
    const pay = main(p, "pay").end_frame - main(p, "pay").start_frame;
    expect(pay).toBeLessThanOrEqual(24);
    // удержание ≥ 25 % сцены (минус сдвиг от seed)
    expect(main(p, "hold").end_frame - main(p, "hold").start_frame).toBeGreaterThanOrEqual(45 - Math.abs(p.offset));
  });

  it("call-response с фазой turn: пауза — это turn, перед ответом", () => {
    const withTurn: PlanPhase[] = [...phases.slice(0, 2), { id: "wait", role: "turn", weight: 1 }, ...phases.slice(2)];
    const p = planBeats(input({ structure: "call-response", phases: withTurn }));
    expect(p.pause).toEqual({ start_frame: main(p, "wait").start_frame, end_frame: main(p, "wait").end_frame });
    expect(main(p, "wait").end_frame).toBe(main(p, "pay").start_frame);
  });

  it("count-up: число ведёт — счёт с кадра 0 до удара, контекст входит поверх", () => {
    const p = planBeats(input({ structure: "count-up" }));
    expect(main(p, "act").start_frame).toBe(0);
    expect(main(p, "act").end_frame).toBe(main(p, "pay").start_frame);
    expect(main(p, "setup").start_frame).toBeGreaterThan(0);
    expect(main(p, "setup").start_frame).toBeLessThan(main(p, "act").end_frame);
  });

  it("структуры дают разные формы на одних и тех же фазах", () => {
    const shapes = STRUCTURES.map((structure) => JSON.stringify(planBeats(input({ structure })).beats.map((b) => [b.phase, b.kind, b.start_frame, b.end_frame])));
    expect(new Set(shapes).size).toBe(STRUCTURES.length);
  });
});

describe("время чтения и длина удержания", () => {
  it("длинный вывод — удержание длиннее", () => {
    const long = phases.map((p) => (p.role === "payoff" ? { ...p, chars: 70 } : p));
    const a = planBeats(input());
    const b = planBeats(input({ phases: long }));
    expect(180 - b.takeaway).toBeGreaterThan(180 - a.takeaway);
    expect(180 - b.takeaway).toBeGreaterThanOrEqual(b.reading);
  });

  it("нет фазы hold — payoff живёт до конца; нет payoff — вывод в начале hold", () => {
    const noHold = planBeats(input({ phases: phases.filter((p) => p.role !== "hold") }));
    expect(main(noHold, "pay").end_frame).toBe(180);
    const noPay = planBeats(input({ phases: phases.filter((p) => p.role !== "payoff") }));
    expect(noPay.takeaway).toBe(main(noPay, "hold").start_frame);
    expect(180 - noPay.takeaway).toBeGreaterThanOrEqual(noPay.reading);
  });
});

describe("сдвиг от содержания", () => {
  it("±6–10 кадров от seed: разные сцены одной структуры не бьют в один кадр", () => {
    const base = planBeats(input({ seed: "x" }));
    const offsets = new Set<number>();
    const landings = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const p = planBeats(input({ seed: `scene-${i}` }));
      expect(Math.abs(p.offset)).toBeGreaterThanOrEqual(6);
      expect(Math.abs(p.offset)).toBeLessThanOrEqual(10);
      offsets.add(p.offset);
      landings.add(p.takeaway);
    }
    expect(offsets.size).toBeGreaterThanOrEqual(6);
    expect(landings.size).toBeGreaterThanOrEqual(6);
    // без сдвига удар стоял бы на одном кадре: сдвиг двигает именно его
    expect(Math.abs(base.takeaway - planBeats(input({ seed: "x" })).takeaway)).toBe(0);
  });

  it("на 60 fps сдвиг вдвое больше кадров", () => {
    const a = planBeats(input({ seed: "k" }));
    const b = planBeats(input({ seed: "k", fps: 60, duration: 360 }));
    expect(b.offset).toBe(2 * a.offset);
  });
});

describe("свойства", () => {
  const cases: PlanInput[] = [];
  const sets: PlanPhase[][] = [
    phases,
    [{ id: "a", role: "action", weight: 1 }, { id: "p", role: "payoff", weight: 1, chars: 30 }, { id: "h", role: "hold", weight: 1 }],
    [{ id: "s1", role: "setup", weight: 2, elements: 5 }, { id: "s2", role: "setup", weight: 1 }, { id: "a1", role: "action", weight: 4 }, { id: "a2", role: "action", weight: 1 }, { id: "t", role: "turn", weight: 1 }, { id: "p", role: "payoff", weight: 2, chars: 45 }, { id: "h", role: "hold", weight: 1, chars: 20 }],
    [{ id: "only", role: "action", weight: 1 }],
  ];
  for (const structure of STRUCTURES) {
    for (const ps of sets) {
      for (const [duration, fps] of [[150, 30], [180, 30], [240, 30], [450, 30], [360, 60], [600, 60], [150, 25]] as const) {
        for (const intensity of ["calm", "balanced", "energetic"] as const) {
          for (const seed of ["a", "b", "scene-17"]) cases.push({ structure, phases: ps, duration, fps, intensity, density: ps.length * 2, seed });
        }
      }
    }
  }

  it(`${cases.length} входов: биты в пределах сцены, длины > 0, у каждой фазы основной бит, детерминизм`, () => {
    for (const c of cases) {
      const p = planBeats(c);
      for (const b of p.beats) {
        expect(b.start_frame).toBeGreaterThanOrEqual(0);
        expect(b.end_frame).toBeLessThanOrEqual(c.duration);
        expect(b.end_frame).toBeGreaterThan(b.start_frame);
        expect(Number.isInteger(b.start_frame) && Number.isInteger(b.end_frame)).toBe(true);
      }
      for (const ph of c.phases) expect(p.beats.filter((b) => b.phase === ph.id && b.kind === "main")).toHaveLength(1);
      // последняя фаза живёт до последнего кадра
      expect(Math.max(...p.beats.map((b) => b.end_frame))).toBe(c.duration);
      expect(planBeats(c)).toEqual(p);
    }
  });

  it("вывод держится на экране не меньше времени чтения (≥ 2 с)", () => {
    for (const c of cases) {
      const p = planBeats(c);
      expect(p.reading).toBeGreaterThanOrEqual(2 * c.fps);
      expect(c.duration - p.takeaway).toBeGreaterThanOrEqual(p.reading);
    }
  });

  it("короткая сцена (1 с) — без отрицательных длин", () => {
    for (const structure of STRUCTURES) {
      const p = planBeats(input({ structure, duration: 30, phases: sets[2]! }));
      for (const b of p.beats) expect(b.end_frame).toBeGreaterThan(b.start_frame);
      for (const b of p.beats) expect(b.end_frame).toBeLessThanOrEqual(30);
    }
  });
});
