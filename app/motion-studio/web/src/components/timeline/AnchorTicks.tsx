// Дорожка «Якоря» (Task 45): ключевые слова сцен — отметки на кадре слова (красные, если слово вне
// окна своей сцены); при приближении — ещё и начала всех слов смонтированного ролика.
import { type VideoTimelineClip, anchorCheck } from "@ms/contracts";
import { frameToX } from "../../timeline/geometry.js";

/** С какого масштаба (пикселей на кадр) видны начала слов и их подписи. */
export const WORD_TICKS_ZOOM = 2;
export const WORD_LABELS_ZOOM = 5;

export interface AnchorTicksProps {
  clips: readonly VideoTimelineClip[];
  /** Позиция клипа на время перетаскивания (по `clip_id`). */
  dragged?: { clipId: string; start: number } | undefined;
  words: readonly { frame: number; text: string }[];
  zoom: number;
}

export function AnchorTicks({ clips, dragged, words, zoom }: AnchorTicksProps) {
  return (
    <div className="ptl-lane ptl-anchors" data-testid="track-anchors">
      {zoom >= WORD_TICKS_ZOOM ? words.map((w, i) => (
        <span key={`w${i}`} className="ptl-word" style={{ left: `${frameToX(w.frame, zoom)}px` }} title={w.text}>
          {zoom >= WORD_LABELS_ZOOM ? <span className="ptl-word-label">{w.text}</span> : null}
        </span>
      )) : null}
      {clips.flatMap((c) => {
        const start = dragged?.clipId === c.clip_id ? dragged.start : c.start_frame;
        const check = anchorCheck(c, start);
        return c.anchors.map((a) => {
          const out = !check.ok && check.outside.includes(a.word_id);
          return (
            <span
              key={`${c.clip_id}-${a.word_id}`}
              className={`ptl-anchor ${out ? "outside" : ""}`}
              data-testid="anchor-tick"
              data-outside={out ? "true" : "false"}
              style={{ left: `${frameToX(a.frame, zoom)}px` }}
              title={a.text}
            >
              <span className="ptl-anchor-label">{a.text}</span>
            </span>
          );
        });
      })}
    </div>
  );
}
