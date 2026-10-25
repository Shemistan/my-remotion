// Маскировка секретов (Task 48): журнал сервера, архив диагностики, stderr агентов, doctor.
// Ключи Anthropic, Bearer-токены, переменные окружения с ключами/токенами, OAuth-токены в JSON
// → «[скрыто]». Пути не трогает (это `maskPaths` ответов API).

export const HIDDEN = "[скрыто]";

const RULES: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, HIDDEN],
  [/\b(Bearer)\s+[^\s"',;]+/gi, `$1 ${HIDDEN}`],
  [/\b(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|[A-Z][A-Z0-9_]*(?:_TOKEN|_SECRET|_API_KEY|_PASSWORD))=\S+/g, `$1=${HIDDEN}`],
  [/("(?:access|refresh|id)_token"\s*:\s*)"[^"]*"/g, `$1"${HIDDEN}"`],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

/** Имена полей, значение которых скрывается целиком. */
const SECRET_KEY = /^(?:api[_-]?key|token|access_token|refresh_token|id_token|secret|password|authorization|cookie)$/i;

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
