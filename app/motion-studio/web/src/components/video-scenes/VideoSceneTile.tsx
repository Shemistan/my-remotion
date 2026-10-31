// Плитка сцены видеопроекта (Task 40): номер, режим и зона, кадры в ролике, цитата, статус
// генерации и очередь, «сцена устарела», превью версии («Сцена») или в контексте исходника
// («В контексте»), замечания QA, Approval C; «Доработать» → Playground, «Повторить» (упавшая или
// отменённая — generate с новым `:try-n`), «Перегенерировать» (готовая — `regenerate: true`).
import type { VideoSceneDto, VideoSceneStatus } from "@ms/contracts";
import { useState } from "react";
import { urls } from "../../api/client.js";
import { isActive, useVersion } from "../../api/queries.js";
import { t, tk } from "../../i18n/index.js";
import { JobStatus, jobErrorTitle } from "../JobStatus.js";
import { Link } from "../Link.js";
import { Player } from "../Player.js";
import { ConfirmDialog } from "../ui/ConfirmDialog.js";
import { DisabledReason } from "../ui/DisabledReason.js";
import { Skeleton } from "../ui/Skeleton.js";
import { ApprovalCButton } from "./ApprovalCButton.js";
import { ContextPlayer } from "./ContextPlayer.js";
import { QueueBadge } from "./QueueBadge.js";

export interface VideoSceneTileProps {
  projectId: string;
  scene: VideoSceneDto;
  n: number;
  busy: boolean;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onImprove?: () => void;
  /** S21: выбор для пакетной перегенерации; нет — чекбокса нет (сцена идёт). */
  selected?: boolean;
  onSelect?: (on: boolean) => void;
}

function VersionPreview({ versionId, status }: { versionId: string | null; status: VideoSceneStatus }) {
  const dto = useVersion(versionId ?? undefined);
  if (!versionId) return <div className="tile-empty muted small">{tk(`videoScenes.status.${status}`, t("videoScenes.preview.none"))}</div>;
  if (!dto.data) return <div className="tile-empty"><Skeleton lines={2} compact /></div>;
  const m = dto.data.manifest;
  if (m.status !== "ready" || !m.preview) return <div className="tile-empty muted small">{t("videoScenes.preview.notReady")}</div>;
  const s = dto.data.settings;
  const player = <Player key={versionId} src={urls.preview(versionId)} fps={s.fps} durationFrames={s.duration_frames} width={s.width} height={s.height} aspectRatio={s.aspect_ratio} />;
  return s.height > s.width ? <div className="tall">{player}</div> : player;
}

export function VideoSceneTile({ projectId, scene, n, busy, onRetry, onRegenerate, onImprove, selected, onSelect }: VideoSceneTileProps) {
  const [view, setView] = useState<"scene" | "context">("scene");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const status = scene.status;
  const job = scene.job;
  const failure = status === "failed" && job ? jobErrorTitle(job) : null;
  const showJob = job !== null && (status === "blocked" || isActive(job.status));
  const qa = scene.qa_warnings ?? [];
  const p = scene.placement;
  return (
    <li className={`scene-tile status-${status}${scene.stale ? " stale" : ""}`} data-testid="video-scene-tile" data-item={scene.item_id} data-status={status}>
      <div className="row wrap tile-head">
        {onSelect ? (
          <input type="checkbox" aria-label={t("videoScenes.select", { n })} checked={selected === true} disabled={busy} onChange={(e) => onSelect(e.target.checked)} />
        ) : null}
        <strong>{t("videoScenes.scene.n", { n })}</strong>
        <span className="chip small">{t("videoScenes.placement", { mode: tk(`plan.mode.${p.mode}`, p.mode), zone: tk(`zone.${p.zone}`, p.zone) })}</span>
        <span className="muted small">{t("videoScenes.frames", { start: scene.frames.start, end: scene.frames.end })}</span>
        <span className="spacer" />
        {scene.stale ? <span className="badge stale-badge" title={t("videoScenes.staleHint")}>{t("videoScenes.stale")}</span> : null}
        {scene.qa_overall !== null ? <span className="muted small">{t("videoScenes.score", { score: scene.qa_overall })}</span> : null}
        <span className={`badge status-${status === "ready" ? "completed" : status}`}>{t(`videoScenes.status.${status}`)}</span>
      </div>
      <blockquote className="card-quote">«{scene.quote}»</blockquote>
      {scene.version_id ? (
        <div className="row tabs small" role="tablist" aria-label={t("videoScenes.view.label")}>
          {(["scene", "context"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`tab ${view === k ? "active" : ""}`} onClick={() => setView(k)}>
              {t(`videoScenes.view.${k}`)}
            </button>
          ))}
          {scene.version_number ? <span className="muted small">{t("videoScenes.version", { n: scene.version_number })}</span> : null}
        </div>
      ) : null}
      <div className="tile-preview">
        {view === "context" && scene.version_id ? <ContextPlayer projectId={projectId} scene={scene} /> : <VersionPreview versionId={scene.version_id} status={status} />}
      </div>
      <QueueBadge queue={scene.queue} />
      {showJob ? <JobStatus jobId={job.id} compact /> : null}
      {failure ? <p className="error small" role="status">{failure}</p> : status === "failed" ? <p className="error small">{t("videoScenes.failed")}</p> : null}
      {qa.length > 0 ? (
        <ul className="card-issues small">
          {qa.map((x, i) => (
            <li key={`qa-${i}`}>
              <span className={`badge severity-${x.severity}`}>{t("videoScenes.qaWarning")}</span>{" "}
              <strong>{tk(`qa.code.${x.code}`, t("qa.code.other"))}</strong>
              {x.description ? <span className="muted"> — {x.description}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {scene.scene_id ? (
        <ApprovalCButton projectId={projectId} sceneId={scene.scene_id} versionId={scene.version_id} versionNumber={scene.version_number} approval={scene.approval} />
      ) : null}
      <div className="row wrap tile-actions">
        {scene.scene_id ? (
          <Link to={{ name: "scene", id: scene.scene_id }} className="button" title={t("videoScenes.refineHint")}>{t("videoScenes.refine")}</Link>
        ) : null}
        {onImprove ? <button type="button" disabled={busy} onClick={onImprove}>{t("videoScenes.improve")}</button> : null}
        <span className="spacer" />
        {onRetry ? <button type="button" className="primary" disabled={busy} onClick={onRetry}>{t("videoScenes.retry")}</button> : null}
        {onRegenerate ? (
          <DisabledReason reasonKey={busy ? "ux.disabled.requestRunning" : null}>
            <button
              type="button"
              className={scene.stale ? "primary" : undefined}
              disabled={busy}
              onClick={() => (scene.approval.state === "valid" ? setConfirmRegenerate(true) : onRegenerate())}
            >
              {t("videoScenes.regenerate")}
            </button>
          </DisabledReason>
        ) : null}
      </div>
      {onRegenerate ? (
        <ConfirmDialog
          open={confirmRegenerate}
          title={t("ux.confirm.regenerate.title")}
          description={t("ux.confirm.regenerate.description")}
          confirmLabel={t("ux.confirm.regenerate.action")}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => { setConfirmRegenerate(false); onRegenerate(); }}
        />
      ) : null}
    </li>
  );
}
