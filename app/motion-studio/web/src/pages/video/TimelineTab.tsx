// Вкладка «Таймлайн» видеопроекта (Task 45, ТЗ §11.1 п.4): сборка таймлайна из A, B и C,
// дорожки (`TimelineView`), перемещение сцен по словам (Р-V6: длительность, режим и зона — только
// в плане), инспектор сцены, превью ревизии с общим курсором, ревизии и «вернуть эту», баннер
// устаревания, экспорт финала («Смонтировать и экспортировать») и история экспортов с отчётом
// проверки и повтором.
import { type Job, type TimelineOp, type VideoTimelineDoc, frameToUs, usToFrame } from "@ms/contracts";
import { type ReactElement, useRef, useState } from "react";
import { ApiError, newKey } from "../../api/client.js";
import { isActive, useEdl, usePlan, useTranscript } from "../../api/queries.js";
import {
  type TimelineRevisionEntry, timelineApi, timelineUrls, useBuildTimeline, useSaveTimeline, useTimeline, useTimelinePreview, useTimelineRevisions,
} from "../../api/timeline-client.js";
import { useVideoScenes } from "../../api/video-scenes-client.js";
import { JobStatus } from "../../components/JobStatus.js";
import { ErrorCard } from "../../components/diagnostics/ErrorCard.js";
import { ClipInspector } from "../../components/timeline/ClipInspector.js";
import { ExportHistory } from "../../components/timeline/ExportHistory.js";
import { FinalExportDialog } from "../../components/timeline/FinalExportDialog.js";
import { FreshnessBanner } from "../../components/timeline/FreshnessBanner.js";
import { TimelineView } from "../../components/timeline/TimelineView.js";
import type { ExcludedBlock } from "../../components/timeline/TrackGraphics.js";
import { t } from "../../i18n/index.js";
import { revertOps } from "../../timeline/drag.js";
import { toSource } from "../../video/use-timeline.js";
import type { VideoTabProps } from "./tab-props.js";

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" });

/** Ошибка запроса — карточка каталога ошибок (Task 48). */
function ApiErrorCard({ error }: { error: unknown }) {
  const code = error instanceof ApiError ? error.code : "network";
  return <ErrorCard error={{ error: code, message: error instanceof Error ? error.message : "" }} />;
}

/**
 * «Изменить границы — в плане» (Р-V6): вкладки переключает VideoWorkspace (реестр 35′, свойства
 * вкладок без смены вкладки) — нажимаем сцену на дорожке плана рядом с плеером: она открывает
 * вкладку «План» на этой сцене. Дорожки нет — вкладка «План» по адресу.
 */
function openPlanItem(itemId: string): void {
  const el = [...document.querySelectorAll<HTMLButtonElement>("[data-testid^='plan-item-']")].find((b) => b.dataset.testid === `plan-item-${itemId}`);
  if (el) el.click();
  else window.location.assign(`${window.location.pathname}?tab=plan`);
}

function Revisions({ timelineId, current, busy, onRestore }: { timelineId: string; current: VideoTimelineDoc; busy: boolean; onRestore: (ops: TimelineOp[]) => void }) {
  const q = useTimelineRevisions(timelineId, current.revision);
  const [note, setNote] = useState<string | null>(null);
  const restore = async (r: TimelineRevisionEntry) => {
    const target = await timelineApi.revision(timelineId, r.revision);
    const ops = revertOps(current, target.doc);
    if (ops.length === 0) setNote(t("projectTimeline.revisions.nothing"));
    else {
      setNote(null);
      onRestore(ops);
    }
  };
  return (
    <section className="panel ptl-revisions" aria-label={t("projectTimeline.revisions.title")}>
      <h3>{t("projectTimeline.revisions.title")}</h3>
      <ul className="plain small" data-testid="timeline-revisions">
        {[...(q.data ?? [])].reverse().map((r) => (
          <li key={r.revision} data-revision={r.revision}>
            <span>{t("projectTimeline.revisions.item", { n: r.revision, at: when(r.created_at) })}</span>
            <span className="muted">{t("projectTimeline.revisions.ops", { n: r.ops })}</span>
            {r.current ? <span className="badge">{t("projectTimeline.revisions.current")}</span> : (
              <button type="button" disabled={busy} title={t("projectTimeline.revisions.restoreHint", { n: r.revision })} onClick={() => void restore(r)}>
                {t("projectTimeline.revisions.restore")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {note ? <p className="muted small">{note}</p> : null}
    </section>
  );
}

export const TimelineTab: (props: VideoTabProps) => ReactElement = ({ data, onSeek }) => {
  const projectId = data.project.id;
  const ready = Boolean(data.plan && data.edl && data.media);
  const q = useTimeline(projectId, ready);
  const edl = useEdl(data.edl?.id);
  const transcript = useTranscript(data.transcript?.id);
  const plan = usePlan(data.plan?.id);
  const scenes = useVideoScenes(projectId, ready);
  const build = useBuildTimeline(projectId);
  const save = useSaveTimeline(projectId);
  const preview = useTimelinePreview(projectId);
  const [buildKey, setBuildKey] = useState(newKey);
  const [previewKey, setPreviewKey] = useState(newKey);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [playhead, setPlayhead] = useState(0);
  const [dialog, setDialog] = useState(false);
  const [finalJob, setFinalJob] = useState<Job | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  if (!ready || !data.media) return <section className="panel" data-tab="timeline"><p className="muted">{t("projectTimeline.stub")}</p></section>;
  const media = data.media;
  const st = q.data;
  const dto = st?.dto ?? null;
  const job = st?.job ?? null;
  const jobBusy = job !== null && isActive(job.status);
  const busy = jobBusy || save.isPending || build.isPending;
  const doRebuild = () => build.mutate(buildKey, { onSettled: () => setBuildKey(newKey()) });
  const deriv = (kind: string) => media.derivatives.find((d) => d.kind === kind);
  const thumbs = deriv("thumbs")?.params as { count?: number; every_us?: number } | undefined;

  const header = (
    <div className="row wrap">
      <h2>{t("projectTimeline.title")}</h2>
      {dto ? <span className="badge" data-testid="timeline-revision">{t("projectTimeline.revision", { n: dto.revision })}</span> : null}
      <span className="spacer" />
      <button type="button" className={dto ? "" : "primary"} disabled={busy} onClick={doRebuild}>{dto ? t("projectTimeline.rebuild") : t("projectTimeline.build")}</button>
      {dto ? <button type="button" className="primary" disabled={busy} onClick={() => setDialog(true)}>{t("projectTimeline.export")}</button> : null}
    </div>
  );
  const jobLine = job && (isActive(job.status) || job.status === "failed" || job.status === "blocked") ? <JobStatus jobId={job.id} /> : null;

  if (q.isError) return <section className="panel" data-tab="timeline">{header}<ApiErrorCard error={q.error} /></section>;
  if (!st) return <section className="panel" data-tab="timeline"><p className="muted">{t("common.loading")}</p></section>;
  if (!dto) {
    return (
      <section className="panel stack" data-tab="timeline">
        {header}
        <p className="hint">{t("projectTimeline.empty")}</p>
        {build.isError ? <ApiErrorCard error={build.error} /> : null}
        {jobLine}
      </section>
    );
  }

  const doc = dto.doc;
  const fps = doc.fps;
  // номера сцен — по порядку сцен плана (как во вкладках «План» и «Сцены»)
  const items = (plan.data?.doc.items ?? []).filter((x) => x.status !== "rejected");
  const numbers = new Map<string, number>(items.map((x, i) => [x.id, i + 1]));
  for (const c of doc.scenes) if (!numbers.has(c.item_id)) numbers.set(c.item_id, numbers.size + 1);
  const excluded: ExcludedBlock[] = doc.excluded.flatMap((x) => {
    const it = items.find((i) => i.id === x.item_id);
    return it ? [{ item_id: x.item_id, reason: x.reason, start: it.frames.start, end: it.frames.end }] : [];
  });
  const map = edl.data?.word_map ?? {};
  const wordText = new Map<string, string>();
  const words = (transcript.data?.doc.words ?? []).flatMap((w) => {
    wordText.set(w.id, w.text);
    const m = map[w.id];
    return m && m.state !== "removed" ? [{ frame: usToFrame(m.edited_start_us, fps), text: w.text }] : [];
  });
  const clip = doc.scenes.find((c) => c.item_id === selected);
  const ex = doc.excluded.find((x) => x.item_id === selected);
  const sceneOf = (itemId: string | undefined) => scenes.data?.scenes.find((s) => s.item_id === itemId);
  const tl = edl.data?.timeline;

  const apply = (ops: TimelineOp[]) => save.mutate({ timelineId: dto.timeline_id, body: { base_revision: dto.revision, ops } });
  const seekFrame = (f: number) => {
    setPlayhead(f);
    if (video.current) video.current.currentTime = frameToUs(f, fps) / 1e6;
    if (tl) onSeek(toSource(tl, frameToUs(f, fps)));
  };
  const finalActive = data.jobs.some((j) => (j.type === "final.render" || j.type === "final.reproduce") && isActive(j.status));

  return (
    <section className="panel stack" data-tab="timeline">
      {header}
      {!dto.fresh ? <FreshnessBanner reasons={dto.reasons} busy={busy} onRebuild={doRebuild} /> : null}
      {build.isError ? <ApiErrorCard error={build.error} /> : null}
      {jobLine}
      <div className="ptl-preview stack">
        {dto.preview_ready ? (
          <video
            ref={video}
            data-testid="timeline-preview"
            src={timelineUrls.preview(dto.timeline_id, dto.revision)}
            controls
            preload="metadata"
            aria-label={t("projectTimeline.preview.label", { n: dto.revision })}
            onTimeUpdate={(e) => setPlayhead(Math.min(doc.duration_frames, usToFrame(Math.round(e.currentTarget.currentTime * 1e6), fps)))}
          />
        ) : (
          <div className="row wrap">
            <p className="muted small">{t("projectTimeline.preview.none", { n: dto.revision })}</p>
            <button
              type="button"
              disabled={busy || preview.isPending}
              onClick={() => preview.mutate({ timelineId: dto.timeline_id, n: dto.revision, key: previewKey }, { onSettled: () => setPreviewKey(newKey()) })}
            >
              {t("projectTimeline.preview.build")}
            </button>
          </div>
        )}
        {preview.isError ? <ApiErrorCard error={preview.error} /> : null}
      </div>
      <TimelineView
        doc={doc}
        mediaId={media.asset.id}
        thumbs={{ count: thumbs?.count ?? 0, everyUs: thumbs?.every_us ?? 1 }}
        hasWaveform={Boolean(deriv("waveform"))}
        words={words}
        numbers={numbers}
        excluded={excluded}
        selected={selected}
        playhead={playhead}
        busy={busy}
        onSelect={setSelected}
        onSeek={seekFrame}
        onMove={(clipId, start, o) => apply([{ op: "move", clip_id: clipId, start_frame: start, ...(o.snap ? {} : { snap: false as const }), ...(o.reason ? { override_reason: o.reason } : {}) }])}
      />
      {save.isError ? <ApiErrorCard error={save.error} /> : null}
      {doc.issues.length > 0 ? (
        <section className="ptl-issues" aria-label={t("projectTimeline.issues")}>
          <h3>{t("projectTimeline.issues")}</h3>
          <ul className="small" data-testid="timeline-issues">
            {doc.issues.map((i, k) => (
              <li key={k} className={i.severity}>
                {`${i.item_id ? `${t("projectTimeline.excludedItem", { n: numbers.get(i.item_id) ?? "?", reason: i.message })}` : i.message} · ${t(i.severity === "blocking" ? "projectTimeline.issue.blocking" : "projectTimeline.issue.warning")}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid-2">
        <ClipInspector
          key={`${selected ?? "none"}@${dto.revision}`}
          clip={clip}
          excluded={ex}
          n={numbers.get(selected ?? "") ?? "?"}
          fps={fps}
          tl={tl}
          scene={sceneOf(selected)}
          busy={busy}
          onOps={apply}
          onOpenPlan={openPlanItem}
        />
        <Revisions timelineId={dto.timeline_id} current={doc} busy={busy} onRestore={apply} />
      </div>
      {dialog ? (
        <FinalExportDialog
          projectId={projectId}
          timeline={dto}
          display={{ width: media.asset.probe.video.display_width, height: media.asset.probe.video.display_height }}
          numbers={numbers}
          onStarted={(j) => { setFinalJob(j); setDialog(false); }}
          onClose={() => setDialog(false)}
        />
      ) : null}
      {finalJob ? (
        <div className="stack" data-testid="final-job">
          <p className="muted small">{t("finalExport.progress")}</p>
          <JobStatus jobId={finalJob.id} />
        </div>
      ) : null}
      <ExportHistory projectId={projectId} active={finalActive} words={wordText} />
    </section>
  );
};
