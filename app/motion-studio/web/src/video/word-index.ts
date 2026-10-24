// Слово под курсором плеера: бинарный поиск по началам слов (слова по возрастанию start_us).
// В паузе между словами — предыдущее слово (подсветка не мигает); до первого слова — -1.

export function wordAt(words: readonly { start_us: number }[], us: number): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid]!.start_us <= us) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
