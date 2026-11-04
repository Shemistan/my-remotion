// Dashboard (ТЗ §11.1): проекты (поиск, архив, корзина — Task 47), баннер восстановления после
// сбоя, активные задачи, последние экспорты, «Новый проект», затраты на агентов (Task 49a).
// Служебные проекты bench скрывает сервер (`GET /projects`). Страница проекта — сцены,
// экспорты проекта и новая сцена по промпту.
import { type HistoryEntry, type Job, type ProjectDto, type Settings, defaultSettings } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, newKey, urls } from "../api/client.js";
import { isActive, useAppSettings, useJobs, useProject } from "../api/queries.js";
import { timelineUrls } from "../api/timeline-client.js";
import { jobErrorReason, stageText } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { CostSummary } from "../components/costs/CostSummary.js";
import { ProjectList } from "../components/projects/ProjectList.js";
import { RecoveryBanner } from "../components/projects/RecoveryBanner.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Skeleton } from "../components/ui/Skeleton.js";
import { versionState } from "../components/VersionHistory.js";
import { errorText, t, tk } from "../i18n/index.js";
import { navigate } from "../router.js";
import { VideoWorkspace } from "./VideoWorkspace.js";
import { ScriptWorkspace } from "./script/ScriptWorkspace.js";

export const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

function exportIdOf(j: Job): string | undefined {
  const id = (j.output_refs as { export_id?: unknown } | null)?.export_id;
  return typeof id === "string" ? id : undefined;
}

const isFinal = (j: Job): boolean => j.type === "final.render" || j.type === "final.reproduce";

function NewProject() {
  const id = useId();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: (kind: ProjectDto["kind"]) => api.createProject(title.trim(), kind),
    onSuccess: (p) => {
      setTitle("");
      void client.invalidateQueries({ queryKey: ["projects"] });
      navigate({ name: "project", id: p.id });
    },
  });
  return (
    <form className="panel new-project" onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate("playground"); }}>
      <h2>{t("dashboard.newProject")}</h2>
      <label htmlFor={id}>{t("dashboard.projectTitle")}</label>
      <input id={id} className="new-project-title" value={title} placeholder={t("dashboard.projectTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
      <div className="row wrap">
        {(["playground", "video", "script"] as const).map((kind) => (
          <button
            key={kind}
            type={kind === "playground" ? "submit" : "button"}
            className={kind === "playground" ? "primary" : undefined}
            disabled={!title.trim() || create.isPending}
            onClick={kind === "playground" ? undefined : () => create.mutate(kind)}
          >
            {t(kind === "playground" ? "dashboard.create" : kind === "video" ? "dashboard.createVideo" : "dashboard.createScript")}
          </button>
        ))}
      </div>
      {!title.trim() ? <p className="hint">{t("ux.disabled.enterProjectTitle")}</p> : null}
      {create.isError ? <p className="error">{errorText(create.error)}</p> : null}
    </form>
  );
}

type JobsQuery = ReturnType<typeof useJobs>;

/** Загрузка или ошибка запроса задач: «пусто» показывается только по данным. */
function JobsState({ q }: { q: JobsQuery }) {
  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  return <Skeleton lines={2} compact />;
}

function ActiveJobs({ q, failed }: { q: JobsQuery; failed: JobsQuery }) {
  const active = (q.data ?? []).filter((j) => isActive(j.status));
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const failedLastDay = (failed.data ?? []).filter((j) => new Date(j.finished_at ?? j.created_at).getTime() >= since).length;
  return (
    <section className="panel">
      <h2>{t("dashboard.activeJobs")}</h2>
      {!q.data || q.isError ? <JobsState q={q} /> : active.length === 0 ? <EmptyState compact title={t("dashboard.noActiveJobs")} description={t("ux.dashboard.jobsEmpty.description")} /> : (
        <ul className="job-list">
          {active.map((j) => (
            <li key={j.id}>
              <span>{tk(`job.type.${j.type}`, j.type)}</span>
              <span className={`badge status-${j.status}`}>{t(`job.status.${j.status}`)}</span>
              <span className="muted">{stageText(j.stage)}</span>
              <span className="mono">{`${Math.round(j.progress * 100)}%`}</span>
              {j.scene_id ? <Link to={{ name: "scene", id: j.scene_id }}>{t("dashboard.openScene")}</Link> : null}
            </li>
          ))}
        </ul>
      )}
      {failedLastDay > 0 ? <p><Link to={{ name: "jobs", status: "failed" }}>{t("dashboard.failedLastDay", { n: failedLastDay })}</Link></p> : null}
      <Link to={{ name: "jobs" }}>{t("dashboard.allJobs")}</Link>
    </section>
  );
}

function RecentExports({ q }: { q: JobsQuery }) {
  // Task 45: и финалы видеопроектов (`final.render`, `final.reproduce`) — файл финала
  const done = (q.data ?? []).filter((j) => (j.type === "scene.export" || isFinal(j)) && j.status === "completed" && exportIdOf(j)).slice(0, 10);
  return (
    <section className="panel">
      <h2>{t("dashboard.recentExports")}</h2>
      {!q.data || q.isError ? <JobsState q={q} /> : done.length === 0 ? <EmptyState compact title={t("dashboard.noExports")} description={t("ux.dashboard.exportsEmpty.description")} /> : (
        <ul className="job-list">
          {done.map((j) => {
            const format = (j.output_refs as { format?: string } | null)?.format ?? "";
            const final = isFinal(j);
            return (
              <li key={j.id}>
                <span>{final ? t("dashboard.finalExport") : tk(`export.format.${format}`, format)}</span>
                <Link to={{ name: "project", id: j.project_id }}>{j.project_title ?? j.project_id}</Link>
                {j.scene_id ? <Link to={{ name: "scene", id: j.scene_id }}>{j.scene_title ?? j.scene_id}</Link> : null}
                <span className="muted">{j.finished_at ? dateTime(j.finished_at) : ""}</span>
                <a href={final ? timelineUrls.finalFile(exportIdOf(j)!) : urls.exportFile(exportIdOf(j)!)} download>{t("export.download")}</a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const jobs = useJobs();
  const failed = useJobs({ status: "failed", limit: 500 });
  return (
    <div className="page dashboard">
      <h1>{t("dashboard.title")}</h1>
      <RecoveryBanner />
      <div className="grid-2">
        <section className="panel">
          <h2>{t("dashboard.projects")}</h2>
          {/* Task 47: поиск, активные / архив / корзина, переименование, архив, удаление */}
          <ProjectList />
        </section>
        <div className="stack">
          <NewProject />
          <ActiveJobs q={jobs} failed={failed} />
          <RecentExports q={jobs} />
          {/* Task 49a: затраты за 7/30 дней, справочно */}
          <CostSummary />
        </div>
      </div>
    </div>
  );
}

function NewScene({ projectId, initial }: { projectId: string; initial: Settings }) {
  const id = useId();
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>(initial);
  const [key] = useState(newKey);
  const create = useMutation({
    mutationFn: () => api.createScene(projectId, { prompt: prompt.trim(), settings }, key),
    onSuccess: (r) => navigate({ name: "scene", id: r.scene.id }),
  });
  return (
    <form className="panel new-scene" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) create.mutate(); }}>
      <h2>{t("project.newScene")}</h2>
      <label htmlFor={id}>{t("project.prompt")}</label>
      <textarea id={id} rows={4} value={prompt} placeholder={t("project.promptPlaceholder")} onChange={(e) => setPrompt(e.target.value)} />
      <details>
        <summary>{t("project.sceneSettings")}</summary>
        <SettingsForm value={settings} onChange={setSettings} />
      </details>
      <p className="hint">{t("project.generateHint")}</p>
      {create.isError ? <p className="error">{errorText(create.error)}</p> : null}
      <button type="submit" className="primary" disabled={!prompt.trim() || create.isPending}>{t("project.generate")}</button>
    </form>
  );
}

const sceneLine = (v: HistoryEntry | null) =>
  v ? `${t("versions.label", { n: v.number })} · ${t(`versions.status.${versionState(v)}`)}` : t("project.noVersions");

export function ProjectPage({ id }: { id: string }) {
  const q = useProject(id);
  const app = useAppSettings();
  const client = useQueryClient();
  const [sceneFilter, setSceneFilter] = useState<"all" | "failed" | "ready">("all");
  // повтор — только последняя упавшая задача сцены без готовой версии, не вся история проекта
  const retryFailed = useMutation({
    mutationFn: (ids: string[]) => api.retryFailedJobs({ ids }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["project", id] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  if (q.isError) return <div className="page"><p className="error">{errorText(q.error)}</p></div>;
  if (!q.data) return <div className="page"><Skeleton lines={5} /></div>;
  const { project, scenes, exports } = q.data;
  // видеопроект (Task 29): Video Workspace; сцены проекта (если есть) — списком внизу
  if (project.kind === "video") return <VideoWorkspace id={project.id} scenes={scenes} />;
  // сценарный проект: текст → план → сцены → экспорт
  if (project.kind === "script") return <ScriptWorkspace project={project} />;
  const initial = project.settings ?? app.data?.defaults ?? defaultSettings();
  const isFailed = (s: (typeof scenes)[number]) => s.last_job?.status === "failed" && s.current_version?.status !== "ready";
  const failedIds = scenes.filter(isFailed).map((s) => s.last_job!.id);
  const failedCount = failedIds.length;
  const titleCounts = new Map<string, number>();
  for (const scene of scenes) titleCounts.set(scene.title, (titleCounts.get(scene.title) ?? 0) + 1);
  const visibleScenes = scenes.filter((s) => sceneFilter === "all"
    || (sceneFilter === "failed" && isFailed(s))
    || (sceneFilter === "ready" && s.current_version?.status === "ready"));
  return (
    <div className="page project">
      <nav className="crumbs"><Link to={{ name: "dashboard" }}>{t("nav.dashboard")}</Link></nav>
      <h1>{project.title}</h1>
      <div className="grid-2">
        <section className="panel">
          <h2>{t("project.scenes")}</h2>
          {scenes.length === 0 ? <EmptyState title={t("project.noScenes")} description={t("ux.project.scenesEmpty.description")} /> : null}
          {scenes.length > 0 ? (
            <div className="row wrap scene-filters">
              <div className="segmented" role="group" aria-label={t("project.sceneFilter.label")}>
                {(["all", "failed", "ready"] as const).map((filter) => (
                  <button key={filter} type="button" className={sceneFilter === filter ? "active" : ""} aria-pressed={sceneFilter === filter} onClick={() => setSceneFilter(filter)}>
                    {t(`project.sceneFilter.${filter}`)}
                  </button>
                ))}
              </div>
              <button type="button" disabled={failedCount === 0 || retryFailed.isPending} onClick={() => retryFailed.mutate(failedIds)}>
                {t("project.retryFailed", { n: failedCount })}
              </button>
            </div>
          ) : null}
          {retryFailed.isError ? <p className="error">{errorText(retryFailed.error)}</p> : null}
          <ul className="scene-cards">
            {visibleScenes.map((s) => {
              const ready = s.current_version?.status === "ready";
              const failed = isFailed(s);
              const active = s.last_job && isActive(s.last_job.status);
              return (
                <li key={s.id} data-scene-id={s.id}>
                  <Link to={{ name: "scene", id: s.id }} className="scene-card">
                    {ready ? (
                      <img src={urls.poster(s.current_version!.version_id)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    ) : <div className="thumb-empty" />}
                    <span className="row wrap">
                      <span className="strong">{s.title}</span>
                      {failed ? <span className="badge status-failed">{t("job.status.failed")}</span> : null}
                      {!failed && active ? <span className={`badge status-${s.last_job!.status}`}>{t(`job.status.${s.last_job!.status}`)}</span> : null}
                    </span>
                    {(titleCounts.get(s.title) ?? 0) > 1 && s.excerpt ? <span className="muted small scene-excerpt">{s.excerpt}</span> : null}
                    {failed && jobErrorReason(s.last_job!) ? <span className="muted small job-error-reason">{jobErrorReason(s.last_job!)}</span> : null}
                    <span className="muted small">{sceneLine(s.current_version ?? s.latest_version)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="stack">
          {app.isSuccess || app.isError ? <NewScene projectId={project.id} initial={initial} /> : <Skeleton lines={4} />}
          <section className="panel">
            <h2>{t("project.exports")}</h2>
            {exports.length === 0 ? <EmptyState compact title={t("dashboard.noExports")} description={t("ux.project.exportsEmpty.description")} /> : (
              <ul className="job-list">
                {exports.map((e) => (
                  <li key={e.id}>
                    <span>{tk(`export.format.${e.format}`, e.format)}</span>
                    <span className="muted">{dateTime(e.created_at)}</span>
                    <a href={urls.exportFile(e.id)} download>{t("export.download")}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
