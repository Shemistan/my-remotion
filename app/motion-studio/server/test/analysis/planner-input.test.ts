// Task 32: вход Visual Planner — якоря смысла с примерным временем (ориентир), лицо и свободные
// зоны в момент якоря (занятость по окнам времени, `occupancyForRange`), паттерны, предел покрытия.
import { describe, expect, it } from "vitest";
import { PATTERN_SLUGS, type SemanticTimeline } from "@ms/contracts";
import { occupiedAt, plannerInput } from "../../src/analysis/planner-input.js";
import { FACE, P, footage, id, quote59, shot, textOf, tl, win, words } from "./plan-helpers.js";

const sem = (anchors: SemanticTimeline["anchors"]): SemanticTimeline => ({
  schema_version: 1, id: "sem_1", transcript_ref: { id: "trn_1", revision: 1 }, edl_ref: { id: "edl_1", revision: 1 },
  chapters: [{ id: "ch_01", title: "Итоги года", summary: "", start_word_id: id(4), end_word_id: id(20) }],
  anchors, entities: [], numbers: [{ value: 40, unit: "%", start_word_id: id(8), end_word_id: id(8), quote: "40%", claim_type: "fact" }], causal: [], disputed: [],
});
const a = (aid: string, s: number, e: number) => ({ id: aid, kind: "number" as const, start_word_id: id(s), end_word_id: id(e), quote: textOf(s, e), claim_type: "fact" as const, importance: 3, emphasis_word_ids: [] });
const style = { base: { preset: "dark-premium" as const, intensity: "balanced" as const, depth: 1 }, author: "agent" as const };

describe("occupiedAt", () => {
  const hands = { x: 0.05, y: 0.55, w: 0.9, h: 0.45 };
  const f = footage(FACE, { windows: [win(0, 6_000_000, [FACE, hands]), win(6_000_000, 12_000_000, [FACE])] });
  it("занятость — объединение окон, пересекающих диапазон, а не худший случай шота", () => {
    expect(occupiedAt(f, { start_us: 7_000_000, end_us: 9_000_000 })).toEqual([FACE]);
    expect(occupiedAt(f, { start_us: 5_000_000, end_us: 7_000_000 })).toEqual([FACE, hands]);
  });
  it("окон нет — занятость шота; шоты вне диапазона не участвуют", () => {
    const two = { ...f, shots: [shot(FACE, { end_us: 6_000_000 }), shot(undefined, { start_us: 6_000_000, id: "shot_002" })] };
    expect(occupiedAt(two, { start_us: 7_000_000, end_us: 8_000_000 })).toEqual([]);
    expect(occupiedAt(two, { start_us: 1_000_000, end_us: 2_000_000 })).toEqual([FACE]);
  });
});

describe("plannerInput", () => {
  const f = footage(FACE);
  const i = plannerInput(sem([a("a_0001", 5, 9), a("a_0002", 2, 3)]), f, tl, words, style, { maxCoverage: P.maxCoverage, frame: { width: 1920, height: 1080 } });

  it("якоря: только слышимые; цитата, слова, примерное edited-время в секундах (0,1 с)", () => {
    expect(i.anchors).toEqual([{ id: "a_0001", kind: "number", quote: quote59, start_word_id: id(5), end_word_id: id(9), edited_s: [2.5, 4.5], importance: 3, claim_type: "fact" }]);
  });

  it("лицо и свободные зоны в момент якоря; лицо справа", () => {
    const at = i.footage_at_anchor.a_0001!;
    expect(at.face_zone).toBe("right");
    expect(at.free_zones.find((z) => z.zone === "left_third")!.free_ratio).toBe(1);
    expect(at.free_zones.find((z) => z.zone === "right_third")!.free_ratio).toBeLessThan(0.9);
  });

  it("паттерны KB (12, с описанием), предел покрытия, длительность, кадр, оставленные слова без вырезанных", () => {
    expect(i.patterns.map((p) => p.slug)).toEqual([...PATTERN_SLUGS]);
    expect(i.patterns.every((p) => p.summary.length > 10)).toBe(true);
    expect(i.budget).toEqual({ max_coverage: 0.4, edited_duration_s: 10.5 });
    expect(i.frame).toEqual({ orientation: "landscape", author_position: "right" });
    expect(i.words.map((w) => w.id)).not.toContain(id(3));
    expect(i.words[0]).toEqual({ id: id(4), text: "ну" });
    expect(i.numbers).toEqual([{ value: 40, unit: "%", quote: "40%", start_word_id: id(8), end_word_id: id(8) }]);
    expect(i.chapters).toEqual([{ id: "ch_01", title: "Итоги года", start_word_id: id(4), end_word_id: id(20) }]);
    expect(i.style).toEqual({ preset: "dark-premium", intensity: "balanced", depth: 1, locked: false });
  });

  it("вертикальный кадр и лицо не найдено", () => {
    const v = plannerInput(sem([a("a_0001", 5, 9)]), footage(undefined), tl, words, undefined, { maxCoverage: 0.3, frame: { width: 1080, height: 1920 } });
    expect(v.frame.orientation).toBe("portrait");
    expect(v.footage_at_anchor.a_0001!.face_zone).toBe("absent");
    expect(v.style).toBeUndefined();
  });
});
