// Лента миниатюр исходника (кадр раз в `every_us`) с отметками принятых вырезок; клик —
// переход к кадру миниатюры.
import type { EditDecision } from "@ms/contracts";
import { urls } from "../../api/client.js";
import { t } from "../../i18n/index.js";

const MAX_THUMBS = 24;

export interface ThumbStripProps {
  mediaId: string;
  count: number;
  everyUs: number;
  durationUs: number;
  decisions: EditDecision[];
  onSeek: (sourceUs: number) => void;
}

export function ThumbStrip({ mediaId, count, everyUs, durationUs, decisions, onSeek }: ThumbStripProps) {
  if (count === 0) return null;
  const step = Math.max(1, Math.ceil(count / MAX_THUMBS));
  const shown = Array.from({ length: Math.ceil(count / step) }, (_, k) => k * step);
  const pct = (us: number) => `${(100 * us) / Math.max(1, durationUs)}%`;
  return (
    <div className="thumb-strip" aria-label={t("video.thumbs")}>
      <div className="thumbs">
        {shown.map((n) => (
          <button key={n} type="button" className="thumb" onClick={() => onSeek(n * everyUs)} title={String(n)}>
            <img src={urls.thumb(mediaId, n)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <div className="thumb-cuts" aria-hidden="true">
        {decisions.filter((d) => d.status === "accepted").map((d) => (
          <span key={d.id} className="thumb-cut" style={{ left: pct(d.source_start_us), width: pct(d.source_end_us - d.source_start_us) }} />
        ))}
      </div>
    </div>
  );
}
