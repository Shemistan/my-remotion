// S4 «сценарий → моушн»: операции правки плана сценария (спека §5.3, §7) — новая ревизия,
// пересчёт цитаты, слов и кадров, проверки и разнообразие заново, ошибки диапазона.
import { type PlanIssue, ScriptPlanRevisionDocSchema, quoteOf, readingFrames } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { ScriptPlanError, applyScriptPlanOps } from "../../src/script/plan-ops.js";
import { PLAN as d1, SCRIPT as script, itemOf, w } from "./plan-ops-fixtures.js";

const codes = (issues: PlanIssue[]) => issues.map((i) => i.code);
const sty1 = { id: "sty_1", revision: 1 };

describe("applyScriptPlanOps", () => {
  it("set_status: следующая ревизия, parent_revision и ops; сцена снята", () => {
    const op = { op: "set_status", item_id: "ss_002", status: "rejected" } as const;
    const d2 = applyScriptPlanOps(d1, [op], script);
    expect(d2.revision).toBe(d1.revision + 1);
    expect(d2).toMatchObject({ plan_id: d1.plan_id, parent_revision: 1, ops: [op] });
    expect(d2.items.find((i) => i.id === "ss_002")!.status).toBe("rejected");
    expect(d2.diversity.techniques).toEqual({ "hero-number": 1, "bar-compare": 1 });
    expect(() => ScriptPlanRevisionDocSchema.parse(d2)).not.toThrow();
    expect(d1.items[1]!.status).toBe("accepted"); // исходный документ не тронут
  });

  it("add: сцена пользователя по порядку текста, следующий id, время по readingFrames", () => {
    const d3 = applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(30), end_word_id: w(41) }], script);
    expect(d3.items.map((i) => i.id)).toEqual(["ss_001", "ss_002", "ss_004", "ss_003"]);
    expect(d3.items[2]).toMatchObject({
      origin: "user", status: "accepted", block_id: "b1", words: 12,
      quote: quoteOf(script, w(30), w(41)), frames: readingFrames(12, d1.reading, d1.fps), at_s: 11.6,
    });
    // приём — не как у соседей (structure-build и bar-compare)
    expect(["structure-build", "bar-compare"]).not.toContain(d3.items[2]!.technique);
  });

  it("add: приём и назначение из запроса; добавленная к отклонённой сцене — не пересечение", () => {
    const off = applyScriptPlanOps(d1, [{ op: "set_status", item_id: "ss_002", status: "rejected" }], script);
    const d = applyScriptPlanOps(off, [{ op: "add", start_word_id: w(20), end_word_id: w(30), technique: "timeline", purpose: "даты" }], script);
    const x = d.items.find((i) => i.origin === "user")!;
    expect(x).toMatchObject({ id: "ss_004", technique: "timeline", pattern: "timeline", purpose: "даты" });
    expect(d.items.map((i) => i.id)).toEqual(["ss_001", "ss_002", "ss_004", "ss_003"]);
    // вернуть ss_002 нельзя: пересечётся с принятой ss_004
    expect(() => applyScriptPlanOps(d, [{ op: "set_status", item_id: "ss_002", status: "accepted" }], script)).toThrow(/overlap/);
  });

  it("ошибки: overlap, bad_range (порядок, другой блок, нет слова), unknown_item", () => {
    const err = (f: () => unknown): ScriptPlanError => {
      try {
        f();
      } catch (e) {
        expect(e).toBeInstanceOf(ScriptPlanError);
        return e as ScriptPlanError;
      }
      throw new Error("ошибки не было");
    };
    expect(() => applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(5), end_word_id: w(9) }], script)).toThrow(/overlap/);
    expect(err(() => applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(5), end_word_id: w(9) }], script))).toMatchObject({ status: 422, code: "overlap", extra: { item_id: "ss_001" } });
    expect(err(() => applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(41), end_word_id: w(30) }], script)).code).toBe("bad_range");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(59), end_word_id: w(62) }], script)).code).toBe("bad_range");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "add", start_word_id: w(59), end_word_id: w(999) }], script)).code).toBe("bad_range");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "set_status", item_id: "ss_099", status: "rejected" }], script)).code).toBe("unknown_item");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "modify", item_id: "ss_002", patch: { end_word_id: w(50) } }], script)).code).toBe("overlap");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "modify", item_id: "ss_002", patch: { key_terms: [{ text: "слово1", word_id: w(1) }] } }], script)).code).toBe("bad_range");
    expect(err(() => applyScriptPlanOps(d1, [{ op: "set_status", item_id: "ss_001", status: "accepted" }], script)).code).toBe("no_change");
  });

  it("set_reading: кадры всех сцен заново, отпечаток меняется (готовая сцена станет stale)", () => {
    const reading = { wps: 2, lead_s: 0.5, tail_s: 1 };
    const d4 = applyScriptPlanOps(d1, [{ op: "set_reading", reading }], script);
    expect(d4.reading).toEqual(reading);
    expect(d4.items[0]!.frames).toEqual(readingFrames(d1.items[0]!.words, reading, d1.fps));
    expect(d4.items[2]!.at_s).toBe(22); // 44 слова блока до сцены / 2
    expect(itemFingerprint(d4.items[0]!, sty1)).not.toBe(itemFingerprint(d1.items[0]!, sty1));
  });

  it("modify границ: цитата, слова, кадры, at_s; термины и числа вне фрагмента отпадают", () => {
    const base = applyScriptPlanOps(d1, [{
      op: "modify", item_id: "ss_002",
      patch: { key_terms: [{ text: "слово14", word_id: w(14) }, { text: "слово25", word_id: w(25) }] },
    }], script);
    const withData = { ...base, items: base.items.map((x) => x.id === "ss_002" ? { ...x, data: [{ label: "n", value: 14, quote: "слово14" }, { label: "m", value: 25, quote: "слово25" }] } : x) };
    const d = applyScriptPlanOps(withData, [{ op: "modify", item_id: "ss_002", patch: { start_word_id: w(20) } }], script);
    const x = d.items.find((i) => i.id === "ss_002")!;
    expect(x).toMatchObject({ start_word_id: w(20), end_word_id: w(26), words: 7, quote: quoteOf(script, w(20), w(26)), frames: readingFrames(7, d1.reading, d1.fps), at_s: 7.6 });
    expect(x.key_terms.map((k) => k.word_id)).toEqual([w(25)]);
    expect(x.data.map((k) => k.quote)).toEqual(["слово25"]);
    expect(itemFingerprint(x, sty1)).not.toBe(itemFingerprint(d1.items[1]!, sty1));
  });

  it("modify приёма: проверки разнообразия заново, structure_rule прежнего приёма снимается", () => {
    const withRule = { ...d1, items: d1.items.map((x) => x.id === "ss_002" ? { ...x, structure_rule: "assembly" as const } : x) };
    const d5 = applyScriptPlanOps(withRule, [{ op: "modify", item_id: "ss_002", patch: { technique: d1.items[0]!.technique } }], script);
    expect(codes(d5.issues)).toContain("adjacent_technique_repeat");
    expect(d5.diversity.adjacent_repeats).toBe(1);
    expect(d5.items[1]!.structure_rule).toBeUndefined();
    const d6 = applyScriptPlanOps(d1, [{ op: "modify", item_id: "ss_002", patch: { idea: "другая", purpose: "иное", pattern: "spatial" } }], script);
    expect(d6.items[1]).toMatchObject({ idea: "другая", purpose: "иное", pattern: "spatial" });
    expect(itemFingerprint(d6.items[1]!, sty1)).not.toBe(itemFingerprint(d1.items[1]!, sty1));
  });

  it("проверки длительности и числа заново: scene_too_long blocking, value_unverified, coverage", () => {
    const long = applyScriptPlanOps(d1, [
      { op: "set_status", item_id: "ss_001", status: "rejected" },
      { op: "set_status", item_id: "ss_002", status: "rejected" },
      { op: "modify", item_id: "ss_003", patch: { start_word_id: w(1), end_word_id: w(60) } },
    ], script);
    expect(long.issues).toContainEqual(expect.objectContaining({ item_id: "ss_003", code: "scene_too_long", severity: "blocking" }));
    const one = { ...d1, items: [itemOf("ss_001", 61, 70, "hero-number", { data: [{ label: "x", value: 7, quote: "кот" }] })] };
    const d = applyScriptPlanOps(one, [{ op: "modify", item_id: "ss_001", patch: { idea: "и2" } }], script);
    expect(d.issues).toContainEqual(expect.objectContaining({ item_id: "ss_001", code: "value_unverified", severity: "warning" }));
    expect(codes(d.issues)).toContain("coverage_low");
  });
});
