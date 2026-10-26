// Центр восстановления (Task 47): отчёт последнего запуска (штатный или после сбоя, итог,
// «Понятно»), задачи, прерванные сбоем, с исходом; заблокированные задачи с PID и командами;
// черновики в карантине — «Посмотреть журнал» (события задачи) и «Удалить черновик» только
// через подтверждение со сводкой (`quarantine/intent` → `discard`).
import type { Job, RecoveryDto } from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../api/client.js";
import { dateTime, projectsApi, useRecovery } from "../api/projects-client.js";
import { stageText } from "../components/JobStatus.js";
import { sizeText } from "../components/projects/DeleteDialog.js";
import { errorText, t, tk } from "../i18n/index.js";

type Quarantined = RecoveryDto["quarantined"][number];

function JobRow({ j }: { j: Job }) {
  const err = j.error as { message?: string; pids?: number[]; cmds?: string[] } | null;
  return (
    <li data-job-id={j.id}>
      <div className="row wrap">
        <span>{tk(`job.type.${j.type}`, j.type)}</span>
        <span className={`badge status-${j.status}`}>{t(`job.status.${j.status}`)}</span>
        <span className="muted">{stageText(j.stage)}</span>
        <span className="mono small">{j.id}</span>
      </div>
      {err?.message ? <p className="muted small">{err.message}</p> : null}
      {err?.pids?.length ? (
        <ul className="mono small">
          {err.pids.map((pid, i) => <li key={pid}>{t("recovery.pid", { pid, cmd: err.cmds?.[i] ?? "" })}</li>)}
        </ul>
      ) : null}
    </li>
  );
}

function JobLog({ jobId }: { jobId: string }) {
  const q = useQuery({ queryKey: ["job", jobId], queryFn: () => api.job(jobId) });
  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  if (!q.data) return <p className="muted">{t("common.loading")}</p>;
  if (q.data.events.length === 0) return <p className="muted">{t("recovery.noEvents")}</p>;
  return (
    <ul className="mono small" data-testid="job-log">
      {q.data.events.map((e) => <li key={e.id}>{`${dateTime(e.ts)} ${e.level} ${e.kind}: ${e.message}`}</li>)}
    </ul>
  );
}

function DiscardDialog({ dir, onClose }: { dir: string; onClose: () => void }) {
  const uid = useId();
  const client = useQueryClient();
  const intent = useQuery({ queryKey: ["discard-intent", dir], queryFn: () => projectsApi.discardIntent(dir), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  const discard = useMutation({
    mutationFn: () => projectsApi.discard(dir, intent.data!.token),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["recovery"] });
      onClose();
    },
  });
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`}>{t("recovery.discardTitle")}</h2>
        {intent.isError ? <p className="error">{errorText(intent.error)}</p> : null}
        {intent.data ? <p>{t("recovery.discardSummary", { dir, size: sizeText(intent.data.bytes) })}</p> : <p className="muted">{t("common.loading")}</p>}
        {discard.isError ? <p className="error">{errorText(discard.error)}</p> : null}
        <div className="row end">
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={!intent.data || discard.isPending} onClick={() => discard.mutate()}>{t("recovery.discardConfirm")}</button>
        </div>
      </div>
    </div>
  );
}

function QuarantineRow({ q }: { q: Quarantined }) {
  const [log, setLog] = useState(false);
  const [discard, setDiscard] = useState(false);
  return (
    <li data-quarantine={q.rel_path}>
      <div className="row wrap">
        <span className="mono small">{q.rel_path}</span>
        {q.bytes !== undefined ? <span className="muted small">{sizeText(q.bytes)}</span> : null}
        {q.at ? <span className="muted small">{dateTime(q.at)}</span> : null}
      </div>
      <p className="muted small">{t("recovery.reason", { reason: q.reason })}</p>
      <div className="row">
        <button type="button" onClick={() => setLog((v) => !v)}>{log ? t("recovery.hideLog") : t("recovery.showLog")}</button>
        <button type="button" onClick={() => setDiscard(true)}>{t("recovery.discard")}</button>
      </div>
      {log ? (q.job_id ? <JobLog jobId={q.job_id} /> : <p className="muted">{t("recovery.noJobLog")}</p>) : null}
      {discard ? <DiscardDialog dir={q.rel_path} onClose={() => setDiscard(false)} /> : null}
    </li>
  );
}

export function RecoveryCenter() {
  const q = useRecovery();
  const client = useQueryClient();
  const ack = useMutation({
    mutationFn: (id: string) => projectsApi.ack(id),
    onSuccess: (r) => client.setQueryData(["recovery"], r),
  });
  const r = q.data;
  return (
    <div className="page recovery">
      <h1>{t("recovery.title")}</h1>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {!r && !q.isError ? <p className="muted">{t("common.loading")}</p> : null}
      {r ? (
        <div className="stack">
          <section className="panel" data-testid="recovery-boot">
            {!r.boot ? <p className="muted">{t("recovery.noBoot")}</p> : (
              <>
                <p>
                  {t("recovery.lastBoot", { at: dateTime(r.boot.created_at) })}
                  {" · "}
                  <span className={r.boot.crashed ? "badge status-failed" : "badge status-completed"}>{r.boot.crashed ? t("recovery.crashed") : t("recovery.clean")}</span>
                </p>
                {r.boot.summary ? <p>{t("recovery.summary", r.boot.summary)}</p> : null}
                {r.boot.warnings?.length ? (
                  <ul className="small" data-testid="recovery-warnings">
                    {r.boot.warnings.map((w, i) => <li key={i} className="warn" data-kind={w.kind}>{t("recovery.warning", { message: w.message })}</li>)}
                  </ul>
                ) : null}
                {r.boot.acknowledged_at ? (
                  <p className="muted small">{t("recovery.acked", { at: dateTime(r.boot.acknowledged_at) })}</p>
                ) : (
                  <button type="button" disabled={ack.isPending} onClick={() => ack.mutate(r.boot!.id)}>{t("recovery.ack")}</button>
                )}
                {ack.isError ? <p className="error">{errorText(ack.error)}</p> : null}
              </>
            )}
          </section>
          <section className="panel">
            <h2>{t("recovery.interrupted")}</h2>
            {r.interrupted.length === 0 ? <p className="muted">{t("recovery.noInterrupted")}</p> : <ul className="job-list">{r.interrupted.map((j) => <JobRow key={j.id} j={j} />)}</ul>}
          </section>
          <section className="panel">
            <h2>{t("recovery.blocked")}</h2>
            {r.blocked.length === 0 ? <p className="muted">{t("recovery.noBlocked")}</p> : (
              <>
                <p className="hint">{t("recovery.blockedHint")}</p>
                <ul className="job-list">{r.blocked.map((j) => <JobRow key={j.id} j={j} />)}</ul>
              </>
            )}
          </section>
          <section className="panel">
            <h2>{t("recovery.quarantine")}</h2>
            {r.quarantined.length === 0 ? <p className="muted">{t("recovery.noQuarantine")}</p> : (
              <>
                <p className="hint">{t("recovery.quarantineHint")}</p>
                <ul className="job-list">{r.quarantined.map((x) => <QuarantineRow key={x.rel_path} q={x} />)}</ul>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
