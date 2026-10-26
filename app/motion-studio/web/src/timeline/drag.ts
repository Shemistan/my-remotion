// Перетаскивание сцены по таймлайну (Task 45, Р-V6): только перемещение — длительность клипа не
// меняется. Новое начало прилипает к началу ближайшего слова (`snapToWord`, Alt — без прилипания),
// окно сцены сразу проверяется на ключевые слова (`anchorCheck`). «Вернуть прежнюю ревизию» —
// операции, переводящие текущую расстановку в выбранную (сдвиги, версии, включение).
import { type TimelineOp, type VideoTimelineClip, type VideoTimelineDoc, anchorCheck, snapToWord } from "@ms/contracts";

export interface DragResult {
  start_frame: number;
  /** Начало сдвинуто к слову. */
  snapped: boolean;
  anchor: ReturnType<typeof anchorCheck>;
}

/**
 * Сдвиг клипа на `dxFrames`: начало не меньше 0 и не больше `maxStart` (конец ролика минус длина
 * сцены); затем прилипание к слову (`wordFrames` — кадры начала слов, Alt — без него).
 */
export function dragMove(
  clip: Pick<VideoTimelineClip, "start_frame" | "duration_frames" | "anchors">, dxFrames: number, wordFrames: readonly number[], alt: boolean, maxStart = Number.POSITIVE_INFINITY,
): DragResult {
  const raw = Math.min(Math.max(0, clip.start_frame + Math.round(dxFrames)), Math.max(0, maxStart));
  const start = alt ? raw : snapToWord(raw, wordFrames);
  return { start_frame: start, snapped: start !== raw, anchor: anchorCheck(clip, start) };
}

/**
 * Операции «вернуть ревизию `target`» над текущей `current`: клипы `target` — на свою позицию
 * (с причиной сдвига, если была), своей версией, включены; клипы, которых в `target` нет, —
 * исключены. Пусто — ревизии не отличаются.
 */
export function revertOps(current: Pick<VideoTimelineDoc, "scenes">, target: Pick<VideoTimelineDoc, "scenes">): TimelineOp[] {
  const ops: TimelineOp[] = [];
  const now = new Map(current.scenes.map((c) => [c.clip_id, c]));
  const want = new Set(target.scenes.map((c) => c.clip_id));
  for (const c of current.scenes) {
    if (!want.has(c.clip_id)) ops.push({ op: "include", clip_id: c.clip_id, include: false });
  }
  for (const c of target.scenes) {
    const cur = now.get(c.clip_id);
    const reason = c.override_reason;
    if (!cur) ops.push({ op: "include", clip_id: c.clip_id, include: true, ...(c.include === "override" && reason ? { override_reason: reason } : {}) });
    if (!cur || cur.version_id !== c.version_id) ops.push({ op: "use_version", clip_id: c.clip_id, version_id: c.version_id });
    if (!cur || cur.start_frame !== c.start_frame) {
      ops.push({ op: "move", clip_id: c.clip_id, start_frame: c.start_frame, snap: false, ...(c.include === "approved" && reason ? { override_reason: reason } : {}) });
    }
  }
  return ops;
}
