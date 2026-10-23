// S5 п. 3: missing_element только по зрению, опровергнутый реестром раскладки, — warning.
// gen-cache (s3-6ef1f76): Visual QA не нашёл подпись, которую проба видела на кадре.
import type { VisualQAOutput } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import type { LayoutFrame } from "../../src/qa/layout.js";
import { reconcileMissing } from "../../src/qa/visual-agent.js";
import { beat, el, spec } from "./helpers.js";

const sp = spec({
  elements: [
    el("title", { role: "заголовок", content: { text: "Кэш отвечает за 2 мс" } }),
    el("hit-rate", { kind: "number", role: "герой", content: { value: 94, suffix: "%" } }),
    el("db", { kind: "card", role: "база", content: { label: "PostgreSQL" } }),
    el("glow", { kind: "shape", role: "акцент" }),
    el("latency", { kind: "number", role: "герой", content: { value: 2, unit: "мс" } }),
    el("year", { kind: "number", role: "год", content: { value: 42 } }),
  ],
  beats: [beat("b0", 0, 60, ["title", "db", "latency", "year"]), beat("b1", 60, 120, ["hit-rate", "glow"])],
});

const item = (text: string, id = "scene#0") => ({ id, role: "scene", text, rect: { x: 10, y: 10, w: 200, h: 40 }, fontPx: 40, opacity: 1 });
const frame = (f: number, items: ReturnType<typeof item>[]): LayoutFrame => ({ frame: f, height: 1080, items, ghosts: [] });

const missing = (id: string, frame?: number) => ({
  code: "missing_element", severity: "blocking" as const, area: id, ...(frame !== undefined ? { frame } : {}),
  description: `элемент ${id} не найден`, fix_hint: `построй ${id}`,
});
const out = (issues: VisualQAOutput["issues"], visual: VisualQAOutput["gate"]["visual"] = "fail"): VisualQAOutput => ({
  gate: { visual, semantic: "pass", style: "pass" },
  issues,
  checked_frames: [30, 90],
  ocr: [],
  elements_seen: [],
  scores: { overall: 6, hierarchy: 6, composition: 6, entrance: 6, choreography: 6, hold: 6, legibility: 6, meaning: 6 },
  score_notes: [],
});

describe("reconcileMissing: реестр раскладки опровергает зрение", () => {
  it("текст элемента виден в реестре на кадре его бита → warning; без других blocking visual fail → warn", () => {
    const r = reconcileMissing(out([missing("title")]), sp, [frame(30, [item("Кэш отвечает   за 2 мс")])], 120);
    expect(r.issues).toEqual([expect.objectContaining({ code: "missing_element", severity: "warning", area: "title" })]);
    expect(r.issues[0]!.description).toContain("реестр раскладки");
    expect(r.gate.visual).toBe("warn");
  });

  it("число: value + suffix в тексте пробы; подпись карточки — по content.label", () => {
    const r = reconcileMissing(out([missing("hit-rate"), missing("db")]), sp, [frame(30, [item("PostgreSQL")]), frame(90, [item("94%")])], 120);
    expect(r.issues.map((i) => i.severity)).toEqual(["warning", "warning"]);
  });

  it("id элемента в ключе владельца пробы (data-ms-id) тоже подтверждает", () => {
    const r = reconcileMissing(out([missing("db")]), sp, [frame(30, [item("БД", "label:db:0")])], 120);
    expect(r.issues[0]!.severity).toBe("warning");
  });

  it("текст виден только вне битов элемента — не опровергает: blocking остаётся", () => {
    const r = reconcileMissing(out([missing("title")]), sp, [frame(90, [item("Кэш отвечает за 2 мс")])], 120);
    expect(r.issues[0]!.severity).toBe("blocking");
    expect(r.gate.visual).toBe("fail");
  });

  it("элемент без текста (shape) реестр не видит — blocking остаётся; чужой blocking держит visual fail", () => {
    const overlap = { code: "overlap", severity: "blocking" as const, frame: 30, area: "заголовок", description: "наезд", fix_hint: "разведи" };
    const r = reconcileMissing(out([missing("glow"), missing("title"), overlap]), sp, [frame(30, [item("Кэш отвечает за 2 мс")]), frame(90, [item("94%")])], 120);
    expect(r.issues.map((i) => `${i.area}:${i.severity}`)).toEqual(["glow:blocking", "title:warning", "заголовок:blocking"]);
    expect(r.gate.visual).toBe("fail");
  });

  it("I4: число-герой {2, мс} не опровергается заголовком «Кэш отвечает за 2 мс» — blocking остаётся", () => {
    const r = reconcileMissing(out([missing("latency")]), sp, [frame(30, [item("Кэш отвечает за 2 мс")])], 120);
    expect(r.issues[0]!.severity).toBe("blocking");
    expect(r.gate.visual).toBe("fail");
  });

  it("I4: число — целым текстом элемента пробы: «2 мс» отдельным элементом подтверждает, «42» в «2042» — нет", () => {
    expect(reconcileMissing(out([missing("latency")]), sp, [frame(30, [item("2 мс")])], 120).issues[0]!.severity).toBe("warning");
    expect(reconcileMissing(out([missing("year")]), sp, [frame(30, [item("2042")])], 120).issues[0]!.severity).toBe("blocking");
    // единица сама по себе (подпись чужого числа) — не текст элемента
    expect(reconcileMissing(out([missing("latency")]), sp, [frame(30, [item("мс")])], 120).issues[0]!.severity).toBe("blocking");
  });

  it("I4: текст чужого элемента (владелец в пробе — другой id) не подтверждает", () => {
    const r = reconcileMissing(out([missing("title")]), sp, [frame(30, [item("Кэш отвечает за 2 мс", "label:db:0")])], 120);
    expect(r.issues[0]!.severity).toBe("blocking");
  });

  it("I4: элемент пробы вне кадра не подтверждает", () => {
    const off = { ...item("PostgreSQL"), rect: { x: 2500, y: 10, w: 200, h: 40 } };
    const r = reconcileMissing(out([missing("db")]), sp, [frame(30, [off])], 120, { width: 1920, height: 1080 });
    expect(r.issues[0]!.severity).toBe("blocking");
  });

  it("пустой реестр (старая проба, нет текста) — ответ без изменений", () => {
    const o = out([missing("title")]);
    expect(reconcileMissing(o, sp, [], 120)).toEqual(o);
  });
});
