// Текст для человека (ревью Task 33): слова транскрипта строкой и русские множественные формы.
// Общие для сервера (цитаты сцен, сообщения) и UI (транскрипт, цитаты, диалоги).

/**
 * Токен ASR пристыковывается к предыдущему без пробела: начинается с дефиса перед буквой
 * («-адреса», «-то») или со знака препинания, закрывающего фразу или скобку. Тире, одиночный
 * дефис и минус числа («-5») — отдельные слова.
 */
export function gluesToPrevious(text: string): boolean {
  return /^(?:-\p{L}|[,.!?:;…»)\]%])/u.test(text.trim());
}

/** Слова строкой для показа: края слов без пробелов ASR, склейка по `gluesToPrevious`, после «« (» — без пробела. */
export function joinWords(texts: readonly string[]): string {
  let out = "";
  for (const raw of texts) {
    const s = raw.trim();
    if (s === "") continue;
    out += out === "" || gluesToPrevious(s) || /[«([]$/.test(out) ? s : ` ${s}`;
  }
  return out;
}

const PLURAL = new Intl.PluralRules("ru-RU");

/** Форма слова для числа `n`: 1, 21 — `one`; 2–4, 22 — `few`; 0, 5–20, 25 — `many` (дробные — `few`). */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const c = PLURAL.select(n);
  return c === "one" ? one : c === "few" || c === "other" ? few : many;
}
