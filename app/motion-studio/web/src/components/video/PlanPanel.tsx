// Вкладка «План» (Task 33): построение плана (`plan.visual`; по умолчанию с агентом, поверх плана
// со сценами — после подтверждения замены; без агента — пустой план, сцены добавляет человек), баннер устаревшего плана, «Утвердить визуальный план (B)» с перечнем причин,
// если нельзя, проблемы плана, список сцен и инспектор выбранной, транскрипт после монтажа для
// сцены пользователя (`AddSceneDialog`). Правка — новая ревизия от текущей; 409 — перечитать.
import { type EdlDto, type PlanDto, type PlanIssue, type PlanOp, type TranscriptDto, type VideoProjectDto, type Zone, joinWords } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, newKey } from "../../api/client.js";
import { isActive } from "../../api/queries.js";
import { errorText, t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";
import { AddSceneDialog } from "./AddSceneDialog.js";
import { PlanInspector } from "./PlanInspector.js";
import { PlanIssues } from "./PlanIssues.js";
import { StaleBanner } from "./StaleBanner.js";
import { TranscriptEditor } from "./TranscriptEditor.js";

export interface PlanPanelProps {
  data: VideoProjectDto;
  edl: EdlDto;
  transcript: TranscriptDto | undefined;
  plan: PlanDto | undefined;
  /** Blocking-проблемы стиля проекта (тоже мешают B). */
  styleIssues: readonly PlanIssue[];
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  onPreviewZone: (zone: Zone | undefined) => void;
  onPlayEdited: (range: { start_us: number; end_us: number }) => void;
  onSeek: (sourceUs: number) => void;
  currentUs: number;
  onChanged: () => void;
}

/** Причины, по которым B утвердить нельзя (пусто — можно). */
export function approvalBReasons(data: VideoProjectDto, plan: PlanDto, styleIssues: readonly PlanIssue[]): string[] {
  const out: string[] = [];
  if (data.approvals.A.state !== "valid") out.push(t("plan.b.needA"));
  const f = plan.inputs_fresh;
  if (!f.edl || !f.transcript || !f.style) out.push(t("plan.b.outdated"));
  const open = plan.doc.items.filter((x) => x.status === "proposed" || x.status === "stale");
  if (open.length > 0) out.push(t("plan.b.unresolved", { list: open.map((x) => x.id).join(", ") }));
  const blocking = plan.doc.issues.filter((x) => x.severity === "blocking").length;
  if (blocking > 0) out.push(t("plan.b.blocking", { n: blocking }));
  const styleBlocking = styleIssues.filter((x) => x.severity === "blocking").length;
  if (styleBlocking > 0) out.push(t("plan.b.styleBlocking", { n: styleBlocking }));
  return out;
}

export function PlanPanel(p: PlanPanelProps) {
  const { data, edl, transcript, plan } = p;
  const client = useQueryClient();
  const projectId = data.project.id;
  const [useAgent, setUseAgent] = useState(true);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [genKey, setGenKey] = useState(newKey);
  const [recheckKey, setRecheckKey] = useState(newKey);
  const [conflict, setConflict] = useState(false);
  const [adding, setAdding] = useState<{ start_word_id: string; end_word_id: string; text: string } | null>(null);
  const busy = (type: string) => data.jobs.some((j) => j.type === type && isActive(j.status));

  const generate = useMutation({
    mutationFn: () => api.generatePlan(projectId, useAgent, genKey),
    onSuccess: p.onChanged,
    onSettled: () => setGenKey(newKey()),
  });
  const save = useMutation({
    mutationFn: (ops: PlanOp[]) => api.savePlan(plan!.id, plan!.current_revision, ops),
    onSuccess: (r, ops) => {
      setConflict(false);
      setAdding(null);
      if (ops.some((o) => o.op === "add")) p.onSelect(r.doc.items.at(-1)?.id);
      client.setQueryData(["plan", r.id], r);
      p.onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "revision_conflict") {
        setConflict(true);
        p.onChanged();
      }
    },
  });
  const approve = useMutation({ mutationFn: () => api.approve(projectId, "B"), onSuccess: p.onChanged });
  const recheck = useMutation({
    mutationFn: () => api.recheckPlan(plan!.id, recheckKey),
    onSuccess: p.onChanged,
    onSettled: () => setRecheckKey(newKey()),
  });

  const aValid = data.approvals.A.state === "valid";
  const needs = [
    ...(aValid ? [] : [t("plan.need.A")]),
    ...(data.semantic?.fresh ? [] : [t("plan.need.semantic")]),
    ...(data.footage ? [] : [t("plan.need.footage")]),
  ];
  // сцены текущей ревизии плана (как считает сервер), а не показанной (ревью Task 33 M4)
  const hasScenes = (data.plan?.scenes ?? 0) > 0;
  const generateBar = (
    <>
      <div className="row wrap">
        <button
          type="button"
          className={plan ? "" : "primary"}
          disabled={needs.length > 0 || generate.isPending || busy("plan.visual") || confirmReplace}
          onClick={() => (useAgent && hasScenes ? setConfirmReplace(true) : generate.mutate())}
        >
          {t("plan.generate")}
        </button>
        <label className="row small">
          <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
          {t("analysis.useAgent")}
        </label>
      </div>
      {confirmReplace ? (
        <div className="msg-warning confirm-replace" role="alertdialog" aria-label={t("plan.generate")}>
          <p>{t("plan.replaceWarning")}</p>
          <div className="row wrap">
            <button type="button" className="primary" onClick={() => { setConfirmReplace(false); generate.mutate(); }}>{t("plan.replaceConfirm")}</button>
            <button type="button" onClick={() => setConfirmReplace(false)}>{t("common.cancel")}</button>
          </div>
        </div>
      ) : null}
    </>
  );

  if (!plan) {
    return (
      <section className="panel plan-panel">
        <h2>{t("video.tab.plan")}</h2>
        <p className="muted">{t("plan.empty")}</p>
        {generateBar}
        {needs.length > 0 ? <p className="hint">{t("plan.needs", { list: needs.join(", ") })}</p> : <p className="hint">{t("plan.generateHint")}</p>}
        {generate.isError ? <p className="error">{errorText(generate.error)}</p> : null}
      </section>
    );
  }

  const doc = plan.doc;
  const isCurrent = doc.revision === plan.current_revision;
  const reasons = approvalBReasons(data, plan, p.styleIssues);
  const bValid = data.approvals.B.state === "valid";
  const item = doc.items.find((x) => x.id === p.selected);
  const active = doc.items.filter((x) => x.status !== "rejected" && !(x.status === "stale" && x.stale_reason === "anchor_cut"));
  const coverage = Math.round((100 * active.reduce((a, x) => a + (x.edited.end_us - x.edited.start_us), 0)) / Math.max(1, edl.timeline.duration_us));
  const words = transcript?.doc.words ?? [];
  const textOf = (a: string, b: string) => {
    const i = words.findIndex((w) => w.id === a);
    const j = words.findIndex((w) => w.id === b);
    return i < 0 || j < i ? "" : joinWords(words.slice(i, j + 1).filter((w) => edl.word_map[w.id]?.state !== "removed").map((w) => w.text));
  };

  return (
    <>
      <section className="panel plan-panel" aria-label={t("video.tab.plan")}>
        <div className="row wrap">
          <h2 className="grow">{t("video.tab.plan")}</h2>
          <span className="badge">{t("plan.revision", { n: doc.revision })}</span>
          <span className="muted small">{t("plan.coverage", { pct: coverage })}</span>
        </div>
        {generateBar}
        {generate.isError ? <p className="error">{errorText(generate.error)}</p> : null}
        <div className="row wrap actions">
          <button type="button" className="primary" disabled={reasons.length > 0 || bValid || approve.isPending} onClick={() => approve.mutate()}>
            {t("plan.approve")}
          </button>
          {bValid ? <span className="ok small">{t("plan.approved")}</span> : null}
        </div>
        {reasons.length > 0 && !bValid ? (
          <div className="hint b-reasons" data-testid="b-reasons">
            <span>{t("plan.b.reasons")}</span>
            <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ) : null}
        {approve.isError ? <p className="error">{errorText(approve.error)}</p> : null}
      </section>
      <StaleBanner fresh={plan.inputs_fresh} recheck={plan.recheck} busy={recheck.isPending || busy("plan.recheck")} onRecheck={() => recheck.mutate()} />
      {conflict ? <p className="error" role="alert">{t("plan.conflict")}</p> : null}
      {save.isError && !conflict ? <p className="error">{errorText(save.error)}</p> : null}
      {item ? (
        <PlanInspector
          item={item}
          items={doc.items}
          proposal={plan.proposals[item.id]}
          issues={doc.issues}
          faceOverlapMax={plan.face_overlap_max}
          timeline={edl.timeline}
          words={words}
          busy={save.isPending || !isCurrent}
          onOps={(ops) => save.mutate(ops)}
          onPlay={p.onPlayEdited}
          onPreviewZone={p.onPreviewZone}
        />
      ) : <p className="muted small">{t("plan.selectHint")}</p>}
      <section className="panel">
        <h2>{t("plan.scenes", { n: doc.items.length })}</h2>
        {doc.items.length === 0 ? <p className="muted small">{t("plan.trackEmpty")}</p> : (
          <ul className="scene-list">
            {doc.items.map((x) => (
              <li key={x.id} className={`scene-row status-${x.status} ${p.selected === x.id ? "selected" : ""}`} data-testid={`scene-row-${x.id}`}>
                <button type="button" className="scene-row-btn" onClick={() => p.onSelect(x.id)}>
                  <span className={`mode-dot mode-${x.composition_mode}`} aria-hidden="true" />
                  <span className="strong">{t("plan.sceneTitle", { id: x.id, type: t(`pattern.${x.visual_type}`) })}</span>
                  <span className="mono small">{t("plan.sceneRange", { from: formatTimecode(x.edited.start_us), to: formatTimecode(x.edited.end_us) })}</span>
                  <span className={`badge plan-status-${x.status}`}>{t(`plan.status.${x.status}`)}</span>
                </button>
                <p className="muted small scene-purpose">{x.purpose}</p>
              </li>
            ))}
          </ul>
        )}
        {doc.skipped.length > 0 ? (
          <details className="skipped">
            <summary className="small">{t("plan.skippedList", { n: doc.skipped.length })}</summary>
            <ul className="small">{doc.skipped.map((s, i) => <li key={i}>{s.reason}</li>)}</ul>
          </details>
        ) : null}
      </section>
      <section className="panel">
        <h2>{t("plan.issues", { n: doc.issues.length })}</h2>
        <PlanIssues issues={doc.issues} onSelect={(id) => p.onSelect(id)} />
      </section>
      {transcript ? (
        <section className="panel">
          <h2>{t("plan.transcript")}</h2>
          <p className="hint">{t("plan.addHint")}</p>
          <TranscriptEditor
            transcript={transcript}
            wordMap={edl.word_map}
            currentUs={p.currentUs}
            readOnly
            onSeek={p.onSeek}
            onAddScene={(a, b) => setAdding({ start_word_id: a, end_word_id: b, text: textOf(a, b) })}
          />
        </section>
      ) : null}
      {adding ? <AddSceneDialog range={adding} busy={save.isPending} onSubmit={(op) => save.mutate([op])} onClose={() => setAdding(null)} /> : null}
    </>
  );
}
