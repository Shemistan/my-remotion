// Таймлайн видеопроекта (Phase 5, Task 35′): исходник по EDL как последовательности композиции,
// сэмплы звука клипа, состав сцен по Approval C, якоря по словам и проверки. Длительность, режим и
// зона сцены с таймлайна не меняются (Р-V6, Д2) — только перемещение в пределах якорей, выбор
// утверждённой версии, включение/исключение. Время — `usToFrame` на `tl.fps`.
import { z } from "zod";
import { Sha256Schema } from "./manifest.js";
import { type PlanIssue, PlanIssueSchema, type ScenePlanItem } from "./plan.js";
import { FpsSchema, usToFrame } from "./time.js";
import { type EditedTimeline, type TimelineClip } from "./timeline.js";
import { PlacementSchema, placementFor, videoSceneFrames } from "./video-scene.js";
import { WordIdSchema } from "./transcript.js";

const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Int0 = z.number().int().nonnegative();
const Frame = Int0;

/** Кусок исходника в композиции: `<Sequence from durationInFrames>` + `startFrom` видео исходника. */
export const SequenceSpecSchema = z.object({ idx: Int0, from: Frame, durationInFrames: z.number().int().positive(), startFrom: Frame }).strict();
export type SequenceSpec = z.infer<typeof SequenceSpecSchema>;

const clipEndUs = (c: TimelineClip): number => c.edited_start_us + (c.source_end_us - c.source_start_us);

/**
 * Клипы EDL → последовательности: `from = usToFrame(edited_start)`, `durationInFrames =
 * usToFrame(edited_end) − from`, `startFrom = usToFrame(source_start)`. Клип короче кадра (0 кадров
 * после округления, например хвост исходника не на кадре) не попадает — `<Sequence>` нулевой длины нет.
 */
export function clipsToSequences(tl: EditedTimeline): SequenceSpec[] {
  const out: SequenceSpec[] = [];
  for (const c of tl.clips) {
    const from = usToFrame(c.edited_start_us, tl.fps);
    const durationInFrames = usToFrame(clipEndUs(c), tl.fps) - from;
    if (durationInFrames > 0) out.push({ idx: c.idx, from, durationInFrames, startFrom: usToFrame(c.source_start_us, tl.fps) });
  }
  return out;
}

/** Кадров в смонтированном ролике: `usToFrame(duration_us)` (= конец последней последовательности). */
export function timelineFrames(tl: EditedTimeline): number {
  return usToFrame(tl.duration_us, tl.fps);
}

/** Сэмплы исходника клипа: `round(us · sampleRate / 1e6)` границ `[source_start, source_end)`. */
export function audioSampleRange(c: TimelineClip, sampleRate: number): { start: number; end: number } {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new RangeError(`частота дискретизации должна быть целым > 0: ${sampleRate}`);
  return { start: Math.round((c.source_start_us * sampleRate) / 1e6), end: Math.round((c.source_end_us * sampleRate) / 1e6) };
}

/** Сцена на таймлайне: утверждённая версия (C) или `override` с причиной. */
export const VideoTimelineClipSchema = z.object({
  clip_id: Id,
  scene_id: Id,
  item_id: Id,
  version_id: Id,
  version_number: z.number().int().positive(),
  include: z.enum(["approved", "override"]),
  override_reason: z.string().min(1).optional(),
  start_frame: Frame,
  /** Длина сцены по плану (`frames.end − frames.start`), с таймлайна не меняется. */
  duration_frames: z.number().int().positive(),
  placement: PlacementSchema,
  z: z.number().int(),
  /** Ключевые слова сцены в кадрах таймлайна: окно сцены обязано их покрывать (`anchorCheck`). */
  anchors: z.array(z.object({ word_id: WordIdSchema, text: z.string().min(1), frame: Frame }).strict()),
  /** Длина выбранной версии (`props.timing.duration_frames`); ≠ `duration_frames` — `duration_mismatch`. */
  version_frames: z.number().int().positive().optional(),
}).strict().refine((c) => c.include !== "override" || c.override_reason !== undefined, { message: "override — только с причиной", path: ["override_reason"] });
export type VideoTimelineClip = z.infer<typeof VideoTimelineClipSchema>;

/** Р-V6, Д2: длительности, режима и зоны с таймлайна нет — `set_duration`, `set_zone` не операции. */
export const TimelineOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), clip_id: Id, start_frame: Frame, override_reason: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal("use_version"), clip_id: Id, version_id: Id }).strict(),
  z.object({ op: z.literal("include"), clip_id: Id, include: z.boolean(), override_reason: z.string().min(1).optional() }).strict(),
]);
export type TimelineOp = z.infer<typeof TimelineOpSchema>;

const InputRef = z.object({ id: Id, revision: Revision, hash: Sha256Schema }).strict();

export const ExcludedReasonSchema = z.enum(["not_approved", "no_version", "failed", "stale", "user"]);
export type ExcludedReason = z.infer<typeof ExcludedReasonSchema>;

/** Ревизия таймлайна `timeline/<id>/r<N>/timeline.json` (субъект final). */
export const VideoTimelineDocSchema = z.object({
  schema_version: z.literal(1),
  timeline_id: Id,
  revision: Revision,
  parent_revision: Revision.optional(),
  fps: FpsSchema,
  duration_frames: Int0,
  inputs: z.object({ media_sha256: Sha256Schema, edl: InputRef, plan: InputRef, style: InputRef }).strict(),
  video: z.array(SequenceSpecSchema),
  scenes: z.array(VideoTimelineClipSchema),
  excluded: z.array(z.object({ item_id: Id, reason: ExcludedReasonSchema }).strict()),
  issues: z.array(PlanIssueSchema),
  ops: z.array(TimelineOpSchema).optional(),
}).strict();
export type VideoTimelineDoc = z.infer<typeof VideoTimelineDocSchema>;

/** Версия сцены для состава таймлайна. */
export interface TimelineVersionRef {
  version_id: string;
  version_number: number;
  /** `props.timing.duration_frames` версии. */
  duration_frames: number;
}

/** Состояние видеосцены сцены плана для `composeTimeline`. */
export interface ComposeSceneState {
  scene_id: string;
  /** Последняя генерация: готова, упала, не было. */
  status: "ready" | "failed" | "none";
  /** Версия с валидным Approval C. */
  approved?: TimelineVersionRef;
  /** Текущая версия сцены (для `override`). */
  current?: TimelineVersionRef;
  /** Отпечаток сцены плана изменился после генерации. */
  stale?: boolean;
}

export interface ComposeTimelineInput {
  tl: EditedTimeline;
  items: ScenePlanItem[];
  /** По id сцены плана. */
  scenes: Record<string, ComposeSceneState>;
  /** id сцены плана → причина: неутверждённая текущая версия входит как `override`. */
  overrides?: Record<string, string>;
  inputs: VideoTimelineDoc["inputs"];
  timelineId: string;
  revision: number;
  parentRevision?: number;
}

/**
 * Состав таймлайна из плана: отклонённые сцены не входят; устаревшие (план или отпечаток) —
 * `stale`; с валидным C — утверждённая версия; упавшие без C — `failed`; без C, но с причиной в
 * `overrides` — текущая версия как `override`; без версии — `no_version`; иначе — `not_approved`.
 * Клип стоит на кадрах плана, длина — план; якоря — ключевые слова в кадрах таймлайна.
 */
export function composeTimeline(i: ComposeTimelineInput): VideoTimelineDoc {
  const fps = i.tl.fps;
  const scenes: VideoTimelineClip[] = [];
  const excluded: VideoTimelineDoc["excluded"] = [];
  for (const item of i.items) {
    if (item.status === "rejected") continue;
    const s = i.scenes[item.id];
    const exclude = (reason: ExcludedReason) => excluded.push({ item_id: item.id, reason });
    const reason = i.overrides?.[item.id];
    let pick: { v: TimelineVersionRef; include: "approved" | "override" } | undefined;
    if (item.status === "stale" || s?.stale) exclude("stale");
    else if (s?.approved) pick = { v: s.approved, include: "approved" };
    else if (s?.status === "failed") exclude("failed");
    else if (!s?.current) exclude("no_version");
    else if (reason !== undefined) pick = { v: s.current, include: "override" };
    else exclude("not_approved");
    if (!pick || !s) continue;
    scenes.push({
      clip_id: `clip_${item.id}`,
      scene_id: s.scene_id,
      item_id: item.id,
      version_id: pick.v.version_id,
      version_number: pick.v.version_number,
      include: pick.include,
      ...(pick.include === "override" ? { override_reason: reason! } : {}),
      start_frame: item.frames.start,
      duration_frames: videoSceneFrames(item),
      placement: placementFor(item.composition_mode, item.zone, item.rect),
      z: item.composition_mode === "fullscreen" ? 0 : 1,
      anchors: item.key_terms.map((k) => ({ word_id: k.word_id, text: k.text, frame: usToFrame(k.edited_at_us, fps) })),
      version_frames: pick.v.duration_frames,
    });
  }
  scenes.sort((a, b) => a.start_frame - b.start_frame || a.clip_id.localeCompare(b.clip_id));
  const doc: VideoTimelineDoc = {
    schema_version: 1,
    timeline_id: i.timelineId,
    revision: i.revision,
    ...(i.parentRevision !== undefined ? { parent_revision: i.parentRevision } : {}),
    fps: { num: fps.num, den: fps.den },
    duration_frames: timelineFrames(i.tl),
    inputs: i.inputs,
    video: clipsToSequences(i.tl),
    scenes,
    excluded,
    issues: [],
  };
  return { ...doc, issues: timelineChecks(doc) };
}

/** Окно сцены, начатой на `startFrame`, покрывает все её якоря: `[start, start + длительность)`. */
export function anchorCheck(clip: Pick<VideoTimelineClip, "duration_frames" | "anchors">, startFrame: number): { ok: true } | { ok: false; outside: string[] } {
  const outside = clip.anchors.filter((a) => a.frame < startFrame || a.frame >= startFrame + clip.duration_frames).map((a) => a.word_id);
  return outside.length === 0 ? { ok: true } : { ok: false, outside };
}

/** Прилипание к началу ближайшего слова, если оно не дальше `maxDist` кадров; иначе кадр как есть. */
export function snapToWord(frame: number, wordFrames: readonly number[], maxDist = 6): number {
  let best = frame;
  let dist = Number.POSITIVE_INFINITY;
  for (const w of wordFrames) {
    const d = Math.abs(w - frame);
    if (d < dist) {
      dist = d;
      best = w;
    }
  }
  return dist <= maxDist ? best : frame;
}

/**
 * Проверки таймлайна: `out_of_range` — окно сцены за пределами ролика; `anchor_outside` — ключевое
 * слово вне окна (blocking, с `override_reason` — warning); `duration_mismatch` — длина версии ≠
 * плану; `scene_overlap` — пересечение окон двух сцен, если одна из них непрозрачна или зона общая.
 */
export function timelineChecks(doc: Pick<VideoTimelineDoc, "scenes" | "duration_frames">): PlanIssue[] {
  const out: PlanIssue[] = [];
  const add = (item_id: string, code: string, severity: PlanIssue["severity"], message: string) => out.push({ item_id, code, severity, message });
  for (const c of doc.scenes) {
    if (c.start_frame + c.duration_frames > doc.duration_frames) {
      add(c.item_id, "out_of_range", "blocking", `сцена кончается на кадре ${c.start_frame + c.duration_frames}, а ролик — на ${doc.duration_frames}`);
    }
    const a = anchorCheck(c, c.start_frame);
    if (!a.ok) {
      const words = c.anchors.filter((x) => a.outside.includes(x.word_id)).map((x) => `«${x.text}»`).join(", ");
      add(c.item_id, "anchor_outside", c.override_reason ? "warning" : "blocking", `ключевое слово ${words} звучит вне сцены`);
    }
    if (c.version_frames !== undefined && c.version_frames !== c.duration_frames) {
      add(c.item_id, "duration_mismatch", "blocking", `версия длиной ${c.version_frames} кадров, а сцена плана — ${c.duration_frames}: перегенерируйте сцену`);
    }
  }
  const sorted = [...doc.scenes].sort((a, b) => a.start_frame - b.start_frame);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (b.start_frame >= a.start_frame + a.duration_frames) break;
      if (!a.placement.transparent || !b.placement.transparent || a.placement.zone === b.placement.zone) {
        add(b.item_id, "scene_overlap", "blocking", `сцена пересекается с ${a.item_id}`);
      }
    }
  }
  return out;
}
