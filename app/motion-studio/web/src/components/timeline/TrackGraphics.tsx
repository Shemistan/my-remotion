// Дорожка «Графика» (Task 45): сцены таймлайна цветом режима с бейджем C (без утверждения —
// «без C»), исключённые из ролика — серым на месте сцены плана с причиной. Перетаскивание —
// только перемещение (Р-V6): прилипание к слову (Alt — без), мгновенная проверка ключевых слов;
// слово окажется вне сцены — красная подсветка и поле «причина» перед сохранением.
import type { VideoTimelineClip } from "@ms/contracts";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { t, tk } from "../../i18n/index.js";
import { type DragResult, dragMove, keyMove } from "../../timeline/drag.js";
import { frameToX } from "../../timeline/geometry.js";

const LANE_PX = 28;

export interface ExcludedBlock {
  item_id: string;
  reason: string;
  start: number;
  end: number;
}

export interface TrackGraphicsProps {
  clips: readonly VideoTimelineClip[];
  excluded: readonly ExcludedBlock[];
  durationFrames: number;
  zoom: number;
  wordFrames: readonly number[];
  numbers: ReadonlyMap<string, number>;
  /** id сцены плана выбранного клипа. */
  selected?: string | undefined;
  busy: boolean;
  onSelect: (itemId: string) => void;
  onMove: (clipId: string, start: number, o: { snap: boolean; reason?: string }) => void;
  /** Позиция перетаскиваемого клипа — для дорожки «Якоря». */
  onDrag?: (d: { clipId: string; start: number } | undefined) => void;
}

/** Дорожки без пересечений: клип — в первую, где предыдущий кончился. */
export function lanesOf(blocks: readonly { id: string; start: number; end: number }[]): Map<string, number> {
  const ends: number[] = [];
  const out = new Map<string, number>();
  for (const b of [...blocks].sort((x, y) => x.start - y.start)) {
    let lane = ends.findIndex((e) => e <= b.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = b.end;
    out.set(b.id, lane);
  }
  return out;
}

interface Drag { clip: VideoTimelineClip; x0: number; res: DragResult; alt: boolean; moved: boolean }

export function TrackGraphics({ clips, excluded, durationFrames, zoom, wordFrames, numbers, selected, busy, onSelect, onMove, onDrag }: TrackGraphicsProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{ clip: VideoTimelineClip; start: number; snap: boolean; outside: string[] } | null>(null);
  const [reason, setReason] = useState("");
  const dragRef = useRef<Drag | null>(null);
  const lanes = lanesOf([
    ...clips.map((c) => ({ id: c.clip_id, start: c.start_frame, end: c.start_frame + c.duration_frames })),
    ...excluded.map((x) => ({ id: `x_${x.item_id}`, start: x.start, end: x.end })),
  ]);
  const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));

  const set = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
    onDrag?.(d && d.moved ? { clipId: d.clip.clip_id, start: d.res.start_frame } : undefined);
  };
  const down = (e: PointerEvent<HTMLButtonElement>, c: VideoTimelineClip) => {
    if (busy || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    set({ clip: c, x0: e.clientX, alt: e.altKey, moved: false, res: dragMove(c, 0, wordFrames, true) });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / zoom;
    const res = dragMove(d.clip, dx, wordFrames, e.altKey, durationFrames - d.clip.duration_frames);
    set({ ...d, alt: e.altKey, res, moved: d.moved || Math.abs(e.clientX - d.x0) >= 3 });
  };
  const up = () => {
    const d = dragRef.current;
    set(null);
    if (!d) return;
    if (!d.moved || d.res.start_frame === d.clip.start_frame) {
      onSelect(d.clip.item_id);
      return;
    }
    onSelect(d.clip.item_id);
    commit(d.clip, d.res, !d.alt);
  };
  /** Сдвиг готов: слово в сцене — сразу, вне — поле причины. */
  const commit = (c: VideoTimelineClip, res: DragResult, snap: boolean) => {
    if (res.anchor.ok) onMove(c.clip_id, res.start_frame, { snap });
    else {
      setReason("");
      setPending({ clip: c, start: res.start_frame, snap, outside: res.anchor.outside });
    }
  };
  // стрелки на сфокусированной сцене: ±1 кадр, с Shift — к началу соседнего слова (кадр как есть)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, c: VideoTimelineClip) => {
    if (e.key === "Enter" || e.key === " ") {
      onSelect(c.item_id);
      return;
    }
    if (busy || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    onSelect(c.item_id);
    const res = keyMove(c, e.key === "ArrowRight" ? 1 : -1, e.shiftKey, wordFrames, durationFrames - c.duration_frames);
    if (res) commit(c, res, false);
  };

  const words = (c: VideoTimelineClip, ids: readonly string[]) => c.anchors.filter((a) => ids.includes(a.word_id)).map((a) => `«${a.text}»`).join(", ");

  return (
    <div className="ptl-graphics">
      <div className="ptl-lane ptl-graphics-lane" data-testid="track-graphics" style={{ height: `${laneCount * LANE_PX + 4}px` }}>
        {excluded.map((x) => {
          const reasonText = tk(`projectTimeline.excluded.reason.${x.reason}`, x.reason);
          return (
            <button
              key={`x_${x.item_id}`}
              type="button"
              className={`ptl-clip excluded ${selected === x.item_id ? "selected" : ""}`}
              data-testid={`timeline-excluded-${x.item_id}`}
              data-reason={x.reason}
              title={t("projectTimeline.excluded.blockTitle", { n: numbers.get(x.item_id) ?? "?", reason: reasonText })}
              // сцена плана может выходить за конец ролика (монтаж короче) — плашка не шире дорожки
              style={{ left: `${frameToX(Math.min(x.start, durationFrames - 1), zoom)}px`, width: `${Math.max(4, (Math.min(x.end, durationFrames) - Math.min(x.start, durationFrames - 1)) * zoom)}px`, top: `${2 + (lanes.get(`x_${x.item_id}`) ?? 0) * LANE_PX}px` }}
              onClick={() => onSelect(x.item_id)}
            >
              <span className="ptl-clip-label">{numbers.get(x.item_id) ?? "?"}</span>
              <span className="ptl-clip-reason">{reasonText}</span>
            </button>
          );
        })}
        {clips.map((c) => {
          const active = drag?.clip.clip_id === c.clip_id && drag.moved ? drag : undefined;
          const start = active ? active.res.start_frame : c.start_frame;
          const bad = active ? !active.res.anchor.ok : false;
          const n = numbers.get(c.item_id) ?? "?";
          const title = t("projectTimeline.clip.title", {
            n, mode: t(`plan.mode.${c.placement.mode}`), zone: t(`zone.${c.placement.zone}`), from: c.start_frame, to: c.start_frame + c.duration_frames,
          });
          return (
            <button
              key={c.clip_id}
              type="button"
              className={["ptl-clip", `mode-${c.placement.mode}`, c.include, selected === c.item_id ? "selected" : "", active ? "dragging" : "", bad ? "bad" : "", active?.res.snapped ? "snapped" : ""].filter(Boolean).join(" ")}
              data-testid={`timeline-clip-${c.item_id}`}
              data-start={start}
              data-anchor={bad ? "outside" : "ok"}
              aria-pressed={selected === c.item_id}
              disabled={busy}
              title={title}
              style={{ left: `${frameToX(start, zoom)}px`, width: `${Math.max(4, c.duration_frames * zoom)}px`, top: `${2 + (lanes.get(c.clip_id) ?? 0) * LANE_PX}px` }}
              onPointerDown={(e) => down(e, c)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => set(null)}
              onKeyDown={(e) => onKey(e, c)}
            >
              <span className="ptl-clip-label">{n}</span>
              <span className={`ptl-badge ${c.include}`}>{c.include === "approved" ? t("projectTimeline.clip.badgeC") : t("projectTimeline.clip.badgeOverride")}</span>
              {active?.res.snapped ? <span className="ptl-snap" aria-hidden="true">⌖</span> : null}
            </button>
          );
        })}
      </div>
      {pending ? (
        <form
          className="ptl-reason"
          data-testid="move-reason"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            onMove(pending.clip.clip_id, pending.start, { snap: pending.snap, reason: reason.trim() });
            setPending(null);
          }}
        >
          <p className="error small">{t("projectTimeline.drag.outside", { words: words(pending.clip, pending.outside) })}</p>
          <label className="row small">
            {t("projectTimeline.drag.reason")}
            <input className="grow" value={reason} placeholder={t("projectTimeline.drag.reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" disabled={!reason.trim()}>{t("projectTimeline.drag.apply")}</button>
            <button type="button" onClick={() => setPending(null)}>{t("projectTimeline.drag.cancel")}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
