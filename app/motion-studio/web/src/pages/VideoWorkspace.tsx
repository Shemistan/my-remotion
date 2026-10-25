// Video Workspace (ТЗ §11.1 п.3–4, Task 29, 33): шапка проекта с утверждениями A/B, плеер (исходник /
// после монтажа) с зонами поверх кадра, волна, миниатюры, линейки монтажа и дорожка визуального
// плана; вкладки «Медиа», «Транскрипт», «Черновой монтаж», «Анализ», «План», «Стиль», Phase 4–6 —
// «Сцены», «Экспорт», «Таймлайн» (заглушки Task 35′). Задачи
// проекта — со статусом и прогрессом; данные перечитываются по событиям задач и опросом, пока задача идёт.
import { type SceneDto, ZONE_RECTS, type Zone } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, newKey } from "../api/client.js";
import { isActive, useEdl, useFootage, usePlan, useProjectStyle, useSemantic, useTranscript, useVideoProject } from "../api/queries.js";
import { JobStatus } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { AnalysisPanel } from "../components/video/AnalysisPanel.js";
import { ApprovalBar } from "../components/video/ApprovalBar.js";
import { AsrStatus } from "../components/video/AsrStatus.js";
import { EditedTimelineBar } from "../components/video/EditedTimelineBar.js";
import { MediaImport } from "../components/video/MediaImport.js";
import { MediaInfo } from "../components/video/MediaInfo.js";
import { PlanPanel } from "../components/video/PlanPanel.js";
import { PlanTrack } from "../components/video/PlanTrack.js";
import { ProxyPlayer, type ProxyPlayerHandle } from "../components/video/ProxyPlayer.js";
import { RevisionList } from "../components/video/RevisionList.js";
import { RoughCutPanel } from "../components/video/RoughCutPanel.js";
import { SafeZoneOverlay } from "../components/video/SafeZoneOverlay.js";
import { StyleBiblePanel } from "../components/video/StyleBiblePanel.js";
import { ThumbStrip } from "../components/video/ThumbStrip.js";
import { TranscriptEditor } from "../components/video/TranscriptEditor.js";
import { Waveform } from "../components/video/Waveform.js";
import { errorText, t } from "../i18n/index.js";
import { ExportTab } from "./video/ExportTab.js";
import { ScenesTab } from "./video/ScenesTab.js";
import { TimelineTab } from "./video/TimelineTab.js";
import { toEdited, toSource } from "../video/use-timeline.js";

/** Вкладки; Phase 4–6 (Task 35′): «Сцены» (Task 40), «Экспорт» (5L, 45), «Таймлайн» (45). */
export const TABS = ["media", "transcript", "roughcut", "analysis", "plan", "style", "scenes", "export", "timeline"] as const;
type Tab = (typeof TABS)[number];

export function VideoWorkspace({ id, scenes = [] }: { id: string; scenes?: Pick<SceneDto, "id" | "title">[] }) {
  const client = useQueryClient();
  const q = useVideoProject(id);
  const [tab, setTab] = useState<Tab>("media");
  const [currentUs, setCurrentUs] = useState(0);
  const [viewing, setViewing] = useState<number | undefined>(undefined);
  const [useAgent, setUseAgent] = useState(false);
  const [proposeKey, setProposeKey] = useState(newKey);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [previewZone, setPreviewZone] = useState<Zone | undefined>(undefined);
  const player = useRef<ProxyPlayerHandle>(null);
  const data = q.data;
  const transcript = useTranscript(data?.transcript?.id, viewing);
  const current = useTranscript(data?.transcript?.id);
  const edl = useEdl(data?.edl?.id);
  const footage = useFootage(data?.footage?.id);
  const plan = usePlan(data?.plan?.id);
  const semantic = useSemantic(plan.data?.doc.inputs.semantic_id);
  const style = useProjectStyle(id, Boolean(data?.style));

  const refresh = () => {
    for (const key of ["video", "transcript", "transcriptRevisions", "edl", "jobs", "plan", "style"]) void client.invalidateQueries({ queryKey: [key] });
  };
  const propose = useMutation({
    mutationFn: () => api.proposeRoughCut(id, useAgent, proposeKey),
    onSuccess: refresh,
    onSettled: () => setProposeKey(newKey()),
  });
  const cut = useMutation({
    mutationFn: (v: { start: string; end: string }) => api.saveEdl(edl.data!.id, edl.data!.current_revision, [{ op: "add_cut", start_word_id: v.start, end_word_id: v.end }]),
    onSettled: refresh,
  });
  const revoke = useMutation({ mutationFn: (aid: string) => api.revokeApproval(aid), onSettled: refresh });

  if (q.isError) return <div className="page"><p className="error">{errorText(q.error)}</p></div>;
  if (!data) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  const { project, media } = data;
  const jobBusy = (type: string) => data.jobs.some((j) => j.type === type && isActive(j.status));
  const seek = (us: number) => player.current?.seekSource(us);
  const decisions = edl.data?.doc.decisions ?? [];
  const deriv = (kind: string) => media?.derivatives.find((d) => d.kind === kind);
  const proxy = deriv("proxy")?.params as { width?: number; height?: number } | undefined;
  const thumbs = deriv("thumbs")?.params as { count?: number; every_us?: number } | undefined;
  const tl = edl.data?.timeline;

  // зоны поверх кадра: «Анализ» — шот под курсором; «План» — зона выбранной сцены (или выбранная для превью)
  const shot = footage.data?.analysis.shots.find((s) => s.source_start_us <= currentUs && currentUs < s.source_end_us);
  const item = plan.data?.doc.items.find((x) => x.id === selected);
  const planZone = tab === "plan" && item ? (() => {
    const zone = previewZone ?? item.zone;
    const faceIssue = plan.data!.doc.issues.some((i) => i.item_id === item.id && i.code === "face_overlap" && i.severity === "blocking");
    // проблема лица известна только для сохранённой зоны (её считает сервер)
    return { rect: ZONE_RECTS[zone], label: `${item.id} · ${t(`zone.${zone}`)}`, bad: zone === item.zone && faceIssue };
  })() : undefined;
  const showOverlay = media && footage.data && (tab === "analysis" || (tab === "plan" && planZone));
  const aspect = media ? media.asset.probe.video.display_width / media.asset.probe.video.display_height : 16 / 9;
  const skipped = (() => {
    const sem = semantic.data?.semantic;
    if (!sem || !edl.data || !plan.data) return [];
    const anchors = new Map(sem.anchors.map((a) => [a.id, a]));
    return plan.data.doc.skipped.flatMap((s) => {
      const a = s.anchor_ids.map((x) => anchors.get(x)).find(Boolean);
      const m = a ? edl.data!.word_map[a.start_word_id] : undefined;
      return m && m.state !== "removed" ? [{ at_us: m.edited_start_us, reason: s.reason }] : [];
    });
  })();
  const selectItem = (sid: string | undefined) => {
    setSelected(sid);
    setPreviewZone(undefined);
    const x = plan.data?.doc.items.find((i) => i.id === sid);
    if (x) {
      if (tab !== "plan") setTab("plan");
      seek(x.source.start_us);
    }
  };

  return (
    <div className="page video-workspace" data-project-id={project.id}>
      <nav className="crumbs"><Link to={{ name: "dashboard" }}>{t("nav.dashboard")}</Link></nav>
      <div className="row wrap video-head">
        <h1>{project.title}</h1>
        <span className="spacer" />
        <ApprovalBar approvals={data.approvals} onRevoke={(aid) => revoke.mutate(aid)} />
      </div>
      {data.jobs.length > 0 ? (
        <div className="video-jobs">
          {data.jobs.map((j) => <JobStatus key={j.id} jobId={j.id} compact />)}
        </div>
      ) : null}
      {!media ? (
        <div className="grid-2">
          <MediaImport projectId={project.id} onJob={refresh} />
          <p className="muted">{t("video.noMedia")}</p>
        </div>
      ) : (
        <div className="video-grid">
          <div className="stack video-left">
            <ProxyPlayer
              ref={player}
              mediaId={media.asset.id}
              durationUs={media.asset.probe.duration_us}
              fps={media.asset.probe.timeline_fps}
              width={proxy?.width ?? media.asset.probe.video.display_width}
              height={proxy?.height ?? media.asset.probe.video.display_height}
              edl={edl.data}
              onTime={setCurrentUs}
              overlay={showOverlay ? (
                <SafeZoneOverlay aspect={aspect} shot={shot} mode={footage.data!.analysis.mode} atUs={currentUs} plan={tab === "plan" ? planZone : undefined} />
              ) : undefined}
            />
            <Waveform
              mediaId={media.asset.id}
              hasWaveform={Boolean(deriv("waveform"))}
              durationUs={media.asset.probe.duration_us}
              decisions={decisions}
              currentUs={currentUs}
              onSeek={seek}
            />
            <ThumbStrip
              mediaId={media.asset.id}
              count={thumbs?.count ?? 0}
              everyUs={thumbs?.every_us ?? 1}
              durationUs={media.asset.probe.duration_us}
              decisions={decisions}
              onSeek={seek}
            />
            {tl ? <EditedTimelineBar timeline={tl} currentUs={currentUs} onSeek={seek} /> : null}
            {tl && plan.data ? (
              <PlanTrack
                items={plan.data.doc.items}
                issues={plan.data.doc.issues}
                durationUs={tl.duration_us}
                skipped={skipped}
                selected={selected}
                currentUs={toEdited(tl, Math.min(currentUs, tl.source_duration_us)).us}
                onSelect={selectItem}
              />
            ) : null}
          </div>
          <div className="stack video-right">
            <div className="row tabs" role="tablist">
              {TABS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                  {t(`video.tab.${k}`)}
                </button>
              ))}
            </div>
            {tab === "media" ? (
              <>
                <MediaInfo media={media} />
                <AsrStatus mediaId={media.asset.id} busy={jobBusy("asr.transcribe")} onJob={refresh} />
              </>
            ) : null}
            {tab === "transcript" ? (
              !data.transcript ? <p className="muted">{t("transcript.empty")}</p> : transcript.data && current.data ? (
                <>
                  <section className="panel">
                    <h2 className="row">
                      <span>{t("video.tab.transcript")}</span>
                      <span className="badge">{t("transcript.revisionBadge", { n: transcript.data.doc.revision })}</span>
                    </h2>
                    <TranscriptEditor
                      transcript={transcript.data}
                      wordMap={viewing === undefined ? edl.data?.word_map : undefined}
                      currentUs={currentUs}
                      readOnly={viewing !== undefined}
                      onSeek={seek}
                      onCut={edl.data ? (start, end) => cut.mutate({ start, end }) : undefined}
                      onSaved={refresh}
                      onConflict={refresh}
                    />
                    {cut.isError ? <p className="error">{errorText(cut.error)}</p> : null}
                  </section>
                  <RevisionList transcriptId={data.transcript.id} current={current.data} viewing={viewing} onView={setViewing} />
                </>
              ) : <p className="muted">{t("common.loading")}</p>
            ) : null}
            {tab === "roughcut" ? (
              <>
                <section className="panel">
                  <div className="row wrap">
                    <button type="button" className="primary" disabled={!data.transcript || propose.isPending || jobBusy("roughcut.propose")} onClick={() => propose.mutate()}>
                      {t("roughcut.propose")}
                    </button>
                    <label className="row small">
                      <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
                      {t("roughcut.useAgent")}
                    </label>
                  </div>
                  {propose.isError ? <p className="error">{errorText(propose.error)}</p> : null}
                </section>
                {edl.data ? (
                  <RoughCutPanel
                    projectId={project.id}
                    edl={edl.data}
                    approvals={data.approvals}
                    onListen={(r) => player.current?.playRange(r)}
                    onChanged={refresh}
                    onPreviewJob={refresh}
                  />
                ) : <p className="muted">{t("roughcut.empty")}</p>}
              </>
            ) : null}
            {tab === "analysis" ? (
              <AnalysisPanel data={data} words={current.data?.doc.words ?? []} currentUs={currentUs} onSeek={seek} onJob={refresh} />
            ) : null}
            {tab === "plan" ? (
              edl.data ? (
                <PlanPanel
                  data={data}
                  edl={edl.data}
                  transcript={current.data}
                  plan={plan.data}
                  styleIssues={style.data?.issues ?? []}
                  selected={selected}
                  onSelect={selectItem}
                  onPreviewZone={setPreviewZone}
                  onPlayEdited={(r) => tl && player.current?.playRange({ start_us: toSource(tl, r.start_us), end_us: toSource(tl, r.end_us) }, "edited")}
                  onSeek={seek}
                  currentUs={currentUs}
                  onChanged={refresh}
                />
              ) : <p className="muted">{t("roughcut.empty")}</p>
            ) : null}
            {tab === "scenes" ? <ScenesTab data={data} currentUs={currentUs} onSeek={seek} onChanged={refresh} /> : null}
            {tab === "export" ? <ExportTab data={data} currentUs={currentUs} onSeek={seek} onChanged={refresh} /> : null}
            {tab === "timeline" ? <TimelineTab data={data} currentUs={currentUs} onSeek={seek} onChanged={refresh} /> : null}
            {tab === "style" ? (
              style.data ? (
                <StyleBiblePanel projectId={project.id} style={style.data} bValid={data.approvals.B.state === "valid"} onSaved={(dto) => { client.setQueryData(["style", id], dto); refresh(); }} />
              ) : <p className="muted">{data.style ? t("common.loading") : t("style.empty")}</p>
            ) : null}
          </div>
        </div>
      )}
      {scenes.length > 0 ? (
        <section className="panel">
          <h2>{t("video.scenes")}</h2>
          <ul className="job-list">
            {scenes.map((s) => <li key={s.id}><Link to={{ name: "scene", id: s.id }}>{s.title}</Link></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
