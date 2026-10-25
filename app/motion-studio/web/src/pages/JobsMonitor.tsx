// Jobs Monitor (ТЗ §11.1): задачи с фильтром статуса, прогресс, ошибка; карточка задачи —
// журнал, отмена и повтор.
import { type JobStatus as Status, JobStatusSchema } from "@ms/contracts";
import { useId, useState } from "react";
import { useJobs } from "../api/queries.js";
import { JobStatus, jobErrorTitle, stageText } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { errorText, t, tk } from "../i18n/index.js";
import { navigate } from "../router.js";
import { dateTime } from "./Dashboard.js";

export function JobsMonitor({ status }: { status?: string }) {
  const id = useId();
  const parsed = JobStatusSchema.safeParse(status);
  const filter: Status | undefined = parsed.success ? parsed.data : undefined;
  const jobs = useJobs(filter ? { status: filter } : {});
  const [openJob, setOpenJob] = useState<string | null>(null);
  const list = [...(jobs.data ?? [])].reverse();

  return (
    <div className="page jobs">
      <h1>{t("jobs.title")}</h1>
      <div className="row">
        <label htmlFor={id}>{t("jobs.filter")}</label>
        <select id={id} value={filter ?? ""} onChange={(e) => navigate({ name: "jobs", ...(e.target.value ? { status: e.target.value } : {}) }, { replace: true })}>
          <option value="">{t("jobs.all")}</option>
          {JobStatusSchema.options.map((s) => <option key={s} value={s}>{t(`job.status.${s}`)}</option>)}
        </select>
      </div>
      {jobs.isError ? <p className="error">{errorText(jobs.error)}</p> : null}
      {jobs.data?.length === 0 ? <p className="muted">{t("jobs.empty")}</p> : null}
      <table className="jobs-table">
        <thead>
          <tr>
            <th>{t("jobs.col.type")}</th><th>{t("jobs.col.status")}</th><th>{t("jobs.col.stage")}</th><th>{t("jobs.col.progress")}</th>
            <th>{t("jobs.col.created")}</th><th>{t("jobs.col.error")}</th><th />
          </tr>
        </thead>
        <tbody>
          {list.map((j) => (
            <tr key={j.id} data-job-id={j.id} className={openJob === j.id ? "selected" : ""}>
              <td>
                <div>{tk(`job.type.${j.type}`, j.type)}</div>
                {j.scene_id ? <Link to={{ name: "scene", id: j.scene_id }} className="small">{t("jobs.scene")}</Link> : null}
              </td>
              <td><span className={`badge status-${j.status}`}>{t(`job.status.${j.status}`)}</span></td>
              <td>{stageText(j.stage)}</td>
              <td className="mono">{`${Math.round(j.progress * 100)}%`}</td>
              <td className="small">{dateTime(j.created_at)}</td>
              <td className="small">{jobErrorTitle(j) ?? ""}</td>
              <td><button type="button" onClick={() => setOpenJob(openJob === j.id ? null : j.id)}>{openJob === j.id ? t("common.hide") : t("jobs.details")}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {openJob ? <div className="job-detail"><JobStatus jobId={openJob} /></div> : null}
    </div>
  );
}
