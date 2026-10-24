// Время Video Workspace: таймкоды `чч:мм:сс.кк`, кадры `timeline_fps`, перевод времени
// плеера (секунды, дробные) в целые µs и отображение source ↔ edited через `@ms/contracts`.
// Время плеера всегда округляется и ограничивается длительностью до `sourceToEdited` /
// `editedToSource` (ревью Task 23, m7): они бросают RangeError на дробных и вне диапазона.
import { type EditedTimeline, type Fps, editedToSource, sourceToEdited, usToFrame } from "@ms/contracts";
import { useEdl } from "../api/queries.js";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `чч:мм:сс.кк` (сотые доли секунды, отбрасываются). */
export function formatTimecode(us: number): string {
  const v = Math.max(0, Math.floor(us));
  const cs = Math.floor(v / 10_000);
  const s = Math.floor(cs / 100);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}.${pad(cs % 100)}`;
}

/** Секунды с одним знаком через запятую: 2 500 000 → «2,5». */
export function formatSecondsUs(us: number, digits = 1): string {
  return (us / 1_000_000).toFixed(digits).replace(".", ",");
}

/** Время `<video>` (секунды) → целые µs в `[0, maxUs]`. */
export function playerUs(seconds: number, maxUs: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(Math.max(0, Math.round(seconds * 1_000_000)), Math.max(0, maxUs));
}

/** Номер кадра момента `us` на `fps` (как сервер: `usToFrame`). */
export function frameOf(us: number, fps: Fps): number {
  return usToFrame(Math.max(0, Math.round(us)), fps);
}

/** source → edited с округлением и ограничением; в вырезке — точка склейки. */
export function toEdited(tl: EditedTimeline, sourceUs: number): { us: number; inCut: boolean } {
  const r = sourceToEdited(tl, Math.min(Math.max(0, Math.round(sourceUs)), tl.source_duration_us));
  return { us: r.us, inCut: r.inCut };
}

/** edited → source с округлением и ограничением. */
export function toSource(tl: EditedTimeline, editedUs: number): number {
  return editedToSource(tl, Math.min(Math.max(0, Math.round(editedUs)), tl.duration_us));
}

/** Вырезка, в которую попадает момент исходника: `[start, end)` по клипам таймлайна; иначе `undefined`. */
export function cutAt(tl: EditedTimeline, sourceUs: number): { start_us: number; end_us: number } | undefined {
  let prevEnd = 0;
  for (const c of tl.clips) {
    if (sourceUs < c.source_start_us) return sourceUs >= prevEnd ? { start_us: prevEnd, end_us: c.source_start_us } : undefined;
    if (sourceUs < c.source_end_us) return undefined;
    prevEnd = c.source_end_us;
  }
  return sourceUs >= prevEnd && prevEnd < tl.source_duration_us ? { start_us: prevEnd, end_us: tl.source_duration_us } : undefined;
}

/** Ревизия EDL с таймлайном и функциями перевода времени. */
export function useEditedTimeline(edlId: string | undefined, revision?: number) {
  const q = useEdl(edlId, revision);
  const tl = q.data?.timeline;
  return {
    query: q,
    timeline: tl,
    toEdited: (us: number) => (tl ? toEdited(tl, us) : { us, inCut: false }),
    toSource: (us: number) => (tl ? toSource(tl, us) : us),
  };
}
