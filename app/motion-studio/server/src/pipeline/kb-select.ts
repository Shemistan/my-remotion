// Кандидаты KB для Motion Director (04 §2): поиск по запросу пользователя и по ключам
// Concept (`kb_queries.ru/en`), в том числе внутри паттернов концепции. Фильтры адаптера по
// умолчанию: native/adaptable, только permissive, только визуальные записи.
import type { ConceptOutput } from "@ms/contracts";
import type { SearchHit } from "../knowledge/types.js";
import type { KnowledgeSource } from "./refs.js";

/** С запасом на каждый поиск: потом объединяется и обрезается до `limit`. */
const PER_QUERY = 3;
/** Совпадение с паттерном концепции поднимает запись: Director ищет приём под мысль. */
const PATTERN_BOOST = 1.25;

/**
 * Объединение `kb.search` по запросу и всем `kb_queries.ru/en` (каждый ключ — и без
 * фильтра, и в паттернах концепции); дедуп по `id` с наибольшим `score`, записи из
 * паттернов концепции — с бонусом. `allowRestricted` — только по явному разрешению.
 */
export function selectCandidates(
  kb: Pick<KnowledgeSource, "search">,
  prompt: string,
  concept: Pick<ConceptOutput, "kb_queries" | "patterns">,
  limit = 12,
  opts: { allowRestricted?: boolean } = {},
): SearchHit[] {
  const best = new Map<string, SearchHit>();
  const take = (hits: SearchHit[]) => {
    for (const h of hits) {
      const boosted = h.view.patterns.some((p) => (concept.patterns as string[]).includes(p)) ? { ...h, score: h.score * PATTERN_BOOST } : h;
      const prev = best.get(h.view.id);
      if (!prev || boosted.score > prev.score) best.set(h.view.id, boosted);
    }
  };
  const base = opts.allowRestricted ? { allowRestricted: true } : {};
  const per = limit * PER_QUERY;
  take(kb.search(prompt, base, per));
  for (const q of [...concept.kb_queries.ru, ...concept.kb_queries.en]) {
    take(kb.search(q, base, per));
    take(kb.search(q, { ...base, patterns: [...concept.patterns] }, per));
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.view.id < b.view.id ? -1 : 1)).slice(0, limit);
}
