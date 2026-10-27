// Статус задачи: тип, этап, прогресс, стоимость (справочно), ошибка — `ErrorCard` (Task 48:
// понятный текст, подсказка и действия каталога, технические подробности),
// журнал событий, отмена и повтор. blocked (stale_process): PID и команды процессов прежней
// попытки; повтор — только когда они завершились.
import type { Job, JobDetailDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client.js";
import { isActive, useJob } from "../api/queries.js";
import { usd } from "../api/diagnostics-client.js";
import { errorText, t, tk } from "../i18n/index.js";
import { etaFrom } from "../ui/eta.js";
import { ErrorCard } from "./diagnostics/ErrorCard.js";
import { DisabledReason } from "./ui/DisabledReason.js";
import { ProgressStages, type ProgressStage } from "./ui/ProgressStages.js";
import { Skeleton } from "./ui/Skeleton.js";
import { pushToast } from "./ui/Toasts.js";

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
  const status = q.data?.job.status;
  const previous = useRef(status);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (!before || !status || !isActive(before) || isActive(status)) return;
    if (status === "completed") pushToast(t("ux.toast.jobCompleted"), "success");
    else if (status === "blocked") pushToast(t("ux.toast.jobBlocked"), "error");
    else if (status === "failed") pushToast(t("ux.toast.jobFailed"), "error");
  }, [status]);

  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  if (!q.data) return <Skeleton lines={2} compact />;
  const { job, events } = q.data;
  const alive = q.data.processes.some((p) => p.alive) || (job.status === "blocked" && q.data.processes.length === 0 && (job.error?.pids?.length ?? 0) > 0);
  const canRetry = ["failed", "cancelled", "blocked"].includes(job.status);
  const title = jobErrorTitle(job);
  const pct = Math.round(job.progress * 100);
  const progressStages: ProgressStage[] = job.status === "completed" ? [
    { id: "waiting", label: t("ux.progress.waiting"), state: "done" },
    { id: "current", label: job.stage ? stageText(job.stage) : t("ux.progress.current", { stage: stageText(job.stage) }), state: "done" },
    { id: "done", label: t("ux.progress.done"), state: "done" },
  ] : [
    { id: "waiting", label: t("ux.progress.waiting"), state: job.status === "pending" ? "current" : "done" },
    { id: "current", label: t("ux.progress.current", { stage: stageText(job.stage) }), state: job.status === "pending" ? "waiting" : "current" },
    { id: "done", label: t("ux.progress.finishing"), state: "waiting" },
  ];

  return (
    <section className={`panel job-status status-${job.status}`} aria-label={t("job.title")} data-job={job.id}>
      <div className="row wrap">
        <strong>{tk(`job.type.${job.type}`, job.type)}</strong>
        <span className={`badge status-${job.status}`}>{t(`job.status.${job.status}`)}</span>
        {isActive(job.status) && job.stage ? <span className="muted">{stageText(job.stage)}</span> : null}
        {job.cancel_requested && job.status === "running" ? <span className="muted">{t("job.cancelRequested")}</span> : null}
        {job.cost_usd ? <span className="muted small" title={t("diagnostics.costNote")}>{t("diagnostics.cost", { usd: usd(job.cost_usd) })}</span> : null}
      </div>
      {isActive(job.status) || job.status === "completed" ? (
        <ProgressStages stages={progressStages} progress={pct / 100} etaSeconds={isActive(job.status) ? etaFrom(job.started_at ?? job.created_at, job.progress) : null} />
      ) : null}
      {job.error ? <ErrorCard error={job.error} jobId={job.id} {...(title ? { title } : {})} /> : null}
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
          <DisabledReason reasonKey={alive ? "ux.disabled.activeProcess" : retry.isPending ? "ux.disabled.requestRunning" : null}>
            <button type="button" disabled={retry.isPending || alive} onClick={() => retry.mutate()}>{t("job.retry")}</button>
          </DisabledReason>
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
          <pre className="log small" tabIndex={0} aria-label={t("job.log", { n: events.length })}>
            {events.slice(-LOG_TAIL).map((e) => `${e.ts.slice(11, 19)} ${e.level.padEnd(5)} ${e.kind}: ${e.message}`).join("\n")}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
