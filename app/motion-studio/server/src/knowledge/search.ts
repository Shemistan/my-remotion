import { stemEn, stemRu } from "./stem.js";
import { SYNONYMS } from "./synonyms.js";
import type { CapabilityView, CompatibilityStatus, SearchFilters, SearchHit } from "./types.js";

const MAX_STEM = 6;
const CYRILLIC = /[а-я]/;
// Короткие токены, которые значимы (иначе слова <3 символов отбрасываются).
const KNOWN_SHORT = new Set(["3d", "2d", "ai", "ui", "ux", "vr", "ar", "js", "ts"]);
// Служебные слова и императивы запроса: шум для поиска. Сравниваются в нормализованном виде.
const STOP_WORDS = [
  "для", "при", "что", "как", "это", "или", "над", "под", "без", "все", "его", "она", "они", "так", "уже", "про",
  "между", "через", "после", "перед", "если", "чтобы", "также", "три", "два", "одна", "один", "the", "and", "for",
  "with", "from", "создай", "сделай", "покажи", "нужно", "нужна", "надо", "хочу", "идет", "идёт", "анимацию",
  "анимация", "ролик", "видео", "сцена", "сцену", "плавный", "плавно", "красивый", "красиво", "премиальный",
  "премиальную", "добавь", "сделать", "показать", "создать", "make", "create", "show", "please", "год", "года", "годов", "лет",
];

/** Нормализация слова: стемминг, затем усечение до 6 (русские) — так сходятся и синонимы брифа. */
export function normalizeWord(raw: string): string {
  const w = raw.toLowerCase().replace(/ё/g, "е");
  if (!CYRILLIC.test(w)) return stemEn(w);
  const s = stemRu(w);
  return s.length > MAX_STEM ? s.slice(0, MAX_STEM) : s;
}

/** Синонимы брифа заданы префиксами («кинети»): берём как есть (усечённые) и в стеммированном виде. */
function synonymTokens(s: string): string[] {
  const w = s.toLowerCase().replace(/ё/g, "е");
  return [...new Set([w.length > MAX_STEM ? w.slice(0, MAX_STEM) : w, normalizeWord(w)])];
}

const STOP = new Set(STOP_WORDS.flatMap((w) => [w.toLowerCase().replace(/ё/g, "е"), normalizeWord(w)]));
const SYN = new Map(Object.entries(SYNONYMS).map(([k, v]) => [stemEn(k), v]));

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => (w.length >= 3 || KNOWN_SHORT.has(w)) && !/^\p{N}+$/u.test(w));
}

/** Токены текста для индекса. */
export function indexTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(text)) {
    const n = normalizeWord(w);
    if (!STOP.has(w) && !STOP.has(n)) out.add(n);
  }
  return out;
}

/** Токены запроса: нормализованные + синонимы для английских слов. */
export function tokenize(query: string): string[] {
  const out = new Set<string>();
  for (const w of words(query)) {
    const n = normalizeWord(w);
    if (STOP.has(w) || STOP.has(n)) continue;
    out.add(n);
    if (!CYRILLIC.test(w)) for (const s of SYN.get(stemEn(w)) ?? []) for (const t of synonymTokens(s)) out.add(t);
  }
  return [...out];
}

// Русские слова -> слаги паттернов knowledge/patterns/ (по стему).
const PATTERN_RULES: readonly (readonly [RegExp, string])[] = [
  [/^(рост|пад|снижен|увелич|уменьш|спад|упад)/, "growth-decline"],
  [/^(сравн|прот$|различ|отличи)/, "comparison"],
  [/^(хронол|таймлайн|период|эволюц)/, "timeline"],
  [/^(этап|шаг|последоват)/, "sequence-steps"],
  [/^(архитект|систем|структур)/, "system-structure"],
  [/^(причин|следств|потому)/, "cause-effect"],
  [/^(связ|отношен|взаимо)/, "relationships"],
  [/^(превращ|трансформ|преобраз)/, "transformation"],
  [/^(колич|процент|числ|цифр|дол$)/, "quantities"],
  [/^(карт$|географ|регион|локаци|маршрут)/, "spatial"],
  [/^(акцент|главн|выдел|подчерк)/, "key-point-emphasis"],
  [/^(абстракт|концепц|понят|философ)/, "abstract-concepts"],
];

/** Паттерны, на которые указывают слова запроса (и «история с годами» -> timeline). */
export function queryPatterns(query: string): string[] {
  const out = new Set<string>();
  for (const w of words(query)) {
    if (!CYRILLIC.test(w)) continue;
    const s = stemRu(w);
    for (const [re, slug] of PATTERN_RULES) if (re.test(s)) out.add(slug);
  }
  if ((query.match(/\b(19|20)\d{2}\b/g) ?? []).length >= 2) out.add("timeline");
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

export interface SearchIndex {
  docs: IndexedDoc[];
  df: Map<string, number>;
  patDf: Map<string, number>;
}

export function buildIndex(docs: IndexedDoc[]): SearchIndex {
  const df = new Map<string, number>();
  const patDf = new Map<string, number>();
  for (const d of docs) {
    const all = new Set([...d.name, ...d.visualizes, ...d.voiceover, ...d.useWhen, ...d.tags]);
    for (const t of all) df.set(t, (df.get(t) ?? 0) + 1);
    for (const p of new Set(d.view.patterns)) patDf.set(p, (patDf.get(p) ?? 0) + 1);
  }
  return { docs, df, patDf };
}

// Веса полей из брифа; поверх них — IDF (BM25), чтобы частые токены не доминировали.
const W = { name: 3, visualizes: 2, voiceover: 2, useWhen: 1, tags: 1 } as const;
const COMPAT_BOOST: Partial<Record<CompatibilityStatus, number>> = { native: 1.5, adaptable: 1.2 };
const DEFAULT_COMPAT: CompatibilityStatus[] = ["native", "adaptable"];

// Слова-«шум»: встречаются в запросах постоянно, но редко различают компоненты. Вклад режется.
const WEAK = new Set(["компан", "истор", "клиент", "пользо", "анимац", "премиа"]);
const WEAK_FACTOR = 0.3;

const idf = (n: number, df: number): number => Math.log(1 + (n - df + 0.5) / (df + 0.5));

export function searchDocs(index: SearchIndex, query: string, filters: SearchFilters = {}, limit = 20): SearchHit[] {
  const tokens = tokenize(query);
  const pats = queryPatterns(query);
  if (tokens.length === 0 && pats.length === 0) return [];
  const n = index.docs.length;
  const compat = new Set(filters.compat ?? DEFAULT_COMPAT);
  const hits: SearchHit[] = [];
  for (const d of index.docs) {
    const v = d.view;
    if (!compat.has(v.compatibility_status)) continue;
    if (!filters.allowRestricted && v.license_class !== "permissive") continue;
    if (filters.kinds && !filters.kinds.includes(v.kind)) continue;
    if (filters.patterns && !filters.patterns.some((p) => v.patterns.includes(p))) continue;
    let score = 0;
    const matched: string[] = [];
    for (const t of tokens) {
      const w =
        (d.name.has(t) ? W.name : 0) +
        (d.visualizes.has(t) ? W.visualizes : 0) +
        (d.voiceover.has(t) ? W.voiceover : 0) +
        (d.useWhen.has(t) ? W.useWhen : 0) +
        (d.tags.has(t) ? W.tags : 0);
      if (w > 0) {
        score += w * idf(n, index.df.get(t) ?? 0) * (WEAK.has(t) ? WEAK_FACTOR : 1);
        matched.push(t);
      }
    }
    for (const p of pats) {
      if (v.patterns.includes(p)) {
        score += W.tags * idf(n, index.patDf.get(p) ?? 0);
        matched.push(`pattern:${p}`);
      }
    }
    if (score === 0) continue;
    hits.push({ view: v, score: score * (COMPAT_BOOST[v.compatibility_status] ?? 1), matched });
  }
  hits.sort((a, b) => b.score - a.score || (a.view.id < b.view.id ? -1 : 1));
  return hits.slice(0, limit);
}
