// Карточка ошибки (Task 48): этап, понятный текст и подсказка из каталога ошибок, действия
// каталога, «Технические подробности» (исходное сообщение). Повтор задачи продолжает с
// последнего успешного шага (чекпоинты, ТЗ §11.3) — кнопка `retry` появляется, если передан
// `onRetry`; иначе действие показывается подсказкой (кнопку держит владелец, напр. JobStatus).
import { type ErrorAction, explainError } from "@ms/contracts/diagnostics";
import type { ReactNode } from "react";
import { diagnosticsHref } from "../../api/diagnostics-client.js";
import { t, tk } from "../../i18n/index.js";
import { navigate } from "../../router.js";

export interface ErrorCardProps {
  /** Ошибка задачи (`JobError`) или API (`{ error, message }`). */
  error: { code: string; message?: string; stage?: string } | { error: string; message?: string };
  jobId?: string;
  /** Свой заголовок (напр. известный код отказа экспорта); иначе — из каталога. */
  title?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  children?: ReactNode;
}

const HINT_ACTIONS: ErrorAction[] = ["wait_storage", "kill_process", "reapprove", "rebuild_timeline"];

function go(e: { preventDefault(): void; button: number; metaKey: boolean; ctrlKey: boolean }, url: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigate(url);
}

export function ErrorCard({ error, jobId, title, onRetry, retryDisabled, children }: ErrorCardProps) {
  const v = explainError(error);
  const heading = title ?? (v.unknown ? t("errors.generic", { message: v.message || v.code }) : tk(v.title, v.code, { message: v.message }));
  const logs = diagnosticsHref(jobId);
  return (
    <div className="error-card" role="alert" data-error-code={v.code}>
      {v.stage ? <p className="muted small">{t("diagnostics.error.stage", { stage: tk(`stage.${v.stage}`, v.stage) })}</p> : null}
      <p className="error-title">{heading}</p>
      {v.hint ? <p className="hint">{tk(v.hint, "")}</p> : null}
      {v.actions.filter((a) => HINT_ACTIONS.includes(a)).map((a) => <p key={a} className="hint small">{tk(`diagnostics.action.${a}`, a)}</p>)}
      <div className="row wrap">
        {v.actions.includes("retry") && onRetry ? (
          <button type="button" disabled={retryDisabled} onClick={onRetry}>{t("diagnostics.action.retry")}</button>
        ) : null}
        {v.actions.includes("retry") && !onRetry ? <span className="hint small">{t("diagnostics.action.retryHint")}</span> : null}
        {v.actions.includes("open_settings") ? <a href="/settings" onClick={(e) => go(e, "/settings")}>{t("diagnostics.action.open_settings")}</a> : null}
        <a href={logs} onClick={(e) => go(e, logs)}>{t("diagnostics.action.open_logs")}</a>
      </div>
      {v.message || children ? (
        <details className="tech">
          <summary>{t("diagnostics.error.details")}</summary>
          {v.message ? <pre className="log small">{v.message}</pre> : null}
          {children}
        </details>
      ) : null}
    </div>
  );
}
