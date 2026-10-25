// S16a F9: смысловые повторы в плане (`meaning_repeat`): сцены 12 и 18 плана приёмки S12 обе
// показывают «оба массива бакетов в памяти» — разными приёмами, поэтому разнообразие их не ловит.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { type ScriptSceneItem, ScriptPlanRevisionDocSchema } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { meaningRepeats, stemsOf } from "../../src/script/meaning-repeat.js";
import { planIssues } from "../../src/script/plan-validate.js";
import { DOC, docOf } from "./plan-fixtures.js";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const accepted = ScriptPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(REPO, "docs/evidence/script-mvp/acceptance/plan-final.json"), "utf8")));

const item = (id: string, over: Partial<ScriptSceneItem>): ScriptSceneItem => ({
  ...accepted.items.find((x) => x.id === "ss_011")!, id, key_terms: [], data: [], idea: "", purpose: "", ...over,
});

describe("meaningRepeats", () => {
  it("план приёмки: сцены 12 и 18 («оба массива в памяти») — повтор смысла", () => {
    const pairs = meaningRepeats(accepted.items).map((p) => [p.a, p.b]);
    expect(pairs).toContainEqual(["ss_012", "ss_018"]);
    // не шумит: из 23 сцен — единицы пар
    expect(pairs.length).toBeLessThanOrEqual(3);
  });

  it("issue: warning у поздней сцены с подсказкой, кто повторяется", () => {
    const issues = planIssues(accepted.items, docOf([{ title: "", text: "раз" }]), accepted.reading, accepted.fps).issues.filter((x) => x.code === "meaning_repeat");
    const i = issues.find((x) => x.item_id === "ss_018");
    expect(i).toMatchObject({ severity: "warning" });
    expect(i!.message).toMatch(/ss_012/);
    expect(i!.message).toMatch(/оба массива/);
  });

  it("почти одинаковая идея (Jaccard основ ≥ 0,5) — повтор, даже без общих терминов", () => {
    const a = item("ss_001", { idea: "Два массива бакетов стоят рядом в памяти, оба подсвечены" });
    const b = item("ss_002", { idea: "Оба массива бакетов стоят рядом в памяти и подсвечены" });
    const c = item("ss_003", { idea: "Счётчик процессоров Google растёт до одного процента" });
    expect(meaningRepeats([a, b, c]).map((p) => [p.a, p.b])).toEqual([["ss_001", "ss_002"]]);
  });

  it("общие термины и числа ≥ 60 % в обе стороны; один общий термин — не повтор", () => {
    const t = (text: string) => ({ text, word_id: "w_000001" });
    const a = item("ss_001", { quote: "дважды восемь слотов в группе", key_terms: [t("слоты"), t("группа")], data: [{ label: "слотов", value: 8, quote: "восемь" }] });
    const b = item("ss_002", { quote: "группа из восьми слотов", key_terms: [t("слотов"), t("группы")], data: [{ label: "слоты", value: 8, quote: "восьми" }] });
    const c = item("ss_003", { quote: "слоты и хэш", key_terms: [t("хэш"), t("ключ"), t("tophash")] });
    expect(meaningRepeats([a, b, c]).map((p) => [p.a, p.b])).toEqual([["ss_001", "ss_002"]]);
  });

  it("снятые сцены не сравниваются", () => {
    const a = item("ss_001", { idea: "Два массива бакетов стоят рядом в памяти" });
    const b = item("ss_002", { idea: "Два массива бакетов стоят рядом в памяти", status: "rejected" });
    expect(meaningRepeats([a, b])).toEqual([]);
  });

  it("основы слов: регистр, ё, знаки, окончания", () => {
    expect(stemsOf("Массивы, массивов; ПАМЯТЬ — памяти, ещё")).toEqual(["массив", "массив", "памят", "памят"]);
    expect(stemsOf("overflow-бакеты, бакетов")).toEqual(["overfl", "бакет", "бакет"]);
  });
});

// фикстура плана не мешает: в обычном плане без повторов issue нет
describe("planIssues", () => {
  it("без повторов — без meaning_repeat", () => {
    expect(planIssues([], DOC, accepted.reading, accepted.fps).issues.map((x) => x.code)).not.toContain("meaning_repeat");
  });
});
