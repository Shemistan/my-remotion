// Выбор QA-кадров по битам и элементам спецификации (без эвристики по словам действия).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MotionSpec } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { resolveStyle } from "@ms/render";
import { MAX_QA_FRAMES, MAX_QA_FRAMES_HARD, MIN_QA_GAP, blankCheckFrom, countStarts, enterFrames, inBeat, selectQaFrames, uncoveredElements } from "../../src/pipeline/qa-frames.js";
import { directorOutput } from "../pipeline/helpers.js";
import { beat, el, spec } from "./helpers.js";

const gaps = (f: number[]) => f.slice(1).map((x, i) => x - f[i]!);

// биты [0,25],[20,125],[125,162]: вход заголовка, рост графика, удержание
const spec162 = spec({
  elements: [el("title", { kind: "text", entrance: "rise" }), el("chart", { kind: "chart", entrance: "draw" })],
  beats: [beat("b0", 0, 25, ["title"]), beat("b1", 20, 125, ["chart"], "chart-growth"), beat("b2", 125, 162, ["chart"], "hold")],
});

describe("selectQaFrames", () => {
  it("вход первого бита (enter_frames стиля: dark-premium balanced = 24), середины, последний; 12 внутри входа", () => {
    expect(MAX_QA_FRAMES).toBe(8);
    expect(MIN_QA_GAP).toBe(10);
    expect(selectQaFrames(spec162)).toEqual([24, 72, 143, 161]);
  });

  it("длительность входа — из разрешённого стиля: energetic короче, calm длиннее, mask 1.5×", () => {
    const st = (intensity: "calm" | "balanced" | "energetic") => resolveStyle({ preset: "dark-premium", intensity });
    expect(st("balanced").motion.enter_frames).toBe(24);
    expect(selectQaFrames(spec162, 162, st("energetic"))[0]).toBe(18);
    expect(selectQaFrames(spec162, 162, st("calm"))[0]).toBe(25); // 30, но не позже конца бита
    expect(enterFrames("mask", st("balanced"))).toBe(36);
    const masked = spec({ elements: [el("t", { entrance: "mask" })], beats: [beat("b0", 0, 60, ["t"]), beat("b1", 60, 120, ["t"], "hold")] });
    expect(selectQaFrames(masked)[0]).toBe(36);
  });

  it("spec 180 кадров: вход, середина акцента, середины; шаг ≥ 10", () => {
    const fr = selectQaFrames(directorOutput().spec);
    expect(fr).toEqual([24, 80, 140, 165, 179]);
    gaps(fr).forEach((g) => expect(g).toBeGreaterThanOrEqual(10));
  });

  it("бит с элементом role = emphasis [150,180]: его середина и конец − 1", () => {
    const sp = spec({
      elements: [el("title"), el("badge", { kind: "card", role: "emphasis", entrance: "pop" })],
      beats: [beat("b0", 0, 40, ["title"]), beat("b1", 40, 150, ["title"], "story"), beat("b2", 150, 180, ["badge"], "badge-pop")],
    });
    const fr = selectQaFrames(sp);
    expect(fr).toContain(179);
    expect(fr).toContain(165);
  });

  it("акцент по роли не ищется в удержании: берётся бит, где элемент появился", () => {
    const sp = spec({
      elements: [el("title"), el("badge", { kind: "card", role: "акцент-итог: множитель", entrance: "scale" })],
      beats: [beat("b0", 0, 30, ["title"]), beat("b1", 100, 130, ["badge"], "badge-born"), beat("b2", 130, 180, ["title", "badge"], "hold")],
    });
    expect(selectQaFrames(sp)).toContain(115);
  });

  it("20 битов по 9 кадров (все короткоживущие) → не больше 12 кадров (S2-fix2), без дублей", () => {
    const beats = Array.from({ length: 20 }, (_, i) => beat(`b${i}`, i * 9, i * 9 + 9, [`e${i}`], `step-${i}`));
    const sp = spec({ beats, elements: beats.map((b) => el(b.element_ids[0]!, { kind: "card", entrance: "pop" })) });
    const fr = selectQaFrames(sp);
    expect(fr.length).toBeLessThanOrEqual(MAX_QA_FRAMES_HARD);
    expect(new Set(fr).size).toBe(fr.length);
  });

  it("короткая сцена: обязательные кадры остаются, даже если ближе MIN_QA_GAP", () => {
    const sp = spec({ elements: [el("t")], beats: [beat("b0", 0, 20, ["t"]), beat("b1", 10, 20, ["t"], "accent-flash")] });
    // вход 19 (бит 20 кадров короче входа 24), середина акцента 15, последний 19
    expect(selectQaFrames(sp)).toEqual([15, 19]);
  });

  it("импульс в коротком бите [84,96) получает кадр внутри бита; вход сцены — без него", () => {
    const sp = spec({
      elements: [el("title"), el("chart", { kind: "chart", entrance: "draw" }), el("line-pulse", { kind: "shape", role: "импульс по линии", entrance: "pop" })],
      beats: [
        beat("b0", 0, 30, ["title"]), beat("b1", 20, 120, ["chart"], "chart-growth"), beat("b2", 84, 96, ["line-pulse"], "pulse"),
        beat("b3", 120, 150, ["chart"], "final-emphasis"), beat("b4", 150, 180, ["title", "chart"], "hold"),
      ],
    });
    const fr = selectQaFrames(sp);
    expect(fr.filter((f) => f >= 84 && f < 96)).toHaveLength(1);
    expect(fr[0]).toBe(24);
    expect(uncoveredElements(sp, fr)).toEqual([]);
    // без покрытия импульс остался бы без кадра
    expect(uncoveredElements(sp, [24, 70, 135, 165, 179])).toEqual(["line-pulse"]);
  });

  it("элемент акцента без кадра в своих битах получает кадр раньше середин", () => {
    const sp = spec({
      elements: [el("title"), el("chart", { kind: "chart", entrance: "draw" }), el("badge", { kind: "card", role: "emphasis", entrance: "pop" })],
      beats: [beat("b0", 0, 30, ["title"]), beat("b1", 20, 150, ["chart"], "chart-growth"), beat("b2", 40, 52, ["badge"], "badge-flash"), beat("b3", 150, 180, ["title", "chart"], "final-emphasis")],
    });
    expect(selectQaFrames(sp).some((f) => f >= 40 && f < 52)).toBe(true);
  });

  it("кадры уникальны, по возрастанию и внутри сцены; durationFrames задаёт последний кадр", () => {
    const fr = selectQaFrames(spec162, 150);
    expect(fr.at(-1)).toBe(149);
    expect([...new Set(fr)].sort((a, b) => a - b)).toEqual(fr);
    expect(fr.every((f) => f >= 0 && f < 150)).toBe(true);
  });
});

describe("blankCheckFrom", () => {
  it("конец входа первого бита: min(end, start + enter_frames)", () => {
    expect(blankCheckFrom(spec162)).toBe(24);
    expect(blankCheckFrom(spec({ beats: [beat("b0", 4, 12, ["a"])] }))).toBe(12);
  });
});

describe("inBeat", () => {
  it("[start, end); последний кадр — и в бите, кончающемся на нём", () => {
    expect(inBeat({ start_frame: 140, end_frame: 179 }, 179, 180)).toBe(true);
    expect(inBeat({ start_frame: 140, end_frame: 180 }, 179, 180)).toBe(true);
    expect(inBeat({ start_frame: 140, end_frame: 179 }, 178, 180)).toBe(true);
    expect(inBeat({ start_frame: 100, end_frame: 150 }, 150, 180)).toBe(false);
    expect(inBeat({ start_frame: 100, end_frame: 150 }, 99, 180)).toBe(false);
  });
});

describe("selectQaFrames на spec реальных прогонов", () => {
  const load = (name: string): MotionSpec =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/specs/${name}`, import.meta.url)), "utf8"));
  it.each([
    // [spec, середина акцента, вход последнего появляющегося элемента min(end, start + 24)]
    ["test1-slice.json", 130, 76],
    ["test2-slice.json", 150, 36],
    ["test1-r1.json", 123, 58],
    ["test2-r1.json", 152, 64],
  ])("%s: середина акцента %i, вход %i и последний кадр — в кадрах; нет кадров внутри входа текста; шаг ≥ 10", (name, accentMid, entrance) => {
    const sp = load(name);
    const f = selectQaFrames(sp);
    expect(f).toContain(accentMid);
    expect(f).toContain(entrance);
    expect(f).toContain(sp.duration_frames - 1);
    expect(f.length).toBeLessThanOrEqual(MAX_QA_FRAMES);
    // ни одного кадра в первых ¾ входа текстового элемента (заголовок наполовину вошёл)
    const kinds = new Map(sp.elements.map((e) => [e.id, e.kind]));
    const firstBeat = new Map<string, MotionSpec["beats"][number]>();
    for (const b of [...sp.beats].sort((a, c) => a.start_frame - c.start_frame)) {
      for (const id of b.element_ids) if (!firstBeat.has(id)) firstBeat.set(id, b);
    }
    for (const [id, b] of firstBeat) {
      if (kinds.get(id) !== "text") continue;
      const settle = Math.min(b.end_frame, b.start_frame + 18);
      expect(f.filter((x) => x > b.start_frame && x < settle), `${id} ${b.id}`).toEqual([]);
    }
    gaps(f).forEach((g) => expect(g).toBeGreaterThanOrEqual(10));
  });
});

describe("selectQaFrames: начало счёта числа (09 §2, Task 17)", () => {
  it("число входит со значением «от», счёт — отдельный бит: кадр начала счёта среди QA-кадров", () => {
    const sp = spec({
      elements: [el("title"), el("hero", { kind: "number", entrance: "pop" }), el("chart", { kind: "chart", entrance: "draw" })],
      beats: [
        beat("title", 0, 36, ["title"], "title-in"),
        beat("hero-in", 10, 34, ["hero"], "hero-entrance"),
        beat("chart", 24, 130, ["chart"], "chart-draw"),
        beat("count", 37, 109, ["hero", "chart"], "count-bound-to-head"),
        beat("accent", 109, 132, ["hero"], "final-emphasis"),
        beat("hold", 132, 180, ["hero", "chart", "title"], "hold"),
      ],
    });
    expect(selectQaFrames(sp)).toContain(37);
  });
});

describe("покрытие: кадр в начале бита появления элемент не покрывает (S2-fix eval, gen-cache)", () => {
  // токен летит в бите [30, 42); кадр 30 (вход сцены) совпал с его началом — токена ещё нет
  const sp = spec({
    elements: [el("graph", { kind: "graph", entrance: "pop" }), el("tok", { kind: "shape", entrance: "none" }), el("hero", { kind: "number", entrance: "pop" })],
    beats: [
      beat("b0", 0, 30, ["graph"]), beat("b-tok", 30, 42, ["tok"]), beat("b-hero", 42, 120, ["hero"]),
      beat("b-hold", 150, 180, ["graph", "hero"], "hold"),
    ],
  });
  it("кадр в первой четверти первого бита элемента не считается покрытием; середина бита — считается", () => {
    expect(uncoveredElements(sp, [30, 80, 179])).toContain("tok");
    expect(uncoveredElements(sp, [32, 80, 179])).toContain("tok");
    expect(uncoveredElements(sp, [36, 80, 179])).not.toContain("tok");
  });
  it("selectQaFrames берёт токену кадр из середины его бита", () => {
    const fr = selectQaFrames(sp);
    expect(fr.some((f) => f >= 33 && f < 42)).toBe(true);
    expect(uncoveredElements(sp, fr)).toEqual([]);
  });
});

describe("S2-fix2: токен данных — кадр, где читается его ярлык; бюджет под короткоживущие", () => {
  const tok = (id: string, travel?: number) => el(id, { kind: "shape", role: "данные", entrance: "slide", content: { component: "DataToken", label: id, ...(travel ? { travel } : {}) } });
  it("ярлык токена читается с ~40 % полёта (не позже середины бита) до прихода + 6: кадр раньше не покрывает", () => {
    // бит [40, 80), полёт 10: окно [40 + min(4 + 4, 20), min(80, 40 + 10 + 6)) = [48, 56)
    const sp = spec({ elements: [el("graph", { kind: "graph", entrance: "pop" }), tok("t", 10)], beats: [beat("b0", 0, 30, ["graph"]), beat("bt", 40, 80, ["t"]), beat("hold", 120, 180, ["graph"], "hold")] });
    expect(uncoveredElements(sp, [44, 179])).toContain("t");
    expect(uncoveredElements(sp, [70, 179])).toContain("t"); // середина бита: токен уже поглощён
    expect(uncoveredElements(sp, [50, 179])).not.toContain("t");
    const fr = selectQaFrames(sp);
    expect(fr.some((f) => f >= 48 && f < 56)).toBe(true);
  });
  it("полёт во весь бит: окно — вторая половина бита (подпись компактного токена видна к середине)", () => {
    const sp = spec({ elements: [el("graph", { kind: "graph", entrance: "pop" }), tok("t", 18)], beats: [beat("b0", 0, 30, ["graph"]), beat("bt", 42, 60, ["t"]), beat("hold", 120, 180, ["graph"], "hold")] });
    expect(uncoveredElements(sp, [46, 179])).toContain("t");
    expect(uncoveredElements(sp, [51, 179])).not.toContain("t");
  });
  it("9 токенов и долгие элементы: бюджет 8 + непокрытые короткоживущие (≤ 12) — каждый токен получает кадр", () => {
    const toks = Array.from({ length: 9 }, (_, i) => tok(`t${i}`, 12));
    const longs = Array.from({ length: 5 }, (_, i) => el(`l${i}`, { kind: "card", entrance: "pop" }));
    const sp = spec({
      elements: [...longs, ...toks],
      beats: [
        ...longs.map((e, i) => beat(`bl${i}`, i * 6, 150, [e.id])),
        ...toks.map((e, i) => beat(`bt${i}`, 20 + i * 14, 34 + i * 14, [e.id])),
        beat("hold", 150, 180, longs.map((e) => e.id), "hold"),
      ],
    });
    const fr = selectQaFrames(sp);
    expect(fr.length).toBeGreaterThan(MAX_QA_FRAMES);
    expect(fr.length).toBeLessThanOrEqual(MAX_QA_FRAMES_HARD);
    expect(MAX_QA_FRAMES_HARD).toBe(12);
    expect(uncoveredElements(sp, fr).filter((id) => id.startsWith("t"))).toEqual([]);
  });
  it("сцена без короткоживущих — бюджет прежний (8)", () => {
    const beats = Array.from({ length: 20 }, (_, i) => beat(`b${i}`, i * 9, i * 9 + 30, [`e${i}`], `step-${i}`));
    const sp = spec({ beats, elements: beats.map((b) => el(b.element_ids[0]!, { kind: "card", entrance: "pop" })) });
    expect(selectQaFrames(sp, 200).length).toBeLessThanOrEqual(MAX_QA_FRAMES);
  });
});

describe("countStarts", () => {
  it("без count в действии: второй бит числа (вход → счёт вместе с линией графика)", () => {
    const sp = spec({
      elements: [el("hero", { kind: "number", entrance: "count" }), el("chart", { kind: "chart", entrance: "draw" })],
      beats: [beat("hero-in", 20, 44, ["hero"], "hero-number-pop-in"), beat("chart", 30, 120, ["chart", "hero"], "chart-draw"), beat("hold", 120, 180, ["hero"], "hold")],
    });
    expect(countStarts(sp).map((b) => b.id)).toEqual(["chart"]);
    expect(selectQaFrames(sp)).toContain(30);
  });

  it("вход текста накрывает всё окно начала счёта — кадр начала счёта всё равно берётся (Test 1, прогон Task 17)", () => {
    const sp = spec({
      elements: [
        el("kicker", { entrance: "type" }),
        el("hero", { kind: "number", entrance: "pop" }),
        el("subtitle", { entrance: "blur" }),
        el("chart", { kind: "chart", entrance: "draw" }),
      ],
      beats: [
        beat("kicker-in", 0, 30, ["kicker"], "kicker-type-in"),
        beat("hero-in", 18, 42, ["hero"], "hero-number-pop-in"),
        beat("subtitle-in", 30, 54, ["subtitle"], "subtitle-blur-in"),
        beat("chart-draw", 38, 117, ["chart", "hero"], "chart-draw"),
        beat("hold", 117, 180, ["hero", "chart", "subtitle", "kicker"], "hold"),
      ],
    });
    expect(countStarts(sp).map((b) => b.id)).toEqual(["chart-draw"]);
    const f = selectQaFrames(sp);
    expect(f.some((x) => x >= 38 && x <= 46)).toBe(true);
  });

  it("формы слова count (hits-counting, countdown) — бит счёта, counter — нет (s3afix-rereview m5)", () => {
    for (const action of ["hits-counting", "countdown", "counts"]) {
      const sp = spec({
        elements: [el("hero", { kind: "number", entrance: "pop" })],
        beats: [beat("in", 0, 20, ["hero"], "hero-in"), beat("glow", 20, 40, ["hero"], "hero-glow"), beat("n", 40, 120, ["hero"], action), beat("hold", 120, 180, ["hero"], "hold")],
      });
      expect(countStarts(sp).map((b) => b.id), action).toEqual(["n"]);
    }
    const sp = spec({
      elements: [el("hero", { kind: "number", entrance: "pop" })],
      beats: [beat("in", 0, 20, ["hero"], "hero-in"), beat("glow", 20, 40, ["hero"], "hero-glow"), beat("n", 40, 120, ["hero"], "counter-shine"), beat("hold", 120, 180, ["hero"], "hold")],
    });
    expect(countStarts(sp).map((b) => b.id)).toEqual(["glow"]);
  });
});

