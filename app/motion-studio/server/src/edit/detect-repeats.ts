// Детектор повторов (Task 28): n-грамма (n = 1…3, сравнение по `normalizeToken`), сказанная
// подряд два и более раз («я я думаю», «мы сделали мы сделали это») → вырезка всех вхождений,
// кроме последнего: `[первое.start, последнее.start]` (вместе с паузой перед последним).
// Числа не повторы: «1 000 000» в ASR — «1», «000», «000». Вхождение, которое кончается концом
// предложения («это. Это было», «нет. Нет», «так? Так»), — не повтор: следующее начинает новое
// предложение. Многоточие — не конец: «Мы решили… Мы решили иначе» — оборванная фраза, фальстарт.
import { type EditDecision, type Fps, type TranscriptWord, normalizeToken, snapUsToFrame } from "@ms/contracts";

/** Конец предложения для повторов: `.`, `?`, `!` в конце слова, но не многоточие («…», «...»). */
export const ENDS_SENTENCE = /(?:[?!]|(?<![.…])\.)["»”)\]]*$/u;

const MAX_N = 3;

export interface RepeatOptions {
  idPrefix?: string;
}

/** Повторы → `reason: "repeat"`, `confidence 0.8`, якоря — слова вырезанных вхождений. */
export function detectRepeats(words: Pick<TranscriptWord, "id" | "text" | "start_us" | "end_us">[], fps: Fps, o: RepeatOptions = {}): EditDecision[] {
  const prefix = o.idPrefix ?? "repeat_";
  // пустой токен (только знаки) и число не участвуют: «—», «000»
  const tokens = words.map((w) => {
    const t = normalizeToken(w.text);
    return t === "" || /^[-+]?\d[\d%]*$/u.test(t) ? undefined : t;
  });
  const same = (a: number, b: number, n: number): boolean => {
    for (let k = 0; k < n; k++) {
      const x = tokens[a + k];
      if (x === undefined || x !== tokens[b + k]) return false;
    }
    return true;
  };
  // вхождение с началом `b` продолжает предыдущее, только если слово перед ним не кончает предложение
  const follows = (b: number): boolean => !ENDS_SENTENCE.test(words[b - 1]!.text.trim());
  const out: EditDecision[] = [];
  let i = 0;
  while (i < words.length) {
    let found = false;
    // меньшее n первым: «да да да да» — одна вырезка до последнего «да», а не «да да» × 2
    for (let n = 1; n <= MAX_N && i + 2 * n <= words.length; n++) {
      if (!same(i, i + n, n) || !follows(i + n)) continue;
      let last = i + n; // начало последнего вхождения
      while (last + 2 * n <= words.length && same(i, last + n, n) && follows(last + n)) last += n;
      const start = snapUsToFrame(words[i]!.start_us, fps);
      const end = snapUsToFrame(words[last]!.start_us, fps);
      if (end > start) {
        const quote = words.slice(i, i + n).map((w) => w.text.trim()).join(" ");
        const times = (last - i) / n;
        out.push({
          id: `${prefix}${out.length + 1}`, reason: "repeat", origin: "detector", status: "proposed",
          start_word_id: words[i]!.id, end_word_id: words[last - 1]!.id, source_start_us: start, source_end_us: end, confidence: 0.8,
          explanation: `повтор «${quote}»${times > 1 ? ` ×${times + 1}` : ""}: оставлено последнее`,
        });
      }
      i = last;
      found = true;
      break;
    }
    if (!found) i++;
  }
  return out;
}
