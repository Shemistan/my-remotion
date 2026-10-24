// Раскладка таймлайна: вехи равномерно по оси, от края до края rect (`timelineLayout`), или по
// шкале лет, если у всех вех в дате есть год (`timelineScale`, 0.5.5): ось с делениями и
// подписями лет, веха — на своём месте шкалы.
import type { Point } from "./geometry.js";
import type { Rect } from "./choreo/safe-area.js";
import { niceTicks } from "./ticks.js";

/**
 * n вех: `h` — слева направо по середине высоты rect, `v` — сверху вниз по середине
 * ширины. Первая и последняя — на краях rect, одна веха — в центре.
 */
export function timelineLayout(n: number, rect: Rect, orientation: "h" | "v"): Point[] {
  const count = Math.max(0, Math.floor(n));
  const at = (i: number) => (count === 1 ? 0.5 : i / (count - 1));
  return Array.from({ length: count }, (_, i) => pointAt(at(i), rect, orientation));
}

const pointAt = (u: number, rect: Rect, orientation: "h" | "v"): Point =>
  orientation === "h" ? { x: rect.x + rect.w * u, y: rect.y + rect.h / 2 } : { x: rect.x + rect.w / 2, y: rect.y + rect.h * u };

/** Месяцы (ru — по основе, en — по сокращению) → номер 1..12. */
const MONTHS: readonly [RegExp, number][] = [
  [/^(январ|jan)/, 1], [/^(феврал|feb)/, 2], [/^(март|мар|mar)/, 3], [/^(апрел|apr)/, 4], [/^(ма[йя]|may)/, 5], [/^(июн|jun)/, 6],
  [/^(июл|jul)/, 7], [/^(август|aug)/, 8], [/^(сентябр|sep)/, 9], [/^(октябр|oct)/, 10], [/^(ноябр|nov)/, 11], [/^(декабр|dec)/, 12],
];
const YEAR = /(?<!\p{N})(1[89]\d\d|2[01]\d\d)(?!\p{N})/u;

/**
 * Место даты на шкале лет: год (1800–2199) + (месяц − 1) / 12. Год ищется отдельным числом
 * («Go 1.24» — не год), месяц — словом («февраль», «Feb») или числом перед годом («03.2024»).
 * Без года — `undefined`.
 */
export function datePosition(date: string): number | undefined {
  const s = date.toLowerCase().replace(/ё/g, "е");
  const y = YEAR.exec(s);
  if (!y) return undefined;
  const year = Number(y[1]);
  for (const w of s.match(/\p{L}+/gu) ?? []) {
    const m = MONTHS.find(([re]) => re.test(w));
    if (m) return year + (m[1] - 1) / 12;
  }
  const num = /(?<![\p{N}])(0?[1-9]|1[0-2])[./-](?=(1[89]|2[01])\d\d)/u.exec(s);
  return num ? year + (Number(num[1]) - 1) / 12 : year;
}

/** Деление шкалы: место на оси 0..1 и подпись (год) — у шкалы лет. */
export interface TimelineTick {
  u: number;
  label?: string;
}

export interface TimelineScale {
  /** `years` — у всех вех в дате есть год: шкала лет; `even` — вехи равномерно. */
  mode: "years" | "even";
  /** Место каждой вехи на оси 0..1 (порядок items). */
  pos: number[];
  ticks: TimelineTick[];
}

/** Подписей лет на оси — не больше. */
const MAX_YEAR_LABELS = 9;

/**
 * Шкала таймлайна по датам вех (0.5.5, S14). У всех дат есть год — шкала лет: от года раньше
 * первой до года позже последней (не меньше 3 лет), деления с подписями лет (шаг 1/2/5/10 —
 * не больше 9 подписей) и тихие деления по полугодиям при шаге в год; веха — на своём месте.
 * Иначе вехи равномерно (как `timelineLayout`) и тихие деления без подписей: по 4 на отрезок
 * между вехами (8–16 на ось; одна веха — в центре оси из 12 делений).
 */
export function timelineScale(dates: readonly string[]): TimelineScale {
  const n = dates.length;
  const at = dates.map(datePosition);
  if (n > 0 && at.every((x) => x !== undefined)) {
    const ps = at as number[];
    let lo = Math.floor(Math.min(...ps)) - 1;
    let hi = Math.floor(Math.max(...ps)) + 1;
    if (hi - lo < 3) hi = lo + 3;
    // шаг подписей: 1/2/5/10 лет, не больше MAX_YEAR_LABELS
    let step = 1;
    for (const c of [1, 2, 5, 10, 20, 25, 50, 100]) {
      step = c;
      if (Math.floor(hi / c) - Math.ceil(lo / c) + 1 <= MAX_YEAR_LABELS) break;
    }
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const span = hi - lo;
    const ticks: TimelineTick[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push({ u: (v - lo) / span, label: String(v) });
    if (step === 1) for (let v = lo + 0.5; v < hi; v += 1) ticks.push({ u: (v - lo) / span });
    ticks.sort((a, b) => a.u - b.u);
    return { mode: "years", pos: ps.map((p) => (p - lo) / span), ticks };
  }
  const pos = Array.from({ length: n }, (_, i) => (n === 1 ? 0.5 : i / Math.max(1, n - 1)));
  const count = n <= 1 ? 12 : Math.min(16, Math.max(8, (n - 1) * 4));
  return { mode: "even", pos, ticks: niceTicks(0, count, count).filter((v) => v >= 0 && v <= count).map((v) => ({ u: v / count })) };
}

/** Позиции вех по шкале (`timelineScale`) на rect — те же, что рисует `<Timeline>` (0.5.5). */
export function timelineLayoutFor(dates: readonly string[], rect: Rect, orientation: "h" | "v"): Point[] {
  return timelineScale(dates).pos.map((u) => pointAt(u, rect, orientation));
}
