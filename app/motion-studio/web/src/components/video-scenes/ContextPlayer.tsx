// Превью сцены в контексте исходника (Task 40): версия (утверждённая, иначе текущая) поверх
// ролика с запасом до и после — `scene.preview_context`. Нет превью — «Собрать»; собрано по
// прежней ревизии плана (`outdated`) — видео и «Перерисовать». Ход задачи — `JobStatus`; ключ
// идемпотентности один на попытку: новая — после завершения прежней задачи.
import type { VideoSceneDto } from "@ms/contracts";
import { useEffect, useState } from "react";
import { newKey } from "../../api/client.js";
import { isActive, useJob } from "../../api/queries.js";
import { usePreviewContext, videoScenesErrorText, videoScenesUrls } from "../../api/video-scenes-client.js";
import { t } from "../../i18n/index.js";
import { JobStatus } from "../JobStatus.js";
import "./video-scenes.css";

export interface ContextPlayerProps {
  projectId: string;
  scene: VideoSceneDto;
}

export function ContextPlayer({ projectId, scene }: ContextPlayerProps) {
  const build = usePreviewContext(projectId);
  const [key, setKey] = useState(newKey);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId ?? undefined);
  const status = job.data?.job.status;
  const running = status !== undefined && isActive(status);
  useEffect(() => {
    if (status !== undefined && !isActive(status)) setKey(newKey());
  }, [status]);

  const versionId = scene.approved_version_id ?? scene.version_id;
  const versionNumber = scene.approved_version_id ? scene.approved_version_number ?? null : scene.version_number;
  if (!scene.scene_id || !versionId) return <div className="tile-empty muted small">{t("videoScenes.preview.none")}</div>;
  const sceneId = scene.scene_id;
  const cp = scene.context_preview ?? null;
  const mine = cp && cp.version_id === versionId ? cp : null;
  const start = () => build.mutate({ sceneId, versionId, key }, { onSuccess: (r) => setJobId(r.job.id) });
  return (
    <div className="context-player" data-testid="context-player">
      {mine ? (
        <>
          <p className="muted small">{t("videoScenes.context.of", { n: versionNumber ?? "?" })}</p>
          <video
            key={`${mine.rel_path}`}
            className="context-video"
            data-testid="context-video"
            src={videoScenesUrls.contextPreview(sceneId, versionId)}
            controls
            preload="metadata"
            playsInline
          />
          {mine.outdated ? <p className="hint small" role="status">{t("videoScenes.context.outdated")}</p> : null}
        </>
      ) : (
        <div className="tile-empty muted small">{t("videoScenes.context.none")}</div>
      )}
      <div className="row wrap">
        <span className="muted small">{t("videoScenes.context.hint")}</span>
        <span className="spacer" />
        {!mine || mine.outdated ? (
          <button type="button" className={mine?.outdated ? "primary" : undefined} disabled={build.isPending || running} onClick={start}>
            {mine?.outdated ? t("videoScenes.context.rebuild") : t("videoScenes.context.build")}
          </button>
        ) : null}
      </div>
      {jobId && (running || status === "failed" || status === "blocked") ? <JobStatus jobId={jobId} compact /> : null}
      {build.isError ? <p className="error small" role="alert">{videoScenesErrorText(build.error)}</p> : null}
    </div>
  );
}
