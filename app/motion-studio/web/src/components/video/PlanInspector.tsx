// Инспектор сцены плана (Task 33): назначение, тип визуализации (паттерн KB), режим, зона (смена —
// сразу правкой, превью на кадре), ключевые слова с моментом появления, метафора, оценки, основание
// (`EvidenceQuote`), перекрытие лица и причина (обязательна, если графика поверх автора закрывает
// лицо больше чем на 2 %), проблемы сцены. Действия — операции правки плана: «Принять» (с причиной —
// одной правкой), «Отклонить», «Изменить» (назначение, тип, режим), «Вернуть к предложению» агента.
import {
  type EditedTimeline, PATTERN_SLUGS, type PlanIssue, type PlanOp, type PlanProposal, PlannedCompositionModeSchema, type ScenePlanItem, type Zone,
  ZoneSchema,
} from "@ms/contracts";
import { useEffect, useId, useState } from "react";
import { t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";
import { EvidenceQuote } from "./EvidenceQuote.js";
import { PlanIssues } from "./PlanIssues.js";

/** `planning.faceOverlapMax` по умолчанию: выше — нужна причина (как проверка сервера). */
export const FACE_OVERLAP_MAX = 0.02;
const OVER_AUTHOR = new Set<ScenePlanItem["composition_mode"]>(["overlay", "callout", "pip"]);
export const MODES = PlannedCompositionModeSchema.options;
export const ZONES = ZoneSchema.options;

export interface PlanInspectorProps {
  item: ScenePlanItem;
  /** Предложение агента по этой сцене (поля первой выдачи). */
  proposal?: PlanProposal | undefined;
  issues: readonly PlanIssue[];
  timeline: EditedTimeline;
  busy: boolean;
  onOps: (ops: PlanOp[]) => void;
  onPlay: (editedRange: { start_us: number; end_us: number }) => void;
  /** Зона для превью на кадре (выбор в списке). */
  onPreviewZone: (zone: Zone) => void;
}

const PROPOSAL_KEYS = ["visual_type", "composition_mode", "zone", "start_word_id", "end_word_id"] as const;

export function PlanInspector({ item: x, proposal, issues, timeline, busy, onOps, onPlay, onPreviewZone }: PlanInspectorProps) {
  const ids = { reason: useId(), purpose: useId(), type: useId(), mode: useId(), zone: useId() };
  const [reason, setReason] = useState(x.face_overlap.override_reason ?? "");
  const [edit, setEdit] = useState<{ purpose: string; visual_type: ScenePlanItem["visual_type"]; composition_mode: ScenePlanItem["composition_mode"] } | null>(null);
  useEffect(() => {
    setReason(x.face_overlap.override_reason ?? "");
    setEdit(null);
  }, [x.id, x.face_overlap.override_reason]);

  const needsReason = OVER_AUTHOR.has(x.composition_mode) && x.face_overlap.ratio > FACE_OVERLAP_MAX;
  const reasonText = reason.trim();
  const cutStale = x.status === "stale" && x.stale_reason === "anchor_cut";
  const acceptBlocked = busy || cutStale || x.status === "accepted" || (needsReason && reasonText === "");
  const accept = () => {
    const ops: PlanOp[] = [];
    if (needsReason && reasonText !== (x.face_overlap.override_reason ?? "")) ops.push({ op: "modify", item_id: x.id, patch: { override_reason: reasonText } });
    ops.push({ op: "set_status", item_id: x.id, status: "accepted" });
    onOps(ops);
  };
  const revertPatch = proposal && x.origin === "agent"
    ? Object.fromEntries(PROPOSAL_KEYS.filter((k) => proposal[k] !== x[k]).map((k) => [k, proposal[k]]))
    : {};
  const canRevert = Object.keys(revertPatch).length > 0;
  const saveEdit = () => {
    if (!edit) return;
    const patch: Record<string, string> = {};
    if (edit.purpose.trim() && edit.purpose.trim() !== x.purpose) patch.purpose = edit.purpose.trim();
    if (edit.visual_type !== x.visual_type) patch.visual_type = edit.visual_type;
    if (edit.composition_mode !== x.composition_mode) patch.composition_mode = edit.composition_mode;
    if (Object.keys(patch).length > 0) onOps([{ op: "modify", item_id: x.id, patch }]);
    setEdit(null);
  };
  const mine = issues.filter((i) => i.item_id === x.id);

  return (
    <section className="panel plan-inspector" data-testid="inspector" aria-label={t("inspector.title", { id: x.id })}>
      <h2 className="row wrap">
        <span>{t("inspector.title", { id: x.id })}</span>
        <span className={`badge plan-status-${x.status}`}>{t(`plan.status.${x.status}`)}</span>
        {x.stale_reason ? <span className="badge severity-blocking">{t(`plan.staleReason.${x.stale_reason}`)}</span> : null}
        <span className="muted small">{t("inspector.origin", { who: t(`plan.origin.${x.origin}`) })}</span>
      </h2>
      <dl className="kv inspector-fields">
        <div>
          <dt>{edit ? <label htmlFor={ids.purpose}>{t("inspector.purpose")}</label> : t("inspector.purpose")}</dt>
          <dd>{edit ? <input id={ids.purpose} className="grow" value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /> : x.purpose}</dd>
        </div>
        <div>
          <dt>{edit ? <label htmlFor={ids.type}>{t("inspector.type")}</label> : t("inspector.type")}</dt>
          <dd>
            {edit ? (
              <select id={ids.type} value={edit.visual_type} onChange={(e) => setEdit({ ...edit, visual_type: e.target.value as ScenePlanItem["visual_type"] })}>
                {PATTERN_SLUGS.map((p) => <option key={p} value={p}>{t(`pattern.${p}`)}</option>)}
              </select>
            ) : t(`pattern.${x.visual_type}`)}
          </dd>
        </div>
        <div>
          <dt>{edit ? <label htmlFor={ids.mode}>{t("inspector.mode")}</label> : t("inspector.mode")}</dt>
          <dd>
            {edit ? (
              <select id={ids.mode} value={edit.composition_mode} onChange={(e) => setEdit({ ...edit, composition_mode: e.target.value as ScenePlanItem["composition_mode"] })}>
                {MODES.map((m) => <option key={m} value={m}>{t(`plan.mode.${m}`)}</option>)}
              </select>
            ) : <span className={`mode-chip mode-${x.composition_mode}`}>{t(`plan.mode.${x.composition_mode}`)}</span>}
          </dd>
        </div>
        <div>
          <dt><label htmlFor={ids.zone}>{t("inspector.zone")}</label></dt>
          <dd>
            <select
              id={ids.zone}
              value={x.zone}
              disabled={busy}
              onFocus={() => onPreviewZone(x.zone)}
              onChange={(e) => {
                const z = e.target.value as Zone;
                onPreviewZone(z);
                onOps([{ op: "modify", item_id: x.id, patch: { zone: z } }]);
              }}
            >
              {ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z}`)}</option>)}
            </select>
          </dd>
        </div>
        <div>
          <dt>{t("inspector.keyTerms")}</dt>
          <dd>
            {x.key_terms.length === 0 ? <span className="muted">{t("inspector.noKeyTerms")}</span> : (
              <span className="chips">
                {x.key_terms.map((k) => <span key={`${k.word_id}-${k.text}`} className="chip">{t("inspector.keyTerm", { text: k.text, tc: formatTimecode(k.edited_at_us) })}</span>)}
              </span>
            )}
          </dd>
        </div>
        {x.metaphor ? (
          <div><dt>{t("inspector.metaphor")}</dt><dd>{x.metaphor}</dd></div>
        ) : null}
      </dl>
      <p className="muted small">{t("inspector.scores", { c: x.complexity, u: x.usefulness, e: x.effort, l: x.visual_load })}</p>
      <h3>{t("inspector.evidence")}</h3>
      {x.evidence.map((e, i) => <EvidenceQuote key={`${e.start_word_id}-${i}`} evidence={e} timeline={timeline} onPlay={onPlay} />)}
      {OVER_AUTHOR.has(x.composition_mode) ? (
        <div className={`face-overlap ${needsReason ? "warn" : ""}`}>
          <p>{t("inspector.face", { pct: Math.round(x.face_overlap.ratio * 100) })}</p>
          {needsReason ? (
            <>
              <label htmlFor={ids.reason} className="small">{t("inspector.reason")}</label>
              <textarea id={ids.reason} rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} />
              {reasonText === "" ? <p className="hint">{t("inspector.reasonRequired")}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
      {mine.length > 0 ? <PlanIssues issues={mine} /> : null}
      <div className="row wrap actions">
        {edit ? (
          <>
            <button type="button" className="primary" disabled={busy} onClick={saveEdit}>{t("inspector.save")}</button>
            <button type="button" onClick={() => setEdit(null)}>{t("inspector.cancel")}</button>
          </>
        ) : (
          <>
            <button type="button" className="primary" disabled={acceptBlocked} onClick={accept}>{t("inspector.accept")}</button>
            <button type="button" disabled={busy || x.status === "rejected"} onClick={() => onOps([{ op: "set_status", item_id: x.id, status: "rejected" }])}>
              {t("inspector.reject")}
            </button>
            <button type="button" disabled={busy} onClick={() => setEdit({ purpose: x.purpose, visual_type: x.visual_type, composition_mode: x.composition_mode })}>
              {t("inspector.edit")}
            </button>
            {canRevert ? (
              <button type="button" disabled={busy} onClick={() => onOps([{ op: "modify", item_id: x.id, patch: revertPatch }])}>{t("inspector.revert")}</button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
