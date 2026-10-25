// Перенос операций пользователя на пересобранную ревизию таймлайна (Task 42). `next` собран заново
// (`buildTimelineDoc`: клипы на кадрах нового плана). Клип, сдвинутый пользователем (последний
// `move` в `prev.ops`), сохраняет смещение от первого якоря, общего со старым окном:
// `start' = anchor'.frame + (start − anchor.frame)`; без якорей — от позиции плана ревизии, где
// клип стоял. Сохранить нельзя — новое окно теряет якорь (без причины в операции) или выходит за
// ролик: позиция плана и warning `move_dropped`. Исключение пользователем (`include: false`)
// переносится. Клипа в `next` нет (сцена временно выпала: stale, not_approved, failed) — его
// последние `include: false` и `move` остаются в журнале отложенными (ревью I2) и применяются,
// когда сцена вернётся (опора сдвига — клип из последней ревизии, где он стоял, `lastSeen`).
// Выбор версии и включение `override` не переносятся (новая сборка берёт утверждённые версии);
// `override`-клип, выпавший из пересборки, — warning `override_dropped`.
import { type PlanIssue, type TimelineOp, type VideoTimelineClip, type VideoTimelineDoc, anchorCheck } from "@ms/contracts";
import { lastMove, timelineIssues } from "./ops.js";

/** Клип в ревизии, где он стоял на таймлайне, и позиция его сцены в плане той ревизии. */
export interface SeenClip {
  clip: VideoTimelineClip;
  planStart?: number;
}

export interface CarryOverOptions {
  /** Позиции сцен плана прежней ревизии (`frames.start` по id сцены плана) — для клипов без якорей. */
  prevPlanStarts?: Record<string, number>;
  /** Клипы с отложенными операциями, которых нет в `prev.scenes`, — из последней ревизии, где они стояли. */
  lastSeen?: Record<string, SeenClip>;
}

type Move = Extract<TimelineOp, { op: "move" }>;
type Include = Extract<TimelineOp, { op: "include" }>;

/** Целевое начало сдвинутого клипа или undefined, если опоры нет. */
function target(p: SeenClip, c: VideoTimelineClip): number | undefined {
  for (const pa of p.clip.anchors) {
    const na = c.anchors.find((a) => a.word_id === pa.word_id);
    if (na) return na.frame + (p.clip.start_frame - pa.frame);
  }
  if (p.clip.anchors.length > 0 || c.anchors.length > 0 || p.planStart === undefined) return undefined;
  return c.start_frame + (p.clip.start_frame - p.planStart);
}

/** Клипы, у которых в журнале есть операции, — в порядке первого упоминания. */
const opClips = (ops: readonly TimelineOp[]): string[] => [...new Set(ops.map((o) => o.clip_id))];

const lastInclude = (ops: readonly TimelineOp[], clipId: string): Include | undefined =>
  [...ops].reverse().find((o): o is Include => o.op === "include" && o.clip_id === clipId);

export function carryOver(prev: VideoTimelineDoc, next: VideoTimelineDoc, o: CarryOverOptions = {}): VideoTimelineDoc {
  const prevOps = prev.ops ?? [];
  const warn: PlanIssue[] = [];
  for (const p of prev.scenes) {
    if (p.include !== "override" || next.scenes.some((c) => c.clip_id === p.clip_id)) continue;
    warn.push({ item_id: p.item_id, code: "override_dropped", severity: "warning", message: "неутверждённая версия сцены (включена с причиной) не перенесена на новую сборку — утвердите версию или включите сцену снова" });
  }
  if (prevOps.length === 0 && warn.length === 0) return next;
  const ops: TimelineOp[] = [];
  let scenes = [...next.scenes];
  let excluded = [...next.excluded];
  for (const clipId of opClips(prevOps)) {
    const m: Move | undefined = lastMove(prevOps, clipId);
    const inc = lastInclude(prevOps, clipId);
    const off = inc !== undefined && !inc.include;
    const c = scenes.find((x) => x.clip_id === clipId);
    if (!c) {
      // сцены в новой сборке нет: операции ждут её возвращения
      if (m) ops.push(m);
      if (off) ops.push(inc);
      continue;
    }
    if (m) {
      const was = prev.scenes.find((x) => x.clip_id === clipId);
      const seen: SeenClip | undefined = was ? { clip: was, ...(o.prevPlanStarts?.[was.item_id] !== undefined ? { planStart: o.prevPlanStarts[was.item_id] } : {}) } : o.lastSeen?.[clipId];
      const t = seen ? target(seen, c) : undefined;
      const fits = t !== undefined && t >= 0 && t + c.duration_frames <= next.duration_frames && (m.override_reason !== undefined || anchorCheck(c, t).ok);
      if (fits) {
        const moved: VideoTimelineClip = { ...c, start_frame: t, ...(m.override_reason !== undefined ? { override_reason: m.override_reason } : {}) };
        scenes = scenes.map((x) => (x.clip_id === clipId ? moved : x));
        ops.push({ op: "move", clip_id: clipId, start_frame: t, ...(m.override_reason !== undefined ? { override_reason: m.override_reason } : {}) });
      } else {
        warn.push({ item_id: c.item_id, code: "move_dropped", severity: "warning", message: `сдвиг сцены не перенесён на новый монтаж: ${t === undefined ? "нет опорного слова" : "ключевое слово вышло бы за сцену"} — сцена на позиции плана` });
      }
    }
    if (off) {
      scenes = scenes.filter((x) => x.clip_id !== clipId);
      excluded = [...excluded.filter((x) => x.item_id !== c.item_id), { item_id: c.item_id, reason: "user" }];
      ops.push(inc);
    }
  }
  scenes.sort((a, b) => a.start_frame - b.start_frame || a.clip_id.localeCompare(b.clip_id));
  const out: VideoTimelineDoc = { ...next, scenes, excluded };
  delete out.ops;
  if (ops.length > 0) out.ops = ops;
  return { ...out, issues: [...timelineIssues(out), ...warn] };
}
