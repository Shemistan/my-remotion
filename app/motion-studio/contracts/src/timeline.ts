import { z } from "zod";
import { type Fps, FpsSchema, usToFrame } from "./time.js";
import { snapUsToFrame, usToFrameCeil } from "./timecode.js";
import type { TranscriptWord } from "./transcript.js";

const Us = z.number().int().nonnegative();

/** Оставленный кусок исходника: `[source_start_us, source_end_us)` → начинается в edited с `edited_start_us`. */
export const TimelineClipSchema = z.object({
  idx: z.number().int().nonnegative(),
  source_start_us: Us,
  source_end_us: Us,
  edited_start_us: Us,
}).strict();
export type TimelineClip = z.infer<typeof TimelineClipSchema>;

/** Таймлайн после EDL: клипы по возрастанию, без пересечений, границы вырезок — на кадрах `fps`. */
export const EditedTimelineSchema = z.object({
  fps: FpsSchema,
  source_duration_us: Us,
  duration_us: Us,
  clips: z.array(TimelineClipSchema),
}).strict();
export type EditedTimeline = z.infer<typeof EditedTimelineSchema>;

export type UsRange = { start_us: number; end_us: number };

export type TimelineErrorCode = "unknown_word" | "order" | "anchor_in_cut";

/** Ошибка привязки к словам: код — для причины отклонения предложения агента. */
export class TimelineError extends Error {
  constructor(readonly code: TimelineErrorCode, message: string) {
    super(message);
    this.name = "TimelineError";
  }
}

function checkUs(us: number, max: number, what: string): void {
  if (!Number.isSafeInteger(us) || us < 0 || us > max) throw new RangeError(`${what} вне [0, ${max}]: ${us}`);
}

function checkRange(r: UsRange): void {
  if (!Number.isSafeInteger(r.start_us) || !Number.isSafeInteger(r.end_us) || r.start_us < 0 || r.start_us > r.end_us) {
    throw new RangeError(`неверный диапазон: ${r.start_us}–${r.end_us}`);
  }
}

const clipEnd = (c: TimelineClip): number => c.edited_start_us + (c.source_end_us - c.source_start_us);

/**
 * Строит таймлайн: вырезки сортируются, границы выравниваются `snapUsToFrame` (конец, совпадающий с
 * концом исходника или за ним, — конец исходника), пересекающиеся и соприкасающиеся сливаются,
 * пустые после выравнивания отбрасываются. Восстановленная вырезка даёт таймлайн байт-в-байт как до неё.
 */
export function buildTimeline(sourceDurationUs: number, cuts: UsRange[], fps: Fps): EditedTimeline {
  checkUs(sourceDurationUs, Number.MAX_SAFE_INTEGER, "длительность исходника");
  const snapped: UsRange[] = [];
  for (const c of cuts) {
    checkRange(c);
    const start = Math.min(snapUsToFrame(c.start_us, fps), sourceDurationUs);
    const end = c.end_us >= sourceDurationUs ? sourceDurationUs : Math.min(snapUsToFrame(c.end_us, fps), sourceDurationUs);
    if (end > start) snapped.push({ start_us: start, end_us: end });
  }
  snapped.sort((a, b) => a.start_us - b.start_us || a.end_us - b.end_us);
  const merged: UsRange[] = [];
  for (const c of snapped) {
    const last = merged[merged.length - 1];
    if (last && c.start_us <= last.end_us) last.end_us = Math.max(last.end_us, c.end_us);
    else merged.push({ ...c });
  }
  const clips: TimelineClip[] = [];
  let cursor = 0;
  let edited = 0;
  const push = (end: number): void => {
    if (end <= cursor) return;
    clips.push({ idx: clips.length, source_start_us: cursor, source_end_us: end, edited_start_us: edited });
    edited += end - cursor;
  };
  for (const c of merged) {
    push(c.start_us);
    cursor = c.end_us;
  }
  push(sourceDurationUs);
  return { fps: { num: fps.num, den: fps.den }, source_duration_us: sourceDurationUs, duration_us: edited, clips };
}

/** Индекс первого клипа с `source_start_us >= us` (или `clips.length`). */
function firstClipFrom(tl: EditedTimeline, us: number): number {
  let lo = 0;
  let hi = tl.clips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tl.clips[mid]!.source_start_us < us) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** edited-время склейки, в которую попала точка вырезки: начало следующего клипа или конец edited. */
function spliceAt(tl: EditedTimeline, nextIdx: number): number {
  return tl.clips[nextIdx]?.edited_start_us ?? tl.duration_us;
}

/**
 * Точка исходника → edited. Клип — `[start, end)`; точка в вырезке — edited-время склейки.
 * Конец исходника, если он не вырезан, — конец edited.
 */
export function sourceToEdited(tl: EditedTimeline, us: number): { inCut: false; us: number } | { inCut: true; us: number } {
  checkUs(us, tl.source_duration_us, "source-время");
  const i = firstClipFrom(tl, us + 1) - 1; // последний клип с source_start_us <= us
  const c = tl.clips[i];
  if (c && us < c.source_end_us) return { inCut: false, us: c.edited_start_us + (us - c.source_start_us) };
  const last = tl.clips[tl.clips.length - 1];
  if (last && us === tl.source_duration_us && last.source_end_us === us) return { inCut: false, us: tl.duration_us };
  return { inCut: true, us: spliceAt(tl, i + 1) };
}

/** Конец диапазона в source → edited: клип — `(start, end]`, чтобы конец слова на склейке остался в своём клипе. */
function sourceEndToEdited(tl: EditedTimeline, us: number): number {
  const i = firstClipFrom(tl, us) - 1; // последний клип с source_start_us < us
  const c = tl.clips[i];
  if (c && us <= c.source_end_us) return c.edited_start_us + (us - c.source_start_us);
  return spliceAt(tl, i + 1);
}

/** Индекс последнего клипа с `edited_start_us <= us` (граница принадлежит следующему клипу). */
function clipAtEdited(tl: EditedTimeline, us: number, strict: boolean): number {
  let lo = 0;
  let hi = tl.clips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const s = tl.clips[mid]!.edited_start_us;
    if (strict ? s < us : s <= us) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** edited → source. Граница клипов принадлежит следующему клипу; конец edited — конец последнего клипа. */
export function editedToSource(tl: EditedTimeline, us: number): number {
  checkUs(us, tl.duration_us, "edited-время");
  const c = tl.clips[clipAtEdited(tl, us, false)];
  if (!c) return 0; // всё вырезано: edited пуст
  if (us >= clipEnd(c)) return c.source_end_us;
  return c.source_start_us + (us - c.edited_start_us);
}

/** Конец диапазона в edited → source: граница клипов принадлежит предыдущему клипу. */
function editedEndToSource(tl: EditedTimeline, us: number): number {
  const c = tl.clips[clipAtEdited(tl, us, true)];
  if (!c) return tl.clips[0]?.source_start_us ?? 0;
  return c.source_start_us + (us - c.edited_start_us);
}

/** Длительность оставленной части `[s, e)` исходника. */
function keptLength(tl: EditedTimeline, s: number, e: number): number {
  let total = 0;
  for (let i = Math.max(0, firstClipFrom(tl, s + 1) - 1); i < tl.clips.length; i++) {
    const c = tl.clips[i]!;
    if (c.source_start_us >= e) break;
    total += Math.max(0, Math.min(e, c.source_end_us) - Math.max(s, c.source_start_us));
  }
  return total;
}

function clampRange(tl: EditedTimeline, r: UsRange): UsRange {
  checkRange(r);
  const max = tl.source_duration_us;
  return { start_us: Math.min(r.start_us, max), end_us: Math.min(r.end_us, max) };
}

function mapClamped(tl: EditedTimeline, r: UsRange): { range: UsRange; whole: boolean } | null {
  if (r.start_us === r.end_us) {
    const p = sourceToEdited(tl, r.start_us);
    return p.inCut ? null : { range: { start_us: p.us, end_us: p.us }, whole: true };
  }
  const kept = keptLength(tl, r.start_us, r.end_us);
  if (kept === 0) return null;
  return {
    range: { start_us: sourceToEdited(tl, r.start_us).us, end_us: sourceEndToEdited(tl, r.end_us) },
    whole: kept === r.end_us - r.start_us,
  };
}

/**
 * Диапазон исходника → edited (оставленная часть; вырезки внутри схлопываются в склейку).
 * Целиком вырезанный — `null`. Часть за концом исходника отбрасывается.
 */
export function mapRange(tl: EditedTimeline, r: UsRange): UsRange | null {
  return mapClamped(tl, clampRange(tl, r))?.range ?? null;
}

export type WordMapping =
  | { state: "kept" | "clipped"; edited_start_us: number; edited_end_us: number }
  | { state: "removed" };

/** Положение слов в edited: `kept` — целиком, `clipped` — вырезка задевает слово, `removed` — вырезано целиком. */
export function mapWords(
  tl: EditedTimeline, words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[],
): Record<string, WordMapping> {
  const out: Record<string, WordMapping> = {};
  for (const word of words) {
    const m = mapClamped(tl, clampRange(tl, { start_us: word.start_us, end_us: word.end_us }));
    out[word.id] = m
      ? { state: m.whole ? "kept" : "clipped", edited_start_us: m.range.start_us, edited_end_us: m.range.end_us }
      : { state: "removed" };
  }
  return out;
}

/**
 * Диапазон сцены по словам: edited-диапазон слов `[start.start_us, end.end_us)` с полями `pad`
 * (в edited, в пределах `[0, duration_us]`), его границы в source и покрывающие кадры
 * `[floor(start), ceil(end))` на `tl.fps`. Граничное слово вырезано целиком → `anchor_in_cut`.
 */
export function rangeFromWords(
  tl: EditedTimeline, words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[],
  startWordId: string, endWordId: string, pad: { preUs: number; postUs: number },
): { edited: UsRange; source: UsRange; frames: { start: number; end: number } } {
  if (!(pad.preUs >= 0) || !(pad.postUs >= 0) || !Number.isSafeInteger(pad.preUs) || !Number.isSafeInteger(pad.postUs)) {
    throw new RangeError(`поля должны быть целыми >= 0: ${pad.preUs}, ${pad.postUs}`);
  }
  const si = words.findIndex((x) => x.id === startWordId);
  const ei = words.findIndex((x) => x.id === endWordId);
  if (si < 0 || ei < 0) throw new TimelineError("unknown_word", `нет слова ${si < 0 ? startWordId : endWordId}`);
  if (si > ei) throw new TimelineError("order", `слово ${startWordId} идёт после ${endWordId}`);
  const sw = words[si]!;
  const ew = words[ei]!;
  for (const x of [sw, ew]) {
    if (!mapClamped(tl, clampRange(tl, { start_us: x.start_us, end_us: x.end_us }))) {
      throw new TimelineError("anchor_in_cut", `граничное слово ${x.id} вырезано`);
    }
  }
  const core = mapRange(tl, { start_us: sw.start_us, end_us: Math.max(sw.start_us, ew.end_us) })!;
  const edited = { start_us: Math.max(0, core.start_us - pad.preUs), end_us: Math.min(tl.duration_us, core.end_us + pad.postUs) };
  return {
    edited,
    source: { start_us: editedToSource(tl, edited.start_us), end_us: editedEndToSource(tl, edited.end_us) },
    frames: { start: usToFrame(edited.start_us, tl.fps), end: usToFrameCeil(edited.end_us, tl.fps) },
  };
}
