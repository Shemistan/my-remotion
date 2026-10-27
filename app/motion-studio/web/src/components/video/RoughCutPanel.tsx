// Черновой монтаж (ТЗ §11.1 п.4): предложения по причинам, решения по одной и «Принять все
// ≥ 0,8», итог «было → стало», «Собрать превью» и «Утвердить черновой монтаж (A)» —
// недоступна с подсказкой, пока есть предложенные. Правки — новая ревизия EDL от текущей;
// 409 — сообщение и перезагрузка.
import type { EditDecision, EdlDto, EdlOp, ProjectApprovalsDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError, api, newKey } from "../../api/client.js";
import { errorText, t } from "../../i18n/index.js";
import { formatSecondsUs } from "../../video/use-timeline.js";
import { CutRow } from "./CutRow.js";

export const CONFIDENT = 0.8;
const LISTEN_PAD_US = 1_000_000;

export interface RoughCutPanelProps {
  projectId: string;
  edl: EdlDto;
  approvals: ProjectApprovalsDto;
  onListen: (range: { start_us: number; end_us: number }) => void;
  /** После правки, утверждения или конфликта — перечитать данные. */
  onChanged: () => void;
  /** Задача превью этой ревизии создана. */
  onPreviewJob?: (jobId: string) => void;
}

export function RoughCutPanel({ projectId, edl, approvals, onListen, onChanged, onPreviewJob }: RoughCutPanelProps) {
  const client = useQueryClient();
  const hintId = useId();
  const [conflict, setConflict] = useState(false);
  const [previewKey] = useState(newKey);
  const decisions = [...edl.doc.decisions].sort((a, b) => a.source_start_us - b.source_start_us);
  const proposed = decisions.filter((d) => d.status === "proposed");
  const count = (s: EditDecision["status"]) => decisions.filter((d) => d.status === s).length;

  const save = useMutation({
    mutationFn: (ops: EdlOp[]) => api.saveEdl(edl.id, edl.current_revision, ops),
    onSuccess: (r) => {
      setConflict(false);
      client.setQueryData(["edl", edl.id, "current"], r);
      onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "revision_conflict") {
        setConflict(true);
        onChanged();
      }
    },
  });
  const approve = useMutation({ mutationFn: () => api.approve(projectId, "A"), onSuccess: onChanged });
  const preview = useMutation({
    mutationFn: () => api.buildPreview(edl.id, edl.doc.revision, `${previewKey}-r${edl.doc.revision}`),
    onSuccess: (r) => {
      onPreviewJob?.(r.job.id);
      onChanged();
    },
  });

  const confident = proposed.filter((d) => d.confidence >= CONFIDENT);
  const approveBlocked = proposed.length > 0;
  const isCurrent = edl.doc.revision === edl.current_revision;
  return (
    <section className="panel rough-cut" aria-label={t("video.tab.roughcut")}>
      <div className="row wrap">
        <strong data-testid="roughcut-summary">
          {t("roughcut.summary", { before: formatSecondsUs(edl.timeline.source_duration_us), after: formatSecondsUs(edl.timeline.duration_us) })}
        </strong>
        <span className="muted small">{t("roughcut.revision", { n: edl.doc.revision })}</span>
        <span className="muted small">{t("roughcut.counts", { proposed: count("proposed"), accepted: count("accepted"), rejected: count("rejected") })}</span>
      </div>
      {conflict ? <p className="error" role="alert">{t("roughcut.conflict")}</p> : null}
      {save.isError && !conflict ? <p className="error">{errorText(save.error)}</p> : null}
      {approve.isError ? <p className="error">{errorText(approve.error)}</p> : null}
      {preview.isError ? <p className="error">{errorText(preview.error)}</p> : null}
      <div className="row wrap actions">
        <button
          type="button"
          disabled={!isCurrent || confident.length === 0 || save.isPending}
          onClick={() => save.mutate(confident.map((d) => ({ op: "set_status", decision_id: d.id, status: "accepted" })))}
        >
          {t("roughcut.acceptConfident")}
        </button>
        <button type="button" disabled={preview.isPending || edl.preview_ready} onClick={() => preview.mutate()}>
          {edl.preview_ready ? t("roughcut.previewReady", { n: edl.doc.revision }) : t("roughcut.preview")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={!isCurrent || approveBlocked || approve.isPending || approvals.A.state === "valid"}
          title={approveBlocked ? t("approval.a.proposedLeft", { n: proposed.length }) : undefined}
          aria-describedby={approveBlocked ? hintId : undefined}
          onClick={() => approve.mutate()}
        >
          {t("roughcut.approve")}
        </button>
        {approveBlocked ? <span id={hintId} className="hint small" data-testid="approve-hint">{t("approval.a.proposedLeft", { n: proposed.length })}</span> : null}
      </div>
      {decisions.length === 0 ? <p className="muted">{t("roughcut.empty")}</p> : (
        <ul className="cut-list" tabIndex={0} aria-label={t("video.tab.roughcut")}>
          {decisions.map((d) => (
            <CutRow
              key={d.id}
              decision={d}
              busy={save.isPending || !isCurrent}
              onOps={(ops) => save.mutate(ops)}
              onListen={(x) => onListen({
                start_us: Math.max(0, x.source_start_us - LISTEN_PAD_US),
                end_us: Math.min(edl.timeline.source_duration_us, x.source_end_us + LISTEN_PAD_US),
              })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
