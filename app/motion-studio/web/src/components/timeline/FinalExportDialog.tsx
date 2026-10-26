// Диалог экспорта финала (Task 45, F6/F8/F10): FPS (по умолчанию — таймлайна, иной —
// предупреждение), разрешение (`outputSize` от размера показа исходника), качество (CRF), оценка
// места, сводка входов (ревизии, версии сцен, без C — с причиной, не вошедшие) и явное действие
// «Смонтировать и экспортировать» — решение final на ревизию с этими настройками и задача
// `final.render`. Отказ гейта (409) — карточка с перечнем причин.
import {
  type FinalExportRequest, type FinalQuality, type FinalResolution, type Fps, type Job, type TimelineDto, outputSize,
} from "@ms/contracts";
import { useState } from "react";
import { ApiError, newKey } from "../../api/client.js";
import { useFinalEstimate, useStartFinal } from "../../api/timeline-client.js";
import { t, tk } from "../../i18n/index.js";
import { ErrorCard } from "../diagnostics/ErrorCard.js";

export interface FinalExportDialogProps {
  projectId: string;
  timeline: TimelineDto;
  /** Размер показа исходника (с учётом поворота). */
  display: { width: number; height: number };
  numbers: ReadonlyMap<string, number>;
  onStarted: (job: Job) => void;
  onClose: () => void;
}

const RESOLUTIONS: FinalResolution[] = ["source", "2160p", "1080p", "720p"];
const QUALITIES: FinalQuality[] = ["high", "standard", "draft"];
const FPS_CHOICES = [24, 25, 30, 50, 60];

const fpsText = (f: Fps): string => (f.den === 1 ? `${f.num}` : (f.num / f.den).toFixed(2));
const sameFps = (a: Fps, b: Fps) => a.num * b.den === b.num * a.den;
const gb = (b: number) => t("finalExport.gib", { n: (b / 1024 ** 3).toFixed(2) });

export function FinalExportDialog({ projectId, timeline, display, numbers, onStarted, onClose }: FinalExportDialogProps) {
  const doc = timeline.doc;
  const [fpsChoice, setFpsChoice] = useState<string>("");
  const [resolution, setResolution] = useState<FinalResolution>("1080p");
  const [quality, setQuality] = useState<FinalQuality>("standard");
  const [key, setKey] = useState(newKey);
  const fps: Fps | undefined = fpsChoice ? { num: Number(fpsChoice), den: 1 } : undefined;
  const changedFps = fps !== undefined && !sameFps(fps, doc.fps);
  const request: FinalExportRequest = { resolution, quality, audio_bitrate_kbps: 192, ...(changedFps ? { fps } : {}) };
  const est = useFinalEstimate(timeline.timeline_id, timeline.revision, request);
  const start = useStartFinal(projectId);
  const blocking = doc.issues.filter((i) => i.severity === "blocking");
  const canStart = timeline.fresh && blocking.length === 0 && !start.isPending && est.data?.ok !== false;
  const size = (r: FinalResolution) => outputSize(display, r);
  const gateErrors = start.error instanceof ApiError ? ((start.error.body as { errors?: { code: string; detail: string }[] } | null)?.errors ?? []) : [];

  return (
    <section className="panel final-dialog stack" role="dialog" aria-label={t("finalExport.title")} data-testid="final-dialog">
      <h3>{t("finalExport.title")}</h3>
      <div className="grid-3">
        <label className="small">
          {t("finalExport.fps")}
          <select value={fpsChoice} onChange={(e) => setFpsChoice(e.target.value)} aria-label={t("finalExport.fps")}>
            <option value="">{t("finalExport.fpsSource", { fps: fpsText(doc.fps) })}</option>
            {FPS_CHOICES.filter((f) => !sameFps({ num: f, den: 1 }, doc.fps)).map((f) => <option key={f} value={String(f)}>{f}</option>)}
          </select>
        </label>
        <label className="small">
          {t("finalExport.resolution")}
          <select value={resolution} onChange={(e) => setResolution(e.target.value as FinalResolution)} aria-label={t("finalExport.resolution")}>
            {RESOLUTIONS.map((r) => {
              const s = size(r);
              return (
                <option key={r} value={r}>
                  {r === "source" ? t("finalExport.resolution.source", { w: s.width, h: s.height }) : t("finalExport.resolution.option", { label: r, w: s.width, h: s.height })}
                </option>
              );
            })}
          </select>
        </label>
        <label className="small">
          {t("finalExport.quality")}
          <select value={quality} onChange={(e) => setQuality(e.target.value as FinalQuality)} aria-label={t("finalExport.quality")}>
            {QUALITIES.map((q) => <option key={q} value={q}>{tk(`finalExport.quality.${q}`, q)}</option>)}
          </select>
        </label>
      </div>
      {changedFps ? <p className="hint" role="status" data-testid="fps-warning">{t("finalExport.fpsWarning", { fps: fpsText(doc.fps) })}</p> : null}
      {est.data ? (
        <>
          <p className="small" data-testid="final-output">
            {t("finalExport.output", { w: est.data.width, h: est.data.height, fps: fpsText(est.data.fps), frames: est.data.frames })}
          </p>
          <p className={`small ${est.data.ok ? "muted" : "error"}`} data-testid="final-space">
            {t("finalExport.space", { need: gb(est.data.bytes), master: est.data.master_cached ? "" : t("finalExport.spaceMaster"), free: gb(est.data.free_bytes) })}
            {est.data.ok ? null : ` ${t("finalExport.spaceLow")}`}
          </p>
        </>
      ) : <p className="muted small">{t("finalExport.spaceLoading")}</p>}
      <div className="small">
        <strong>{t("finalExport.inputs")}</strong>
        <ul data-testid="final-inputs">
          <li>{t("finalExport.inputs.timeline", { n: timeline.revision, edl: doc.inputs.edl.revision, plan: doc.inputs.plan.revision, style: doc.inputs.style.revision })}</li>
          {doc.scenes.map((c) => (
            <li key={c.clip_id}>
              {t("finalExport.inputs.scene", {
                n: numbers.get(c.item_id) ?? "?", v: c.version_number,
                state: c.include === "approved" ? t("finalExport.inputs.approved") : t("finalExport.inputs.override", { reason: c.override_reason ?? "" }),
              })}
            </li>
          ))}
          {doc.excluded.map((x) => (
            <li key={x.item_id} className="muted">
              {t("finalExport.inputs.excluded", { n: numbers.get(x.item_id) ?? "?", reason: tk(`projectTimeline.excluded.reason.${x.reason}`, x.reason) })}
            </li>
          ))}
        </ul>
      </div>
      {!timeline.fresh ? <p className="error small">{t("finalExport.stale")}</p> : null}
      {blocking.length > 0 ? <p className="error small" data-testid="final-blocking">{t("finalExport.blocking")}</p> : null}
      <p className="muted small">{t("finalExport.approvalNote", { n: timeline.revision })}</p>
      {start.isError ? (
        <ErrorCard
          error={{ error: start.error instanceof ApiError ? start.error.code : "network", message: start.error.message }}
          title={start.error instanceof ApiError ? tk(`finalExport.gate.${start.error.code}`, t("finalExport.gateTitle")) : t("finalExport.gateTitle")}
        >
          {gateErrors.length > 0 ? (
            <ul className="small" data-testid="final-gate-errors">
              {gateErrors.map((e, i) => <li key={i}>{tk(`finalExport.gate.${e.code}`, e.code)}: {e.detail}</li>)}
            </ul>
          ) : null}
        </ErrorCard>
      ) : null}
      <div className="row wrap">
        <button
          type="button"
          className="primary"
          disabled={!canStart}
          onClick={() => start.mutate({ timelineId: timeline.timeline_id, n: timeline.revision, request, key }, {
            onSuccess: (r) => onStarted(r.job),
            onSettled: () => setKey(newKey()),
          })}
        >
          {t("finalExport.start")}
        </button>
        <button type="button" onClick={onClose}>{t("finalExport.close")}</button>
      </div>
    </section>
  );
}
