// S15b: проверки сцены сценария по всей сцене — временной проход пробы (каждый 6-й кадр) и
// энергия движения превью: мёртвый воздух, пустая половина, пустое начало, поздний герой,
// пустые контейнеры и заглушки в середине сцены.
import type { MotionSpec } from "@ms/contracts";
import { type SweepFrame, summarizeSweep } from "@ms/render";
import { describe, expect, it } from "vitest";
import { type Motion, parseSweep, temporalIssues } from "../../src/qa/temporal.js";

type Box = { x: number; y: number; w: number; h: number };
const SIZE = { w: 1920, h: 1080 };
const WINDOW = { lead: 15, speech: 255, tail: 30 };
const item = (text: string, rect: Box, role = "scene", id = `${role}#${text}`) => ({ id, role, text, rect, fontPx: 40, opacity: 1 });

/** Spec: вход 15–39, длящийся бит b-draw (60–150), удар 150–180, удержание 270–300. */
function spec(beats?: MotionSpec["beats"]): MotionSpec {
  return {
    title: "t", purpose: "p", duration_frames: 300, fps: { num: 30, den: 1 }, style_preset: "tech-neon",
    elements: [{ id: "chart", kind: "chart", role: "герой", entrance: "draw", content: {} }],
    phases: [
      { id: "setup", role: "setup", weight: 1, element_ids: ["chart"] },
      { id: "action", role: "action", weight: 1, element_ids: ["chart"] },
      { id: "payoff", role: "payoff", weight: 1, element_ids: ["chart"] },
      { id: "hold", role: "hold", weight: 1, element_ids: ["chart"] },
    ],
    beats: beats ?? [
      { id: "b-in", start_frame: 15, end_frame: 39, action: "вход", description: "", element_ids: ["chart"], phase: "setup", kind: "enter" },
      { id: "b-draw", start_frame: 60, end_frame: 150, action: "рисование", description: "", element_ids: ["chart"], phase: "action", kind: "sustain" },
      { id: "b-hit", start_frame: 150, end_frame: 180, action: "удар", description: "", element_ids: ["chart"], phase: "payoff", kind: "accent" },
      { id: "b-hold", start_frame: 270, end_frame: 300, action: "удержание", description: "", element_ids: ["chart"], phase: "hold", kind: "hold" },
    ],
  } as MotionSpec;
}

interface Content {
  items?: ReturnType<typeof item>[];
  graphics?: Box[];
  boxes?: { id: string; kind: string; rect: Box; filled: boolean; graphic: boolean }[];
}
/** Кадры прохода 0, 6, …, 294 с содержимым `at(frame)`. */
function sweep(at: (f: number) => Content): SweepFrame[] {
  const out: SweepFrame[] = [];
  for (let f = 0; f < 300; f += 6) {
    const c = at(f);
    const graphics = c.graphics ?? [];
    out.push(summarizeSweep(f, SIZE, { items: c.items ?? [], boxes: c.boxes ?? [], graphics, groups: graphics.map((g) => [g]), accents: [], areas: { text: 0.02, graphic: 0.2 } }));
  }
  return out;
}
/** Энергия: `moving(f)` — кадр отличается от прошлого сэмпла под содержимым. */
function motion(moving: (f: number) => boolean): Motion {
  const frames: number[] = [];
  const luma: Uint8Array[] = [];
  let v = 40;
  for (let f = 0; f < 300; f += 6) {
    if (moving(f)) v = v === 40 ? 120 : 40;
    frames.push(f);
    luma.push(new Uint8Array(96 * 54).fill(v));
  }
  return { frames, luma };
}
const codes = (xs: { code: string; severity: string }[]) => xs.map((x) => `${x.code}:${x.severity}`);
const CHART: Box = { x: 300, y: 200, w: 1300, h: 700 };

describe("parseSweep", () => {
  it("строки [motion-kit:sweep] из логов браузера по порядку кадров; битые и без замера — мимо", () => {
    const s = sweep(() => ({ graphics: [CHART] }));
    const logs = [`[log] [motion-kit:sweep] ${JSON.stringify(s[2])}`, "[log] [motion-kit:layout] {}", `[log] [motion-kit:sweep] ${JSON.stringify(s[1])}`, "[log] [motion-kit:sweep] {broken", `[log] [motion-kit:sweep] ${JSON.stringify({ ...s[3], unmeasured: true })}`];
    expect(parseSweep(logs).map((f) => f.frame)).toEqual([6, 12]);
  });
});

describe("dead_air", () => {
  it("бит идёт, а кадр стоит ≥ 45 кадров (те же тексты и площадь, энергия < 0,5 %) — blocking с кадрами и битом", () => {
    // до 60 и после 150 содержимое меняется, 60–150 — одно и то же, ничего не движется
    const s = sweep((f) => ({ graphics: [CHART], items: [item(f < 60 ? `вход ${f}` : f <= 150 ? "Swiss Table" : `итог ${f}`, { x: 300, y: 950, w: 600, h: 60 })] }));
    const out = temporalIssues(s, spec(), WINDOW, motion((f) => f < 60 || f > 150));
    const dead = out.filter((x) => x.code === "dead_air");
    expect(codes(dead)).toEqual(["dead_air:blocking"]);
    expect(dead[0]!.description).toMatch(/кадры 60[–-]150/);
    expect(dead[0]!.area).toBe("b-draw");
  });

  it("ни одного бита фазы в паузе — вина планировщика: warning", () => {
    const beats = spec().beats.filter((b) => b.id !== "b-draw");
    const s = sweep((f) => ({ graphics: [CHART], items: [item(f < 60 ? `вход ${f}` : f <= 150 ? "Swiss Table" : `итог ${f}`, { x: 300, y: 950, w: 600, h: 60 })] }));
    const dead = temporalIssues(s, spec(beats), WINDOW, motion((f) => f < 60 || f > 150)).filter((x) => x.code === "dead_air");
    expect(codes(dead)).toEqual(["dead_air:warning"]);
    expect(dead[0]!.description).toMatch(/нет активного бита/);
  });

  it("содержимое то же, но под ним движение (энергия ≥ 0,5 %) — не мёртвый воздух; без энергии превью — проверки нет", () => {
    const s = sweep(() => ({ graphics: [CHART], items: [item("Swiss Table", { x: 300, y: 950, w: 600, h: 60 })] }));
    expect(temporalIssues(s, spec(), WINDOW, motion(() => true)).filter((x) => x.code === "dead_air")).toEqual([]);
    expect(temporalIssues(s, spec(), WINDOW, undefined).filter((x) => x.code === "dead_air")).toEqual([]);
  });

  it("стоящий кадр вне окна речи (удержание после речи) — не мёртвый воздух; короче 45 кадров — тоже", () => {
    const s = sweep((f) => ({ graphics: [CHART], items: [item(f < 264 && (f < 60 || f > 96) ? `шаг ${f}` : "итог", { x: 300, y: 950, w: 600, h: 60 })] }));
    expect(temporalIssues(s, spec(), WINDOW, motion((f) => f < 264 && (f < 60 || f > 96))).filter((x) => x.code === "dead_air")).toEqual([]);
  });
});

describe("empty_half", () => {
  const left: Box = { x: 100, y: 200, w: 760, h: 700 };
  it("правая половина пуста ≥ 60 кадров при содержимом слева — warning; > 40 % окна речи — blocking", () => {
    const short = sweep((f) => ({ graphics: [f >= 60 && f < 140 ? left : CHART] }));
    expect(codes(temporalIssues(short, spec(), WINDOW, undefined).filter((x) => x.code === "empty_half"))).toEqual(["empty_half:warning"]);
    const long = sweep(() => ({ graphics: [left] }));
    const out = temporalIssues(long, spec(), WINDOW, undefined).filter((x) => x.code === "empty_half");
    expect(codes(out)).toEqual(["empty_half:blocking"]);
    expect(out[0]!.area).toBe("right");
  });

  it("центровая композиция (центр масс в средних 20 % ширины, рамка ≥ 45 % safe area) — не пустая половина", () => {
    // крупный герой у центра слева и тонкая ось вправо: справа < 3 % клеток, но композиция центровая
    const hero: Box = { x: 672, y: 100, w: 288, h: 880 };
    const axis: Box = { x: 960, y: 530, w: 760, h: 10 };
    const centered = sweep(() => ({ graphics: [hero, axis] }));
    expect(temporalIssues(centered, spec(), WINDOW, undefined).filter((x) => x.code === "empty_half")).toEqual([]);
    // тот же герой без оси — рамка мала: правая половина пуста
    expect(codes(temporalIssues(sweep(() => ({ graphics: [hero] })), spec(), WINDOW, undefined).filter((x) => x.code === "empty_half"))).toEqual(["empty_half:blocking"]);
  });

  it("мало содержимого всего (≤ 8 %) — это не «пустая половина»", () => {
    const tiny = sweep(() => ({ graphics: [{ x: 100, y: 400, w: 300, h: 300 }] }));
    expect(temporalIssues(tiny, spec(), WINDOW, undefined).filter((x) => x.code === "empty_half")).toEqual([]);
  });
});

describe("empty_open / late_hero", () => {
  it("на lead + 12 содержимого < 4 % — warning empty_open (подсказка Director: постер героя с начала речи)", () => {
    const s = sweep((f) => ({ graphics: f < 60 ? [] : [CHART] }));
    const out = temporalIssues(s, spec(), WINDOW, undefined).filter((x) => x.code === "empty_open");
    expect(codes(out)).toEqual(["empty_open:warning"]);
    expect(codes(temporalIssues(sweep(() => ({ graphics: [CHART] })), spec(), WINDOW, undefined).filter((x) => x.code === "empty_open"))).toEqual([]);
  });

  it("герой набирает 70 % финальной площади позже первого момента слова + 30 — warning late_hero", () => {
    const grow = (f: number): Box => ({ x: 300, y: 200, w: Math.min(1300, 100 + f * 6), h: 700 });
    const s = sweep((f) => ({ graphics: [grow(f)] }));
    const late = temporalIssues(s, spec(), WINDOW, undefined, { moments: [{ text: "три", frame: 40 }] }).filter((x) => x.code === "late_hero");
    expect(codes(late)).toEqual(["late_hero:warning"]);
    const early = temporalIssues(s, spec(), WINDOW, undefined, { moments: [{ text: "три", frame: 160 }] }).filter((x) => x.code === "late_hero");
    expect(early).toEqual([]);
  });
});

describe("empty_container / placeholder_label в середине сцены", () => {
  const card = (filled: boolean) => ({ id: "card::0", kind: "card", rect: { x: 1100, y: 300, w: 500, h: 300 }, filled, graphic: false });
  it("карточка пуста ≥ 15 кадров после входа посреди сцены — blocking; пустая один сэмпл (вход) — нет", () => {
    const s = sweep((f) => ({ graphics: [{ x: 100, y: 200, w: 800, h: 700 }], boxes: [card(!(f >= 90 && f < 130))] }));
    const out = temporalIssues(s, spec(), WINDOW, undefined, { enter: 16 }).filter((x) => x.code === "empty_container");
    expect(codes(out)).toEqual(["empty_container:blocking"]);
    expect(out[0]!.description).toMatch(/кадры 90[–-]126/);
    const blink = sweep((f) => ({ graphics: [{ x: 100, y: 200, w: 800, h: 700 }], boxes: [card(f !== 90)] }));
    expect(temporalIssues(blink, spec(), WINDOW, undefined, { enter: 16 }).filter((x) => x.code === "empty_container")).toEqual([]);
  });

  it("«?» в трёх карточках посреди сцены стабильно — blocking placeholder_label; до конца сцены — дело финальной проверки", () => {
    const cards = [0, 1, 2].map((k) => ({ id: `card:q${k}:${k}`, kind: "card", rect: { x: k * 600 + 100, y: 300, w: 400, h: 300 }, filled: true, graphic: false }));
    const qs = [0, 1, 2].map((k) => item("?", { x: k * 600 + 280, y: 420, w: 40, h: 60 }, "scene", `q${k}`));
    const mid = sweep((f) => ({ boxes: cards, items: f >= 60 && f < 120 ? qs : [0, 1, 2].map((k) => item(`шаг ${k}`, { x: k * 600 + 200, y: 420, w: 200, h: 60 })) }));
    expect(codes(temporalIssues(mid, spec(), WINDOW, undefined, { enter: 16 }).filter((x) => x.code === "placeholder_label"))).toEqual(["placeholder_label:blocking"]);
    const tail = sweep((f) => ({ boxes: cards, items: f >= 60 ? qs : [] }));
    expect(temporalIssues(tail, spec(), WINDOW, undefined, { enter: 16 }).filter((x) => x.code === "placeholder_label")).toEqual([]);
  });
});
