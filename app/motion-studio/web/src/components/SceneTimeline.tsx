// Простой таймлайн одной сцены (ТЗ §6.2, не NLE): биты открытой версии, маркеры кадров QA
// (клик → кадр в плеере), положение плеера и полоса версий.
import type { HistoryEntry } from "@ms/contracts";
import { t } from "../i18n/index.js";
import { versionState } from "./VersionHistory.js";

export interface Beat {
  id: string;
  start: number;
  end: number;
}

export interface SceneTimelineProps {
  durationFrames: number;
  frame: number;
  beats: Beat[];
  qaFrames: number[];
  versions: HistoryEntry[];
  openId: string | undefined;
  onSeek: (frame: number) => void;
  onOpen: (versionId: string) => void;
}

/** Биты из spec.json версии (формат spec не гарантирован: берём только корректные). */
export function beatsOf(spec: unknown): Beat[] {
  const beats = (spec as { beats?: unknown } | null)?.beats;
  if (!Array.isArray(beats)) return [];
  return beats.flatMap((b: unknown) => {
    const o = b as { id?: unknown; start_frame?: unknown; end_frame?: unknown };
    return typeof o.id === "string" && typeof o.start_frame === "number" && typeof o.end_frame === "number" && o.end_frame > o.start_frame
      ? [{ id: o.id, start: o.start_frame, end: o.end_frame }]
      : [];
  });
}

export function SceneTimeline({ durationFrames, frame, beats, qaFrames, versions, openId, onSeek, onOpen }: SceneTimelineProps) {
  const pct = (f: number) => `${(f / Math.max(1, durationFrames)) * 100}%`;
  return (
    <section className="timeline" aria-label={t("timeline.title")}>
      <div className="timeline-row">
        <span className="timeline-label">{t("timeline.beats")}</span>
        <div className="timeline-track" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (r.width > 0) onSeek(Math.floor(((e.clientX - r.left) / r.width) * durationFrames));
        }}>
          {beats.map((b) => (
            <div key={b.id} className="beat" data-beat={b.id} title={`${b.id}: ${b.start}–${b.end}`} style={{ left: pct(b.start), width: pct(b.end - b.start) }}>
              <span>{b.id}</span>
            </div>
          ))}
          {qaFrames.map((f) => (
            <button
              key={f}
              type="button"
              className="qa-marker"
              style={{ left: pct(f) }}
              aria-label={t("qa.frame", { frame: f })}
              title={t("qa.frame", { frame: f })}
              onClick={(e) => { e.stopPropagation(); onSeek(f); }}
            />
          ))}
          <div className="playhead" style={{ left: pct(frame) }} />
        </div>
      </div>
      <div className="timeline-row">
        <span className="timeline-label">{t("timeline.versions")}</span>
        <div className="version-strip">
          {[...versions].sort((a, b) => a.number - b.number).map((v) => (
            <button
              key={v.version_id}
              type="button"
              className={`version-chip state-${versionState(v)}${v.version_id === openId ? " open" : ""}`}
              aria-label={t("versions.label", { n: v.number })}
              onClick={() => onOpen(v.version_id)}
            >
              {t("versions.label", { n: v.number })}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
