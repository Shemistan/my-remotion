// Деления осей графиков: «круглые» шаги 1/2/5 × 10^k. Общие для LineChart, AreaChart и
// BarChart: ось считается один раз от данных и не меняется во время анимации.

/** «Круглые» деления оси (шаг 1/2/5 × 10^k), покрывающие [min, max]; около `count` шагов. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / pow;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start, i = 0; v <= end + step / 2 && i < 100; v = start + ++i * step) out.push(Number(v.toPrecision(12)));
  return out;
}

/**
 * Деления оси не больше `max` штук (0.4.0: по умолчанию 4): niceTicks с уменьшением числа
 * шагов, пока делений больше `max` — ось из шести подписей мелькает шумом.
 */
export function axisTicks(min: number, max: number, maxTicks: number): number[] {
  const cap = Math.max(2, Math.round(maxTicks));
  let t = niceTicks(min, max, cap);
  for (let c = cap - 1; t.length > cap && c >= 1; c--) t = niceTicks(min, max, c);
  return t;
}
