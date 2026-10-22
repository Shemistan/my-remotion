// Планировщик ритма (S3a): веса фаз → кадры битов по структуре сцены. Чистая функция:
// у каждой структуры своя форма времени, вывод держится ≥ времени чтения, сдвиг от seed.
import { describe, expect, it } from "vitest";
import type { SceneStructure } from "@ms/contracts";
import { type BeatPlan, HOLD_MAX_S, PAYOFF_MAX_S, type PlanInput, type PlanPhase, STRUCTURES, TAKEAWAY_BAND, phaseTokens, planBeats, readingFrames } from "../../src/motion-kit/choreo/plan.js";

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

  it("cold-open: итог-крючок с кадра 0 (1,2–1,8 с: читается и уходит), затем объяснение, затем возврат к итогу", () => {
    const p = planBeats(input({ structure: "cold-open" }));
    const open = p.beats.find((b) => b.kind === "open")!;
    expect(open).toMatchObject({ phase: "pay", start_frame: 0 });
    expect(open.end_frame).toBeGreaterThanOrEqual(36);
    expect(open.end_frame).toBeLessThanOrEqual(54);
    // длинная сцена — не дольше 1,8 с
    expect(planBeats(input({ structure: "cold-open", duration: 900 })).beats.find((b) => b.kind === "open")!.end_frame).toBe(54);
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

describe("веса важнее минимумов (smoke s3a-366b281, eval-funnel)", () => {
  it("setup 15 / action 45 / payoff 20 / hold 20, 5 и 4 элемента, длинный вывод: action — главная фаза", () => {
    const funnel: PlanPhase[] = [
      { id: "setup", role: "setup", weight: 15, elements: 5 },
      { id: "action", role: "action", weight: 45, elements: 4 },
      { id: "payoff", role: "payoff", weight: 20, elements: 2, chars: 38 },
      { id: "hold", role: "hold", weight: 20, elements: 3 },
    ];
    const p = planBeats(input({ phases: funnel, seed: "Воронка: 3 из 100|x" }));
    const len = (id: string) => main(p, id).end_frame - main(p, id).start_frame;
    expect(len("action")).toBeGreaterThanOrEqual(2 * len("setup"));
    expect(len("action")).toBeGreaterThanOrEqual(55);
    // чтение — не больше 40 % сцены (но ≥ 2 с)
    expect(p.reading).toBeLessThanOrEqual(72);
  });
});

describe("сдвиг от содержания", () => {
  // без текста вывода полоса не упирается в чтение: сдвигу есть место в обе стороны
  const roomy: PlanPhase[] = [
    { id: "setup", role: "setup", weight: 1, elements: 2 },
    { id: "act", role: "action", weight: 2, elements: 3 },
    { id: "pay", role: "payoff", weight: 1 },
    { id: "hold", role: "hold", weight: 2 },
  ];
  it("±6–10 кадров от seed: разные сцены одной структуры не бьют в один кадр", () => {
    const offsets = new Set<number>();
    const landings = new Set<number>();
    const unshifted = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const p = planBeats(input({ phases: roomy, seed: `scene-${i}` }));
      expect(Math.abs(p.offset)).toBeGreaterThanOrEqual(6);
      expect(Math.abs(p.offset)).toBeLessThanOrEqual(10);
      offsets.add(p.offset);
      landings.add(p.takeaway);
      unshifted.add(p.takeaway - p.offset);
    }
    expect(offsets.size).toBeGreaterThanOrEqual(6);
    expect(landings.size).toBeGreaterThanOrEqual(6);
    // без сдвига удар стоял бы на одном кадре: разводит сцены именно сдвиг
    expect(unshifted.size).toBe(1);
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

  it("вывод держится на экране не меньше времени чтения (≥ 2 с) — от удара, а у cold-open и от постера", () => {
    for (const c of cases) {
      const p = planBeats(c);
      expect(p.reading).toBeGreaterThanOrEqual(2 * c.fps);
      expect(c.duration - p.strike).toBeGreaterThanOrEqual(p.reading);
      expect(p.takeaway).toBeLessThanOrEqual(p.strike);
    }
  });

  it("текст вывода входит с задержкой (каскад, передача акцента): чтение — от его входа", () => {
    for (const c of cases) {
      const ph = c.phases.map((x) => (x.role === "payoff" ? { ...x, delay: 12 } : x));
      if (!ph.some((x) => x.role === "payoff")) continue;
      const p = planBeats({ ...c, phases: ph });
      expect(c.duration - (p.strike + 12), `${c.structure} ${c.duration}/${c.fps}`).toBeGreaterThanOrEqual(p.reading);
      // главный бит payoff успевает войти после передачи: задержка + целый вход
      const pay = p.beats.find((b) => b.role === "payoff" && b.kind === "main")!;
      expect(pay.end_frame - pay.start_frame, `${c.structure} ${c.duration}/${c.fps} ${c.intensity}`).toBeGreaterThanOrEqual(12 + phaseTokens(c.fps, c.intensity).enter);
    }
  });

  it("главный акцент после передачи (lead, без текста) получает целый вход (s3afix-rereview I3)", () => {
    for (const c of cases) {
      if (!c.phases.some((x) => x.role === "payoff")) continue;
      const enter = phaseTokens(c.fps, c.intensity).enter;
      // три второстепенных акцента впереди главного: lead = 3 входа
      const ph = c.phases.map((x) => (x.role === "payoff" ? { ...x, lead: 3 * enter } : x));
      const p = planBeats({ ...c, phases: ph });
      const pay = p.beats.find((b) => b.role === "payoff" && b.kind === "main")!;
      expect(pay.end_frame - pay.start_frame, `${c.structure} ${c.duration}/${c.fps} ${c.intensity}`).toBeGreaterThanOrEqual(4 * enter);
    }
  });

  it("сдвиг: 0 или 6–10 кадров при 30 fps (×fps/30)", () => {
    for (const c of cases) {
      const o = Math.abs(planBeats(c).offset);
      if (o === 0) continue;
      expect(o).toBeGreaterThanOrEqual(Math.round(6 * (c.fps / 30)));
      expect(o).toBeLessThanOrEqual(Math.round(10 * (c.fps / 30)));
    }
  });

  it("последовательные структуры: окна по порядку фаз, без перекрытий, стык в стык", () => {
    for (const c of cases.filter((x) => ["build-strike", "cold-open", "call-response"].includes(x.structure) && x.duration >= 150)) {
      const p = planBeats(c);
      const mains = p.beats.filter((b) => b.kind === "main").sort((a, b) => a.start_frame - b.start_frame);
      for (let i = 1; i < mains.length; i++) expect(mains[i]!.start_frame, `${c.structure}`).toBeGreaterThanOrEqual(mains[i - 1]!.end_frame);
      // роли не перемешаны: до удара — подготовка, затем payoff, затем hold
      const rank = { setup: 0, action: 0, turn: 0, payoff: 1, hold: 2 } as const;
      const ranks = mains.map((b) => rank[b.role]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("вес монотонен: больше веса фазе — её окно не короче (при том же сдвиге)", () => {
    for (const structure of STRUCTURES) {
      for (const id of ["setup", "act", "pay", "hold"]) {
        let prev: BeatPlan | undefined;
        for (let w = 1; w <= 8; w++) {
          const ph = phases.map((x) => (x.id === id ? { ...x, weight: w } : x));
          const p = planBeats(input({ structure, phases: ph, seed: "mono" }));
          const len = (q: BeatPlan) => main(q, id).end_frame - main(q, id).start_frame;
          if (prev && prev.offset === p.offset) expect(len(p), `${structure} ${id} w=${w}`).toBeGreaterThanOrEqual(len(prev));
          prev = p;
        }
      }
    }
  });

  it("короткая сцена (1 с) — без отрицательных длин", () => {
    for (const structure of STRUCTURES) {
      const p = planBeats(input({ structure, duration: 30, phases: sets[2]! }));
      for (const b of p.beats) expect(b.end_frame).toBeGreaterThan(b.start_frame);
      for (const b of p.beats) expect(b.end_frame).toBeLessThanOrEqual(30);
    }
  });

  it("только хвост (payoff / hold) в сцене короче чтения — кадры в [0, D], без отрицательных (s3afix-rereview m1)", () => {
    const tails: PlanPhase[][] = [
      [{ id: "p", role: "payoff", weight: 1, chars: 40 }, { id: "h", role: "hold", weight: 1 }],
      [{ id: "p", role: "payoff", weight: 1, chars: 40 }],
      [{ id: "h", role: "hold", weight: 1, chars: 20 }],
      [{ id: "p", role: "payoff", weight: 2, delay: 12, lead: 24 }, { id: "h", role: "hold", weight: 1 }],
    ];
    for (const structure of STRUCTURES) {
      for (const ph of [...tails, sets[2]!, sets[1]!]) {
        for (const duration of [30, 45, 60, 90]) {
          for (const intensity of ["calm", "balanced", "energetic"] as const) {
            const p = planBeats(input({ structure, duration, phases: ph, intensity }));
            const label = `${structure} ${ph.map((x) => x.id).join("/")} D=${duration} ${intensity}`;
            for (const b of p.beats) {
              expect(b.start_frame, label).toBeGreaterThanOrEqual(0);
              expect(b.end_frame, label).toBeLessThanOrEqual(duration);
              expect(b.end_frame, label).toBeGreaterThan(b.start_frame);
            }
            expect(p.strike, label).toBeGreaterThanOrEqual(0);
            expect(p.takeaway, label).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("minFrames фазы (setup графа: рёбра дорисованы) — окно не короче, если сцена позволяет", () => {
    for (const structure of STRUCTURES) {
      const ph = phases.map((x) => (x.id === "setup" ? { ...x, minFrames: 66 } : x));
      // cold-open в 6 с: постер (25) + 66 + действие (28) не влезают до чтения — там нельзя
      for (const [duration, fps] of [[180, 30], [240, 30], [360, 60]] as const) {
        if (structure === "cold-open" && duration === 180) continue;
        const p = planBeats(input({ structure, phases: ph, duration, fps }));
        expect(main(p, "setup").end_frame - main(p, "setup").start_frame, `${structure} ${duration}`).toBeGreaterThanOrEqual(66);
      }
    }
  });
});

describe("длинные сцены: хвост в секундах, а не в доле (S3-fix, user-cases 60 с)", () => {
  // 60-секундные сцены набора user получили 13–20 с почти статичного финала: payoff и hold
  // были долей длины. Удержание — не больше HOLD_MAX_S, payoff — не больше PAYOFF_MAX_S (или
  // чтения и входа главного бита), удар уходит позже, объяснение получает время
  const sets: PlanPhase[][] = [
    phases,
    [{ id: "s", role: "setup", weight: 10, elements: 4 }, { id: "a", role: "action", weight: 40, elements: 6 }, { id: "p", role: "payoff", weight: 25, chars: 60 }, { id: "h", role: "hold", weight: 25 }],
    [{ id: "a", role: "action", weight: 1 }, { id: "p", role: "payoff", weight: 3, chars: 30 }, { id: "h", role: "hold", weight: 6 }],
    [{ id: "s", role: "setup", weight: 1 }, { id: "a", role: "action", weight: 1 }, { id: "t", role: "turn", weight: 1 }, { id: "p", role: "payoff", weight: 1, chars: 20 }, { id: "h", role: "hold", weight: 1 }],
    [{ id: "a", role: "action", weight: 2 }, { id: "h", role: "hold", weight: 3 }],
  ];
  for (const [duration, fps] of [[1800, 30], [3600, 60], [1500, 25], [900, 30]] as const) {
    it(`${duration} кадров при ${fps} fps: удержание ≤ ${HOLD_MAX_S} с, payoff ≤ max(${PAYOFF_MAX_S} с, чтение), кадры в сцене`, () => {
      for (const structure of STRUCTURES) {
        for (const ps of sets) {
          for (const intensity of ["calm", "balanced", "energetic"] as const) {
            const p = planBeats({ structure, phases: ps, duration, fps, intensity, density: 8, seed: `${structure}-${ps.length}` });
            const len = (id: string) => main(p, id).end_frame - main(p, id).start_frame;
            const at = `${structure} × ${ps.map((x) => x.id).join(",")} × ${intensity}`;
            for (const b of p.beats) {
              expect(b.start_frame, at).toBeGreaterThanOrEqual(0);
              expect(b.end_frame, at).toBeLessThanOrEqual(duration);
            }
            const h = ps.find((x) => x.role === "hold");
            if (h) expect(len(h.id), at).toBeLessThanOrEqual(Math.round(HOLD_MAX_S * fps));
            const pay = ps.find((x) => x.role === "payoff");
            if (pay) expect(len(pay.id), at).toBeLessThanOrEqual(Math.max(Math.round(PAYOFF_MAX_S * fps), p.reading));
            // хвост после удара — секунды, а не треть ролика
            expect(duration - p.strike, at).toBeLessThanOrEqual(Math.round((HOLD_MAX_S + Math.max(PAYOFF_MAX_S, p.reading / fps)) * fps));
            expect(planBeats({ structure, phases: ps, duration, fps, intensity, density: 8, seed: `${structure}-${ps.length}` })).toEqual(p);
          }
        }
      }
    });
  }
  // Потолки трогают и короткие сцены (s3fix-rereview m2): count-up без payoff в 6 с бьёт позже
  // (хвост не длиннее HOLD_MAX_S), сдвиг от seed не удлиняет хвост за потолок, в 8–12 с меняется
  // часть планов. Ниже — записанные планы 6 с / 30 fps (kit 0.5.3, крючок cold-open 1,2 с):
  // любое изменение коротких сцен видно здесь, а не проходит молча.
  const row = (p: BeatPlan) => `${p.strike} | ${p.beats.map((b) => `${b.phase}${b.kind === "open" ? "^" : ""}:${b.start_frame}-${b.end_frame}`).join(" ")}`;
  const noPay: PlanPhase[] = [{ id: "act", role: "action", weight: 2 }, { id: "hold", role: "hold", weight: 1, chars: 12 }];
  it("6 с / 30 fps: планы структур записаны (с payoff и без)", () => {
    const got = (ps: PlanPhase[]) => Object.fromEntries(STRUCTURES.map((structure) => [structure, row(planBeats(input({ structure, phases: ps })))]));
    expect(got(phases)).toEqual({
      "build-strike": "108 | setup:0-27 act:27-108 pay:108-138 hold:138-180",
      "cold-open": "90 | pay^:0-36 setup:36-56 act:56-90 pay:90-108 hold:108-180",
      "continuous-flow": "85 | setup:0-21 act:21-180 pay:85-125 hold:125-180",
      "split-reveal": "103 | setup:0-20 act:20-103 pay:103-148 hold:148-180",
      "call-response": "101 | setup:0-22 act:22-87 pay:101-125 hold:125-180",
      "count-up": "50 | act:0-50 setup:8-50 pay:50-80 hold:80-180",
    });
    expect(got(noPay)).toEqual({
      "build-strike": "114 | act:0-114 hold:114-180",
      "cold-open": "96 | act:0-96 hold:96-180",
      "continuous-flow": "91 | act:0-180 hold:91-180",
      "split-reveal": "109 | act:0-109 hold:109-180",
      "call-response": "107 | act:0-107 hold:107-180",
      "count-up": "68 | act:0-68 hold:68-180",
    });
  });
  it("count-up без payoff в 6 с: удержание ≤ 4 с — удар позже полосы, но в своём коридоре (любой seed и fps)", () => {
    for (const fps of [24, 30, 60]) {
      const D = 6 * fps;
      const [lo, hi] = TAKEAWAY_BAND["count-up"];
      for (const seed of ["a", "b", "c", "d", "e"]) {
        const p = planBeats(input({ structure: "count-up", phases: noPay, duration: D, fps, seed }));
        const at = `${fps} fps, seed ${seed}`;
        expect(D - main(p, "hold").start_frame, at).toBeLessThanOrEqual(Math.round(HOLD_MAX_S * fps));
        // удар — не раньше потолка хвоста (D − 4 с) и не позже верха полосы с сдвигом seed
        expect(p.strike, at).toBeGreaterThanOrEqual(Math.min(Math.round(lo * D), D - Math.round(HOLD_MAX_S * fps)));
        expect(p.strike, at).toBeLessThanOrEqual(Math.round(hi * D) + Math.round(10 * (fps / 30)));
      }
    }
  });
});

describe("полоса кадра вывода по структуре и веса (S3a-fix I3)", () => {
  // текста нет — чтение 2 с, полоса не упирается в него; сдвиг от seed вычитается
  const bare: PlanPhase[] = [
    { id: "setup", role: "setup", weight: 15, elements: 2 },
    { id: "act", role: "action", weight: 45, elements: 3 },
    { id: "pay", role: "payoff", weight: 20 },
    { id: "hold", role: "hold", weight: 20 },
  ];
  const at = (structure: SceneStructure, ph: PlanPhase[] = bare, seed = "band") => planBeats(input({ structure, phases: ph, seed }));

  it("удар — в полосе своей структуры; cold-open: вывод с кадра 0 (постер), удар — возврат", () => {
    for (const s of STRUCTURES) {
      const p = at(s);
      const [lo, hi] = TAKEAWAY_BAND[s];
      // общий сдвиг полос под чтение: верх самой поздней полосы — не позже D − чтение
      const top = Math.max(...Object.values(TAKEAWAY_BAND).map((b) => b[1]));
      const shift = Math.max(0, top * 180 - (180 - p.reading));
      expect(p.strike - p.offset, s).toBeGreaterThanOrEqual(Math.floor(lo * 180 - shift));
      expect(p.strike - p.offset, s).toBeLessThanOrEqual(Math.ceil(hi * 180 - shift));
      expect(p.takeaway, s).toBe(s === "cold-open" ? 0 : p.strike);
    }
    // число ведёт — удар раньше всех, ответ на запрос — позже сборки
    expect(at("count-up").strike).toBeLessThan(at("build-strike").strike);
    expect(at("call-response").strike - at("call-response").offset).toBeGreaterThan(at("build-strike").strike - at("build-strike").offset);
  });

  it("веса двигают удар: больше веса объяснению — позже, больше удержанию — раньше и hold длиннее", () => {
    for (const s of STRUCTURES) {
      const base = at(s);
      const longExplain = at(s, bare.map((p) => (p.role === "action" ? { ...p, weight: 75 } : p)));
      const longHold = at(s, bare.map((p) => (p.role === "hold" ? { ...p, weight: 60 } : p)));
      const t = (p: BeatPlan) => p.strike - p.offset;
      expect(t(longExplain), s).toBeGreaterThan(t(base));
      expect(t(longHold), s).toBeLessThan(t(base));
      const hold = (p: BeatPlan) => main(p, "hold").end_frame - main(p, "hold").start_frame + p.offset;
      // call-response: ответ ≤ 0,8 с — прибавка хвоста сначала идёт ему до потолка: хвост
      // (ответ + hold) растёт строго, а hold — строго, если ответ уже у потолка 0,8 с
      if (s === "call-response") {
        const tailOf = (p: BeatPlan) => main(p, "hold").end_frame - main(p, "pay").start_frame + p.offset;
        expect(tailOf(longHold), s).toBeGreaterThan(tailOf(base));
        expect(hold(longHold), s).toBeGreaterThanOrEqual(hold(base));
        const pay = (p: BeatPlan) => main(p, "pay").end_frame - main(p, "pay").start_frame;
        if (pay(base) >= 24) expect(hold(longHold), s).toBeGreaterThan(hold(base));
      } else expect(hold(longHold), s).toBeGreaterThan(hold(base));
    }
  });

  const weightSets = [[10, 50, 20, 20], [15, 45, 20, 20], [20, 40, 15, 25], [5, 30, 25, 40], [25, 55, 10, 10], [10, 60, 15, 15], [40, 20, 20, 20]];
  const sd = (xs: number[]) => {
    const m = xs.reduce((x, y) => x + y, 0) / xs.length;
    return Math.sqrt(xs.reduce((x, v) => x + (v - m) ** 2, 0) / xs.length);
  };
  const withText = (chars: number, [a, b, c, d]: number[]): PlanPhase[] => [
    { id: "s", role: "setup", weight: a!, elements: 2 },
    { id: "a", role: "action", weight: b!, elements: 3 },
    { id: "p", role: "payoff", weight: c!, chars },
    { id: "h", role: "hold", weight: d! },
  ];

  // реальный вывод (≥ 30 символов) — чтение упирается в потолок 40 % сцены (72 кадра при 6 с)
  for (const chars of [0, 20, 40, 70]) {
    it(`σ кадра вывода по структурам × весам (6 с, 30 fps, ${chars} символов): все ≥ 20 и без cold-open ≥ 20 (s3afix-rereview I2)`, () => {
      const all: number[] = [];
      const explained: number[] = [];
      for (const s of STRUCTURES) {
        for (const w of weightSets) {
          const p = planBeats(input({ structure: s, phases: withText(chars, w), seed: `${s}-${w[0]}-${w[1]}` }));
          all.push(p.takeaway);
          if (s !== "cold-open") explained.push(p.takeaway);
        }
      }
      expect(sd(all)).toBeGreaterThanOrEqual(20);
      // и без постера cold-open удары разных структур не сливаются в один кадр
      expect(sd(explained)).toBeGreaterThanOrEqual(20);
    });

    it(`порядок полос сохраняется и при длинном чтении (${chars} символов): count-up < flow < split < build-strike < call-response`, () => {
      const order: SceneStructure[] = ["count-up", "continuous-flow", "split-reveal", "build-strike", "call-response"];
      for (const w of weightSets) {
        const t = order.map((s) => {
          const p = planBeats(input({ structure: s, phases: withText(chars, w), seed: "order" }));
          return p.strike - p.offset;
        });
        for (let i = 1; i < t.length; i++) expect(t[i]!, `${order[i]} после ${order[i - 1]} при весах ${w.join("/")}: ${t.join(", ")}`).toBeGreaterThanOrEqual(t[i - 1]!);
        expect(t.at(-1)!, `call-response позже build-strike при весах ${w.join("/")}`).toBeGreaterThan(t[3]!);
        expect(t[3]!).toBeGreaterThan(t[0]!);
      }
    });

    it(`веса двигают удар и при длинном чтении (${chars} символов): полоса не сжата в кадр`, () => {
      for (const s of STRUCTURES) {
        const ts = new Set(weightSets.map((w) => {
          const p = planBeats(input({ structure: s, phases: withText(chars, w), seed: "w" }));
          return p.strike - p.offset;
        }));
        expect(ts.size, s).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
