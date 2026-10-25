// Приватность журнала сервера и архива диагностики (ревью Task 48).
//
// Тексты пользователя: сценарий, цитаты, слова транскрипта, ответы агентов попадают в сообщения
// и данные событий. В журнал сервера такие события пишутся без текста (только kind, level,
// корреляция, ids и коды) — полный текст остаётся в `job_events` (трассировка в UI). В архив
// диагностики события с текстом пользователя попадают целиком только при `includePrompts`.
//
// Какие события несут текст пользователя:
//  - все события задач `script.*` (сценарий, цитаты: quote_autofixed, skip_dropped,
//    patch_scene_dropped, fill_failed, export_failed, failed и т. д.);
//  - в прочих задачах — события из `USER_TEXT_KINDS` (переотправки агентов с текстом ответа,
//    отклонённые элементы разметки и плана, hotwords и начало вывода ASR, вырезки агента).
//
// Пути: `maskExport` — `maskDeep` (хранилище → «хранилище», дом → «~») плюс чужие домашние
// каталоги `/Users/<имя>` → `/Users/…` и том хранилища `/Volumes/<том>` → `/Volumes/…`.
import { homedir } from "node:os";
import { maskDeep } from "../api/job-dto.js";

export const USER_TEXT_HIDDEN = "[текст пользователя скрыт]";

/** Виды событий с текстом пользователя в задачах не `script.*` (найдены по `ctx.emit` конвейеров). */
export const USER_TEXT_KINDS: ReadonlySet<string> = new Set([
  // сценарий (на случай вызова вне script.*)
  "quote_autofixed", "skip_dropped", "patch_scene_dropped", "fill_failed", "export_failed",
  // агенты: текст ответа, причины переотправки, отказ
  "agent_retry", "agent_retry_failed", "agent_retry_kept_first", "agent_failed", "budget", "agent_cut_rejected",
  "agent_unknown_shots", "agent_unknown_reviews",
  // разметка и план: отклонённые элементы со словами транскрипта
  "semantic_rejected", "semantic_merge_rejected", "plan_problems", "style_fallback",
  // ASR: hotwords пользователя, начало вывода (слова), хвост stderr
  "hotwords_truncated", "asr_output_rejected", "asr_worker_failed",
]);

export function hasUserText(kind: string, jobType: string | undefined): boolean {
  return (jobType?.startsWith("script.") ?? false) || USER_TEXT_KINDS.has(kind);
}

/** Поля данных, которые остаются: идентификаторы, коды, счётчики. */
const KEEP_KEY = /^(?:id|code|codes|reason|count|attempt|round|kind|stage|status|[a-z0-9_]+_id|[a-z0-9_]+_code)$/;
const SAFE_STR = /^[A-Za-z0-9_.:-]{1,100}$/;

function keepCodes(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!KEEP_KEY.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && SAFE_STR.test(v))) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Событие задачи без текста пользователя: `message` → заглушка, `data` → только ids и коды. */
export function stripEvent<T extends { message: string; data?: unknown }>(ev: T): T {
  const { data, ...rest } = ev;
  const kept = keepCodes(data);
  return { ...rest, message: USER_TEXT_HIDDEN, ...(kept ? { data: kept } : {}) } as T;
}

/** Запись журнала без текста пользователя: `msg` → заглушка, `data` → только ids и коды. */
export function stripLogEntry<T extends { msg: string; data?: unknown }>(e: T): T {
  const { data, ...rest } = e;
  const kept = keepCodes(data);
  return { ...rest, msg: USER_TEXT_HIDDEN, ...(kept ? { data: kept } : {}) } as T;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Пути наружу (архив, `/api/logs`): `maskDeep` + чужие `/Users/<имя>` и том хранилища. */
export function maskExport<T>(value: T, root: string, home: string = homedir()): T {
  const masked = maskDeep(value, root, home);
  const vol = /^\/Volumes\/[^/]+/.exec(root)?.[0];
  const volRe = vol ? new RegExp(`${escapeRe(vol)}(?=/|$|[^\\p{L}\\p{N}._~-])`, "gu") : undefined;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      let s = v;
      if (volRe) s = s.replace(volRe, "/Volumes/…");
      return s.replace(/\/Users\/(?!…)[^/\s"'`]+/g, "/Users/…");
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(masked) as T;
}
