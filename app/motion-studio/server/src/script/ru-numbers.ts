// Русские числительные словами (спека §6.1, Р21): «один к двумстам пятидесяти шести» → [1, 256].
// Тексты человека пишут числа словами, а `numberMatchesQuote` без цифр сверку пропускает — здесь
// разбор для сверки `data.value` с цитатой. Словарь — основы 0–999 во всех падежах (количественные и
// порядковые: «двадцать пятого»), «полтора»; множители «тысяча», «миллион», «миллиард»; «с половиной» —
// +0,5; десятичные дроби «шесть и две десятых», «три целых четырнадцать сотых». Неточные количества и
// доли («десятки тысяч», «тысячи», «пара», «несколько», «треть», «четверть», «половина») числом не
// выдаются: разбор помечает их `vague` — сверка тогда не отказ, а warning `value_unverified`.

/** Разряд слова: 0 — единицы и 10–19, 1 — десятки, 2 — сотни. */
type Place = 0 | 1 | 2;
interface Word { value: number; place: Place; ordinal: boolean }

const ORD = "(ый|ой|ий|ого|ому|ым|ом|ая|ую|ое|ые|ых|ыми)";
const CASE5 = "(ь|и|ью)";

/** [шаблон слова, значение, разряд, порядковое]. Буква «ё» заранее заменена на «е». */
const TABLE: [string, number, Place, boolean?][] = [
  ["нол(ь|я|ю|ем|е)|нул(ь|я|ю|ем|е)", 0, 0],
  ["один|одн(а|о|и|ого|ой|ому|им|ом|ою|у|их|ими)", 1, 0],
  ["полтора|полторы|полутора", 1.5, 0],
  ["два|две|двух|двум|двумя", 2, 0],
  ["три|трех|трем|тремя", 3, 0],
  ["четыр(е|ех|ем|ьмя)", 4, 0],
  [`пят${CASE5}`, 5, 0], [`шест${CASE5}`, 6, 0], [`сем${CASE5}`, 7, 0], [`восем(ь|ью)|восьм(и|ью)`, 8, 0], [`девят${CASE5}`, 9, 0],
  [`десят${CASE5}`, 10, 0], [`одиннадцат${CASE5}`, 11, 0], [`двенадцат${CASE5}`, 12, 0], [`тринадцат${CASE5}`, 13, 0],
  [`четырнадцат${CASE5}`, 14, 0], [`пятнадцат${CASE5}`, 15, 0], [`шестнадцат${CASE5}`, 16, 0], [`семнадцат${CASE5}`, 17, 0],
  [`восемнадцат${CASE5}`, 18, 0], [`девятнадцат${CASE5}`, 19, 0],
  [`двадцат${CASE5}`, 20, 1], [`тридцат${CASE5}`, 30, 1], ["сорок|сорока", 40, 1],
  ["пятьдесят|пятидесяти|пятьюдесятью", 50, 1], ["шестьдесят|шестидесяти|шестьюдесятью", 60, 1],
  ["семьдесят|семидесяти|семьюдесятью", 70, 1], ["восемьдесят|восьмидесяти|восемьюдесятью|восьмьюдесятью", 80, 1], ["девяносто|девяноста", 90, 1],
  ["сто|ста", 100, 2], ["двести|двухсот|двумстам|двумястами|двухстах", 200, 2], ["триста|трехсот|тремстам|тремястами|трехстах", 300, 2],
  ["четыреста|четырехсот|четыремстам|четырьмястами|четырехстах", 400, 2],
  ...([[5, "пят"], [6, "шест"], [7, "сем"], [8, "восем"], [9, "девят"]] as const).map(([d, s]): [string, number, Place] => {
    const g = d === 8 ? "восьм" : s; // косвенные падежи: восьмисот, восьмистам
    return [`${s}ьсот|${g}исот|${g}истам|${g}ьюстами|${s}ьюстами|${g}истах`, d * 100, 2];
  }),
  // порядковые: «первого», «двадцать пятого», «сотый»
  [`перв${ORD}`, 1, 0, true], [`втор${ORD}`, 2, 0, true], ["трет(ий|ьего|ьему|ьим|ьем|ья|ьей|ью|ье|ьи|ьих|ьими)", 3, 0, true],
  [`четверт${ORD}`, 4, 0, true], [`пят${ORD}`, 5, 0, true], [`шест${ORD}`, 6, 0, true], [`седьм${ORD}`, 7, 0, true],
  [`восьм${ORD}`, 8, 0, true], [`девят${ORD}`, 9, 0, true], [`десят${ORD}`, 10, 0, true],
  [`(одиннадцат|двенадцат|тринадцат|четырнадцат|пятнадцат|шестнадцат|семнадцат|восемнадцат|девятнадцат)${ORD}`, -1, 0, true],
  [`двадцат${ORD}`, 20, 1, true], [`тридцат${ORD}`, 30, 1, true], [`сороков${ORD}`, 40, 1, true], [`пятидесят${ORD}`, 50, 1, true],
  [`шестидесят${ORD}`, 60, 1, true], [`семидесят${ORD}`, 70, 1, true], [`восьмидесят${ORD}`, 80, 1, true], [`девяност${ORD}`, 90, 1, true],
  [`сот${ORD}`, 100, 2, true],
];
const TEENS = ["одиннадцат", "двенадцат", "тринадцат", "четырнадцат", "пятнадцат", "шестнадцат", "семнадцат", "восемнадцат", "девятнадцат"];
const COMPILED = TABLE.map(([re, value, place, ordinal]) => ({ re: new RegExp(`^(?:${re})$`), value, place, ordinal: ordinal === true }));
/** Множители: шаблон единственного числа (без счёта — ×1), множественного (без счёта — неточно), значение. */
const SCALES: { one: RegExp; many: RegExp; value: number }[] = [
  { one: /^тысяч(а|у|е|ей|ею)$/, many: /^тысяч(и|ам|ами|ах)?$/, value: 1e3 },
  { one: /^миллион(а|у|ом|е)?$/, many: /^миллион(ы|ов|ам|ами|ах)$/, value: 1e6 },
  { one: /^миллиард(а|у|ом|е)?$/, many: /^миллиард(ы|ов|ам|ами|ах)$/, value: 1e9 },
];
const HALF = /^половин(ой|ою)$/;
/** Знаменатель дроби: «десятых» — 10, «сотых» — 100, «тысячных» — 1000. */
const FRACTION = /^(десят|сот|тысячн)(ая|ой|ую|ые|ых|ым|ыми)$/;
const FRACTION_POW: Record<string, number> = { десят: 1, сот: 2, тысячн: 3 };
/** Связка целой и дробной части: «шесть и две десятых», «три целых четырнадцать сотых». */
const FRACTION_JOIN = /^(и|целых|целая|целой|целую)$/;
/** Неточные количества и доли: число по ним не восстановить. */
const VAGUE = /^(десят(ок|ка|ки|ков|кам|ками|ках)|сот(ня|ни|ню|ней|ням|нями|нях|ен)|дюжин\p{L}*|пар(а|ы|у|ой|е)|нескольк(о|их|им|ими)|много|многих|немного|трет(ь|и)|четверт(ь|и|ью)|половин\p{L}*)$/u;

function lookup(token: string): Word | undefined {
  for (const c of COMPILED) {
    if (!c.re.test(token)) continue;
    const value = c.value >= 0 ? c.value : 11 + TEENS.findIndex((t) => token.startsWith(t));
    return { value, place: c.place, ordinal: c.ordinal };
  }
  return undefined;
}

/** Разбор цитаты: числа словами по порядку и признак неточного количества или доли в ней. */
export interface RuNumbers {
  values: number[];
  /** В цитате есть неточное количество или доля («десятки тысяч», «треть») — его значения нет в `values`. */
  vague: boolean;
}

/**
 * Числа, записанные словами, по порядку появления. Слова одного числа идут подряд по убыванию
 * разряда («двумстам пятидесяти шести» = 256); множитель («тысяча», «миллион») умножает набранное
 * (без счёта: «тысяча» — 1000, «тысячи» — неточно); «с половиной» после числа — +0,5 (после
 * множителя — его половина); «N и M десятых» — N + M/10; порядковое слово завершает число. Любое
 * другое слово (и цифры) заканчивает текущее число.
 */
export function ruNumberParse(quote: string): RuNumbers {
  const tokens = quote.normalize("NFC").toLowerCase().replace(/ё/g, "е").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: number[] = [];
  let vague = false;
  let total = 0; // набранное множителями
  let cur = 0; // набранное после последнего множителя
  let last: Place | 3 | undefined; // разряд последнего слова числа; 3 — после множителя; undefined — числа нет
  let lastScale = 1; // последний множитель
  let closed = false; // число завершено порядковым словом
  let whole: number | undefined; // целая часть перед «и M десятых»
  let skipScale = false; // множитель после неточного слова («десятки тысяч») — часть неточного
  const reset = () => {
    total = 0;
    cur = 0;
    last = undefined;
    lastScale = 1;
    closed = false;
    whole = undefined;
  };
  const flush = () => {
    if (whole !== undefined) out.push(whole);
    else if (last !== undefined) out.push(total + cur);
    reset();
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const scale = SCALES.find((x) => x.one.test(t) || x.many.test(t));
    if (scale) {
      if (skipScale) continue;
      if (closed || whole !== undefined) flush();
      if (last === undefined) {
        if (scale.many.test(t)) {
          vague = true;
          skipScale = true;
          continue;
        }
        total += scale.value;
      } else {
        total += (last === 3 ? 1 : cur) * scale.value;
      }
      cur = 0;
      last = 3;
      lastScale = scale.value;
      continue;
    }
    skipScale = false;
    if (t === "с" && last !== undefined && !closed && whole === undefined && HALF.test(tokens[i + 1] ?? "")) {
      cur += last === 3 ? lastScale / 2 : 0.5;
      i++;
      flush();
      continue;
    }
    const frac = FRACTION.exec(t);
    if (frac && last !== undefined && last !== 3 && !closed) {
      const k = 10 ** FRACTION_POW[frac[1]!]!;
      out.push(((whole ?? 0) * k + total + cur) / k);
      reset();
      continue;
    }
    if (FRACTION_JOIN.test(t) && last !== undefined && !closed && whole === undefined) {
      let j = i + 1;
      while (j < tokens.length && lookup(tokens[j]!) && !lookup(tokens[j]!)!.ordinal && !FRACTION.test(tokens[j]!)) j++;
      if (j > i + 1 && FRACTION.test(tokens[j] ?? "")) {
        const w = total + cur;
        reset();
        whole = w;
        continue;
      }
    }
    if (VAGUE.test(t)) {
      flush();
      vague = true;
      skipScale = true;
      continue;
    }
    const wd = lookup(t);
    if (!wd) {
      flush();
      continue;
    }
    // разряд должен убывать; «десять–девятнадцать» после десятков не идут
    const joins = last !== undefined && !closed && (last === 3 || wd.place < last) && !(last === 1 && wd.value >= 10);
    if (!joins && whole === undefined) flush();
    cur += wd.value;
    last = wd.place;
    closed = wd.ordinal;
  }
  flush();
  return { values: out, vague };
}

/** Числа, записанные словами, по порядку появления (см. `ruNumberParse`). */
export function ruNumberValues(quote: string): number[] {
  return ruNumberParse(quote).values;
}
