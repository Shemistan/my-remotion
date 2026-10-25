// Approval C сцены видеопроекта (Task 40, Р-V4): бейдж состояния («утверждена v2, текущая v3»,
// «утверждение устарело — …») и «Утвердить (C)» текущей версии. Блокирующие замечания QA версии
// не запрещают C (решение за человеком), но требуют подтверждения «Утвердить с замечаниями».
// «Снять утверждение» — отзыв C сцены. Используется в плитке сцены и в Playground.
import type { SceneApprovalDto } from "@ms/contracts";
import { useState } from "react";
import { useVersion } from "../../api/queries.js";
import { useApproveScene, useUnapproveScene, videoScenesErrorText } from "../../api/video-scenes-client.js";
import { t, tk } from "../../i18n/index.js";
import "./video-scenes.css";

export interface ApprovalCButtonProps {
  projectId: string;
  sceneId: string;
  /** Текущая готовая версия сцены (её утверждают); нет — кнопки нет. */
  versionId: string | null;
  versionNumber: number | null;
  approval: SceneApprovalDto;
}

/** Подпись состояния C. */
export function approvalText(a: SceneApprovalDto, currentNumber: number | null): string {
  if (a.state === "missing") return t("videoScenes.c.missing");
  if (a.state === "stale") return a.reason ? tk(`videoScenes.c.staleReason.${a.reason}`, t("videoScenes.c.stale")) : t("videoScenes.c.stale");
  const n = a.version_number ?? 0;
  return currentNumber !== null && currentNumber !== n ? t("videoScenes.c.validCurrent", { n, current: currentNumber }) : t("videoScenes.c.valid", { n });
}

export function ApprovalCButton({ projectId, sceneId, versionId, versionNumber, approval }: ApprovalCButtonProps) {
  const approve = useApproveScene(projectId);
  const unapprove = useUnapproveScene(projectId);
  const dto = useVersion(versionId ?? undefined);
  const [confirm, setConfirm] = useState(false);
  const blocking = dto.data?.qa?.issues.filter((x) => x.severity === "blocking").length ?? 0;
  const approvedCurrent = approval.state === "valid" && approval.version_id === versionId;
  const canApprove = versionId !== null && !approvedCurrent;
  const busy = approve.isPending || unapprove.isPending;
  const doApprove = () => {
    setConfirm(false);
    if (versionId) approve.mutate({ sceneId, versionId });
  };
  const error = approve.error ?? unapprove.error;
  return (
    <div className="approval-c" data-testid="approval-c" data-state={approval.state}>
      <div className="row wrap">
        <span className="muted small">{t("videoScenes.c.title")}</span>
        <span className={`badge approval-${approval.state}`} data-testid="approval-c-badge">{approvalText(approval, versionNumber)}</span>
        <span className="spacer" />
        {canApprove ? (
          <button
            type="button"
            className="primary"
            // до отчёта QA версии не знаем, нужны ли подтверждения — кнопка ждёт его
            disabled={busy || !dto.data}
            title={t("videoScenes.c.approveHint", { n: versionNumber ?? "?" })}
            onClick={() => (blocking > 0 ? setConfirm(true) : doApprove())}
          >
            {t("videoScenes.c.approve")}
          </button>
        ) : null}
        {approval.state !== "missing" ? (
          <button type="button" className="link" disabled={busy} onClick={() => unapprove.mutate(sceneId)}>{t("videoScenes.c.unapprove")}</button>
        ) : null}
      </div>
      {confirm ? (
        <div className="banner banner-warn row wrap" role="alertdialog" aria-label={t("videoScenes.c.title")}>
          <span>{t("videoScenes.c.blocking", { n: versionNumber ?? "?", count: blocking })}</span>
          <span className="spacer" />
          <button type="button" className="primary" disabled={busy} onClick={doApprove}>{t("videoScenes.c.confirm")}</button>
          <button type="button" onClick={() => setConfirm(false)}>{t("videoScenes.c.cancel")}</button>
        </div>
      ) : null}
      {error ? <p className="error small" role="alert">{videoScenesErrorText(error)}</p> : null}
    </div>
  );
}
