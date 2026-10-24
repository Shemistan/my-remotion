// Шоты анализа видеоряда (Task 33): миниатюры ключевых кадров, время в исходнике, позиция автора,
// движение камеры, доля кадров с лицом, неуверенность; шот под курсором плеера подсвечен, клик —
// переход к началу шота.
import type { FootageShot } from "@ms/contracts";
import { urls } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";

export interface ShotListProps {
  footageId: string;
  shots: readonly FootageShot[];
  /** Время плеера (source, µs). */
  currentUs: number;
  onSeek: (sourceUs: number) => void;
}

export function ShotList({ footageId, shots, currentUs, onSeek }: ShotListProps) {
  return (
    <div className="shot-list">
      <h3>{t("analysis.shots", { n: shots.length })}</h3>
      <ul className="shots">
        {shots.map((s, i) => {
          const current = s.source_start_us <= currentUs && currentUs < s.source_end_us;
          const face = s.face.union && s.face.detected_ratio > 0;
          return (
            <li key={s.id} className={`shot ${current ? "current" : ""}`} data-testid={`shot-${s.id}`}>
              <button type="button" className="shot-head" onClick={() => onSeek(s.source_start_us)}>
                <span className="strong">{t("analysis.shot", { n: i + 1 })}</span>
                <span className="mono small">{t("analysis.shotRange", { from: formatTimecode(s.source_start_us), to: formatTimecode(s.source_end_us) })}</span>
              </button>
              <div className="shot-frames">
                {s.keyframes.slice(0, 4).map((k) => (
                  <img key={k.us} src={urls.footageFrame(footageId, k.us)} alt={t("analysis.keyframe", { tc: formatTimecode(k.us) })} loading="lazy" onClick={() => onSeek(k.us)} />
                ))}
              </div>
              <div className="row wrap small">
                <span className="badge">{t(`analysis.author.${s.author_position}`)}</span>
                <span className="badge">{t(`analysis.motion.${s.motion}`)}</span>
                <span className={`badge ${face ? "" : "state-warn"}`}>{face ? t("analysis.faceFound", { pct: Math.round(s.face.detected_ratio * 100) }) : t("analysis.noFace")}</span>
              </div>
              {s.uncertainty.length > 0 ? <p className="hint">{t("analysis.uncertainty", { text: s.uncertainty.join("; ") })}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
