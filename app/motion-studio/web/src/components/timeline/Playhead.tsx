// Общий курсор таймлайна (Task 45): вертикальная линия через все дорожки на кадре превью.
import { frameToX } from "../../timeline/geometry.js";

export function Playhead({ frame, zoom }: { frame: number; zoom: number }) {
  return <span className="ptl-playhead" data-testid="timeline-playhead" data-frame={frame} style={{ left: `${frameToX(frame, zoom)}px` }} aria-hidden="true" />;
}
