// Смысловые повторы в плане сценария (S16a F9): разнообразие (`planDiversity`) сравнивает приёмы,
// а две сцены разными приёмами могут показывать одно и то же («оба массива бакетов в памяти» в
// сценах 12 и 18 приёмки S12). Пара принятых сцен — повтор, если:
// - термины и числа каждой сцены нашлись в другой не меньше чем на `TERMS_SHARE` (в обе стороны,
//   и не меньше `TERMS_MIN` совпадений): термин — все его основы есть в цитате, идее или
//   назначении другой сцены; число — то же `value` в её `data`;
// - или идеи почти одинаковы: Jaccard множеств основ ≥ `IDEA_JACCARD`.
// Основа слова — грубый стемминг: нижний регистр, `ё → е`, без служебных слов, без окончания
// из списка, не длиннее 6 букв. Итог — warning у поздней сцены пары, это подсказка, не запрет.
import { type PlanIssue, type ScriptSceneItem, normalizeToken } from "@ms/contracts";

export const TERMS_SHARE = 0.6;
export const TERMS_MIN = 2;
export const IDEA_JACCARD = 0.5;

const STOP = new Set(
  "и в во на не но а что это как по из за для с со к ко от до же ли бы то так там тут его ее их она он оно они мы вы я ты при над под об о про или да нет уже еще".split(" "),
);
/** Окончания: самые длинные первыми; основа после отрезания — не короче 3 букв. */
const ENDINGS = "ями ами иях ах ях ов ев ей ой ий ый ая яя ое ее ые ие ам ям ом ем ую юю ы и а я о е у ю ь й"
  .split(" ").sort((a, b) => b.length - a.length);

function stem(w: string): string {
  const end = ENDINGS.find((e) => w.endsWith(e) && w.length - e.length >= 3);
  return (end ? w.slice(0, -end.length) : w).slice(0, 6);
}

/** Основы слов текста (по порядку, с повторами); дефис делит слово («overflow-бакеты»). */
export function stemsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s—–-]+/u)) {
    const w = normalizeToken(raw);
    if (w === "" || STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

export interface MeaningRepeat {
  /** Ранняя и поздняя сцена пары (по порядку плана). */
  a: string;
  b: string;
  /** Общие термины (тексты терминов ранней сцены) и числа. */
  shared: string[];
  /** Jaccard основ идей. */
  idea: number;
}

interface Prepared {
  x: ScriptSceneItem;
  text: Set<string>;
  idea: Set<string>;
}

/** Термины и числа `x`, найденные в `y`. */
function sharedOf(x: Prepared, y: Prepared): { found: string[]; total: number } {
  const found: string[] = [];
  for (const t of x.x.key_terms) {
    const st = stemsOf(t.text);
    if (st.length > 0 && st.every((s) => y.text.has(s))) found.push(t.text);
  }
  for (const d of x.x.data) {
    if (y.x.data.some((e) => e.value === d.value)) found.push(`${d.label} = ${d.value}`);
  }
  return { found, total: x.x.key_terms.length + x.x.data.length };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const s of a) if (b.has(s)) n++;
  return n / (a.size + b.size - n);
}

/** Пары принятых сцен со смысловым повтором (порядок — как в плане). */
export function meaningRepeats(items: readonly ScriptSceneItem[]): MeaningRepeat[] {
  const acc: Prepared[] = items.filter((x) => x.status === "accepted").map((x) => ({
    x, text: new Set(stemsOf(`${x.quote} ${x.idea} ${x.purpose}`)), idea: new Set(stemsOf(x.idea)),
  }));
  const out: MeaningRepeat[] = [];
  for (let i = 0; i < acc.length; i++) {
    for (let j = i + 1; j < acc.length; j++) {
      const a = acc[i]!;
      const b = acc[j]!;
      const ab = sharedOf(a, b);
      const ba = sharedOf(b, a);
      const terms = ab.total > 0 && ba.total > 0 && ab.found.length >= TERMS_MIN && ba.found.length >= TERMS_MIN &&
        ab.found.length / ab.total >= TERMS_SHARE && ba.found.length / ba.total >= TERMS_SHARE;
      const idea = jaccard(a.idea, b.idea);
      if (terms || idea >= IDEA_JACCARD) out.push({ a: a.x.id, b: b.x.id, shared: ab.found, idea });
    }
  }
  return out;
}

/** Warning `meaning_repeat` у поздней сцены пары: с кем повтор и что общее. */
export function meaningRepeatIssues(items: readonly ScriptSceneItem[]): PlanIssue[] {
  return meaningRepeats(items).map((p) => ({
    item_id: p.b, code: "meaning_repeat", severity: "warning",
    // id сцен UI заменяет на «сцена N»
    message: `${p.a} и ${p.b} показывают одно и то же${p.shared.length > 0 ? ` (общее: ${p.shared.map((s) => `«${s}»`).join(", ")})` : " (почти та же идея)"} — покажите другой аспект или объедините сцены`,
  }));
}
