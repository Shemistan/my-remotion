// Инспектор сцены таймлайна (Task 45): таймкоды в ролике и исходнике, кадры, режим и зона, версия
// и её утверждение, ключевые слова. Действия — только операции Р-V6 и Д2: сдвиг (кадр, с
// прилипанием или без), утверждённая версия (C), исключение и возврат (без C — с причиной). Границ
// и длительности здесь нет: «Изменить границы — в плане».
import { type EditedTimeline, type Fps, type TimelineOp, type VideoSceneDto, type VideoTimelineClip, anchorCheck, frameToUs } from "@ms/contracts";
import { useState } from "react";
import { t, tk } from "../../i18n/index.js";
import { formatTimecode, toSource } from "../../video/use-timeline.js";

export interface ClipInspectorProps {
  /** Клип на таймлайне или сцена, исключённая из ролика. */
  clip?: VideoTimelineClip | undefined;
  excluded?: { item_id: string; reason: string } | undefined;
  n: number | string;
  fps: Fps;
  tl?: EditedTimeline | undefined;
  /** Состояние видеосцены (утверждённая версия C). */
  scene?: VideoSceneDto | undefined;
  busy: boolean;
  onOps: (ops: TimelineOp[]) => void;
  onOpenPlan: (itemId: string) => void;
}

const tc = (frame: number, fps: Fps) => formatTimecode(frameToUs(frame, fps));

export function ClipInspector({ clip, excluded, n, fps, tl, scene, busy, onOps, onOpenPlan }: ClipInspectorProps) {
  const [to, setTo] = useState<string>("");
  const [noSnap, setNoSnap] = useState(false);
  const [reason, setReason] = useState("");
  const itemId = clip?.item_id ?? excluded?.item_id;
  if (!itemId) return <section className="panel ptl-inspector"><p className="muted">{t("projectTimeline.inspector.none")}</p></section>;
  const bounds = (
    <div className="stack">
      <button type="button" onClick={() => onOpenPlan(itemId)}>{t("projectTimeline.inspector.bounds")}</button>
      <p className="muted small">{t("projectTimeline.inspector.boundsHint")}</p>
    </div>
  );

  if (!clip) {
    const r = excluded!.reason;
    const canApproved = r === "user" && scene?.approval.state === "valid";
    const canOverride = (r === "user" || r === "not_approved") && !canApproved && scene?.version_id;
    return (
      <section className="panel ptl-inspector" data-testid="clip-inspector" aria-label={t("projectTimeline.inspector.title", { n, id: itemId })}>
        <h3>{t("projectTimeline.inspector.title", { n, id: itemId })}</h3>
        <p className="muted">{t("projectTimeline.excluded.title", { reason: tk(`projectTimeline.excluded.reason.${r}`, r) })}</p>
        {canApproved ? (
          <button type="button" disabled={busy} onClick={() => onOps([{ op: "include", clip_id: `clip_${itemId}`, include: true }])}>{t("projectTimeline.inspector.include")}</button>
        ) : null}
        {canOverride ? (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onOps([{ op: "include", clip_id: `clip_${itemId}`, include: true, override_reason: reason.trim() }]); }}>
            <label className="stack small">
              {t("projectTimeline.inspector.overrideReason")}
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !reason.trim()}>{t("projectTimeline.inspector.includeOverride")}</button>
          </form>
        ) : null}
        {!canApproved && !canOverride ? <p className="hint small">{t("projectTimeline.inspector.goScenes")}</p> : null}
        {bounds}
      </section>
    );
  }

  const end = clip.start_frame + clip.duration_frames;
  const check = anchorCheck(clip, clip.start_frame);
  const approvedId = scene?.approval.state === "valid" ? scene.approval.version_id : undefined;
  const approvedN = scene?.approval.version_number;
  const startUs = frameToUs(clip.start_frame, fps);
  const endUs = frameToUs(end, fps);
  const target = Number(to);
  const validTo = to.trim() !== "" && Number.isInteger(target) && target >= 0 && target !== clip.start_frame;
  return (
    <section className="panel ptl-inspector" data-testid="clip-inspector" aria-label={t("projectTimeline.inspector.title", { n, id: clip.item_id })}>
      <h3>{t("projectTimeline.inspector.title", { n, id: clip.item_id })}</h3>
      <dl className="small">
        <dt>{t("projectTimeline.inspector.placement", { mode: t(`plan.mode.${clip.placement.mode}`), zone: t(`zone.${clip.placement.zone}`) })}</dt>
        <dd />
        <dt>{t("projectTimeline.inspector.edited", { from: formatTimecode(startUs), to: formatTimecode(endUs) })}</dt>
        <dd />
        {tl ? (
          <>
            <dt>{t("projectTimeline.inspector.source", { from: formatTimecode(toSource(tl, startUs)), to: formatTimecode(toSource(tl, endUs)) })}</dt>
            <dd />
          </>
        ) : null}
        <dt data-testid="inspector-frames">{t("projectTimeline.inspector.frames", { from: clip.start_frame, to: end, n: clip.duration_frames })}</dt>
        <dd />
        <dt>{t("projectTimeline.inspector.version", { n: clip.version_number })}</dt>
        <dd>{clip.include === "approved" ? t("projectTimeline.inspector.approved") : t("projectTimeline.inspector.override", { reason: clip.override_reason ?? "" })}</dd>
      </dl>
      <div className="row wrap">
        {approvedId && approvedId !== clip.version_id && approvedN ? (
          <button type="button" disabled={busy} onClick={() => onOps([{ op: "use_version", clip_id: clip.clip_id, version_id: approvedId }])}>
            {t("projectTimeline.inspector.useApproved", { n: approvedN })}
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => onOps([{ op: "include", clip_id: clip.clip_id, include: false }])}>{t("projectTimeline.inspector.exclude")}</button>
      </div>
      <form className="row wrap small" onSubmit={(e) => { e.preventDefault(); if (validTo) onOps([{ op: "move", clip_id: clip.clip_id, start_frame: target, ...(noSnap ? { snap: false as const } : {}) }]); }}>
        <label className="row">
          {t("projectTimeline.inspector.moveTo")}
          <input type="number" min={0} step={1} value={to} placeholder={String(clip.start_frame)} onChange={(e) => setTo(e.target.value)} style={{ width: "7em" }} />
        </label>
        <label className="row">
          <input type="checkbox" checked={noSnap} onChange={(e) => setNoSnap(e.target.checked)} />
          {t("projectTimeline.inspector.noSnap")}
        </label>
        <button type="submit" disabled={busy || !validTo}>{t("projectTimeline.inspector.move")}</button>
      </form>
      <h4>{t("projectTimeline.inspector.anchors")}</h4>
      {clip.anchors.length === 0 ? <p className="muted small">{t("projectTimeline.inspector.noAnchors")}</p> : (
        <ul className="small">
          {clip.anchors.map((a) => {
            const out = !check.ok && check.outside.includes(a.word_id);
            return (
              <li key={a.word_id} className={out ? "error" : ""}>
                {t(out ? "projectTimeline.inspector.anchorOut" : "projectTimeline.inspector.anchorOk", { text: a.text, frame: a.frame })}
                {" · "}
                {tc(a.frame, fps)}
              </li>
            );
          })}
        </ul>
      )}
      {bounds}
    </section>
  );
}
