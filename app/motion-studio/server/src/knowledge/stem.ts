// Лёгкие стеммеры. Русский — Snowball (суффиксы в RV/R2) плюс таблица алиасов для чередующихся
// корней (рост/росла/растёт); английский — множественное число и -ing/-ed.
const RU_V = "аеиоуыэюя";
const isV = (c: string | undefined): boolean => c !== undefined && RU_V.includes(c);

const PG1 = ["вшись", "вши", "в"];
const PG2 = ["ившись", "ивши", "ив", "ывшись", "ывши", "ыв"];
const REFL = ["ся", "сь"];
const ADJ = [
  "ими", "ыми", "его", "ого", "ему", "ому", "ее", "ие", "ые", "ое", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом",
  "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею",
];
const PART1 = ["ем", "нн", "вш", "ющ", "щ"];
const PART2 = ["ивш", "ывш", "ующ"];
const VERB1 = ["ете", "йте", "нно", "ешь", "ла", "на", "ли", "ем", "ло", "но", "ет", "ют", "ны", "ть", "й", "л", "н"];
const VERB2 = [
  "ейте", "уйте", "ила", "ыла", "ена", "ите", "или", "ыли", "ило", "ыло", "ено", "ует", "уют", "ены", "ить", "ыть",
  "ишь", "ей", "уй", "ил", "ыл", "им", "ым", "ен", "ят", "ит", "ыт", "ую", "ю",
];
const NOUN = [
  "иями", "иях", "иям", "ями", "ами", "ией", "ием", "ией", "ие", "ье", "ев", "ов", "еи", "ии", "ей", "ой", "ий",
  "ям", "ем", "ам", "ом", "ах", "ях", "ию", "ью", "ия", "а", "е", "и", "й", "о", "у", "ы", "ь", "ю", "я",
];

/** Самое длинное окончание из списка в пределах RV; withPrec — перед ним должна стоять а/я (тоже в RV). */
function match(w: string, list: string[], rv: number, withPrec: boolean): string | undefined {
  let best: string | undefined;
  for (const e of list) {
    const start = w.length - e.length;
    if (start < rv || !w.endsWith(e)) continue;
    if (withPrec) {
      const p = w[start - 1];
      if ((p !== "а" && p !== "я") || start - 1 < rv) continue;
    }
    if (best === undefined || e.length > best.length) best = e;
  }
  return best;
}
const cut = (w: string, e: string): string => w.slice(0, w.length - e.length);

// Корни с чередованием, которые суффиксы не склеивают.
const ALIASES: Readonly<Record<string, string>> = {
  росл: "рост", раст: "рост", растет: "рост", выросл: "рост", вырос: "рост", выраст: "рост", вырастет: "рост",
  линейн: "лин", упал: "пад", паден: "пад", падает: "пад", упад: "пад",
};

export function stemRu(input: string): string {
  let w = input.toLowerCase().replace(/ё/g, "е");
  if (w.length < 3) return w;
  let rv = w.length;
  for (let i = 0; i < w.length; i++) {
    if (isV(w[i])) {
      rv = i + 1;
      break;
    }
  }
  let r1 = w.length;
  for (let i = 1; i < w.length; i++) {
    if (!isV(w[i]) && isV(w[i - 1])) {
      r1 = i + 1;
      break;
    }
  }
  let r2 = w.length;
  for (let i = r1 + 1; i < w.length; i++) {
    if (!isV(w[i]) && isV(w[i - 1])) {
      r2 = i + 1;
      break;
    }
  }
  // Шаг 1
  const pg = match(w, PG1, rv, true) ?? match(w, PG2, rv, false);
  if (pg) {
    w = cut(w, pg);
  } else {
    const rf = match(w, REFL, rv, false);
    if (rf) w = cut(w, rf);
    const adj = match(w, ADJ, rv, false);
    if (adj) {
      w = cut(w, adj);
      const pt = match(w, PART2, rv, false) ?? match(w, PART1, rv, true);
      if (pt) w = cut(w, pt);
    } else {
      const vb = match(w, VERB2, rv, false) ?? match(w, VERB1, rv, true);
      if (vb) w = cut(w, vb);
      else {
        const nn = match(w, NOUN, rv, false);
        if (nn) w = cut(w, nn);
      }
    }
  }
  // Шаг 2-4
  if (w.endsWith("и") && w.length - 1 >= rv) w = w.slice(0, -1);
  if (w.endsWith("ость") && w.length - 4 >= r2) w = cut(w, "ость");
  else if (w.endsWith("ост") && w.length - 3 >= r2) w = cut(w, "ост");
  const sup = w.endsWith("ейше") ? "ейше" : w.endsWith("ейш") ? "ейш" : undefined;
  if (sup) w = cut(w, sup);
  if (w.endsWith("нн")) w = w.slice(0, -1);
  else if (w.endsWith("ь")) w = w.slice(0, -1);
  return ALIASES[w] ?? w;
}

export function stemEn(input: string): string {
  let w = input.toLowerCase();
  if (w.length < 4) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (/(ing|ed)$/.test(w) && w.replace(/(ing|ed)$/, "").length >= 3) {
    w = w.replace(/(ing|ed)$/, "");
    if (/([^aeiou])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  } else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}
