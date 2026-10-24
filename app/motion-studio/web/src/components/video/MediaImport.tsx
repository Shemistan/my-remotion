// Импорт исходного видео: путь к файлу на этом Mac (`media.import`, только `media.importRoots`)
// или выбор/перетаскивание файла — потоковая загрузка в хранилище с прогрессом.
import { useMutation } from "@tanstack/react-query";
import { type DragEvent, useId, useState } from "react";
import { api, newKey, uploadMedia } from "../../api/client.js";
import { errorText, t } from "../../i18n/index.js";

export function MediaImport({ projectId, onJob }: { projectId: string; onJob: (jobId: string) => void }) {
  const id = useId();
  const [path, setPath] = useState("");
  // ключ на попытку (только ASCII, ревью C1): двойное нажатие — та же задача, следующая попытка
  // после ответа (успех или ошибка) — новый ключ
  const [pathKey, setPathKey] = useState(newKey);
  const [uploadKey, setUploadKey] = useState(newKey);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const byPath = useMutation({
    mutationFn: () => api.importMedia(projectId, path.trim(), pathKey),
    onSuccess: (r) => onJob(r.job.id),
    onSettled: () => setPathKey(newKey()),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadMedia(projectId, file, uploadKey, (sent, total) => setProgress({ sent, total })),
    onSuccess: (r) => onJob(r.job.id),
    onSettled: () => {
      setProgress(null);
      setUploadKey(newKey());
    },
  });
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) upload.mutate(f);
  };
  const mb = (b: number) => (b / 1e6).toFixed(1).replace(".", ",");
  return (
    <section className="panel media-import">
      <h2>{t("media.import")}</h2>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (path.trim()) byPath.mutate(); }}>
        <label htmlFor={id}>{t("media.pathLabel")}</label>
        <div className="row">
          <input id={id} className="grow mono" value={path} placeholder={t("media.pathPlaceholder")} onChange={(e) => setPath(e.target.value)} />
          <button type="submit" className="primary" disabled={!path.trim() || byPath.isPending}>{t("media.importButton")}</button>
        </div>
        {byPath.isError ? <p className="error">{errorText(byPath.error)}</p> : null}
      </form>
      <p className="muted">{t("media.or")}</p>
      <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        <p className="hint">{t("media.dropHint")}</p>
        <label className="button">
          {t("media.pickFile")}
          <input type="file" accept="video/*,.mov,.mp4,.m4v,.mkv,.webm" className="sr-only" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }} />
        </label>
        {progress ? (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((100 * progress.sent) / Math.max(1, progress.total))}>
            <div style={{ width: `${(100 * progress.sent) / Math.max(1, progress.total)}%` }} />
          </div>
        ) : null}
        {progress ? <p className="small mono">{t("media.uploading", { pct: Math.round((100 * progress.sent) / Math.max(1, progress.total)), sent: mb(progress.sent), total: mb(progress.total) })}</p> : null}
        {upload.isError ? <p className="error">{errorText(upload.error)}</p> : null}
      </div>
      <p className="hint">{t("media.importHint")}</p>
    </section>
  );
}
