// Статус задачи: тип, этап, прогресс, ошибка (понятный текст + технические подробности),
// журнал событий, отмена и повтор. blocked (stale_process): PID и команды процессов прежней
// попытки; повтор — только когда они завершились.
import type { Job, JobDetailDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { isActive, useJob } from "../api/queries.js";
import { errorText, t, tk } from "../i18n/index.js";

export interface JobStatusProps {
  jobId: string;
  compact?: boolean;
}

const EXPORT_CODES = ["transparent_unsupported", "fps_change_unsupported", "fps_tempo_mismatch"] as const;
const LOG_TAIL = 30;

/** Понятное описание ошибки задачи: известный код отказа экспорта или этап неудачи. */
export function jobErrorTitle(job: Job): string | null {
  const e = job.error;
  if (!e) return null;
  const prefix = /^([a-z_]+):/.exec(e.message)?.[1];
  const known = EXPORT_CODES.find((c) => c === prefix);
  if (known) return t(`exportErrors.${known}`);
  if (job.status === "blocked") return t("job.blocked");
  if (e.code !== "pipeline") return tk(`job.errorCode.${e.code}`, e.code);
  return t("job.failedAt", { stage: e.stage ? tk(`stage.${e.stage}`, e.stage) : t("stage.unknown") });
}

export const stageText = (s: string | null) => (s ? tk(`stage.${s}`, s) : t("stage.unknown"));

function Processes({ detail }: { detail: JobDetailDto }) {
  const procs = detail.processes.length > 0
    ? detail.processes
    : (detail.job.error?.pids ?? []).map((pid, i) => ({ pid, cmd: detail.job.error?.cmds?.[i] ?? "", alive: true }));
  if (procs.length === 0) return null;
  return (
    <table className="procs">
      <thead><tr><th>{t("job.pid")}</th><th>{t("job.cmd")}</th><th>{t("job.alive")}</th></tr></thead>
      <tbody>
        {procs.map((p) => (
          <tr key={p.pid}>
            <td className="mono">{p.pid}</td>
            <td className="mono wrap-any">{p.cmd}</td>
            <td>{p.alive ? t("job.aliveYes") : t("job.aliveNo")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function JobStatus({ jobId, compact }: JobStatusProps) {
  const client = useQueryClient();
  const q = useJob(jobId);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["job", jobId] });
    void client.invalidateQueries({ queryKey: ["jobs"] });
    void client.invalidateQueries({ queryKey: ["scene"] });
  };
  const cancel = useMutation({ mutationFn: () => api.cancelJob(jobId), onSuccess: refresh });
  const retry = useMutation({ mutationFn: () => api.retryJob(jobId), onSuccess: refresh });

  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  if (!q.data) return <p className="muted">{t("common.loading")}</p>;
  const { job, events } = q.data;
  const alive = q.data.processes.some((p) => p.alive) || (job.status === "blocked" && q.data.processes.length === 0 && (job.error?.pids?.length ?? 0) > 0);
  const canRetry = ["failed", "cancelled", "blocked"].includes(job.status);
  const title = jobErrorTitle(job);
  const pct = Math.round(job.progress * 100);

  return (
    <section className={`panel job-status status-${job.status}`} aria-label={t("job.title")} data-job={job.id}>
      <div className="row wrap">
        <strong>{tk(`job.type.${job.type}`, job.type)}</strong>
        <span className={`badge status-${job.status}`}>{t(`job.status.${job.status}`)}</span>
        {isActive(job.status) && job.stage ? <span className="muted">{stageText(job.stage)}</span> : null}
        {job.cancel_requested && job.status === "running" ? <span className="muted">{t("job.cancelRequested")}</span> : null}
      </div>
      {isActive(job.status) || job.status === "completed" ? (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("job.progress")}>
          <div style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {title ? <p className="error-title">{title}</p> : null}
      {job.error ? <pre className="log small">{job.error.message}</pre> : null}
      {job.status === "blocked" ? (
        <>
          <Processes detail={q.data} />
          {alive ? <p className="hint">{t("job.blockedHint")}</p> : null}
        </>
      ) : null}
      <div className="row">
        {isActive(job.status) && job.status !== "blocked" ? (
          <button type="button" disabled={cancel.isPending || job.cancel_requested} onClick={() => cancel.mutate()}>{t("job.cancel")}</button>
        ) : null}
        {canRetry ? (
          <button type="button" disabled={retry.isPending || alive} onClick={() => retry.mutate()}>{t("job.retry")}</button>
        ) : null}
        {job.status === "blocked" ? (
          <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{t("job.cancel")}</button>
        ) : null}
      </div>
      {cancel.isError ? <p className="error">{errorText(cancel.error)}</p> : null}
      {retry.isError ? <p className="error">{errorText(retry.error)}</p> : null}
      {!compact && events.length > 0 ? (
        <details className="job-log">
          <summary>{t("job.log", { n: events.length })}</summary>
          <pre className="log small">
            {events.slice(-LOG_TAIL).map((e) => `${e.ts.slice(11, 19)} ${e.level.padEnd(5)} ${e.kind}: ${e.message}`).join("\n")}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
