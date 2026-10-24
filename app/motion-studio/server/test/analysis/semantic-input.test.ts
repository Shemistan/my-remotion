// Task 31: вход Semantic Director — только оставленные слова (kept/clipped), id и текст,
// время в секундах только для ориентира; сегменты без вырезанных слов.
import { describe, expect, it } from "vitest";
import { buildTimeline, mapWords } from "@ms/contracts";
import { semanticInput } from "../../src/analysis/semantic-input.js";
import { F30, w } from "../edit/helpers.js";
import { id, tl10, words10 } from "./semantic-helpers.js";

const segs = [
  { id: "seg_0001", word_ids: [id(1), id(2), id(3), id(4)] },
  { id: "seg_0002", word_ids: [id(5), id(6), id(7), id(8), id(9), id(10)] },
];

describe("semanticInput", () => {
  it("вырезанное целиком слово исключено, частично вырезанное — остаётся; removed — число исключённых", () => {
    const inp = semanticInput(words10, segs, tl10);
    expect(inp.words.map((x) => x.id)).not.toContain(id(3));
    expect(inp.words.map((x) => x.id)).toContain(id(4)); // clipped
    expect(inp.removed).toBe(1);
    expect(inp.words).toHaveLength(9);
    expect(inp.segments).toEqual([
      { id: "seg_0001", word_ids: [id(1), id(2), id(4)] },
      { id: "seg_0002", word_ids: [id(5), id(6), id(7), id(8), id(9), id(10)] },
    ]);
  });

  it("время — edited, секунды с одним знаком (ориентир): после вырезки 1,5 с слово 6 (5,0 с) → 3,5 с", () => {
    const inp = semanticInput(words10, segs, tl10);
    const byId = Object.fromEntries(inp.words.map((x) => [x.id, x]));
    expect(byId[id(1)]!.edited_s).toBe(0);
    expect(byId[id(6)]!.edited_s).toBe(3.5);
    expect(byId[id(4)]!.edited_s).toBe(2); // начало оставленной части
    for (const x of inp.words) expect(Object.keys(x).sort()).toEqual(["edited_s", "id", "text"]);
  });

  it("всё вырезано — пустой вход; сегмент без оставленных слов отбрасывается", () => {
    const all = buildTimeline(10_000_000, [{ start_us: 0, end_us: 10_000_000 }], F30);
    const inp = semanticInput(words10, segs, all);
    expect(inp.words).toEqual([]);
    expect(inp.segments).toEqual([]);
    expect(inp.removed).toBe(10);
  });

  it("пустой транскрипт — пустой вход", () => {
    expect(semanticInput([], [], tl10)).toEqual({ words: [], segments: [], removed: 0 });
  });

  it("слово вне сегментов не теряется: попадает в сегмент seg_rest", () => {
    const ws = [w(id(1), "один", 0, 300_000), w(id(2), "два", 400_000, 700_000)];
    const inp = semanticInput(ws, [{ id: "seg_0001", word_ids: [id(1)] }], buildTimeline(1_000_000, [], F30));
    expect(inp.words.map((x) => x.id)).toEqual([id(1), id(2)]);
    expect(inp.segments.at(-1)).toEqual({ id: "seg_rest", word_ids: [id(2)] });
    expect(mapWords(buildTimeline(1_000_000, [], F30), ws)[id(2)]!.state).toBe("kept");
  });
});
