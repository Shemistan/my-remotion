// Approval C сцены видеопроекта (Task 40, Р-V4): бейдж состояния («утверждена v2, текущая v3»,
// «утверждение устарело — …») и «Утвердить (C)» текущей версии. Блокирующие замечания QA версии
// не запрещают C (решение за человеком), но требуют подтверждения «Утвердить с замечаниями».
// «Снять утверждение» — отзыв C сцены. Используется в плитке сцены и в Playground (там утверждается
// открытая версия — подпись «Утвердить vN (C)»). Версия не загрузилась — ошибка видна, кнопка
// доступна, но замечания QA неизвестны — утверждение через подтверждение.
import type { SceneApprovalDto } from "@ms/contracts";
import { useState } from "react";
import { useVersion } from "../../api/queries.js";
import { useApproveScene, useUnapproveScene } from "../../api/video-scenes-client.js";
import { errorText, t, tk } from "../../i18n/index.js";
import { VideoScenesError } from "./VideoScenesError.js";
import "./video-scenes.css";

export interface ApprovalCButtonProps {
  projectId: string;
  sceneId: string;
  /** Готовая версия, которую утверждают (в плитке — текущая, в Playground — открытая); нет — кнопки нет. */
  versionId: string | null;
  versionNumber: number | null;
  approval: SceneApprovalDto;
  /** Номер текущей версии сцены для бейджа «утверждена v2, текущая v3» (по умолчанию — `versionNumber`). */
  currentNumber?: number | null;
  /** Подпись с номером версии: «Утвердить vN (C)» (Playground, где открыта может быть не текущая). */
  numbered?: boolean;
}

/** Подпись состояния C. */
export function approvalText(a: SceneApprovalDto, currentNumber: number | null): string {
  if (a.state === "missing") return t("videoScenes.c.missing");
  if (a.state === "stale") return a.reason ? tk(`videoScenes.c.staleReason.${a.reason}`, t("videoScenes.c.stale")) : t("videoScenes.c.stale");
  const n = a.version_number ?? 0;
  return currentNumber !== null && currentNumber !== n ? t("videoScenes.c.validCurrent", { n, current: currentNumber }) : t("videoScenes.c.valid", { n });
}

export function ApprovalCButton({ projectId, sceneId, versionId, versionNumber, approval, currentNumber = versionNumber, numbered = false }: ApprovalCButtonProps) {
  const approve = useApproveScene(projectId);
  const unapprove = useUnapproveScene(projectId);
  const dto = useVersion(versionId ?? undefined);
  const [confirm, setConfirm] = useState<"blocking" | "unknown" | null>(null);
  const blocking = dto.data?.qa?.issues.filter((x) => x.severity === "blocking").length ?? 0;
  const approvedCurrent = approval.state === "valid" && approval.version_id === versionId;
  const canApprove = versionId !== null && !approvedCurrent;
  const busy = approve.isPending || unapprove.isPending;
  const doApprove = () => {
    setConfirm(null);
    if (versionId) approve.mutate({ sceneId, versionId });
  };
  const error = approve.error ?? unapprove.error;
  return (
    <div className="approval-c" data-testid="approval-c" data-state={approval.state}>
      <div className="row wrap">
        <span className="muted small">{t("videoScenes.c.title")}</span>
        <span className={`badge approval-${approval.state}`} data-testid="approval-c-badge">{approvalText(approval, currentNumber)}</span>
        <span className="spacer" />
        {canApprove ? (
          <button
            type="button"
            className="primary"
            // до отчёта QA версии не знаем, нужны ли подтверждения — кнопка ждёт его (или ошибку загрузки)
            disabled={busy || (!dto.data && !dto.isError)}
            title={t("videoScenes.c.approveHint", { n: versionNumber ?? "?" })}
            onClick={() => (dto.isError ? setConfirm("unknown") : blocking > 0 ? setConfirm("blocking") : doApprove())}
          >
            {numbered ? t("videoScenes.c.approveN", { n: versionNumber ?? "?" }) : t("videoScenes.c.approve")}
          </button>
        ) : null}
        {approval.state !== "missing" ? (
          <button type="button" className="link" disabled={busy} onClick={() => unapprove.mutate(sceneId)}>{t("videoScenes.c.unapprove")}</button>
        ) : null}
      </div>
      {confirm ? (
        <div className="banner banner-warn row wrap" role="alertdialog" aria-label={t("videoScenes.c.title")}>
          <span>{confirm === "unknown" ? t("videoScenes.c.qaUnknown", { n: versionNumber ?? "?" }) : t("videoScenes.c.blocking", { n: versionNumber ?? "?", count: blocking })}</span>
          <span className="spacer" />
          <button type="button" className="primary" disabled={busy} onClick={doApprove}>{t("videoScenes.c.confirm")}</button>
          <button type="button" onClick={() => setConfirm(null)}>{t("videoScenes.c.cancel")}</button>
        </div>
      ) : null}
      {canApprove && dto.isError ? (
        <p className="error small" data-testid="approval-c-version-error">{t("videoScenes.c.versionError", { message: errorText(dto.error) })}</p>
      ) : null}
      {error ? <VideoScenesError error={error} /> : null}
    </div>
  );
}
