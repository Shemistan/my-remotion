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
 * Сдвиг с клавиатуры (стрелки на сфокусированной сцене): `dir` — ±1 кадр без прилипания; `toWord`
 * (Shift) — к началу соседнего слова в эту сторону. Начало — в [0, `maxStart`]; сдвига нет (край
 * ролика, слова дальше нет) — `undefined`.
 */
export function keyMove(
  clip: Pick<VideoTimelineClip, "start_frame" | "duration_frames" | "anchors">, dir: 1 | -1, toWord: boolean, wordFrames: readonly number[], maxStart = Number.POSITIVE_INFINITY,
): DragResult | undefined {
  const s = clip.start_frame;
  let to = s + dir;
  if (toWord) to = dir > 0 ? Math.min(...wordFrames.filter((w) => w > s)) : Math.max(...wordFrames.filter((w) => w < s));
  if (!Number.isFinite(to)) return undefined;
  const start = Math.min(Math.max(0, to), Math.max(0, maxStart));
  return start === s ? undefined : { start_frame: start, snapped: toWord, anchor: anchorCheck(clip, start) };
}

/** Последний `move` клипа в операциях ревизии. */
function lastMove(ops: VideoTimelineDoc["ops"], clipId: string): Extract<TimelineOp, { op: "move" }> | undefined {
  return [...(ops ?? [])].reverse().find((o): o is Extract<TimelineOp, { op: "move" }> => o.op === "move" && o.clip_id === clipId);
}

/**
 * Операции «вернуть ревизию `target`» над текущей `current`: клипы `target` — на свою позицию
 * (с причиной сдвига: у `override` — из последнего `move` цели, причина включения сдвиг не
 * оправдывает), своей версией, включены; клипы, которые в `target` исключил пользователь, —
 * исключены (исключённые не пользователем — не утверждена, устарела — не трогаются: их состояние
 * задаёт C, а не ревизия). Пусто — ревизии не отличаются.
 */
export function revertOps(current: Pick<VideoTimelineDoc, "scenes">, target: Pick<VideoTimelineDoc, "scenes" | "excluded" | "ops">): TimelineOp[] {
  const ops: TimelineOp[] = [];
  const now = new Map(current.scenes.map((c) => [c.clip_id, c]));
  const want = new Set(target.scenes.map((c) => c.clip_id));
  const byUser = new Set(target.excluded.filter((x) => x.reason === "user").map((x) => x.item_id));
  for (const c of current.scenes) {
    if (!want.has(c.clip_id) && byUser.has(c.item_id)) ops.push({ op: "include", clip_id: c.clip_id, include: false });
  }
  for (const c of target.scenes) {
    const cur = now.get(c.clip_id);
    const reason = c.override_reason;
    if (!cur) ops.push({ op: "include", clip_id: c.clip_id, include: true, ...(c.include === "override" && reason ? { override_reason: reason } : {}) });
    if (!cur || cur.version_id !== c.version_id) ops.push({ op: "use_version", clip_id: c.clip_id, version_id: c.version_id });
    if (!cur || cur.start_frame !== c.start_frame) {
      const moveReason = lastMove(target.ops, c.clip_id)?.override_reason ?? (c.include === "approved" ? reason : undefined);
      ops.push({ op: "move", clip_id: c.clip_id, start_frame: c.start_frame, snap: false, ...(moveReason ? { override_reason: moveReason } : {}) });
    }
  }
  return ops;
}
