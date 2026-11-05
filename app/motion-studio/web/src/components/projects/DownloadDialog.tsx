// «Скачать ролики»: выбор готовых сцен проекта, форматов и папки (системное окно или путь вручную).
// Файлы копирует задача `project.download`: она же рендерит экспорт полного качества там, где его
// ещё нет (превью — половинного разрешения, в монтаж не годится). Окно можно закрыть: задача идёт.
import { type ProjectDownloadFormat, ProjectDownloadRefsSchema } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { api, urls } from "../../api/client.js";
import { isActive, useJob, useProject } from "../../api/queries.js";
import { errorText, t } from "../../i18n/index.js";
import { JobStatus } from "../JobStatus.js";
import { Skeleton } from "../ui/Skeleton.js";

const FOLDER_KEY = "ms.download.folder";
const FORMATS: readonly ProjectDownloadFormat[] = ["mp4", "alpha"];

function savedFolder(): string {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveFolder(path: string): void {
  try {
    localStorage.setItem(FOLDER_KEY, path);
  } catch {
    // без localStorage папку просто придётся выбрать снова
  }
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function Result({ jobId }: { jobId: string }) {
  const job = useJob(jobId).data?.job;
  const reveal = useMutation({ mutationFn: () => api.revealDownload(jobId) });
  const parsed = job?.status === "completed" ? ProjectDownloadRefsSchema.safeParse(job.output_refs) : undefined;
  if (!parsed?.success) return null;
  const { files, missing } = parsed.data;
  return (
    <div data-testid="download-result">
      <div className="row wrap">
        <strong role="status">{t("download.done", { n: files.length })}</strong>
        <span className="spacer" />
        <button type="button" disabled={reveal.isPending} onClick={() => reveal.mutate()}>{t("download.reveal")}</button>
      </div>
      {reveal.isError ? <p className="error" role="alert">{errorText(reveal.error)}</p> : null}
      {missing.length > 0 ? (
        <div className="package-missing" data-testid="download-missing">
          <h4>{t("download.missingTitle", { n: missing.length })}</h4>
          <ul>{missing.map((m) => <li key={m.name}><strong className="mono">{m.name}</strong><span> — {m.reason}</span></li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export function DownloadDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const id = useId();
  const client = useQueryClient();
  const q = useProject(projectId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [formats, setFormats] = useState<ReadonlySet<ProjectDownloadFormat>>(new Set(["mp4"]));
  const [folder, setFolder] = useState(savedFolder);
  const [jobId, setJobId] = useState<string | undefined>();
  const status = useJob(jobId).data?.job.status;

  // номер — позиция сцены в проекте, как в имени файла
  const ready = useMemo(() => (q.data?.scenes ?? []).flatMap((s, i) => (s.current_version?.status === "ready" ? [{ scene: s, n: i + 1, versionId: s.current_version.version_id }] : [])), [q.data]);
  const allPicked = ready.length > 0 && ready.every((r) => picked.has(r.scene.id));

  const choose = useMutation({
    mutationFn: () => api.pickFolder(),
    onSuccess: (r) => {
      if (r.path) setFolder(r.path);
    },
  });
  const start = useMutation({
    mutationFn: () => api.startProjectDownload(projectId, { scene_ids: ready.filter((r) => picked.has(r.scene.id)).map((r) => r.scene.id), formats: FORMATS.filter((f) => formats.has(f)), dest: folder.trim() }),
    onSuccess: (r) => {
      saveFolder(folder.trim());
      setJobId(r.job.id);
    },
  });
  // экспорты проекта могли пополниться — карточка проекта перечитывается
  useEffect(() => {
    if (status && !isActive(status)) void client.invalidateQueries({ queryKey: ["project", projectId] });
  }, [status, client, projectId]);

  const selected = ready.filter((r) => picked.has(r.scene.id)).length;
  const running = status !== undefined && isActive(status);
  const again = status !== undefined && !running;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog download-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{t("download.title")}</h2>
        {q.isError ? <p className="error" role="alert">{errorText(q.error)}</p> : null}
        {!q.data && !q.isError ? <Skeleton lines={4} /> : null}
        {q.data && ready.length === 0 ? <p className="muted">{t("download.noneReady")}</p> : null}
        {ready.length > 0 ? (
          <>
            <div className="row wrap">
              <span className="muted" data-testid="download-count">{t("download.selected", { n: selected, total: ready.length })}</span>
              <span className="spacer" />
              <button type="button" disabled={running} onClick={() => setPicked(allPicked ? new Set() : new Set(ready.map((r) => r.scene.id)))}>
                {t(allPicked ? "download.selectNone" : "download.selectAll")}
              </button>
            </div>
            <ul className="download-list">
              {ready.map((r) => (
                <li key={r.scene.id}>
                  <label data-scene-id={r.scene.id}>
                    <input type="checkbox" disabled={running} checked={picked.has(r.scene.id)} onChange={() => setPicked((p) => toggled(p, r.scene.id))} />
                    <img src={urls.poster(r.versionId)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    <span className="mono small">{String(r.n).padStart(2, "0")}</span>
                    <span className="small download-caption">{r.scene.excerpt ?? r.scene.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            <fieldset className="radio-group" disabled={running}>
              <legend>{t("download.formats")}</legend>
              {FORMATS.map((f) => (
                <label key={f}>
                  <input type="checkbox" checked={formats.has(f)} onChange={() => setFormats((p) => toggled(p, f))} />
                  {t(`download.format.${f}`)}
                </label>
              ))}
            </fieldset>
            <div className="form-row">
              <label htmlFor={`${id}-folder`}>{t("download.folder")}</label>
              <div className="row">
                <input id={`${id}-folder`} className="download-folder" type="text" value={folder} disabled={running} placeholder={t("download.folderPlaceholder")} onChange={(e) => setFolder(e.target.value)} />
                <button type="button" disabled={running || choose.isPending} onClick={() => choose.mutate()}>{t("download.choose")}</button>
              </div>
              {choose.isError ? <p className="error" role="alert">{errorText(choose.error)}</p> : null}
            </div>
            <p className="hint">{t("download.hint")}</p>
            {start.isError ? <p className="error" role="alert">{errorText(start.error)}</p> : null}
          </>
        ) : null}
        {jobId ? <JobStatus jobId={jobId} compact /> : null}
        {jobId ? <Result jobId={jobId} /> : null}
        {running ? <p className="hint">{t("download.background")}</p> : null}
        <div className="row end">
          <button type="button" onClick={onClose}>{t("download.close")}</button>
          <button
            type="button"
            className="primary"
            disabled={selected === 0 || formats.size === 0 || !folder.trim() || start.isPending || running}
            onClick={() => start.mutate()}
          >
            {t(again ? "download.startAgain" : "download.start", { n: selected })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Кнопка и окно: данные проекта запрашиваются только при открытии. */
export function DownloadButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>{t("download.open")}</button>
      {open ? <DownloadDialog projectId={projectId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
