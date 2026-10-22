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
  it("тот же кадр без полноэкранного слоя в spec — clipping blocking (как раньше)", async () => {
    const plain = spec({ elements: [el("title", { kind: "text" })], beats: [beat("b-title", 0, 90, ["title"])] });
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: plain }));
    expect(clips(r)).toContainEqual(expect.objectContaining({ severity: "blocking" }));
  });
  it("слой ещё не вошёл (его бит позже кадра) — clipping blocking", async () => {
    const r = await programmaticChecks(await withFrames(tmp, [landscape()], { spec: sceneSpec(40) }));
    expect(clips(r).length).toBeGreaterThan(0);
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
