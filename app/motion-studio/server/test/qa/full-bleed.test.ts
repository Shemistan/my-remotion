// clipping и полноэкранный слой (S3-fix2): иллюстративные сцены user (02/04/06) ставят пейзаж
// и небо во весь кадр — правило clipping видело в них «объект у края». Исключение — явное:
// элемент spec с раскладкой на всю safe area (не текст и не число), уже вошедший к кадру.
// Обрезанный текст остаётся blocking и под таким слоем — его меряет проба раскладки.
import type { QAIssue } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fullBleedAt, programmaticChecks } from "../../src/qa/programmatic.js";
import { Canvas, H, W, beat, el, makeTmp, removeTmp, spec, withFrames } from "./helpers.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

const clips = (l: QAIssue[]) => l.filter((i) => i.code === "clipping");
/** Пейзаж во весь кадр: небо, холмы, солнце у правого края — края кадра в «чернилах». */
const landscape = () => new Canvas(W, H, "#f2c48d").rect(0, 0, W, 40, "#7fb4e0").rect(0, 70, W, H - 70, "#4f7a3a").rect(W - 20, 10, 20, 20, "#fff3a0");
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const sceneSpec = (bleedStart = 0, bleedLayout = FULL) =>
  spec({
    elements: [el("world", { kind: "group", role: "контекст: мир во весь кадр", layout: bleedLayout }), el("title", { kind: "text", layout: { x: 0.2, y: 0.4, w: 0.6, h: 0.2 } })],
    beats: [beat("b-world", bleedStart, 90, ["world"]), beat("b-title", 0, 90, ["title"])],
  });
/** Строка пробы раскладки кадра 25 с одним текстом `rect` (px композиции). */
const probe = (rect: { x: number; y: number; w: number; h: number }) =>
  `[log] [motion-kit:layout] ${JSON.stringify({ frame: 25, height: H, items: [{ id: "title", role: "text", text: "Журавлик летит", rect, fontPx: 24, opacity: 1 }], ghosts: [], holds: [] })}`;

describe("fullBleedAt: явный признак полноэкранного слоя", () => {
  it("раскладка на всю safe area, не текст, вошёл к кадру", () => {
    expect(fullBleedAt(sceneSpec(), 25)).toBe(true);
    expect(fullBleedAt(sceneSpec(40), 25)).toBe(false);
    expect(fullBleedAt(sceneSpec(0, { x: 0.05, y: 0, w: 0.9, h: 1 }), 25)).toBe(false);
    const textOnly = spec({ elements: [el("t", { kind: "text", layout: FULL })], beats: [beat("b", 0, 90, ["t"])] });
    expect(fullBleedAt(textOnly, 25)).toBe(false);
  });
});

describe("clipping под полноэкранным слоем", () => {
  it("пейзаж во весь кадр при вошедшем слое — не clipping", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: sceneSpec() }));
    expect(clips(r)).toEqual([]);
  });
  // S5: пейзаж, у которого слои мира занимают ≥ 40 % двух краёв и больше, — сцена-мир и без
  // признака в spec: пиксельная обрезка в ней — warning (текст меряет проба раскладки)
  it("тот же кадр без полноэкранного слоя в spec — clipping warning (сцена-мир по пикселям, S5)", async () => {
    const plain = spec({ elements: [el("title", { kind: "text" })], beats: [beat("b-title", 0, 90, ["title"])] });
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: plain }));
    expect(clips(r).length).toBeGreaterThan(0);
    expect(clips(r).every((i) => i.severity === "warning")).toBe(true);
  });
  it("слой ещё не вошёл (его бит позже кадра) — clipping меряется (warning: кадр — мир по пикселям)", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: sceneSpec(40) }));
    expect(clips(r).length).toBeGreaterThan(0);
  });
  it("S5: одна крупная плашка у одного края (не мир) — clipping blocking", async () => {
    const panel = new Canvas(W, H, "#101010").rect(W - 50, 20, 50, 60, "#e6e6eb");
    const plain = spec({ elements: [el("title", { kind: "text" })], beats: [beat("b-title", 0, 90, ["title"])] });
    const r = await programmaticChecks(await withFrames(tmp, [panel], { spec: plain }));
    expect(clips(r)).toContainEqual(expect.objectContaining({ severity: "blocking", area: "right" }));
  });
  it("текст за краем кадра — blocking и под полноэкранным слоем (проба раскладки)", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: sceneSpec(), logs: [probe({ x: W - 60, y: 50, w: 120, h: 20 })] }));
    expect(clips(r)).toContainEqual(expect.objectContaining({ severity: "blocking", area: "title" }));
  });
  it("текст внутри кадра — без замечаний", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: sceneSpec(), logs: [probe({ x: 40, y: 50, w: 100, h: 20 })] }));
    expect(clips(r)).toEqual([]);
  });
});

// Q12 (m1 S5-fix): кадр-мир по противоположным краям ловит и широкий объект данных — карточка
// или график во всю ширину, срезанные слева и справа. Пиксели их не отличают от полосы мира;
// отличает spec: видимый элемент данных (card, chart, graph, number) с раскладкой во всю ширину
// (высоту) — срез настоящего объекта, его clipping остаётся blocking.
describe("кадр-мир и широкий объект во всю ширину", () => {
  /** Светлая карточка 100 %×50 % на тёмном фоне, выходит за левый и правый край. */
  const wide = () => new Canvas(W, H, "#151820").rect(-10, H / 4, W + 20, H / 2, "#e6e6ea");
  const WIDE = { x: 0, y: 0.25, w: 1, h: 0.5 };
  const withEl = (kind: "card" | "chart" | "graph" | "group" | "shape", start = 0) =>
    spec({ elements: [el("wide", { kind, role: "основной объект", layout: WIDE })], beats: [beat("b-wide", start, 90, ["wide"])] });
  const lr = (l: QAIssue[]) => clips(l).map((i) => [i.area, i.severity]).sort();

  it.each(["card", "chart", "graph"] as const)("широкий %s 100 %×50 %, срезанный слева и справа, — clipping blocking", async (kind) => {
    const r = await programmaticChecks(await withFrames(tmp, [wide()], { spec: withEl(kind) }));
    expect(lr(r)).toEqual([["left", "blocking"], ["right", "blocking"]]);
  });
  it("тот же кадр, полоса — элемент фона (group/shape) — кадр-мир, warning", async () => {
    for (const kind of ["group", "shape"] as const) {
      const r = await programmaticChecks(await withFrames(tmp, [wide()], { spec: withEl(kind) }));
      expect(lr(r)).toEqual([["left", "warning"], ["right", "warning"]]);
    }
  });
  it("широкая карточка ещё не вошла (её бит позже кадра) — полоса на кадре не она, warning", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [wide()], { spec: withEl("card", 40) }));
    expect(lr(r)).toEqual([["left", "warning"], ["right", "warning"]]);
  });
  it("узкая карточка в spec не отменяет мир", async () => {
    const narrow = spec({ elements: [el("c", { kind: "card", layout: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } })], beats: [beat("b", 0, 90, ["c"])] });
    const r = await programmaticChecks(await withFrames(tmp, [wide()], { spec: narrow }));
    expect(lr(r)).toEqual([["left", "warning"], ["right", "warning"]]);
  });
  it("пейзаж у всех краёв рядом с широкой карточкой — мир по трём краям, warning", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: withEl("card") }));
    expect(clips(r).length).toBeGreaterThan(0);
    expect(clips(r).every((i) => i.severity === "warning")).toBe(true);
  });
});
