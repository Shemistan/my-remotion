// Кадры QA (06-motion-engine.md §6) по битам и элементам спецификации.
import type { Beat, Element, MotionSpec, StyleBible } from "@ms/contracts";
import { resolveStyle } from "@ms/render";

export const MAX_QA_FRAMES = 8;
/**
 * Потолок с кадрами короткоживущих элементов (S2-fix2): бюджет 8 + по кадру каждому
 * непокрытому токену / импульсу, но не больше 12. Иначе при 5+ токенах часть оставалась без
 * кадра, и пропавший токен проходил QA warning'ом «не проверен».
 */
export const MAX_QA_FRAMES_HARD = 12;
/** Кадры ближе этого расстояния считаются дублями. */
export const MIN_QA_GAP = 10;

/** Входы, которые проявляют элемент; `draw`, `count`, `type` — основное действие компонента на весь бит. */
const APPEARING: ReadonlySet<Element["entrance"]> = new Set(["rise", "fade", "scale", "slide", "mask", "blur", "pop"]);
/** Доля входа, после которой текст читается (кадры раньше — «наполовину вошёл»). */
const TEXT_READY = 0.75;
/** Короткоживущий элемент (импульс, вспышка): все его биты вместе не длиннее этой доли сцены. */
const TRANSIENT_SHARE = 1 / 12;
/** Бит счёта по действию: `count`, `count-up`, `hits-count`; «counter-entrance» — вход, не счёт. */
export const COUNT_ACTION = /count(?!er)/i;
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
 * Биты начала счёта: для каждого числа (`kind: number`) — бит, где идёт счёт: с `count` в
 * действии; иначе второй бит числа (первый — его вход, счёт — следующий, например рисование
 * графика, к голове которого привязано число); иначе единственный бит числа со входом
 * `count`. В начале такого бита на экране значение «от».
 */
export function countStarts(spec: MotionSpec): Beat[] {
  const out: Beat[] = [];
  for (const e of spec.elements.filter((x) => x.kind === "number")) {
    const b = countBeat(spec, e);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/** Бит счёта числа `e` (правило `countStarts`); нет — `undefined`. */
export function countBeat(spec: MotionSpec, e: Element): Beat | undefined {
  const beats = byStart(spec.beats).filter((b) => b.element_ids.includes(e.id));
  return beats.find((x) => COUNT_ACTION.test(x.action)) ?? beats[1] ?? (e.entrance === "count" ? beats[0] : undefined);
}

/**
 * Элементы, ни один бит которых не содержит ни одного из кадров. В первом бите элемента (где
 * он появляется) кадр до конца входа (не дальше первой четверти бита) покрытием не считается:
 * элемент там ещё только входит (токен в начале своего полёта не виден). Иначе кадр входа сцены, совпавший с началом
 * бита токена, «покрывал» токен, и середина его бита в QA не попадала (S2-fix eval, gen-cache).
 */
export function uncoveredElements(spec: MotionSpec, frames: number[], durationFrames: number = spec.duration_frames, style?: MotionTokens): string[] {
  const m = motionOf(spec, style);
  return spec.elements
    .filter((e) => {
      const beats = byStart(spec.beats.filter((b) => b.element_ids.includes(e.id)));
      const b0 = beats[0];
      // элемент виден с конца входа, но не позже первой четверти бита; токен — в окне ярлыка
      const win = b0 ? (tokenWindow(e, b0) ?? [b0.start_frame + Math.min(Math.ceil((b0.end_frame - b0.start_frame) / 4), enterFrames(e.entrance, m)), Infinity]) : [0, Infinity];
      const shown = (b: Beat, f: number) => inBeat(b, f, durationFrames) && (b !== b0 || (f >= win[0]! && f < win[1]!));
      return beats.length > 0 && !frames.some((f) => beats.some((b) => shown(b, f)));
    })
    .map((e) => e.id);
}

/** Элемент — токен данных (`content.component: "DataToken"`). */
export const isDataToken = (e: Element) => e.content["component"] === "DataToken";

/**
 * Окно кадров первого бита токена, где читается его ярлык (S2-fix2): с ~40 % полёта + вход
 * подписи (4 кадра), но не позже середины бита (подпись компактного токена к ней видна
 * целиком), до прихода + 6 (поглощённый токен исчезает). Полёт — `content.travel`, нет —
 * весь бит. Не токен — undefined.
 */
export function tokenWindow(e: Element, b: Pick<Beat, "start_frame" | "end_frame">): [number, number] | undefined {
  if (!isDataToken(e)) return undefined;
  const len = Math.max(1, b.end_frame - b.start_frame);
  const t = e.content["travel"];
  const travel = typeof t === "number" && t > 0 ? t : len;
  const from = b.start_frame + Math.ceil(Math.min(travel * 0.4 + 4, len / 2));
  return [from, Math.max(from + 1, Math.min(b.end_frame, b.start_frame + travel + 6))];
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
    // вход текста накрыл всё окно: если число уже на экране (вошло своим битом раньше),
    // кадр «от» важнее недовошедшей подписи; число, входящее самим счётом, в начале бита
    // ещё не видно — кадра нет
    const shownBefore = spec.elements.some((e) => e.kind === "number" && b.element_ids.includes(e.id) && beats.some((x) => x.element_ids.includes(e.id) && x.start_frame < b.start_frame));
    return shownBefore ? [clamp(b.start_frame)] : [];
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
  // проходы: акцент и короткоживущие с шагом ≥ MIN_QA_GAP, они же и ближе, затем остальные с
  // шагом — бюджет кадров не уходит на долгие элементы раньше, чем короткий токен получит кадр
  // короткоживущие: импульс, вспышка, токен данных — их кадр не ловится серединами битов
  const shortLived = (id: string) => transient(id) || isDataToken(elements.get(id)!);
  const prio = (id: string) => isEmphasisRole(elements.get(id)!.role) || shortLived(id);
  // проход сверх бюджета: непокрытым короткоживущим — кадр и за MAX_QA_FRAMES (до HARD)
  for (const [strict, wantPrio, limit] of [[true, true, MAX_QA_FRAMES], [false, true, MAX_QA_FRAMES], [true, false, MAX_QA_FRAMES], [false, true, MAX_QA_FRAMES_HARD]] as const) {
    for (const id of order) {
      if (chosen.length >= limit) break;
      if (prio(id) !== wantPrio || (limit === MAX_QA_FRAMES_HARD && !shortLived(id))) continue;
      if (uncoveredElements({ ...spec, elements: [elements.get(id)!] }, chosen, durationFrames, m).length === 0) continue;
      // кадры средней половины каждого бита элемента; у токена в первом бите — окно ярлыка
      let best: number | undefined;
      let bestKey = [-1, 0];
      for (const b of beatsOf(id)) {
        const len = b.end_frame - b.start_frame;
        const win = b === first.get(id) ? tokenWindow(elements.get(id)!, b) : undefined;
        const [lo, hi] = win ? [win[0], win[1] - 1] : [(b.start_frame + b.end_frame) / 2 - len / 4, (b.start_frame + b.end_frame) / 2 + len / 4];
        const c = (lo + hi) / 2;
        for (let f = clamp(lo); f <= clamp(hi); f++) {
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
