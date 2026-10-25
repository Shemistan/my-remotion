// Приватность журнала сервера и архива диагностики (ревью Task 48).
//
// Тексты пользователя (сценарий, цитаты, слова транскрипта, имена файлов, ответы агентов, тексты
// ошибок) попадают в сообщения и данные событий. Правило — allowlist: без `includePrompts` у
// ВСЕХ событий и записей журнала, кроме видов из `SAFE_KINDS`, `message`/`msg` заменяется
// заглушкой, а в `data` остаются только ids, коды и счётчики. `SAFE_KINDS` — виды, у которых
// сообщение и данные собираются кодом только из ids, ревизий, чисел и литералов (прогресс,
// статусы без текста ошибки, тайминги, повторное использование); их сообщение проходит
// redact + maskExport. Новый вид события по умолчанию скрыт; тест-страж
// (`test/diagnostics/privacy.test.ts`) требует решения для каждого вида, который эмитит код:
// `SAFE_KINDS` или `HIDDEN_KINDS`.
//
// В журнал сервера события пишутся по тому же правилу всегда — полный текст остаётся в
// `job_events` (трассировка в UI); в архив он попадает только при `includePrompts`.
//
// Пути: `maskExport` — `maskDeep` (хранилище → «хранилище», дом → «~») плюс чужие домашние
// каталоги `/Users/<имя>` → `/Users/…` и том хранилища `/Volumes/<том>` → `/Volumes/…`.
import { homedir } from "node:os";
import { maskDeep } from "../api/job-dto.js";

export const USER_TEXT_HIDDEN = "[текст пользователя скрыт]";

/** Виды без свободного текста: сообщение и данные — только ids, ревизии, числа, литералы. */
export const SAFE_KINDS: ReadonlySet<string> = new Set([
  // раннер и восстановление: прогресс, старт, статусы без текста ошибки
  "progress", "started", "completed", "requeued", "locks_released", "recovered_completed",
  "fenced_out", "abort_timeout", "late_result_ignored", "permits_released",
  // повторное использование опубликованного
  "plan_reused", "edl_reused", "footage_reused", "proxy_reused", "preview_reused", "semantic_reused", "transcript_reused",
  "agent_checkpoint",
  // счётчики, тайминги, ревизии
  "shots", "keyframes_limited", "keyframes_missing", "windows", "windows_merged", "words_trimmed", "sync_check",
  "audio_duration_mismatch", "media_copied", "no_audio", "gpu_contention", "agent_objects_dropped",
  "proposals_suppressed", "no_change", "no_plan", "nothing_to_plan", "nothing_to_analyze", "agent_skipped",
  "plan_current", "plan_rechecked", "plan_restyled", "edl_changed", "transcript_changed", "transcript_mismatch",
  "style_kept", "style_changed_during_job", "fill_nothing", "fill_scene", "fill_done", "test_hook",
]);

/**
 * Виды со свободным текстом (решение принято: скрываются). Нужен тесту-стражу: каждый вид,
 * который эмитит код, — либо здесь, либо в `SAFE_KINDS`. Скрытие от списка не зависит:
 * скрыто всё, чего нет в `SAFE_KINDS`.
 */
export const HIDDEN_KINDS: ReadonlySet<string> = new Set([
  // статусы с текстом ошибки
  "failed", "blocked", "cancelled", "interrupted", "finish_failed", "awaiting_input", "awaiting_approval", "pending", "running",
  // сценарий: цитаты, детали пропусков и правок
  "quote_autofixed", "skip_dropped", "patch_scene_dropped", "fill_failed", "export_failed",
  // агенты: текст ответа, причины переотправки, отказы
  "agent_retry", "agent_retry_failed", "agent_retry_kept_first", "agent_failed", "budget", "agent_cut_rejected",
  "agent_unknown_shots", "agent_unknown_reviews", "agent_permission_denied",
  // разметка и план: элементы со словами транскрипта
  "semantic_rejected", "semantic_merge_rejected", "plan_problems", "style_fallback",
  // ASR и видео: hotwords, начало вывода, stderr, тексты ошибок детектора
  "hotwords_truncated", "asr_output_rejected", "asr_worker_failed", "vision_unavailable", "vision_failed", "vision_frame_errors",
  // тексты ошибок записи, имена файлов, произвольные строки
  "checkpoint_failed", "record_failed", "trash_purged", "log",
  // журнал сервера: ошибки API и сборки архива (текст ошибки)
  "api_error", "bundle_failed",
]);

/** Сообщение события этого вида может содержать текст пользователя (всё, кроме `SAFE_KINDS`). */
export function hasUserText(kind: string | undefined): boolean {
  return kind === undefined || !SAFE_KINDS.has(kind);
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
