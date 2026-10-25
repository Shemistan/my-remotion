// Перенос операций пользователя на пересобранную ревизию таймлайна (Task 42). `next` собран заново
// (`buildTimelineDoc`: клипы на кадрах нового плана). Клип, сдвинутый пользователем (последний
// `move` в `prev.ops`), сохраняет смещение от первого якоря: `start' = anchor'.frame + (start −
// anchor.frame)`; без якорей — от позиции плана прежней ревизии (`prevPlanStarts`). Сохранить
// нельзя — новое окно теряет якорь (без причины в операции) или выходит за ролик: позиция плана и
// warning `move_dropped`. Исключение пользователем (`include: false`) переносится; выбор версии и
// включение `override` — нет (новая сборка берёт утверждённые версии).
import { type PlanIssue, type TimelineOp, type VideoTimelineClip, type VideoTimelineDoc, anchorCheck, timelineChecks } from "@ms/contracts";
import { lastMove } from "./ops.js";

export interface CarryOverOptions {
  /** Позиции сцен плана прежней ревизии (`frames.start` по id сцены плана) — для клипов без якорей. */
  prevPlanStarts?: Record<string, number>;
}

/** Целевое начало сдвинутого клипа или undefined, если опоры нет. */
function target(p: VideoTimelineClip, c: VideoTimelineClip, o: CarryOverOptions): number | undefined {
  const pa = p.anchors[0];
  if (pa) {
    const na = c.anchors.find((a) => a.word_id === pa.word_id);
    return na ? na.frame + (p.start_frame - pa.frame) : undefined;
  }
  const was = o.prevPlanStarts?.[p.item_id];
  return was === undefined || c.anchors.length > 0 ? undefined : c.start_frame + (p.start_frame - was);
}

export function carryOver(prev: VideoTimelineDoc, next: VideoTimelineDoc, o: CarryOverOptions = {}): VideoTimelineDoc {
  if (!prev.ops?.length) return next;
  const ops: TimelineOp[] = [];
  const dropped: PlanIssue[] = [];
  let scenes = next.scenes.map((c): VideoTimelineClip => {
    const m = lastMove(prev.ops, c.clip_id);
    const p = prev.scenes.find((x) => x.clip_id === c.clip_id);
    if (!m || !p) return c;
    const t = target(p, c, o);
    const fits = t !== undefined && t >= 0 && t + c.duration_frames <= next.duration_frames && (m.override_reason !== undefined || anchorCheck(c, t).ok);
    if (!fits) {
      dropped.push({ item_id: c.item_id, code: "move_dropped", severity: "warning", message: `сдвиг сцены не перенесён на новый монтаж: ${t === undefined ? "нет опорного слова" : "ключевое слово вышло бы за сцену"} — сцена на позиции плана` });
      return c;
    }
    ops.push({ op: "move", clip_id: c.clip_id, start_frame: t, ...(m.override_reason !== undefined ? { override_reason: m.override_reason } : {}) });
    return { ...c, start_frame: t, ...(m.override_reason !== undefined ? { override_reason: m.override_reason } : {}) };
  });
  let excluded = next.excluded;
  for (const c of [...scenes]) {
    const last = [...prev.ops].reverse().find((x) => x.op === "include" && x.clip_id === c.clip_id);
    if (last?.op !== "include" || last.include) continue;
    scenes = scenes.filter((x) => x.clip_id !== c.clip_id);
    excluded = [...excluded.filter((x) => x.item_id !== c.item_id), { item_id: c.item_id, reason: "user" }];
    ops.push({ op: "include", clip_id: c.clip_id, include: false });
  }
  scenes.sort((a, b) => a.start_frame - b.start_frame || a.clip_id.localeCompare(b.clip_id));
  const out: VideoTimelineDoc = { ...next, scenes, excluded };
  delete out.ops;
  if (ops.length > 0) out.ops = ops;
  return { ...out, issues: [...timelineChecks(out), ...dropped] };
}
