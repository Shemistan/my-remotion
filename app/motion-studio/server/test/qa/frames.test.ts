// Выбор QA-кадров по битам и элементам спецификации (без эвристики по словам действия).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MotionSpec } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { MAX_QA_FRAMES, MIN_QA_GAP, blankCheckFrom, selectQaFrames } from "../../src/pipeline/qa-frames.js";
import { directorOutput } from "../pipeline/helpers.js";
import { beat, el, spec } from "./helpers.js";

const gaps = (f: number[]) => f.slice(1).map((x, i) => x - f[i]!);

// биты [0,25],[20,125],[125,162]: вход заголовка, рост графика, удержание
const spec162 = spec({
  elements: [el("title", { kind: "text", entrance: "rise" }), el("chart", { kind: "chart", entrance: "draw" })],
  beats: [beat("b0", 0, 25, ["title"]), beat("b1", 20, 125, ["chart"], "chart-growth"), beat("b2", 125, 162, ["chart"], "hold")],
});

describe("selectQaFrames", () => {
  it("вход первого бита, середины, последний; 12 отброшен: шаг до 15 < MIN_QA_GAP", () => {
    expect(MAX_QA_FRAMES).toBe(8);
    expect(MIN_QA_GAP).toBe(10);
    expect(selectQaFrames(spec162)).toEqual([15, 72, 143, 161]);
  });

  it("spec 180 кадров: вход, середина акцента, середины; шаг ≥ 10", () => {
    const fr = selectQaFrames(directorOutput().spec);
    expect(fr).toEqual([15, 80, 140, 165, 179]);
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

  it("20 битов → не больше 8 кадров, шаг ≥ 10", () => {
    const beats = Array.from({ length: 20 }, (_, i) => beat(`b${i}`, i * 9, i * 9 + 9, [`e${i}`], `step-${i}`));
    const sp = spec({ beats, elements: beats.map((b) => el(b.element_ids[0]!, { kind: "card", entrance: "pop" })) });
    const fr = selectQaFrames(sp);
    expect(fr.length).toBeLessThanOrEqual(8);
    gaps(fr).forEach((g) => expect(g).toBeGreaterThanOrEqual(10));
  });

  it("короткая сцена: обязательные кадры остаются, даже если ближе MIN_QA_GAP", () => {
    const sp = spec({ elements: [el("t")], beats: [beat("b0", 0, 20, ["t"]), beat("b1", 10, 20, ["t"], "accent-flash")] });
    const fr = selectQaFrames(sp);
    expect(fr).toEqual([15, 19]);
  });

  it("кадры уникальны, по возрастанию и внутри сцены; durationFrames задаёт последний кадр", () => {
    const fr = selectQaFrames(spec162, 150);
    expect(fr.at(-1)).toBe(149);
    expect([...new Set(fr)].sort((a, b) => a - b)).toEqual(fr);
    expect(fr.every((f) => f >= 0 && f < 150)).toBe(true);
  });
});

describe("blankCheckFrom", () => {
  it("конец входа первого бита: min(end, start + 15)", () => {
    expect(blankCheckFrom(spec162)).toBe(15);
    expect(blankCheckFrom(spec({ beats: [beat("b0", 4, 12, ["a"])] }))).toBe(12);
  });
});

describe("selectQaFrames на spec реальных прогонов", () => {
  const load = (name: string): MotionSpec =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/specs/${name}`, import.meta.url)), "utf8"));
  it.each([
    // [spec, середина акцента, вход последнего появляющегося элемента min(end, start + 15)]
    ["test1-slice.json", 130, 67],
    ["test2-slice.json", 150, 27],
    ["test1-r1.json", 123, 49],
    ["test2-r1.json", 152, 55],
  ])("%s: середина акцента %i, вход %i и последний кадр — в кадрах; нет кадров внутри входа текста; шаг ≥ 10", (name, accentMid, entrance) => {
    const sp = load(name);
    const f = selectQaFrames(sp);
    expect(f).toContain(accentMid);
    expect(f).toContain(entrance);
    expect(f).toContain(sp.duration_frames - 1);
    expect(f.length).toBeLessThanOrEqual(MAX_QA_FRAMES);
    // ни одного кадра внутри анимации входа текстового элемента (заголовок наполовину вошёл)
    const kinds = new Map(sp.elements.map((e) => [e.id, e.kind]));
    const firstBeat = new Map<string, MotionSpec["beats"][number]>();
    for (const b of [...sp.beats].sort((a, c) => a.start_frame - c.start_frame)) {
      for (const id of b.element_ids) if (!firstBeat.has(id)) firstBeat.set(id, b);
    }
    for (const [id, b] of firstBeat) {
      if (kinds.get(id) !== "text") continue;
      const settle = Math.min(b.end_frame, b.start_frame + 15);
      expect(f.filter((x) => x > b.start_frame && x < settle), `${id} ${b.id}`).toEqual([]);
    }
    gaps(f).forEach((g) => expect(g).toBeGreaterThanOrEqual(10));
  });
});
