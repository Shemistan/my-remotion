// Таймлайн ревизии (Task 45, ТЗ §11.1 п.4) на оси кадров смонтированного ролика: линейка,
// дорожки «Видео» (куски исходника EDL с миниатюрой начала), «Звук» (волна исходника, разложенная
// по кускам), «Графика» (`TrackGraphics`), «Якоря» (`AnchorTicks`) и общий курсор (`Playhead`).
// Клик по линейке или дорожке — переход превью; масштаб — «Крупнее / Мельче / Весь ролик».
import { type SequenceSpec, type VideoTimelineDoc, frameToUs } from "@ms/contracts";
import { type MouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { urls } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import { clampZoom, fitZoom, frameToX, rulerStep, xToFrame } from "../../timeline/geometry.js";
import { formatTimecode } from "../../video/use-timeline.js";
import { usePeaks } from "../video/Waveform.js";
import { AnchorTicks } from "./AnchorTicks.js";
import { Playhead } from "./Playhead.js";
import { type ExcludedBlock, TrackGraphics } from "./TrackGraphics.js";
import "./timeline.css";

export interface TimelineViewProps {
  doc: VideoTimelineDoc;
  mediaId: string;
  thumbs: { count: number; everyUs: number };
  hasWaveform: boolean;
  /** Начала слов смонтированного ролика (кадр и текст) — прилипание и дорожка «Якоря». */
  words: readonly { frame: number; text: string }[];
  /** Номер сцены по id сцены плана. */
  numbers: ReadonlyMap<string, number>;
  excluded: readonly ExcludedBlock[];
  selected?: string | undefined;
  playhead: number;
  busy: boolean;
  onSelect: (itemId: string) => void;
  onSeek: (frame: number) => void;
  onMove: (clipId: string, start: number, o: { snap: boolean; reason?: string }) => void;
}

const LABEL_PX = 84;

/** Кусок исходника на кадре `f` таймлайна. */
const seqAt = (seqs: readonly SequenceSpec[], f: number) => seqs.find((s) => f >= s.from && f < s.from + s.durationInFrames);

/** Волна смонтированного звука: столбцы по кадрам таймлайна, пики — из исходника через куски EDL. */
function AudioTrack({ doc, mediaId, enabled, zoom }: { doc: VideoTimelineDoc; mediaId: string; enabled: boolean; zoom: number }) {
  const q = usePeaks(mediaId, enabled);
  const width = Math.max(1, Math.round(doc.duration_frames * zoom));
  if (!enabled) return <div className="ptl-lane ptl-audio muted small" data-testid="track-audio">{t("projectTimeline.noWaveform")}</div>;
  const peaks = q.data;
  const cols = Math.min(1200, Math.max(1, Math.floor(width / 2)));
  const bars: number[] = [];
  if (peaks) {
    const buckets = Math.floor(peaks.length / 2);
    for (let i = 0; i < cols; i++) {
      const f = Math.floor((i * doc.duration_frames) / cols);
      const s = seqAt(doc.video, f);
      if (!s) {
        bars.push(0);
        continue;
      }
      const src = s.startFrom + (f - s.from);
      const span = Math.max(1, Math.floor(doc.duration_frames / cols));
      const b0 = Math.floor(frameToUs(src, doc.fps) / 10_000);
      const b1 = Math.max(b0 + 1, Math.floor(frameToUs(src + span, doc.fps) / 10_000));
      let m = 0;
      for (let b = b0; b < Math.min(b1, buckets); b++) m = Math.max(m, Math.abs(peaks[2 * b]!), Math.abs(peaks[2 * b + 1]!));
      bars.push(m / 128);
    }
  }
  return (
    <svg className="ptl-lane ptl-audio" data-testid="track-audio" width={width} height={40} viewBox={`0 0 ${cols} 40`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((h, i) => {
        const hh = Math.max(0.5, h * 19);
        return <rect key={i} className="wf-bar" x={i} y={20 - hh} width={0.8} height={2 * hh} />;
      })}
    </svg>
  );
}

function VideoTrack({ doc, mediaId, thumbs, zoom }: { doc: VideoTimelineDoc; mediaId: string; thumbs: TimelineViewProps["thumbs"]; zoom: number }) {
  return (
    <div className="ptl-lane ptl-video" data-testid="track-video">
      {doc.video.map((s) => {
        const w = s.durationInFrames * zoom;
        const n = thumbs.count > 0 ? Math.min(thumbs.count - 1, Math.floor(frameToUs(s.startFrom, doc.fps) / Math.max(1, thumbs.everyUs))) : -1;
        return (
          <span
            key={s.idx}
            className="ptl-seq"
            data-testid="timeline-seq"
            title={`${formatTimecode(frameToUs(s.from, doc.fps))} ← ${formatTimecode(frameToUs(s.startFrom, doc.fps))}`}
            style={{ left: `${frameToX(s.from, zoom)}px`, width: `${Math.max(2, w)}px` }}
          >
            {n >= 0 && w >= 30 ? <img src={urls.thumb(mediaId, n)} alt="" loading="lazy" /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function TimelineView(p: TimelineViewProps) {
  const { doc } = p;
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [dragged, setDragged] = useState<{ clipId: string; start: number } | undefined>(undefined);
  const fit = () => fitZoom((box.current?.clientWidth ?? 0) - LABEL_PX - 8, doc.duration_frames);
  useLayoutEffect(() => {
    if (zoom === null) setZoom(fit());
  });
  const z = zoom ?? 1;
  const fps = doc.fps.num / doc.fps.den;
  const width = Math.max(1, Math.round(doc.duration_frames * z));
  const step = rulerStep(z, fps);
  const ticks = Array.from({ length: Math.floor(doc.duration_frames / step) + 1 }, (_, i) => i * step);
  const seek = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    p.onSeek(Math.min(doc.duration_frames, Math.max(0, xToFrame(e.clientX - r.left, z))));
  };
  const wordFrames = p.words.map((w) => w.frame);
  const row = (label: string, child: ReactNode) => (
    <div className="ptl-row">
      <span className="ptl-label muted small">{label}</span>
      <div className="ptl-cell">{child}</div>
    </div>
  );

  return (
    <section className="panel ptl" aria-label={t("projectTimeline.title")} data-testid="timeline-view" data-zoom={z}>
      <div className="row wrap small">
        <span className="muted">{t("projectTimeline.playhead", { frame: p.playhead, tc: formatTimecode(frameToUs(p.playhead, doc.fps)) })}</span>
        <span className="spacer" />
        <button type="button" onClick={() => setZoom(clampZoom(z / 2))}>{t("projectTimeline.zoomOut")}</button>
        <button type="button" onClick={() => setZoom(clampZoom(z * 2))}>{t("projectTimeline.zoomIn")}</button>
        <button type="button" onClick={() => setZoom(fit())}>{t("projectTimeline.zoomFit")}</button>
      </div>
      <div className="ptl-scroll" ref={box}>
        <div className="ptl-content" style={{ width: `${width + LABEL_PX}px` }}>
          <div className="ptl-row">
            <span className="ptl-label" />
            <div className="ptl-cell ptl-ruler" data-testid="timeline-ruler" style={{ width: `${width}px` }} onClick={seek}>
              {ticks.map((f) => (
                <span key={f} className="ptl-tick" style={{ left: `${frameToX(f, z)}px` }}>{formatTimecode(frameToUs(f, doc.fps))}</span>
              ))}
            </div>
          </div>
          {row(t("projectTimeline.track.video"), <div onClick={seek} style={{ width: `${width}px` }}><VideoTrack doc={doc} mediaId={p.mediaId} thumbs={p.thumbs} zoom={z} /></div>)}
          {row(t("projectTimeline.track.audio"), <div onClick={seek} style={{ width: `${width}px` }}><AudioTrack doc={doc} mediaId={p.mediaId} enabled={p.hasWaveform} zoom={z} /></div>)}
          {row(t("projectTimeline.track.graphics"), (
            <div style={{ width: `${width}px` }}>
              <TrackGraphics
                clips={doc.scenes}
                excluded={p.excluded}
                durationFrames={doc.duration_frames}
                zoom={z}
                wordFrames={wordFrames}
                numbers={p.numbers}
                selected={p.selected}
                busy={p.busy}
                onSelect={p.onSelect}
                onMove={p.onMove}
                onDrag={setDragged}
              />
            </div>
          ))}
          {row(t("projectTimeline.track.anchors"), <div onClick={seek} style={{ width: `${width}px` }}><AnchorTicks clips={doc.scenes} dragged={dragged} words={p.words} zoom={z} /></div>)}
          <div className="ptl-playhead-layer" style={{ left: `${LABEL_PX}px`, width: `${width}px` }}>
            <Playhead frame={p.playhead} zoom={z} />
          </div>
        </div>
      </div>
      <p className="muted small">{t("projectTimeline.drag.hint")}</p>
    </section>
  );
}
