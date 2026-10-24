// Video Workspace (ТЗ §11.1 п.3–4): шапка проекта с утверждениями A/B, плеер (исходник / после
// монтажа), волна, миниатюры и линейки монтажа; вкладки «Медиа», «Транскрипт», «Черновой
// монтаж». Задачи проекта (импорт, ASR, монтаж, превью) — со статусом и прогрессом; данные
// перечитываются по событиям задач и опросом, пока задача идёт.
import type { SceneDto } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, newKey } from "../api/client.js";
import { isActive, useEdl, useTranscript, useVideoProject } from "../api/queries.js";
import { JobStatus } from "../components/JobStatus.js";
import { Link } from "../components/Link.js";
import { ApprovalBar } from "../components/video/ApprovalBar.js";
import { AsrStatus } from "../components/video/AsrStatus.js";
import { EditedTimelineBar } from "../components/video/EditedTimelineBar.js";
import { MediaImport } from "../components/video/MediaImport.js";
import { MediaInfo } from "../components/video/MediaInfo.js";
import { ProxyPlayer, type ProxyPlayerHandle } from "../components/video/ProxyPlayer.js";
import { RevisionList } from "../components/video/RevisionList.js";
import { RoughCutPanel } from "../components/video/RoughCutPanel.js";
import { ThumbStrip } from "../components/video/ThumbStrip.js";
import { TranscriptEditor } from "../components/video/TranscriptEditor.js";
import { Waveform } from "../components/video/Waveform.js";
import { errorText, t } from "../i18n/index.js";

type Tab = "media" | "transcript" | "roughcut";

export function VideoWorkspace({ id, scenes = [] }: { id: string; scenes?: Pick<SceneDto, "id" | "title">[] }) {
  const client = useQueryClient();
  const q = useVideoProject(id);
  const [tab, setTab] = useState<Tab>("media");
  const [currentUs, setCurrentUs] = useState(0);
  const [viewing, setViewing] = useState<number | undefined>(undefined);
  const [useAgent, setUseAgent] = useState(false);
  const [proposeKey, setProposeKey] = useState(newKey);
  const player = useRef<ProxyPlayerHandle>(null);
  const data = q.data;
  const transcript = useTranscript(data?.transcript?.id, viewing);
  const current = useTranscript(data?.transcript?.id);
  const edl = useEdl(data?.edl?.id);

  const refresh = () => {
    for (const key of ["video", "transcript", "transcriptRevisions", "edl", "jobs"]) void client.invalidateQueries({ queryKey: [key] });
  };
  const propose = useMutation({
    mutationFn: () => api.proposeRoughCut(id, useAgent, proposeKey),
    onSuccess: () => {
      setProposeKey(newKey());
      refresh();
    },
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
            {edl.data ? <EditedTimelineBar timeline={edl.data.timeline} currentUs={currentUs} onSeek={seek} /> : null}
          </div>
          <div className="stack video-right">
            <div className="row tabs" role="tablist">
              {(["media", "transcript", "roughcut"] as const).map((k) => (
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
