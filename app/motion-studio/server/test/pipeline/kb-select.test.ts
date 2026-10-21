// Кандидаты KB по запросу и ключам Concept — на реальной KB репозитория.
import { beforeAll, describe, expect, it } from "vitest";
import type { ConceptOutput } from "@ms/contracts";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { selectCandidates } from "../../src/pipeline/kb-select.js";
import { repoKnowledge, sourceRoot } from "../knowledge/helpers.js";
import { fakeKb, view } from "./helpers.js";

const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";
const conceptT2: Pick<ConceptOutput, "kb_queries" | "patterns"> = {
  patterns: ["system-structure", "relationships"],
  kb_queries: {
    ru: ["схема узлов со связями", "импульс по связи", "архитектура системы"],
    en: ["animated beam between nodes", "node graph", "architecture diagram"],
  },
};

let kb: KnowledgeAdapter;
beforeAll(async () => {
  kb = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot });
});

describe("selectCandidates (реальная KB)", () => {
  it("Test 2: среди кандидатов — magicui/animated-beam; не больше limit; только визуальные permissive", () => {
    const hits = selectCandidates(kb, TEST2, conceptT2);
    const ids = hits.map((h) => h.view.id);
    expect(ids).toContain("magicui/animated-beam");
    expect(hits.length).toBeLessThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of hits) {
      expect(h.view.license_class).toBe("permissive");
      expect(["native", "adaptable"]).toContain(h.view.compatibility_status);
      expect(h.view.kind).not.toBe("doc");
    }
  });
});

describe("selectCandidates (логика)", () => {
  it("объединяет поиски, дедуп по id с наибольшим score, паттерны концепции — с бонусом", () => {
    const a = view({ id: "x/a", patterns: ["timeline"] });
    const b = view({ id: "x/b", patterns: ["growth-decline"] });
    const calls: { query: string; filters: unknown }[] = [];
    const scores: Record<string, Record<string, number>> = { "рост": { "x/a": 3, "x/b": 1 }, "growth": { "x/b": 2 } };
    const src = {
      search(query: string, filters?: { patterns?: string[] }) {
        calls.push({ query, filters });
        return Object.entries(scores[query] ?? {})
          .filter(([id]) => !filters?.patterns || [a, b].find((v) => v.id === id)!.patterns.some((p) => filters.patterns!.includes(p)))
          .map(([id, score]) => ({ view: id === "x/a" ? a : b, score, matched: [] }));
      },
    };
    const hits = selectCandidates(src, "рост", { patterns: ["growth-decline"], kb_queries: { ru: ["рост"], en: ["growth"] } }, 5);
    expect(hits.map((h) => [h.view.id, h.score])).toEqual([["x/a", 3], ["x/b", 2.5]]);
    expect(calls.map((c) => c.query)).toEqual(["рост", "рост", "рост", "growth", "growth"]);
    expect(calls.filter((c) => (c.filters as { patterns?: string[] }).patterns).length).toBe(2);
  });

  it("allowRestricted доходит до поиска только по явному разрешению", () => {
    const k = fakeKb();
    selectCandidates(k, "q", { patterns: ["growth-decline"], kb_queries: { ru: ["r"], en: [] } });
    expect(k.searches.every((s) => !(s as { filters?: { allowRestricted?: boolean } }).filters?.allowRestricted)).toBe(true);
    selectCandidates(k, "q", { patterns: ["growth-decline"], kb_queries: { ru: ["r"], en: [] } }, 12, { allowRestricted: true });
    expect(k.searches.some((s) => (s as { filters?: { allowRestricted?: boolean } }).filters?.allowRestricted)).toBe(true);
  });
});
