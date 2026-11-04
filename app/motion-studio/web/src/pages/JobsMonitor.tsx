// Jobs Monitor (ТЗ §11.1): задачи с фильтром статуса, прогресс, ошибка; карточка задачи —
// журнал, отмена и повтор.
import { type JobStatus as Status, JobStatusSchema } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useId, useState } from "react";
import { api } from "../api/client.js";
import { useInfiniteJobs, useProjects } from "../api/queries.js";
import { JobStatus, jobErrorReason, jobErrorTitle, stageText } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { errorText, t, tk } from "../i18n/index.js";
import { navigate } from "../router.js";
import { dateTime } from "./Dashboard.js";

export function JobsMonitor({ status, projectId }: { status?: string; projectId?: string }) {
  const statusId = useId();
  const projectIdField = useId();
  const client = useQueryClient();
  const parsed = JobStatusSchema.safeParse(status);
  const filter: Status | undefined = parsed.success ? parsed.data : undefined;
  const jobs = useInfiniteJobs({ ...(filter ? { status: filter } : {}), ...(projectId ? { projectId } : {}) });
  const projects = useProjects();
  const [openJob, setOpenJob] = useState<string | null>(null);
  const list = jobs.data?.pages.flat() ?? [];
  // повторяются только видимые упавшие строки — не вся история
  const failedIds = list.filter((job) => job.status === "failed").map((job) => job.id);
  const failed = failedIds.length;
  const retry = useMutation({
    mutationFn: () => api.retryFailedJobs({ ids: failedIds }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <div className="page jobs">
      <h1>{t("jobs.title")}</h1>
      <div className="row">
        <label htmlFor={statusId}>{t("jobs.filter")}</label>
        <select id={statusId} value={filter ?? ""} onChange={(e) => navigate({ name: "jobs", ...(e.target.value ? { status: e.target.value } : {}), ...(projectId ? { projectId } : {}) }, { replace: true })}>
          <option value="">{t("jobs.all")}</option>
          {JobStatusSchema.options.map((s) => <option key={s} value={s}>{t(`job.status.${s}`)}</option>)}
        </select>
        <label htmlFor={projectIdField}>{t("jobs.projectFilter")}</label>
        <select id={projectIdField} value={projectId ?? ""} onChange={(e) => navigate({ name: "jobs", ...(filter ? { status: filter } : {}), ...(e.target.value ? { projectId: e.target.value } : {}) }, { replace: true })}>
          <option value="">{t("jobs.allProjects")}</option>
          {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
      </div>
      <div className="row jobs-actions">
        <button type="button" disabled={failed === 0 || retry.isPending} onClick={() => retry.mutate()}>{t("jobs.retryFailed", { n: failed })}</button>
        {retry.data ? <span className="muted small">{t("jobs.retryFailedResult", { retried: retry.data.retried.length, skipped: retry.data.skipped.length })}</span> : null}
      </div>
      {jobs.isError ? <p className="error">{errorText(jobs.error)}</p> : null}
      {retry.isError ? <p className="error">{errorText(retry.error)}</p> : null}
      {jobs.data && list.length === 0 ? <p className="muted">{t("jobs.empty")}</p> : null}
      <table className="jobs-table">
        <thead>
          <tr>
            <th>{t("jobs.col.type")}</th><th>{t("jobs.col.status")}</th><th>{t("jobs.col.stage")}</th><th>{t("jobs.col.progress")}</th>
            <th>{t("jobs.col.created")}</th><th>{t("jobs.col.error")}</th><th />
          </tr>
        </thead>
        <tbody>
          {list.map((j) => (
            <Fragment key={j.id}>
              <tr data-job-id={j.id} className={openJob === j.id ? "selected" : ""}>
                <td>
                  <div>{tk(`job.type.${j.type}`, j.type)}</div>
                  <div className="small job-location">
                    <Link to={{ name: "project", id: j.project_id }}>{j.project_title ?? t("jobs.unknownProject")}</Link>
                    {j.scene_id ? <Link to={{ name: "scene", id: j.scene_id }}>{j.scene_title ?? t("jobs.unknownScene")}</Link> : null}
                  </div>
                </td>
                <td><span className={`badge status-${j.status}`}>{t(`job.status.${j.status}`)}</span></td>
                <td>{stageText(j.stage)}</td>
                <td className="mono">{`${Math.round(j.progress * 100)}%`}</td>
                <td className="small">{dateTime(j.created_at)}</td>
                <td>
                  <div className="small">{jobErrorTitle(j) ?? ""}</div>
                  {jobErrorReason(j) ? <div className="muted small">{jobErrorReason(j)}</div> : null}
                </td>
                <td><button type="button" onClick={() => setOpenJob(openJob === j.id ? null : j.id)}>{openJob === j.id ? t("common.hide") : t("jobs.details")}</button></td>
              </tr>
              {openJob === j.id ? (
                <tr className="job-detail-row"><td colSpan={7}><div className="job-detail"><JobStatus jobId={j.id} /></div></td></tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {jobs.hasNextPage ? <button type="button" className="jobs-load-more" disabled={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>{t("jobs.loadMore")}</button> : null}
    </div>
  );
}
