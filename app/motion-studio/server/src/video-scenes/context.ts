// Контекст видеосцены (Task 37′, ADR 0009): вход `video` у `playground.generate` по сцене
// ревизии визуального плана — текущий стиль проекта, размещение (Р-V5), запас вокруг фразы и
// моменты ключевых слов в кадрах `timeline_fps`, рамка лица за окно сцены, кадр исходника под
// сценой (ключевой кадр анализа видеоряда, ближайший к середине окна). Только чтение.
import { posix } from "node:path";
import {
  type FootageAnalysis, type Fps, type NormRect, type ScenePlanItem, type VideoSceneContext, VideoSceneContextSchema, type VisualPlanRevisionDoc,
  joinWords, mapWords, placementFor, videoKeyMoments, videoSceneWindow,
} from "@ms/contracts";
import { readFootage } from "../analysis/plan-ops.js";
import { facesAt } from "../analysis/planner-input.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import type { Db } from "../db/open.js";
import * as footageRepo from "../db/repos/footage.js";
import { timelineFor } from "../edit/timeline-store.js";
import { currentTranscript } from "../edit/transcript-ops.js";

/** fps таймлайна ревизии плана (`timeline_fps` её EDL): в нём кадры сцен плана. */
export function planFps(db: Db, doc: VisualPlanRevisionDoc): Fps {
  return timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision).fps;
}

/** Объединение рамок (охватывающий прямоугольник); пусто — undefined. */
export function unionRect(rects: readonly NormRect[]): NormRect | undefined {
  if (rects.length === 0) return undefined;
  if (rects.length === 1) return { ...rects[0]! };
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.min(1, Math.max(...rects.map((r) => r.x + r.w)));
  const y1 = Math.min(1, Math.max(...rects.map((r) => r.y + r.h)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Ключевой кадр анализа видеоряда, ближайший к середине окна исходника сцены (путь в хранилище:
 * каталог артефакта анализа + путь кадра); кадров нет — undefined.
 */
function contextFrame(footage: FootageAnalysis, footageRel: string, src: { start_us: number; end_us: number }): string | undefined {
  const mid = (src.start_us + src.end_us) / 2;
  let best: { us: number; path: string } | undefined;
  for (const k of footage.shots.flatMap((s) => s.keyframes)) if (!best || Math.abs(k.us - mid) < Math.abs(best.us - mid)) best = k;
  return best ? posix.join(posix.dirname(footageRel), best.path) : undefined;
}

/**
 * Вход `video` задачи генерации сцены `item` ревизии плана `doc`. Стиль проекта — текущий; нет
 * стиля, таймлайна, анализа видеоряда — ошибка (план без них не строится).
 */
export function videoSceneContext(db: Db, root: string, i: { projectId: string; doc: VisualPlanRevisionDoc; item: ScenePlanItem }): VideoSceneContext {
  const { doc, item } = i;
  const style = currentProjectStyle(db, root, i.projectId);
  if (!style) throw new Error(`у проекта ${i.projectId} нет стиля — сначала план`);
  const fps = planFps(db, doc);
  const w = videoSceneWindow(item, fps);
  const moments = videoKeyMoments(item, fps);
  const row = footageRepo.get(db, doc.inputs.footage_id);
  if (!row) throw new Error(`нет анализа видеоряда ${doc.inputs.footage_id}`);
  const footage = readFootage(db, root, doc.inputs.footage_id);
  const face = unionRect(facesAt(footage, item.source));
  const frame = contextFrame(footage, row.rel_path, item.source);
  return VideoSceneContextSchema.parse({
    project_id: i.projectId, plan_id: doc.plan_id, plan_revision: doc.revision, item_id: item.id, style: style.base,
    lead_frames: w.lead, tail_frames: w.tail, placement: placementFor(item.composition_mode, item.zone, item.rect),
    ...(face ? { face } : {}), ...(moments.length > 0 ? { key_moments: moments } : {}), ...(frame ? { context_frame_rel: frame } : {}),
  });
}

/** Речь сцены — услышанные слова её границ (вырезанные монтажом — нет) одной строкой. */
export function videoNarration(db: Db, root: string, doc: VisualPlanRevisionDoc, item: Pick<ScenePlanItem, "start_word_id" | "end_word_id">): string {
  const words = currentTranscript(db, root, doc.inputs.transcript.id, doc.inputs.transcript.revision).words;
  const si = words.findIndex((x) => x.id === item.start_word_id);
  const ei = words.findIndex((x) => x.id === item.end_word_id);
  if (si < 0 || ei < si) return "";
  const span = words.slice(si, ei + 1);
  const map = mapWords(timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision), span);
  return joinWords(span.filter((x) => map[x.id] !== undefined && map[x.id]!.state !== "removed").map((x) => x.text));
}
