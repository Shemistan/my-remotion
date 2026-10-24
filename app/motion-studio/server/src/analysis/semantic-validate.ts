// Проверка ответа Semantic Director кодом (Task 31). Агент видит только оставленные монтажом
// слова (`semanticInput`) и отвечает парами id слов с дословными цитатами; код проверяет каждое
// предложение и отклоняет не прошедшее с кодом — ничего не «чинит».
//
// Правила якоря (и числа) — общая функция `checkHeardRange` (@ms/contracts, ревью I1): цитата —
// то, что слышит зритель (оставленные слова диапазона); граничное слово вырезано или цитата
// опирается на вырезанное → `anchor_in_cut`; id нет → `unknown_word`; порядок → `order`; иначе
// `quote_mismatch`. Тем же правилом пользуются план (`buildPlanItems`) и его перепроверка (Task 32).
// - `emphasis_word_ids` — оставленные слова внутри диапазона, иначе `emphasis_out_of_range`;
// - `value` числа сверяется с цифрами цитаты (`numberMatchesQuote`, ревью m3): не совпало →
//   `value_mismatch`; цитата без цифр (словесное число) — сверка пропускается.
// Главы (ревью m2): задаются НАЧАЛАМИ — глава тянется до начала следующей (так их объединяет
// `mergeWindows`), `end_word_id` агента проверяется как диапазон, но границей не служит. Пропуск
// слов перед главой отдан предыдущей главе (первой — сама глава растягивается к началу), после
// последней — последней: глава принята, в `rejected` пометка `chapter_extended` с id растянутой
// главы. Глав нет вовсе — `chapter_gap`; пересечение — `chapter_overlap` (отклоняется поздняя).
// Связи — только между принятыми якорями (`unknown_anchor`). Сущности — упоминания на оставленных словах.
import {
  type SemanticAgentOutput, type SemanticRejected, type TranscriptWord, type WordMapping, checkHeardRange,
} from "@ms/contracts";

export interface SemanticValidation {
  timeline: SemanticAgentOutput;
  rejected: SemanticRejected[];
}

type Code = SemanticRejected["code"];

/**
 * `words` — слова транскрипта по порядку (весь или кусок окна, вместе с вырезанными), `wordMap` —
 * `mapWords(tl, words)` текущего EDL. Слово без записи в `wordMap` считается вырезанным.
 */
export function validateSemantic(out: SemanticAgentOutput, words: Pick<TranscriptWord, "id" | "text">[], wordMap: Record<string, WordMapping | undefined>): SemanticValidation {
  const pos = new Map(words.map((w, i) => [w.id, i]));
  const kept = (i: number) => {
    const s = wordMap[words[i]!.id]?.state;
    return s === "kept" || s === "clipped";
  };
  // номер оставленного слова (для покрытия глав): вырезанные между главами — не пропуск
  const keptIdx: number[] = [];
  let nk = 0;
  for (let i = 0; i < words.length; i++) keptIdx.push(kept(i) ? nk++ : -1);
  const rejected: SemanticRejected[] = [];
  const reject = (kind: SemanticRejected["kind"], id: string | undefined, code: Code, detail: string) => {
    rejected.push({ kind, ...(id !== undefined ? { id } : {}), code, detail });
  };

  /** Диапазон (и цитата) по правилу «то, что слышит зритель»: индексы во `words` или код отказа. */
  const span = (st: string, e: string, quote?: string): { si: number; ei: number } | { code: Code; detail: string } => {
    const r = checkHeardRange(words, wordMap, st, e, quote);
    if (!r.ok) return { code: r.code, detail: quote === undefined ? r.message : `${r.message}: «${clip(quote)}»` };
    return { si: pos.get(st)!, ei: pos.get(e)! };
  };

  // главы: каждая отдельно, затем покрытие оставленных слов
  const chapters: { c: SemanticAgentOutput["chapters"][number]; a: number; b: number }[] = [];
  for (const c of out.chapters) {
    const r = span(c.start_word_id, c.end_word_id);
    if ("code" in r) reject("chapter", c.id, r.code, r.detail);
    else chapters.push({ c, a: keptIdx[r.si]!, b: keptIdx[r.ei]! });
  }
  chapters.sort((x, y) => x.a - y.a || x.b - y.b);
  const okChapters: typeof chapters = [];
  let covered = -1; // последний покрытый номер оставленного слова
  for (const x of chapters) {
    if (x.a <= covered) {
      reject("chapter", x.c.id, "chapter_overlap", `глава ${x.c.id} пересекается с предыдущей`);
      continue;
    }
    if (x.a > covered + 1) {
      const prev = okChapters.at(-1)?.c.id;
      const gap = x.a - covered - 1;
      if (prev) reject("chapter", prev, "chapter_extended", `перед главой ${x.c.id} не покрыто слов: ${gap} — отданы главе ${prev} (граница — начало следующей главы)`);
      else reject("chapter", x.c.id, "chapter_extended", `до главы ${x.c.id} не покрыто слов: ${gap} — глава растянута к началу`);
    }
    okChapters.push(x);
    covered = x.b;
  }
  if (nk > 0 && covered < nk - 1) {
    const last = okChapters.at(-1)?.c.id;
    if (last) reject("chapter", last, "chapter_extended", `после главы ${last} не покрыто слов: ${nk - 1 - covered} — глава растянута до конца`);
    else reject("chapter", undefined, "chapter_gap", "глав нет: слова не покрыты");
  }

  const anchors: SemanticAgentOutput["anchors"] = [];
  for (const a of out.anchors) {
    const r = span(a.start_word_id, a.end_word_id, a.quote);
    if ("code" in r) {
      reject("anchor", a.id, r.code, r.detail);
      continue;
    }
    const bad = a.emphasis_word_ids.find((x) => {
      const i = pos.get(x);
      return i === undefined || i < r.si || i > r.ei || !kept(i);
    });
    if (bad !== undefined) {
      reject("anchor", a.id, "emphasis_out_of_range", `акцент ${bad} вне оставленных слов якоря ${a.start_word_id}…${a.end_word_id}`);
      continue;
    }
    anchors.push(a);
  }

  const numbers: SemanticAgentOutput["numbers"] = [];
  for (const n of out.numbers) {
    const r = span(n.start_word_id, n.end_word_id, n.quote);
    const label = `${n.value}${n.unit ? ` ${n.unit}` : ""}`;
    if ("code" in r) reject("number", undefined, r.code, `${label}: ${r.detail}`);
    else if (numberMatchesQuote(n.value, n.quote) === false) reject("number", undefined, "value_mismatch", `значение ${n.value} не совпадает с цифрами цитаты «${clip(n.quote)}»`);
    else numbers.push(n);
  }

  const entities: SemanticAgentOutput["entities"] = [];
  for (const e of out.entities) {
    const unknown = e.mention_word_ids.find((x) => !pos.has(x));
    const cut = e.mention_word_ids.find((x) => pos.has(x) && !kept(pos.get(x)!));
    if (unknown !== undefined) reject("entity", e.name, "unknown_word", `нет слова ${unknown}`);
    else if (cut !== undefined) reject("entity", e.name, "anchor_in_cut", `упоминание ${cut} вырезано монтажом`);
    else entities.push(e);
  }

  const ids = new Set(anchors.map((a) => a.id));
  const causal: SemanticAgentOutput["causal"] = [];
  for (const c of out.causal) {
    const miss = [c.cause_anchor_id, c.effect_anchor_id].find((x) => !ids.has(x));
    if (miss !== undefined) reject("causal", `${c.cause_anchor_id}→${c.effect_anchor_id}`, "unknown_anchor", `якорь ${miss} не принят`);
    else causal.push(c);
  }

  const disputed: SemanticAgentOutput["disputed"] = [];
  for (const d of out.disputed) {
    const r = span(d.start_word_id, d.end_word_id);
    if ("code" in r) reject("disputed", undefined, r.code, r.detail);
    else disputed.push(d);
  }

  return { timeline: { chapters: okChapters.map((x) => x.c), anchors, entities, numbers, causal, disputed }, rejected };
}

const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);

const MULTIPLIERS: [RegExp, number][] = [[/тыс/, 1e3], [/млн|миллион/, 1e6], [/млрд|миллиард/, 1e9]];

/**
 * Совпадает ли `value` числа с цифрами цитаты (ревью m3). Цитата без цифр (словесное число:
 * «полгода», «миллион») — `undefined`, сверка пропускается. Чтения цифр: разряды через пробел
 * («1 000 000» — и целиком, и по группам: «2 300» неоднозначно), дробь через запятую или точку
 * («3,5»); множители — только если они есть в цитате словом («тыс», «млн», «млрд») или знаком
 * «%» (`value` = доля: 5% → 0,05). Знак сравнивается по модулю: «упал на 3» → -3 — смысл из слов.
 */
export function numberMatchesQuote(value: number, quote: string): boolean | undefined {
  const q = quote.normalize("NFC").replace(/[\u00a0\u202f]/g, " ").toLowerCase();
  if (!/\d/.test(q)) return undefined;
  const parse = (t: string) => Number(t.replace(/ /g, "").replace(",", "."));
  const cands = new Set<number>();
  for (const m of q.matchAll(/\d+(?: \d{3})*(?:[.,]\d+)?/g)) cands.add(parse(m[0]));
  for (const m of q.matchAll(/\d+(?:[.,]\d+)?/g)) cands.add(parse(m[0]));
  const mults = [1, ...MULTIPLIERS.filter(([re]) => re.test(q)).map(([, k]) => k), ...(q.includes("%") ? [0.01] : [])];
  const v = Math.abs(value);
  return [...cands].some((c) => mults.some((k) => Math.abs(c * k - v) <= 1e-9 * Math.max(1, v)));
}
