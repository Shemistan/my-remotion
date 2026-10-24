// Форматирование чисел для кадра. Своё, а не Intl: вывод ICU различается между Node и
// Chrome и между версиями, а кадр обязан совпадать байт в байт.

export interface FormatOptions {
  locale: "ru" | "en";
  /** Сокращение: «12,5 тыс.», «1 млн» / «12.5K», «1M». */
  compact?: boolean;
  /** Знаков после запятой. Без compact — ровно столько (стабильная ширина счётчика), с compact — не больше. */
  decimals?: number;
}

const COMPACT = {
  ru: [
    { v: 1e9, s: " млрд" },
    { v: 1e6, s: " млн" },
    { v: 1e3, s: " тыс." },
  ],
  en: [
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "K" },
  ],
} as const;

/** Типографский минус U+2212: шире дефиса, по ширине как цифра. */
const MINUS = "−";

function group(int: string, sep: string, minDigits: number): string {
  if (int.length < minDigits) return int;
  let out = "";
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) out += sep;
    out += int[i];
  }
  return out;
}

function fixed(abs: number, decimals: number, locale: FormatOptions["locale"], trim: boolean): string {
  const [int = "0", raw = ""] = abs.toFixed(decimals).split(".");
  const frac = trim ? raw.replace(/0+$/, "") : raw;
  // ru: 4-значные без разделителя (1500), с 5 знаков — пробел; en: запятая с 4 знаков
  const g = locale === "ru" ? group(int, " ", 5) : group(int, ",", 4);
  return frac ? `${g}${locale === "ru" ? "," : "."}${frac}` : g;
}

/**
 * `formatNumber(1_000_000, { locale: "ru" })` → «1 000 000»;
 * `formatNumber(10_000, { locale: "en" })` → «10,000».
 */
export function formatNumber(value: number, opts: FormatOptions): string {
  if (!Number.isFinite(value)) throw new RangeError(`formatNumber: не число: ${value}`);
  const decimals = Math.max(0, Math.min(6, Math.floor(opts.decimals ?? 0)));
  const abs = Math.abs(value);
  let body: string;
  let zero: boolean;
  if (opts.compact) {
    // крупнейшая ступень не больше значения; если округление даёт 1000 — следующая:
    // 999 960 → «1 млн», а не «1000 тыс.»
    const steps = [{ v: 1, s: "" }, ...[...COMPACT[opts.locale]].reverse()];
    let k = 0;
    while (k + 1 < steps.length && abs >= steps[k + 1]!.v) k++;
    while (k + 1 < steps.length && Number((abs / steps[k]!.v).toFixed(decimals)) >= 1000) k++;
    const unit = steps[k]!.v === 1 ? undefined : steps[k];
    const scaled = unit ? abs / unit.v : abs;
    body = fixed(scaled, decimals, opts.locale, true) + (unit ? unit.s : "");
    zero = Number(scaled.toFixed(decimals)) === 0;
  } else {
    body = fixed(abs, decimals, opts.locale, false);
    zero = Number(abs.toFixed(decimals)) === 0;
  }
  return value < 0 && !zero ? MINUS + body : body;
}

/** Формы существительного: ru — [один, два, пять] («релиз», «релиза», «релизов»), en — [one, other]. */
export type PluralForms = readonly string[];

/**
 * Форма существительного при числе — по тому, что показано в кадре (`decimals`, `compact`):
 * `pluralForm(21, ["релиз", "релиза", "релизов"], { locale: "ru" })` → «релиз»;
 * дробное — «2,5 релиза»; после «тыс.»/«млн» — «1,2 тыс. релизов».
 */
export function pluralForm(value: number, forms: PluralForms, opts: FormatOptions): string {
  const pick = (i: number) => forms[Math.min(i, forms.length - 1)] ?? "";
  const decimals = Math.max(0, Math.min(6, Math.floor(opts.decimals ?? 0)));
  const shown = Math.abs(Number(Math.abs(value).toFixed(decimals)));
  if (opts.locale === "en") return shown === 1 ? pick(0) : pick(1);
  if (opts.compact && shown >= 1000) return pick(2);
  if (!Number.isInteger(shown)) return pick(1);
  const n100 = shown % 100;
  const n10 = shown % 10;
  if (n100 >= 11 && n100 <= 14) return pick(2);
  if (n10 === 1) return pick(0);
  if (n10 >= 2 && n10 <= 4) return pick(1);
  return pick(2);
}
