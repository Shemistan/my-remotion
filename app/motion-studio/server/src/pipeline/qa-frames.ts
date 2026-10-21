// Кадры QA (06-motion-engine.md §6) по битам и элементам спецификации.
import type { Beat, Element, MotionSpec, StyleBible } from "@ms/contracts";
import { resolveStyle } from "@ms/render";

export const MAX_QA_FRAMES = 8;
/** Кадры ближе этого расстояния считаются дублями. */
export const MIN_QA_GAP = 10;

/** Входы, которые проявляют элемент; `draw`, `count`, `type` — основное действие компонента на весь бит. */
const APPEARING: ReadonlySet<Element["entrance"]> = new Set(["rise", "fade", "scale", "slide", "mask", "blur", "pop"]);
/** Доля входа, после которой текст читается (кадры раньше — «наполовину вошёл»). */
const TEXT_READY = 0.75;
/** Короткоживущий элемент (импульс, вспышка): все его биты вместе не длиннее этой доли сцены. */
const TRANSIENT_SHARE = 1 / 12;
/** Бит акцента по действию (тот же признак, что у `no_emphasis` в specChecks). */
export const ACCENT_ACTION = /emphasis|accent/i;

/** Кадровые токены движения: `enter_frames` разрешённого стиля (fps и интенсивность уже учтены). */
export type MotionTokens = Pick<StyleBible, "motion">;

/** Роль акцента: `emphasis` или роль, начинающаяся с emphasis/accent/акцент («акцент-итог: …»). */
export function isEmphasisRole(role: string): boolean {
  return /^\s*(emphasis|accent|акцент)/i.test(role);
}

/** Стиль по умолчанию — пресет spec, интенсивность balanced, fps spec. */
function motionOf(spec: MotionSpec, style?: MotionTokens): MotionTokens {
  return style ?? resolveStyle({ preset: spec.style_preset, intensity: "balanced", fps: spec.fps });
}

/** Длительность входа kit в кадрах (`<Enter>`): `enter_frames`, у `mask` — 1.5×. */
export function enterFrames(entrance: Element["entrance"], style: MotionTokens): number {
  return entrance === "mask" ? Math.round(style.motion.enter_frames * 1.5) : style.motion.enter_frames;
}

/**
 * Кадр внутри бита: `[start, end)`; последний кадр сцены входит в бит, который кончается
 * на нём или на `duration_frames` (удержание «до конца» пишут и так, и так).
 */
export function inBeat(b: Pick<Beat, "start_frame" | "end_frame">, f: number, durationFrames: number): boolean {
  if (f < b.start_frame) return false;
  return f < b.end_frame || (f === durationFrames - 1 && b.end_frame >= durationFrames - 1);
}

const byStart = (beats: readonly Beat[]) => [...beats].sort((a, b) => a.start_frame - b.start_frame || a.end_frame - b.end_frame);
/** Элемент вошёл: начало бита + длительность входа, не позже конца бита. */
const settle = (b: Beat, frames: number) => Math.min(b.end_frame, b.start_frame + frames);

/** Первый бит каждого элемента — бит, где он появляется. */
function firstBeats(spec: MotionSpec): Map<string, Beat> {
  const first = new Map<string, Beat>();
  for (const b of byStart(spec.beats)) for (const id of b.element_ids) if (!first.has(id)) first.set(id, b);
  return first;
}

/**
 * Бит акцента: последний бит с emphasis/accent в действии; иначе — бит, где появляется
 * первый элемент с ролью акцента (не удержание, где он просто стоит).
 */
export function accentBeat(spec: MotionSpec): Beat | undefined {
  const byAction = byStart(spec.beats).filter((b) => ACCENT_ACTION.test(b.action)).at(-1);
  if (byAction) return byAction;
  const first = firstBeats(spec);
  return byStart(spec.elements.filter((e) => isEmphasisRole(e.role)).flatMap((e) => first.get(e.id) ?? [])).at(0);
}

/**
 * С этого кадра сцена обязана что-то показывать: конец входа первого бита (самый долгий
 * вход его элементов). Кадр 0 может быть пустым фоном.
 */
export function blankCheckFrom(spec: MotionSpec, style?: MotionTokens): number {
  const m = motionOf(spec, style);
  const b0 = byStart(spec.beats)[0]!;
  const kinds = new Map(spec.elements.map((e) => [e.id, e.entrance]));
  const longest = Math.max(m.motion.enter_frames, ...b0.element_ids.map((id) => enterFrames(kinds.get(id) ?? "none", m)));
  return settle(b0, longest);
}

/**
 * Кадры начала счёта: для каждого числа (`kind: number`) — старт его бита счёта (действие
 * с `count`, иначе первый бит числа со входом `count`). В этот кадр на экране значение «от».
 */
export function countStarts(spec: MotionSpec): Beat[] {
  const out: Beat[] = [];
  for (const e of spec.elements.filter((x) => x.kind === "number")) {
    const beats = byStart(spec.beats).filter((b) => b.element_ids.includes(e.id));
    const b = beats.find((x) => /count/i.test(x.action)) ?? (e.entrance === "count" ? beats[0] : undefined);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/** Элементы, ни один бит которых не содержит ни одного из кадров. */
export function uncoveredElements(spec: MotionSpec, frames: number[], durationFrames: number = spec.duration_frames): string[] {
  return spec.elements
    .filter((e) => {
      const beats = spec.beats.filter((b) => b.element_ids.includes(e.id));
      return beats.length > 0 && !frames.some((f) => beats.some((b) => inBeat(b, f, durationFrames)));
    })
    .map((e) => e.id);
}

/**
 * QA-кадры, уникальные, по возрастанию, не больше MAX_QA_FRAMES:
 * 1. обязательные (остаются, даже если ближе MIN_QA_GAP друг к другу): начало счёта чисел
 *    (`countStarts`: на кадре видно значение «от»), вход — кадр, когда
 *    вошёл последний появляющийся элемент (начало его первого бита + длительность входа
 *    по стилю, не позже конца бита; бит акцента и короткоживущие элементы входом не
 *    считаются; входов нет — вход первого бита), середина бита акцента, последний кадр;
 * 2. конец бита акцента − 1 (шаг ≥ MIN_QA_GAP);
 * 3. покрытие: каждому элементу, в битах которого ещё нет кадра, — кадр из середины его
 *    бита; сначала элементы акцента, затем короткоживущие. Шаг ≥ MIN_QA_GAP, а элементам
 *    акцента и коротким (≤ 1/12 сцены, например импульс) — кадр и ближе, лишь бы не дубль;
 * 4. середины битов — жадно по наибольшему расстоянию до выбранных (шаг ≥ MIN_QA_GAP).
 * Кадры внутри первых ¾ входа текстового элемента (заголовок вошёл наполовину) не берутся.
 * Входы — по `elements[].entrance` и первому биту элемента, не по словам в `action`;
 * длительность входа — `style.motion.enter_frames` (по умолчанию — пресет spec, balanced).
 */
export function selectQaFrames(spec: MotionSpec, durationFrames: number = spec.duration_frames, style?: MotionTokens): number[] {
  const m = motionOf(spec, style);
  const last = durationFrames - 1;
  const clamp = (f: number) => Math.max(0, Math.min(last, Math.floor(f)));
  const mid = (b: Beat) => clamp((b.start_frame + b.end_frame) / 2);
  const beats = byStart(spec.beats);
  const accent = accentBeat(spec);
  const first = firstBeats(spec);
  const elements = new Map(spec.elements.map((e) => [e.id, e]));
  const settleOf = (id: string, b: Beat) => settle(b, enterFrames(elements.get(id)?.entrance ?? "none", m));

  const beatsOf = (id: string) => beats.filter((b) => b.element_ids.includes(id));
  const span = (id: string) => beatsOf(id).reduce((s, b) => s + (b.end_frame - b.start_frame), 0);
  const transient = (id: string) => span(id) <= durationFrames * TRANSIENT_SHARE;
  // вход сцены — без бита акцента и без короткоживущих элементов (импульс — событие, не вход)
  const entrances = [...first].filter(([id, b]) => b !== accent && !transient(id) && APPEARING.has(elements.get(id)?.entrance ?? "none"));
  const entrance = clamp(entrances.length > 0 ? Math.max(...entrances.map(([id, b]) => settleOf(id, b))) : blankCheckFrom(spec, m));
  // текст считается вошедшим на ¾ входа (кривая enter — ease-out: дальше он почти на месте)
  const textWindows = entrances
    .filter(([id]) => elements.get(id)?.kind === "text")
    .map(([id, b]) => [b.start_frame, Math.min(settleOf(id, b), b.start_frame + Math.ceil(enterFrames(elements.get(id)!.entrance, m) * TEXT_READY))] as const);
  const insideTextEntrance = (f: number) => textWindows.some(([s, e]) => f > s && f < e);

  // начало счёта числа (09 §2: OCR значения «от» на кадре начала числового бита); старт
  // внутри входа текста сдвигается вперёд, но не дальше первых 10 % бита счёта (счёт там
  // ещё у значения «от» — EASE.count разгоняется медленно)
  const counts = countStarts(spec).flatMap((b) => {
    const limit = b.start_frame + Math.ceil((b.end_frame - b.start_frame) * 0.1);
    for (let f = b.start_frame; f <= limit; f++) if (!insideTextEntrance(f)) return [clamp(f)];
    return [];
  });
  const chosen = [...new Set([entrance, ...counts, ...(accent ? [mid(accent)] : []), last])];
  const far = (f: number) => Math.min(...chosen.map((c) => Math.abs(c - f)));
  if (accent && chosen.length < MAX_QA_FRAMES) {
    const end = clamp(accent.end_frame - 1);
    if (far(end) >= MIN_QA_GAP) chosen.push(end);
  }

  // покрытие элементов: акцент, затем короткоживущие, затем остальные
  const order = spec.elements
    .map((e) => e.id)
    .filter((id) => beatsOf(id).length > 0)
    .sort((a, b) => Number(isEmphasisRole(elements.get(b)!.role)) - Number(isEmphasisRole(elements.get(a)!.role)) || span(a) - span(b));
  // проход 1 — только с шагом ≥ MIN_QA_GAP; проход 2 — акцент и короткоживущие, и ближе
  for (const strict of [true, false]) {
    for (const id of order) {
      if (chosen.length >= MAX_QA_FRAMES) break;
      if (!strict && !(isEmphasisRole(elements.get(id)!.role) || transient(id))) continue;
      if (uncoveredElements({ ...spec, elements: [elements.get(id)!] }, chosen, durationFrames).length === 0) continue;
      // кадры средней половины каждого бита элемента
      let best: number | undefined;
      let bestKey = [-1, 0];
      for (const b of beatsOf(id)) {
        const len = b.end_frame - b.start_frame;
        const c = (b.start_frame + b.end_frame) / 2;
        for (let f = clamp(c - len / 4); f <= clamp(c + len / 4); f++) {
          if (!inBeat(b, f, durationFrames) || insideTextEntrance(f) || chosen.includes(f)) continue;
          const key = [far(f), -Math.abs(f - c)];
          if (key[0]! > bestKey[0]! || (key[0] === bestKey[0] && key[1]! > bestKey[1]!)) {
            best = f;
            bestKey = key;
          }
        }
      }
      if (best !== undefined && (!strict || bestKey[0]! >= MIN_QA_GAP)) chosen.push(best);
    }
  }

  const pool = [...new Set(beats.map(mid))].filter((f) => !insideTextEntrance(f));
  while (chosen.length < MAX_QA_FRAMES) {
    let best: number | undefined;
    let bestDist = -1;
    for (const f of pool) {
      const d = far(f);
      if (d >= MIN_QA_GAP && d > bestDist) {
        best = f;
        bestDist = d;
      }
    }
    if (best === undefined) break;
    chosen.push(best);
  }
  return chosen.sort((a, b) => a - b);
}
