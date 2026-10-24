// Проверка ответа Semantic Director кодом (Task 31). Агент видит только оставленные монтажом
// слова (`semanticInput`) и отвечает парами id слов с дословными цитатами; код проверяет каждое
// предложение и отклоняет не прошедшее с кодом — ничего не «чинит».
//
// Правила якоря (и числа):
// - id слова нет → `unknown_word`; граничное слово вырезано монтажом целиком → `anchor_in_cut`;
//   начало после конца → `order`;
// - цитата сверяется (`verifyQuote`) с тем, что услышит зритель, — оставленными словами диапазона.
//   Вырезанные слова внутри диапазона (паразит, повтор, вырезанный монтажом) допустимы, если цитата
//   их не содержит: якорь опирается на смонтированную речь, граничные слова целы, время код считает
//   по ним. Цитата совпала только вместе с вырезанными словами — агент опирается на вырезанное →
//   `anchor_in_cut`; иначе `quote_mismatch`;
// - `emphasis_word_ids` — оставленные слова внутри диапазона, иначе `emphasis_out_of_range`.
// Главы: границы — оставленные слова по порядку; вместе покрывают все оставленные слова без
// пропусков (`chapter_gap`) и пересечений (`chapter_overlap`, отклоняется поздняя). Связи — только
// между принятыми якорями (`unknown_anchor`). Сущности — упоминания на оставленных словах.
import { type SemanticAgentOutput, type SemanticRejected, type TranscriptWord, type WordMapping, verifyQuote } from "@ms/contracts";

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

  /** Диапазон слов: индексы во `words` или код отказа. */
  const span = (s: string, e: string): { si: number; ei: number } | { code: Code; detail: string } => {
    const si = pos.get(s);
    const ei = pos.get(e);
    if (si === undefined || ei === undefined) return { code: "unknown_word", detail: `нет слова ${si === undefined ? s : e}` };
    for (const [i, x] of [[si, s], [ei, e]] as const) if (!kept(i)) return { code: "anchor_in_cut", detail: `граничное слово ${x} вырезано монтажом` };
    if (si > ei) return { code: "order", detail: `слово ${s} идёт после ${e}` };
    return { si, ei };
  };
  /** Цитата диапазона: сверка с оставленными словами, затем — со всеми (опора на вырезанное). */
  const quoted = (si: number, ei: number, quote: string): { code: Code; detail: string } | undefined => {
    const heard = words.slice(si, ei + 1).filter((_, k) => kept(si + k));
    if (verifyQuote(heard, heard[0]!.id, heard.at(-1)!.id, quote).ok) return undefined;
    const hasCut = heard.length < ei - si + 1;
    if (hasCut && verifyQuote(words, words[si]!.id, words[ei]!.id, quote).ok) {
      return { code: "anchor_in_cut", detail: `цитата содержит слова, вырезанные монтажом: «${clip(quote)}»` };
    }
    return { code: "quote_mismatch", detail: `цитата не совпадает со словами ${words[si]!.id}…${words[ei]!.id}: «${clip(quote)}»` };
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
    if (x.a > covered + 1) reject("chapter", x.c.id, "chapter_gap", `перед главой ${x.c.id} не покрыто слов: ${x.a - covered - 1}`);
    okChapters.push(x);
    covered = x.b;
  }
  if (nk > 0 && covered < nk - 1) {
    const last = okChapters.at(-1)?.c.id;
    reject("chapter", last, "chapter_gap", last ? `после главы ${last} не покрыто слов: ${nk - 1 - covered}` : "глав нет: слова не покрыты");
  }

  const anchors: SemanticAgentOutput["anchors"] = [];
  for (const a of out.anchors) {
    const r = span(a.start_word_id, a.end_word_id);
    if ("code" in r) {
      reject("anchor", a.id, r.code, r.detail);
      continue;
    }
    const q = quoted(r.si, r.ei, a.quote);
    if (q) {
      reject("anchor", a.id, q.code, q.detail);
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
    const r = span(n.start_word_id, n.end_word_id);
    const q = "code" in r ? r : quoted(r.si, r.ei, n.quote);
    if (q) reject("number", undefined, q.code, `${n.value}${n.unit ? ` ${n.unit}` : ""}: ${q.detail}`);
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
