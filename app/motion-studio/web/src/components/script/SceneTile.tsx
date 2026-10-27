// Плитка сцены сценария (S9, спека §8): номер, цитата, приём, статус генерации, превью текущей
// версии (плеер), значок «сцена устарела», замечания QA и разнообразия; «Доработать в
// Playground», «Повторить генерацию» (упавшая/отменённая), «Перегенерировать» (готовая).
// Ход идущей и заблокированной задачи — `JobStatus`; повтор — не retry задачи, а generate
// (новый ключ `:try-<n>`, S5), это делает вкладка через `onRetry`.
import type { ScriptItemStatus } from "@ms/contracts";
import { urls } from "../../api/client.js";
import { isActive, useVersion } from "../../api/queries.js";
import { t, tk } from "../../i18n/index.js";
import { techniqueLabel } from "../../script/format.js";
import type { SceneRow } from "../../script/output.js";
import { JobStatus, jobErrorTitle } from "../JobStatus.js";
import { Link } from "../Link.js";
import { Player } from "../Player.js";
import { Skeleton } from "../ui/Skeleton.js";
import { IssueText } from "./PlanIssues.js";

export interface SceneTileProps {
  row: SceneRow;
  numbers: ReadonlyMap<string, number>;
  busy: boolean;
  /** Повтор упавшей/отменённой генерации; нет — кнопки нет. */
  onRetry?: () => void;
  /** Перегенерация готовой сцены; нет — кнопки нет. */
  onRegenerate?: () => void;
}

function Preview({ versionId, status }: { versionId: string | null; status: ScriptItemStatus }) {
  const dto = useVersion(versionId ?? undefined);
  if (!versionId) return <div className="tile-empty muted small">{t(`scriptOutput.preview.${status === "ready" ? "notReady" : status}`)}</div>;
  if (!dto.data) return <div className="tile-empty"><Skeleton lines={2} compact /></div>;
  const m = dto.data.manifest;
  if (m.status !== "ready" || !m.preview) return <div className="tile-empty muted small">{t("scriptOutput.preview.notReady")}</div>;
  const s = dto.data.settings;
  const player = <Player key={versionId} src={urls.preview(versionId)} fps={s.fps} durationFrames={s.duration_frames} width={s.width} height={s.height} aspectRatio={s.aspect_ratio} />;
  // вертикальная сцена — по высоте плитки, а не на всю ширину
  return s.height > s.width ? <div className="tall">{player}</div> : player;
}

export function SceneTile({ row, numbers, busy, onRetry, onRegenerate }: SceneTileProps) {
  const { item, n, scene } = row;
  const status: ScriptItemStatus = scene?.status ?? "none";
  const job = scene?.job ?? null;
  const failure = status === "failed" && job ? jobErrorTitle(job) : null;
  const showJob = job !== null && (status === "blocked" || isActive(job.status));
  const qa = scene?.qa_warnings ?? [];
  const diversity = scene?.warnings ?? [];
  return (
    <li className={`scene-tile status-${status}${scene?.stale ? " stale" : ""}`} data-testid="scene-tile" data-item={item.id} data-status={status}>
      <div className="row wrap tile-head">
        <strong>{t("scriptOutput.scene.n", { n })}</strong>
        <span className="chip small">{techniqueLabel(item.technique)}</span>
        <span className="spacer" />
        {scene?.stale ? <span className="badge stale-badge" title={t("scriptOutput.staleHint")}>{t("scriptOutput.stale")}</span> : null}
        <span className={`badge status-${status === "ready" ? "completed" : status}`}>{t(`scriptOutput.status.${status}`)}</span>
      </div>
      <blockquote className="card-quote">«{item.quote}»</blockquote>
      <div className="tile-preview">
        <Preview versionId={scene?.version_id ?? null} status={status} />
      </div>
      {showJob ? <JobStatus jobId={job.id} compact /> : null}
      {failure ? <p className="error small" role="status">{failure}</p> : status === "failed" ? <p className="error small">{t("scriptOutput.failed")}</p> : null}
      {qa.length > 0 || diversity.length > 0 ? (
        <ul className="card-issues small">
          {qa.map((x, i) => (
            <li key={`qa-${i}`}>
              <span className={`badge severity-${x.severity}`}>{t("scriptOutput.qaWarnings")}</span>{" "}
              <strong>{tk(`qa.code.${x.code}`, t("qa.code.other"))}</strong>
              {x.description ? <span className="muted"> — {x.description}</span> : null}
            </li>
          ))}
          {diversity.map((x, i) => (
            <li key={`dv-${i}`}>
              <span className={`badge severity-${x.severity}`}>{t("scriptOutput.diversity")}</span>{" "}
              <IssueText issue={x} numbers={numbers} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row wrap tile-actions">
        {scene ? <Link to={{ name: "scene", id: scene.scene_id }} className="button">{t("scriptOutput.refine")}</Link> : null}
        <span className="spacer" />
        {onRetry ? <button type="button" className="primary" disabled={busy} onClick={onRetry}>{t("scriptOutput.retry")}</button> : null}
        {onRegenerate ? (
          <button type="button" className={scene?.stale ? "primary" : undefined} disabled={busy} onClick={onRegenerate}>{t("scriptOutput.regenerate")}</button>
        ) : null}
      </div>
    </li>
  );
}
