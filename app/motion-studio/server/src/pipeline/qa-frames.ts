// Кадры QA (06-motion-engine.md §6) по битам и элементам спецификации.
import type { Beat, Element, MotionSpec } from "@ms/contracts";

export const MAX_QA_FRAMES = 8;
/** Кадры ближе этого расстояния считаются дублями. */
export const MIN_QA_GAP = 10;
/** Кадров от начала бита до «элемент вошёл» (вход kit ≈ enter_frames, 12–18 кадров при 30 fps). */
export const ENTRANCE_SETTLE = 15;

/** Входы, которые проявляют элемент; `draw`, `count`, `type` — основное действие компонента на весь бит. */
const APPEARING: ReadonlySet<Element["entrance"]> = new Set(["rise", "fade", "scale", "slide", "mask", "blur", "pop"]);
/** Бит акцента по действию (тот же признак, что у `no_emphasis` в specChecks). */
export const ACCENT_ACTION = /emphasis|accent/i;

/** Роль акцента: `emphasis` или роль, начинающаяся с emphasis/accent/акцент («акцент-итог: …»). */
export function isEmphasisRole(role: string): boolean {
  return /^\s*(emphasis|accent|акцент)/i.test(role);
}

const byStart = (beats: readonly Beat[]) => [...beats].sort((a, b) => a.start_frame - b.start_frame || a.end_frame - b.end_frame);
const settle = (b: Beat) => Math.min(b.end_frame, b.start_frame + ENTRANCE_SETTLE);

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

/** С этого кадра сцена обязана что-то показывать: конец входа первого бита. Кадр 0 может быть пустым фоном. */
export function blankCheckFrom(spec: MotionSpec): number {
  return settle(byStart(spec.beats)[0]!);
}

/**
 * QA-кадры, уникальные, по возрастанию, не больше MAX_QA_FRAMES:
 * - обязательные (остаются, даже если ближе MIN_QA_GAP друг к другу): вход — кадр, когда
 *   вошёл последний появляющийся элемент (`min(end, start + 15)` его первого бита; бит
 *   акцента входом не считается; входов нет — вход первого бита), середина бита акцента,
 *   последний кадр;
 * - затем с шагом ≥ MIN_QA_GAP: конец бита акцента − 1, середины битов — жадно по
 *   наибольшему расстоянию до выбранных.
 * Кадры внутри анимации входа текстового элемента (заголовок вошёл наполовину) не берутся.
 * Входы определяются по `elements[].entrance` и первому биту элемента, не по словам в `action`.
 */
export function selectQaFrames(spec: MotionSpec, durationFrames: number = spec.duration_frames): number[] {
  const last = durationFrames - 1;
  const clamp = (f: number) => Math.max(0, Math.min(last, Math.floor(f)));
  const mid = (b: Beat) => clamp((b.start_frame + b.end_frame) / 2);
  const beats = byStart(spec.beats);
  const accent = accentBeat(spec);
  const first = firstBeats(spec);
  const elements = new Map(spec.elements.map((e) => [e.id, e]));

  const entrances = [...first].filter(([id, b]) => b !== accent && APPEARING.has(elements.get(id)?.entrance ?? "none"));
  const entrance = clamp(entrances.length > 0 ? Math.max(...entrances.map(([, b]) => settle(b))) : settle(beats[0]!));
  const textWindows = entrances.filter(([id]) => elements.get(id)?.kind === "text").map(([, b]) => [b.start_frame, settle(b)] as const);
  const insideTextEntrance = (f: number) => textWindows.some(([s, e]) => f > s && f < e);

  const chosen = [...new Set([entrance, ...(accent ? [mid(accent)] : []), last])];
  const far = (f: number) => Math.min(...chosen.map((c) => Math.abs(c - f)));
  if (accent && chosen.length < MAX_QA_FRAMES) {
    const end = clamp(accent.end_frame - 1);
    if (far(end) >= MIN_QA_GAP) chosen.push(end);
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
