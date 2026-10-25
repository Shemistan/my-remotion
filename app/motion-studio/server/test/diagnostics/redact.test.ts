// redact: токены и ключи в журналах, архиве диагностики и stderr агентов → «[скрыто]».
import { expect, it } from "vitest";
import { redact, redactDeep } from "../../src/diagnostics/redact.js";

it("ключи Anthropic и Bearer-токены", () => {
  expect(redact("token sk-ant-api03-AbC_12 and Bearer xyz.abc")).toBe("token [скрыто] and Bearer [скрыто]");
});

it("переменные окружения с ключами и OAuth-токены в JSON", () => {
  expect(redact("ANTHROPIC_API_KEY=sk-x1 next")).toBe("ANTHROPIC_API_KEY=[скрыто] next");
  expect(redact("CLAUDE_CODE_OAUTH_TOKEN=abc123 ok")).toBe("CLAUDE_CODE_OAUTH_TOKEN=[скрыто] ok");
  expect(redact('{"access_token": "a.b.c", "refresh_token":"zzz", "x": 1}')).toBe('{"access_token": "[скрыто]", "refresh_token":"[скрыто]", "x": 1}');
  expect(redact("authorization: bearer abc")).toBe("authorization: bearer [скрыто]");
});

it("обычный текст не меняется", () => {
  expect(redact("рендер 1920×1080, задача job_1")).toBe("рендер 1920×1080, задача job_1");
  expect(redact("sk-antenna, Bearer")).toBe("sk-antenna, Bearer");
});

it("redactDeep: строки во вложенных объектах и массивах, ключи-секреты целиком", () => {
  const v = redactDeep({ a: ["Bearer t0k"], b: { c: "sk-ant-zz", n: 5 }, api_key: "plain", token: "x" });
  expect(v).toEqual({ a: ["Bearer [скрыто]"], b: { c: "[скрыто]", n: 5 }, api_key: "[скрыто]", token: "[скрыто]" });
});

it("заголовки: Authorization Basic, Cookie и Set-Cookie, x-api-key", () => {
  expect(redact("Authorization: Basic dXNlcjpwYXNz")).toBe("Authorization: Basic [скрыто]");
  expect(redact("Cookie: sid=abc; theme=dark\nnext")).toBe("Cookie: [скрыто]\nnext");
  expect(redact("set-cookie: sid=abc; Path=/; HttpOnly")).toBe("set-cookie: [скрыто]");
  expect(redact('{"cookie": "sid=abc", "x": 1}')).toBe('{"cookie": "[скрыто]", "x": 1}');
  expect(redact("x-api-key: k-123 ok")).toBe("x-api-key: [скрыто] ok");
});

it("camelCase, форма KEY: v, нижний регистр, значения в кавычках с пробелами", () => {
  expect(redact('{"accessToken":"a.b","apiKey": "k 1"}')).toBe('{"accessToken":"[скрыто]","apiKey": "[скрыто]"}');
  expect(redact("apiKey=xyz rest")).toBe("apiKey=[скрыто] rest");
  expect(redact("ANTHROPIC_API_KEY: sk-x1 next")).toBe("ANTHROPIC_API_KEY: [скрыто] next");
  expect(redact("anthropic_api_key=abc next")).toBe("anthropic_api_key=[скрыто] next");
  expect(redact('MY_SECRET="two words" tail')).toBe('MY_SECRET="[скрыто]" tail');
  expect(redact("password='a b c' tail")).toBe("password='[скрыто]' tail");
  // счётчики токенов — не секреты
  expect(redact("input_tokens: 1200, max_tokens=4000")).toBe("input_tokens: 1200, max_tokens=4000");
});

it("Bearer: скрывается токеноподобное значение, следующее слово прозы — нет", () => {
  expect(redact("Bearer eyJhbGciOi.payload.sig")).toBe("Bearer [скрыто]");
  expect(redact("Bearer abcdefghijklmnopqrstuv")).toBe("Bearer [скрыто]");
  expect(redact("the Bearer of bad news")).toBe("the Bearer of bad news");
  expect(redact("Bearer token required")).toBe("Bearer token required");
});

it("redactDeep: поля camelCase и заголовки — целиком; счётчики токенов не трогает", () => {
  expect(redactDeep({ accessToken: "a", apiKey: "b", "x-api-key": "c", "set-cookie": "d", input_tokens: 5 }))
    .toEqual({ accessToken: "[скрыто]", apiKey: "[скрыто]", "x-api-key": "[скрыто]", "set-cookie": "[скрыто]", input_tokens: 5 });
});
