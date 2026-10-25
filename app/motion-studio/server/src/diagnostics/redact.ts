// Маскировка секретов (Task 48): журнал сервера, архив диагностики, stderr агентов, doctor.
// Ключи Anthropic, заголовки Authorization/Cookie/Set-Cookie, Bearer-токены, пары «ключ=значение»
// и «ключ: значение» с именами токенов, секретов, ключей API и паролей (любой регистр, camelCase,
// ключ в кавычках, значение в кавычках с пробелами) → «[скрыто]». Пути не трогает (это
// `maskPaths`/`maskExport`).

export const HIDDEN = "[скрыто]";

/** Имя ключа-секрета: `…token`, `…secret`, `…api_key`/`apiKey`/`x-api-key`, `…password`. Не `tokens`. */
const KEY = String.raw`[A-Za-z0-9_-]*?(?:token|secret|api[_-]?key|password|passwd)(?![A-Za-z0-9])`;
/** Значение: в кавычках (с пробелами) или до пробела/разделителя. */
const VALUE = String.raw`\[скрыто\]|"[^"\n]*"|'[^'\n]*'|[^\s"',;&}\]]+`;

const quoted = (v: string) => (v.startsWith('"') ? `"${HIDDEN}"` : v.startsWith("'") ? `'${HIDDEN}'` : HIDDEN);

/** Bearer без контекста заголовка: скрывается только токеноподобное значение, не слово прозы. */
const tokenLike = (v: string) => v.length >= 16 || /[0-9._~+/=-]/.test(v);

const RULES: [RegExp, (...m: string[]) => string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, () => HIDDEN],
  // Authorization: <схема> <значение> — значение скрывается всегда
  [/\b((?:proxy-)?authorization["']?\s*[:=]\s*["']?)(?:(bearer|basic|digest|token)\s+)?([^\s"',;]+)/gi,
    (_m, head, scheme) => `${head}${scheme ? `${scheme} ` : ""}${HIDDEN}`],
  // Cookie / Set-Cookie: значение в кавычках или до конца строки
  [/(["']?)\b((?:set-)?cookie)\1(\s*:\s*)("[^"\n]*"|'[^'\n]*'|[^\r\n]+)/gi, (_m, q, key, sep, v) => `${q}${key}${q}${sep}${quoted(v!)}`],
  [/\b(Bearer)\s+([A-Za-z0-9._~+/-]+=*)/gi, (m, b, v) => (v === undefined || !tokenLike(v) ? m : `${b} ${HIDDEN}`)],
  // ключ=значение, ключ: значение, "ключ": "значение"
  [new RegExp(String.raw`(["']?)(?<![A-Za-z0-9_-])(${KEY})\1(\s*[:=]\s*)(${VALUE})`, "gi"),
    (_m, q, key, sep, v) => `${q}${key}${q}${sep}${quoted(v!)}`],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, to] of RULES) out = out.replace(re, (...a: unknown[]) => to(...(a.filter((x) => typeof x === "string" || x === undefined) as string[])));
  return out;
}

/** Имена полей, значение которых скрывается целиком (любой регистр, camelCase, заголовки). */
const SECRET_KEY = /^(?:x-)?(?:[a-z0-9_-]*?(?:token|secret|api[_-]?key|password|passwd)|authorization|proxy-authorization|cookie|set-cookie)$/i;

/** Рекурсивно: строки — через `redact`, поля-секреты — целиком. */
export function redactDeep<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redact(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && x != null && typeof x !== "object" ? HIDDEN : walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
