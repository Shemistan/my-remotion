// Доступ к строкам интерфейса: `t(key, params)` — ключ словаря `ru.ts`, `{name}` в строке
// заменяется параметром. Второй язык — второй словарь того же вида (библиотеки i18n не нужно).
import { ruPlural } from "@ms/contracts";
import { ApiError } from "../api/client.js";
import { ru } from "./ru.js";

export type TKey = keyof typeof ru;
type Params = Record<string, string | number>;

export function t(key: TKey, params?: Params): string {
  const s: string = ru[key];
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function hasKey(key: string): key is TKey {
  return Object.prototype.hasOwnProperty.call(ru, key);
}

/** Строка с числом `n` в нужной форме: ключи `${base}.one` / `.few` / `.many` (`{n}` — само число). */
export function tn(base: string, n: number, params: Params = {}): string {
  const form = ruPlural(n, "one", "few", "many");
  return tk(`${base}.${form}`, String(n), { n, ...params });
}

/** Строка по составному ключу (`qa.gate.${g}`); нет такого ключа — запасной текст. */
export function tk(key: string, fallback: string, params?: Params): string {
  return hasKey(key) ? t(key, params) : fallback;
}

/** Понятный текст ошибки: известный код API — из словаря, иначе общий с сообщением сервера. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return tk(`errors.${e.code}`, t("errors.generic", { message: e.message || e.code }), { message: e.message || e.code });
  return t("errors.network");
}
