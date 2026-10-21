// Лексер кода для CodeBlock: простой, без зависимостей, детерминированный. Цель —
// подсветка и набор по токенам, а не разбор языка: склейка токенов всегда даёт исходный
// текст байт в байт, незакрытые строки и комментарии не бросают исключений.

export type CodeLang = "ts" | "py" | "json" | "bash";
export type TokenKind = "kw" | "str" | "num" | "com" | "id" | "punct" | "ws";
export interface CodeToken {
  text: string;
  kind: TokenKind;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const KEYWORDS: Record<CodeLang, Set<string>> = {
  ts: words(`abstract as async await break case catch class const continue debugger default delete do else enum export
    extends false finally for from function get if implements import in instanceof interface let new null of private
    protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void
    while with yield keyof infer declare namespace`),
  py: words(`False None True and as assert async await break class continue def del elif else except finally for from
    global if import in is lambda nonlocal not or pass raise return try while with yield match case self`),
  json: words("true false null"),
  bash: words(`if then else elif fi for while until do done case esac function in select return local export readonly
    declare set unset shift exit`),
};

/** Начало комментария в позиции i: длина маркера или 0. */
function commentAt(src: string, i: number, lang: CodeLang): "line" | "block" | null {
  if (lang === "ts") {
    // два слэша посимвольно: строковый литерал из двух слэшей static check считает URL без схемы
    if (src[i] === "/" && src[i + 1] === "/") return "line";
    if (src.startsWith("/*", i)) return "block";
  }
  if ((lang === "py" || lang === "bash") && src[i] === "#") {
    // в bash # — комментарий только в начале слова (`a#b` — часть слова)
    if (lang === "bash" && i > 0 && !/\s|;/.test(src[i - 1]!)) return null;
    return "line";
  }
  return null;
}

const QUOTES: Record<CodeLang, string> = { ts: "'\"`", py: "'\"", json: '"', bash: "'\"" };

/** Конец строкового литерала, начатого в i (индекс после закрывающей кавычки или конец строки/текста). */
function stringEnd(src: string, i: number, lang: CodeLang): number {
  const q = src[i]!;
  if (lang === "py" && src.startsWith(q.repeat(3), i)) {
    const close = src.indexOf(q.repeat(3), i + 3);
    return close < 0 ? src.length : close + 3;
  }
  // шаблонная строка ts и строки bash могут переносить строку; остальные кончаются на \n
  const multiline = (lang === "ts" && q === "`") || lang === "bash";
  let j = i + 1;
  while (j < src.length) {
    const c = src[j]!;
    // обратный слэш экранирует следующий символ (кроме одинарных кавычек bash)
    if (c === "\\" && !(lang === "bash" && q === "'")) {
      j += 2;
      continue;
    }
    if (c === q) return j + 1;
    if (c === "\n" && !multiline) return j;
    j++;
  }
  return src.length;
}

const NUM = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/;
const IDENT: Record<CodeLang, RegExp> = {
  ts: /^[A-Za-z_$][\w$]*/,
  py: /^[A-Za-z_]\w*/,
  json: /^[A-Za-z_]\w*/,
  // слово bash: команда, флаг, переменная, путь
  bash: /^(?:\$\{[^}\s]*\}?|\$[?#@!*-]|[\w$./~:=@%+-]+)/,
};

/** Токены кода: ключевые слова, строки, числа, комментарии, идентификаторы, знаки, пробелы. */
export function tokenizeCode(src: string, lang: CodeLang): CodeToken[] {
  const out: CodeToken[] = [];
  const kw = KEYWORDS[lang];
  let i = 0;
  const push = (kind: TokenKind, end: number) => {
    out.push({ text: src.slice(i, end), kind });
    i = end;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\n") {
      push("ws", i + 1);
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      let j = i + 1;
      while (j < src.length && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++;
      push("ws", j);
      continue;
    }
    const com = commentAt(src, i, lang);
    if (com === "line") {
      const nl = src.indexOf("\n", i);
      push("com", nl < 0 ? src.length : nl);
      continue;
    }
    if (com === "block") {
      const close = src.indexOf("*/", i + 2);
      push("com", close < 0 ? src.length : close + 2);
      continue;
    }
    if (QUOTES[lang].includes(c)) {
      push("str", stringEnd(src, i, lang));
      continue;
    }
    const rest = src.slice(i);
    // число; со знаком — только в JSON (в коде минус — оператор); в bash `1.2.3-x` — слово
    const sign = lang === "json" && c === "-" ? "-" : "";
    const digits = NUM.exec(rest.slice(sign.length))?.[0] ?? "";
    const tail = src[i + sign.length + digits.length] ?? " ";
    if (/\d/.test(digits) && !/[A-Za-z_$]/.test(tail) && (lang !== "bash" || !/[\w$./~:=@%+-]/.test(tail))) {
      push("num", i + sign.length + digits.length);
      continue;
    }
    const id = IDENT[lang].exec(rest)?.[0];
    if (id) {
      push(kw.has(id) ? "kw" : "id", i + id.length);
      continue;
    }
    push("punct", i + Array.from(rest)[0]!.length);
  }
  return out;
}

/**
 * Набранная к доле `p` (0..1) часть кода — целыми токенами. Каждый видимый токен и каждый
 * перевод строки — один «удар»; пробелы и отступы появляются вместе со следующим токеном
 * (хвостовых пробелов нет). p > 0 сразу даёт первый токен, p = 1 — весь текст.
 */
export function typedTokens<T extends CodeToken>(tokens: readonly T[], p: number): T[] {
  const weight = (t: CodeToken) => (t.kind !== "ws" || t.text.includes("\n") ? 1 : 0);
  const total = tokens.reduce((a, t) => a + weight(t), 0);
  const budget = Math.ceil(Math.max(0, Math.min(1, p)) * total - 1e-9);
  const out: T[] = [];
  const pending: T[] = [];
  let used = 0;
  for (const t of tokens) {
    const w = weight(t);
    if (w === 0) {
      pending.push(t);
      continue;
    }
    if (used + w > budget) break;
    out.push(...pending.splice(0), t);
    used += w;
  }
  return out;
}
