// Две линейки — исходник и после монтажа — со связями оставленных клипов. Наведение показывает
// оба таймкода (`чч:мм:сс.кк`) и номер кадра edited; клик — переход (в source-времени).
import type { EditedTimeline } from "@ms/contracts";
import { type MouseEvent, useState } from "react";
import { t } from "../../i18n/index.js";
import { formatTimecode, frameOf, toEdited, toSource } from "../../video/use-timeline.js";

export interface EditedTimelineBarProps {
  timeline: EditedTimeline;
  /** Текущее время плеера (source). */
  currentUs?: number;
  onSeek?: (sourceUs: number) => void;
}

const pct = (us: number, total: number) => `${total > 0 ? (100 * us) / total : 0}%`;

export function EditedTimelineBar({ timeline: tl, currentUs, onSeek }: EditedTimelineBarProps) {
  const [hover, setHover] = useState<{ source: number; edited: number } | null>(null);
  const S = tl.source_duration_us;
  const E = tl.duration_us;
  const fraction = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0;
  };
  const atSource = (e: MouseEvent<HTMLElement>) => {
    const source = Math.round(fraction(e) * S);
    return { source, edited: toEdited(tl, source).us };
  };
  const atEdited = (e: MouseEvent<HTMLElement>) => {
    const edited = Math.round(fraction(e) * E);
    return { source: toSource(tl, edited), edited };
  };
  return (
    <section className="panel edited-timeline" aria-label={t("vtimeline.title")}>
      <div className="tl-label muted small">{t("vtimeline.source")}</div>
      <div
        className="tl-bar"
        data-testid="source-bar"
        onMouseMove={(e) => setHover(atSource(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSeek?.(atSource(e).source)}
      >
        {tl.clips.map((c) => (
          <span key={c.idx} className="tl-clip" style={{ left: pct(c.source_start_us, S), width: pct(c.source_end_us - c.source_start_us, S) }} />
        ))}
        {currentUs !== undefined ? <span className="tl-cursor" style={{ left: pct(currentUs, S) }} /> : null}
      </div>
      <svg className="tl-links" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
        {tl.clips.map((c) => (
          <polygon
            key={c.idx}
            data-testid="clip-link"
            points={[
              [(1000 * c.source_start_us) / S, 0], [(1000 * c.source_end_us) / S, 0],
              [(1000 * (c.edited_start_us + c.source_end_us - c.source_start_us)) / Math.max(1, E), 24], [(1000 * c.edited_start_us) / Math.max(1, E), 24],
            ].map((p) => p.join(",")).join(" ")}
          />
        ))}
      </svg>
      <div className="tl-label muted small">{t("vtimeline.edited")}</div>
      <div
        className="tl-bar"
        data-testid="edited-bar"
        onMouseMove={(e) => setHover(atEdited(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSeek?.(atEdited(e).source)}
      >
        {tl.clips.map((c) => (
          <span key={c.idx} className="tl-clip edited" style={{ left: pct(c.edited_start_us, E), width: pct(c.source_end_us - c.source_start_us, E) }} />
        ))}
        {currentUs !== undefined ? <span className="tl-cursor" style={{ left: pct(toEdited(tl, Math.min(currentUs, S)).us, E) }} /> : null}
      </div>
      <p className="mono small tl-hover" data-testid="timeline-hover">
        {hover ? t("vtimeline.hover", { source: formatTimecode(hover.source), edited: formatTimecode(hover.edited), frame: frameOf(hover.edited, tl.fps) }) : " "}
      </p>
    </section>
  );
}
