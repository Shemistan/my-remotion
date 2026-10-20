import { SYNONYMS } from "./synonyms.js";
import type { CapabilityView, CompatibilityStatus, SearchFilters, SearchHit } from "./types.js";

const MAX_RU = 6;
const CYRILLIC = /[а-я]/;
// Служебные слова, которые только шумят в поиске.
const STOP = new Set([
  "для", "при", "что", "как", "это", "или", "над", "под", "без", "все", "его", "она", "они", "так", "уже",
  "про", "между", "через", "после", "перед", "если", "чтобы", "также", "the", "and", "for", "with", "from",
  "три", "два", "одна", "один",
]);

function norm(raw: string): string {
  const t = raw.toLowerCase().replace(/ё/g, "е");
  return CYRILLIC.test(t) && t.length > MAX_RU ? t.slice(0, MAX_RU) : t;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/^\p{N}+$/u.test(w) && !STOP.has(w));
}

/** Токены текста для индекса: нормализованные, без чисел и стоп-слов. */
export function indexTokens(text: string): Set<string> {
  return new Set(words(text).map(norm));
}

/** Токены запроса: нормализованные + синонимы для английских слов. */
export function tokenize(query: string): string[] {
  const out = new Set<string>();
  for (const w of words(query)) {
    out.add(norm(w));
    for (const s of SYNONYMS[w] ?? []) out.add(norm(s));
  }
  return [...out];
}

export interface IndexedDoc {
  view: CapabilityView;
  name: Set<string>;
  visualizes: Set<string>;
  voiceover: Set<string>;
  useWhen: Set<string>;
  tags: Set<string>;
}

const W = { name: 3, visualizes: 2, voiceover: 2, useWhen: 1, tags: 1 } as const;
const COMPAT_BOOST: Partial<Record<CompatibilityStatus, number>> = { native: 1.5, adaptable: 1.2 };
const DEFAULT_COMPAT: CompatibilityStatus[] = ["native", "adaptable"];

export function searchDocs(docs: IndexedDoc[], query: string, filters: SearchFilters = {}, limit = 20): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const compat = new Set(filters.compat ?? DEFAULT_COMPAT);
  const hits: SearchHit[] = [];
  for (const d of docs) {
    const v = d.view;
    if (!compat.has(v.compatibility_status)) continue;
    if (!filters.allowRestricted && v.license_class !== "permissive") continue;
    if (filters.kinds && !filters.kinds.includes(v.kind)) continue;
    if (filters.patterns && !filters.patterns.some((p) => v.patterns.includes(p))) continue;
    let score = 0;
    const matched: string[] = [];
    for (const t of tokens) {
      const s =
        (d.name.has(t) ? W.name : 0) +
        (d.visualizes.has(t) ? W.visualizes : 0) +
        (d.voiceover.has(t) ? W.voiceover : 0) +
        (d.useWhen.has(t) ? W.useWhen : 0) +
        (d.tags.has(t) ? W.tags : 0);
      if (s > 0) {
        score += s;
        matched.push(t);
      }
    }
    if (score === 0) continue;
    hits.push({ view: v, score: score * (COMPAT_BOOST[v.compatibility_status] ?? 1), matched });
  }
  hits.sort((a, b) => b.score - a.score || (a.view.id < b.view.id ? -1 : 1));
  return hits.slice(0, limit);
}
