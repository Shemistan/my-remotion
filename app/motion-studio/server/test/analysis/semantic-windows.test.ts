// Task 31: окна транскрипта для Semantic Director (3000 слов, перекрытие 300, до 6000 — одним
// окном) и объединение ответов окон: дубли якорей в перекрытии, главы на стыках — покрытие без
// пересечений, связи и сущности через окна.
import { describe, expect, it } from "vitest";
import { type SemanticAgentOutput, mapWords, buildTimeline } from "@ms/contracts";
import { validateSemantic } from "../../src/analysis/semantic-validate.js";
import { WINDOW_DEFAULTS, mergeWindows, ownedRanges, windowSpans, windowWords } from "../../src/analysis/semantic-windows.js";
import { F30 } from "../edit/helpers.js";
import { anchor, ch, id, manyWords, out } from "./semantic-helpers.js";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const defaults = WINDOW_DEFAULTS;

describe("windowWords", () => {
  it("7000 слов → три окна по 3000 с перекрытием 300; 500 и 6000 — одно окно", () => {
    expect(windowWords(range(7000), { maxWords: 6000, window: 3000, overlap: 300 }).map((x) => [x[0], x.at(-1)])).toEqual([[0, 2999], [2700, 5699], [5400, 6999]]);
    expect(windowWords(range(500), defaults)).toHaveLength(1);
    expect(windowWords(range(6000), defaults)).toHaveLength(1);
    expect(windowWords(range(6001), defaults).map((x) => [x[0], x.at(-1)])).toEqual([[0, 2999], [2700, 5699], [5400, 6000]]);
    expect(windowWords([], defaults)).toEqual([]);
  });

  it("хвост не длиннее перекрытия не становится отдельным окном (8401 слово → 3 окна, последнее до конца)", () => {
    expect(windowSpans(8401, defaults)).toEqual([{ start: 0, end: 3000 }, { start: 2700, end: 5700 }, { start: 5400, end: 8401 }]);
    expect(windowSpans(8701, defaults)).toHaveLength(4);
  });

  it("каждое слово — ровно в одном «своём» отрезке; граница — середина перекрытия", () => {
    const spans = windowSpans(7000, defaults);
    expect(ownedRanges(spans, 7000)).toEqual([{ from: 0, to: 2850 }, { from: 2850, to: 5550 }, { from: 5550, to: 7000 }]);
  });

  it("неверные параметры окна — ошибка", () => {
    expect(() => windowSpans(10, { maxWords: 6000, window: 300, overlap: 300 })).toThrow();
  });
});

describe("mergeWindows: 7000 слов, три окна", () => {
  const N = 7000;
  const words = manyWords(N);
  const visible = words.map((w) => ({ id: w.id }));
  const map = mapWords(buildTimeline(N * 400_000, [], F30), words);
  const spans = windowSpans(N, defaults); // [0,3000) [2700,5700) [5400,7000)
  const q = (s: number, e: number) => words.slice(s - 1, e).map((w) => w.text).join(" ");
  const A = (aid: string, s: number, e: number, kind: SemanticAgentOutput["anchors"][number]["kind"] = "thesis") => anchor(aid, id(s), id(e), q(s, e), { kind });

  // окно 1: главы 1–1000, 1001–2000, 2001–3000 (последняя обрезана концом окна)
  const w1 = out({
    chapters: [ch("c1", id(1), id(1000), "Вступление"), ch("c2", id(1001), id(2000), "Метод"), ch("c3", id(2001), id(3000), "Опыт")],
    // a1 — до стыка; a2 — в перекрытии (начало 2801 < 2851), его дубль даст окно 2; a3 — в перекрытии после середины (не своё)
    anchors: [A("a1", 10, 15), A("a2", 2801, 2805), A("a3", 2901, 2903, "number")],
    causal: [{ cause_anchor_id: "a1", effect_anchor_id: "a2" }],
    entities: [{ name: "Альфа", kind: "org", mention_word_ids: [id(20), id(2950)] }],
  });
  // окно 2 (2701–5700): глава «Опыт» продолжается с начала окна до 4000; граница 2860 — почти та же, что 2841 окна 3?
  const w2 = out({
    chapters: [ch("c1", id(2701), id(4000), "Опыт, продолжение"), ch("c2", id(4001), id(5700), "Результаты")],
    anchors: [A("a1", 2801, 2805), A("a2", 2901, 2903, "number"), A("a3", 4100, 4110), A("a4", 5600, 5605)],
    causal: [{ cause_anchor_id: "a2", effect_anchor_id: "a3" }, { cause_anchor_id: "a1", effect_anchor_id: "a4" }],
    entities: [{ name: "альфа", kind: "org", mention_word_ids: [id(2950), id(4200)] }],
  });
  // окно 3 (5401–7000): граница главы 5560 (после середины 5551) — своя, 5500 — чужая (до середины)
  const w3 = out({
    chapters: [ch("c1", id(5401), id(5499), "Результаты, хвост"), ch("c2", id(5500), id(5559), "Чужая граница"), ch("c3", id(5560), id(7000), "Выводы")],
    anchors: [A("a1", 5600, 5605), A("a2", 6990, 7000)],
    causal: [{ cause_anchor_id: "a1", effect_anchor_id: "a2" }],
  });
  const merged = mergeWindows([w1, w2, w3], spans, visible);

  it("главы покрывают все 7000 слов без пересечений; границы — из «своих» отрезков окон", () => {
    const t = merged.timeline;
    expect(t.chapters.map((c) => [c.start_word_id, c.end_word_id, c.title])).toEqual([
      [id(1), id(1000), "Вступление"], [id(1001), id(2000), "Метод"], [id(2001), id(4000), "Опыт"],
      [id(4001), id(5559), "Результаты"], [id(5560), id(7000), "Выводы"],
    ]);
    expect(t.chapters.map((c) => c.id)).toEqual(["ch_01", "ch_02", "ch_03", "ch_04", "ch_05"]);
    expect(validateSemantic(t, words, map).rejected).toEqual([]);
  });

  it("дубли якорей в перекрытии — один раз; id переназначены по порядку; связи переназначены через дубли", () => {
    const t = merged.timeline;
    expect(t.anchors.map((a) => [a.start_word_id, a.kind])).toEqual([
      [id(10), "thesis"], [id(2801), "thesis"], [id(2901), "number"], [id(4100), "thesis"], [id(5600), "thesis"], [id(6990), "thesis"],
    ]);
    expect(t.anchors.map((a) => a.id)).toEqual(["a_0001", "a_0002", "a_0003", "a_0004", "a_0005", "a_0006"]);
    const byStart = (n: number) => t.anchors.find((a) => a.start_word_id === id(n))!.id;
    expect(t.causal).toEqual([
      { cause_anchor_id: byStart(10), effect_anchor_id: byStart(2801) },
      { cause_anchor_id: byStart(2901), effect_anchor_id: byStart(4100) },
      { cause_anchor_id: byStart(2801), effect_anchor_id: byStart(5600) },
      { cause_anchor_id: byStart(5600), effect_anchor_id: byStart(6990) },
    ]);
  });

  it("сущности объединены по имени (без регистра), упоминания — без повторов, по порядку", () => {
    expect(merged.timeline.entities).toEqual([{ name: "Альфа", kind: "org", mention_word_ids: [id(20), id(2950), id(4200)] }]);
  });

  it("почти совпавшие границы глав соседних окон в перекрытии — одна граница (раннего окна)", () => {
    const a = out({ chapters: [ch("c1", id(1), id(2840)), ch("c2", id(2841), id(3000), "Б")] });
    const b = out({ chapters: [ch("c1", id(2701), id(2859)), ch("c2", id(2860), id(5700), "Б′")] });
    const c = out({ chapters: [ch("c1", id(5401), id(7000))] });
    const m = mergeWindows([a, b, c], spans, visible);
    expect(m.timeline.chapters.map((x) => [x.start_word_id, x.title])).toEqual([[id(1), "Глава c1"], [id(2841), "Б"]]);
    expect(m.dropped.boundaries).toBe(1);
  });

  it("одно окно — ответ как есть, только id переназначены", () => {
    const one = out({ chapters: [ch("x", id(1), id(10))], anchors: [A("z", 2, 3)] });
    const m = mergeWindows([one], [{ start: 0, end: 10 }], visible.slice(0, 10));
    expect(m.timeline.chapters).toEqual([{ ...ch("x", id(1), id(10)), id: "ch_01" }]);
    expect(m.timeline.anchors[0]!.id).toBe("a_0001");
  });

  it("окно без глав: первая глава начинается со слова 0 (граница окна 1 не потеряна), связь на якорь чужого отрезка без дубля — отброшена", () => {
    const a = out({ chapters: [ch("c1", id(1), id(3000))], anchors: [A("a1", 100, 101), A("a2", 2990, 2995)], causal: [{ cause_anchor_id: "a1", effect_anchor_id: "a2" }] });
    const m = mergeWindows([a, out(), out()], spans, visible);
    expect(m.timeline.chapters).toHaveLength(1);
    expect(m.timeline.chapters[0]).toMatchObject({ start_word_id: id(1), end_word_id: id(7000) });
    expect(m.timeline.anchors).toHaveLength(1);
    expect(m.timeline.causal).toEqual([]);
    expect(m.dropped.causal).toBe(1);
  });
});
