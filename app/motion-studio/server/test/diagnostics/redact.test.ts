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
