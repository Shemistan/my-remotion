// Dashboard (ТЗ §11.1): проекты, активные задачи, последние экспорты, «Новый проект».
// Служебные проекты bench скрывает сервер (`GET /projects`). Страница проекта — сцены,
// экспорты проекта и новая сцена по промпту.
import { type HistoryEntry, type Job, type ProjectDto, type Settings, defaultSettings } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, newKey, urls } from "../api/client.js";
import { isActive, useAppSettings, useJobs, useProject, useProjects } from "../api/queries.js";
import { stageText } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { SettingsForm } from "../components/SettingsForm.js";
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
      <div className="row">
        <input id={id} className="grow" value={title} placeholder={t("dashboard.projectTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="primary" disabled={!title.trim() || create.isPending}>{t("dashboard.create")}</button>
        <button type="button" disabled={!title.trim() || create.isPending} onClick={() => create.mutate("video")}>{t("dashboard.createVideo")}</button>
        <button type="button" disabled={!title.trim() || create.isPending} onClick={() => create.mutate("script")}>{t("dashboard.createScript")}</button>
      </div>
      {create.isError ? <p className="error">{errorText(create.error)}</p> : null}
    </form>
  );
}

type JobsQuery = ReturnType<typeof useJobs>;

/** Загрузка или ошибка запроса задач: «пусто» показывается только по данным. */
function JobsState({ q }: { q: JobsQuery }) {
  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  return <p className="muted">{t("common.loading")}</p>;
}

function ActiveJobs({ q }: { q: JobsQuery }) {
  const active = (q.data ?? []).filter((j) => isActive(j.status));
  return (
    <section className="panel">
      <h2>{t("dashboard.activeJobs")}</h2>
      {!q.data || q.isError ? <JobsState q={q} /> : active.length === 0 ? <p className="muted">{t("dashboard.noActiveJobs")}</p> : (
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
      <Link to={{ name: "jobs" }}>{t("dashboard.allJobs")}</Link>
    </section>
  );
}

function RecentExports({ q }: { q: JobsQuery }) {
  const done = (q.data ?? []).filter((j) => j.type === "scene.export" && j.status === "completed" && exportIdOf(j)).slice(-10).reverse();
  return (
    <section className="panel">
      <h2>{t("dashboard.recentExports")}</h2>
      {!q.data || q.isError ? <JobsState q={q} /> : done.length === 0 ? <p className="muted">{t("dashboard.noExports")}</p> : (
        <ul className="job-list">
          {done.map((j) => {
            const format = (j.output_refs as { format?: string } | null)?.format ?? "";
            return (
              <li key={j.id}>
                <span>{tk(`export.format.${format}`, format)}</span>
                <span className="muted">{j.finished_at ? dateTime(j.finished_at) : ""}</span>
                <a href={urls.exportFile(exportIdOf(j)!)} download>{t("export.download")}</a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const projects = useProjects();
  const jobs = useJobs();
  return (
    <div className="page dashboard">
      <h1>{t("dashboard.title")}</h1>
      <div className="grid-2">
        <section className="panel">
          <h2>{t("dashboard.projects")}</h2>
          {projects.isError ? <p className="error">{errorText(projects.error)}</p> : null}
          {projects.isPending ? <p className="muted">{t("common.loading")}</p> : null}
          {projects.data?.length === 0 && !projects.isError ? <p className="muted">{t("dashboard.noProjects")}</p> : null}
          <ul className="project-list">
            {(projects.data ?? []).map((p) => (
              <li key={p.id} data-project-id={p.id}>
                <Link to={{ name: "project", id: p.id }} className="strong">{p.title}</Link>
                <span className="badge">{t(`project.kind.${p.kind}`)}</span>
                <span className="muted small">{t("dashboard.updated", { at: dateTime(p.updated_at) })}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="stack">
          <NewProject />
          <ActiveJobs q={jobs} />
          <RecentExports q={jobs} />
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
  if (q.isError) return <div className="page"><p className="error">{errorText(q.error)}</p></div>;
  if (!q.data) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  const { project, scenes, exports } = q.data;
  // видеопроект (Task 29): Video Workspace; сцены проекта (если есть) — списком внизу
  if (project.kind === "video") return <VideoWorkspace id={project.id} scenes={scenes} />;
  // сценарный проект: текст → план → сцены → экспорт
  if (project.kind === "script") return <ScriptWorkspace project={project} />;
  const initial = project.settings ?? app.data?.defaults ?? defaultSettings();
  return (
    <div className="page project">
      <nav className="crumbs"><Link to={{ name: "dashboard" }}>{t("nav.dashboard")}</Link></nav>
      <h1>{project.title}</h1>
      <div className="grid-2">
        <section className="panel">
          <h2>{t("project.scenes")}</h2>
          {scenes.length === 0 ? <p className="muted">{t("project.noScenes")}</p> : null}
          <ul className="scene-cards">
            {scenes.map((s) => (
              <li key={s.id} data-scene-id={s.id}>
                <Link to={{ name: "scene", id: s.id }} className="scene-card">
                  {s.current_version?.status === "ready" ? (
                    <img src={urls.frame(s.current_version.version_id, 0)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  ) : <div className="thumb-empty" />}
                  <span className="strong">{s.title}</span>
                  <span className="muted small">{sceneLine(s.current_version ?? s.latest_version)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <div className="stack">
          {app.isSuccess || app.isError ? <NewScene projectId={project.id} initial={initial} /> : <p className="muted">{t("common.loading")}</p>}
          <section className="panel">
            <h2>{t("project.exports")}</h2>
            {exports.length === 0 ? <p className="muted">{t("dashboard.noExports")}</p> : (
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
