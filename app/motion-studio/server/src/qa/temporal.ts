// Проверки сцены сценария по всей сцене (S15b): временной проход пробы раскладки (kit 0.5.8,
// `[motion-kit:sweep]` каждого SWEEP_EVERY-го кадра) и энергия движения превью (яркость тех же
// кадров на сетке пробы). Раньше QA видел только QA-кадры и финал — пустые секунды, пустая
// половина кадра и «ничего не происходит 3 с» проходили (судья S15a).
import { type MotionSpec, type QAIssue, isHoldBeat } from "@ms/contracts";
import { SWEEP_TAG, type SweepFrame, gridDims } from "@ms/render";
import { PLACEHOLDER_HINT, placeholderStubs } from "./layout.js";
import type { KeyMoment } from "./spec-checks.js";

type Issue = Omit<QAIssue, "source">;

/** Окно речи сцены сценария, кадры. */
export interface Window {
  lead: number;
  speech: number;
  tail: number;
}

/** Яркость превью (`previewLuma` render): кадры и сэмплы на сетке пробы. */
export interface Motion {
  frames: number[];
  luma: Uint8Array[];
}

/** Мёртвый воздух: столько кадров подряд без смены видимого и без движения. */
export const DEAD_AIR_FRAMES = 45;
/** Энергия движения ниже этой доли (|Δ| яркости / 255 под содержимым) — кадр стоит. */
export const DEAD_AIR_ENERGY = 0.005;
/** Площадь содержимого «та же» — в пределах этой доли. */
export const AREA_TOL = 0.02;
/** Пустая половина: содержимого в ней меньше этой доли половины… */
export const EMPTY_HALF_SIDE = 0.03;
/** …при содержимом всего кадра больше этой доли… */
export const EMPTY_HALF_TOTAL = 0.08;
/** …не меньше стольких кадров подряд. */
export const EMPTY_HALF_FRAMES = 60;
/** Пустая половина дольше этой доли окна речи — blocking. */
export const EMPTY_HALF_BLOCKING = 0.4;
/** Центровая композиция: центр масс в средних 20 % по оси деления и рамка ≥ 45 % safe area. */
export const CENTER_BAND = 0.2;
export const CENTER_FRAME = 0.45;
/** Пустое начало: на lead + EMPTY_OPEN_AT содержимого меньше этой доли кадра. */
export const EMPTY_OPEN_SHARE = 0.04;
export const EMPTY_OPEN_AT = 12;
/** Поздний герой: 70 % финальной площади позже первого момента слова + 30 кадров. */
export const LATE_HERO_SHARE = 0.7;
export const LATE_HERO_AFTER = 30;
/** Пустой контейнер и заглушки в середине сцены — видны не меньше стольких кадров. */
export const STABLE_FRAMES = 15;
/** Safe area по умолчанию (StyleBible): поля по 5 % с каждой стороны. */
const SAFE = { x: 0.05, y: 0.05 };

/** Строки временного прохода из логов браузера (битые и без замера пропускаются), по кадрам. */
export function parseSweep(logs: readonly string[]): SweepFrame[] {
  const out: SweepFrame[] = [];
  for (const l of logs) {
    const i = l.indexOf(SWEEP_TAG);
    if (i < 0) continue;
    try {
      const f = JSON.parse(l.slice(i + SWEEP_TAG.length)) as SweepFrame & { unmeasured?: boolean };
      if (typeof f.frame === "number" && typeof f.cells === "string" && !f.unmeasured) out.push(f);
    } catch {
      // строка обрезана — не кадр прохода
    }
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/** hex клеток (`packCells` kit) → 0/1 по клеткам. */
export function unpackCells(hex: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i]!, 16);
    for (let k = 0; k < 4; k++) if (i * 4 + k < n && v & (8 >> k)) out[i * 4 + k] = 1;
  }
  return out;
}

const fmt = (frames: readonly number[]) => (frames.length === 1 ? `${frames[0]}` : `${frames[0]}–${frames.at(-1)}`);

/** Отрезки подряд идущих сэмплов, для которых `ok`: [первый, последний] индексы. */
function runs(n: number, ok: (k: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let k = 0; k <= n; k++) {
    if (k < n && ok(k)) {
      if (s < 0) s = k;
    } else if (s >= 0) {
      out.push([s, k - 1]);
      s = -1;
    }
  }
  return out;
}

/** Энергия движения пары соседних сэмплов: среднее |Δ| / 255 под клетками содержимого обоих. */
function energy(a: Uint8Array, b: Uint8Array, ca: Uint8Array, cb: Uint8Array): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ca.length && i < a.length; i++) {
    if (!ca[i] && !cb[i]) continue;
    sum += Math.abs(a[i]! - b[i]!);
    n++;
  }
  return n === 0 ? 0 : sum / n / 255;
}

const textsOf = (f: SweepFrame) => f.items.map((x) => x.text.trim()).sort().join("\u0001");

/**
 * Проверки по всей сцене (только сцена сценария, S15b):
 * - `dead_air` — в окне речи ≥ DEAD_AIR_FRAMES кадров без смены видимого (те же тексты и числа,
 *   площадь содержимого ±2 %) и без движения (энергия < 0,5 % на пиксель содержимого). Идёт бит
 *   фазы (не удержание) — кадр стоит по вине кода: blocking для Engineer (кадры, бит). Бита нет —
 *   вина планировщика: warning. Без яркости превью проверки нет (движение не видно).
 * - `empty_half` — в половине кадра (лево/право у 16:9, верх/низ у 9:16) содержимого < 3 % при
 *   общем > 8 %, ≥ 60 кадров подряд после lead + enter: warning; дольше 40 % окна речи — blocking.
 *   Центровая композиция (центр масс в средних 20 %, рамка ≥ 45 % safe area) — не пустая половина.
 * - `empty_open` — на lead + 12 содержимого < 4 %: warning (подсказка Director).
 * - `late_hero` — герой набрал 70 % финальной площади позже первого момента слова + 30: warning.
 * - `empty_container`, `placeholder_label` — посреди сцены (не до конца: финал проверяет
 *   `scriptLayoutIssues`), после входа (enter кадров от появления), стабильно ≥ 15 кадров.
 */
export function temporalIssues(sweep: readonly SweepFrame[], spec: MotionSpec, window: Window, motion?: Motion, opts: { enter?: number; moments?: readonly KeyMoment[] } = {}): Issue[] {
  if (sweep.length < 2) return [];
  const enter = opts.enter ?? 16;
  const size = sweep[0]!.size;
  const { gw, gh } = gridDims(size);
  const n = gw * gh;
  const cells = sweep.map((f) => unpackCells(f.cells, n));
  const step = Math.max(1, sweep[1]!.frame - sweep[0]!.frame);
  const speechEnd = window.lead + window.speech;
  const inSpeech = (f: number) => f >= window.lead && f < speechEnd;
  /** Кадров покрывают сэмплы [a; b]: от первого до последнего + шаг. */
  const cover = (a: number, b: number) => sweep[b]!.frame - sweep[a]!.frame + step;
  const out: Issue[] = [];

  // --- dead_air ---
  if (motion && motion.frames.length > 0) {
    const lumaAt = new Map(motion.frames.map((f, k) => [f, motion.luma[k]!]));
    const still = (k: number) => {
      const a = sweep[k]!;
      const b = sweep[k + 1];
      if (!b || !inSpeech(a.frame) || !inSpeech(b.frame)) return false;
      if (textsOf(a) !== textsOf(b)) return false;
      if (Math.abs(a.content - b.content) > AREA_TOL * Math.max(a.content, b.content, 1e-9)) return false;
      const la = lumaAt.get(a.frame);
      const lb = lumaAt.get(b.frame);
      if (!la || !lb) return false;
      return energy(la, lb, cells[k]!, cells[k + 1]!) < DEAD_AIR_ENERGY;
    };
    for (const [s, e0] of runs(sweep.length - 1, still)) {
      const e = e0 + 1;
      const from = sweep[s]!.frame;
      const to = sweep[e]!.frame;
      if (to - from < DEAD_AIR_FRAMES) continue;
      const need = Math.min(STABLE_FRAMES, Math.round((to - from) / 3));
      const active = spec.beats.filter((b) => b.phase !== undefined && !isHoldBeat(b) && Math.min(b.end_frame, to) - Math.max(b.start_frame, from) >= need);
      const frames = `кадры ${from}–${to}`;
      if (active.length > 0) {
        out.push({
          code: "dead_air", severity: "blocking", frame: from, area: active.map((b) => b.id).join(", "),
          description: `${frames}: идёт бит ${active.map((b) => `${b.id} (${b.action})`).join(", ")}, а в кадре ${to - from} кадров ничего не меняется и не движется — мёртвый воздух посреди речи`,
          fix_hint: "движение бита — на всю его длину: счёт, прорисовка, сдвиг, нарастание или живой акцент до следующего бита, а не вход за 10–20 кадров и стоп-кадр; длящийся бит (sustain/count) ведёт interpolate по [start; end] бита",
        });
      } else {
        out.push({
          code: "dead_air", severity: "warning", frame: from, area: "spec",
          description: `${frames}: в окне речи ${to - from} кадров ничего не меняется и нет активного бита фазы — пауза плана битов (планировщик)`,
          fix_hint: "Director: между битами — длящийся бит (рисование, счёт, сдвиг камеры) или следующий вход раньше; пауза без бита не длиннее 1,5 с",
        });
      }
    }
  }

  // --- empty_half ---
  const portrait = size.h > size.w;
  const safe = { x: size.w * SAFE.x, y: size.h * SAFE.y, w: size.w * (1 - 2 * SAFE.x), h: size.h * (1 - 2 * SAFE.y) };
  const halfOf = (k: number): { side: string } | undefined => {
    const f = sweep[k]!;
    if (f.frame < window.lead + enter || f.content <= EMPTY_HALF_TOTAL) return undefined;
    const c = cells[k]!;
    let a = 0;
    let b = 0;
    let sum = 0;
    let x0 = gw;
    let y0 = gh;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < n; i++) {
      if (!c[i]) continue;
      const x = i % gw;
      const y = Math.floor(i / gw);
      const pos = portrait ? y / gh : x / gw;
      if (pos < 0.5) a++;
      else b++;
      sum += (portrait ? y + 0.5 : x + 0.5) / (portrait ? gh : gw);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const half = n / 2;
    const empty = a / half < EMPTY_HALF_SIDE ? (portrait ? "top" : "left") : b / half < EMPTY_HALF_SIDE ? (portrait ? "bottom" : "right") : undefined;
    if (!empty) return undefined;
    const centroid = sum / Math.max(1, a + b);
    const frame = ((x1 - x0 + 1) * (size.w / gw) * (y1 - y0 + 1) * (size.h / gh)) / (safe.w * safe.h);
    if (Math.abs(centroid - 0.5) <= CENTER_BAND / 2 && frame >= CENTER_FRAME) return undefined;
    return { side: empty };
  };
  const halves = sweep.map((_, k) => halfOf(k));
  const halfRuns = runs(sweep.length, (k) => halves[k] !== undefined).filter(([s, e]) => cover(s, e) >= EMPTY_HALF_FRAMES);
  if (halfRuns.length > 0) {
    const inWin = (s: number, e: number) => {
      let c = 0;
      for (let k = s; k <= e; k++) if (inSpeech(sweep[k]!.frame)) c += step;
      return c;
    };
    const emptyInSpeech = halfRuns.reduce((acc, [s, e]) => acc + inWin(s, e), 0);
    const hard = emptyInSpeech > EMPTY_HALF_BLOCKING * window.speech;
    const sides = [...new Set(halfRuns.map(([s]) => halves[s]!.side))];
    const ru: Record<string, string> = { left: "левая", right: "правая", top: "верхняя", bottom: "нижняя" };
    out.push({
      code: "empty_half", severity: hard ? "blocking" : "warning", frame: sweep[halfRuns[0]![0]]!.frame, area: sides.join(", "),
      description: `${sides.map((x) => ru[x]).join(" и ")} половина кадра пуста (кадры ${halfRuns.map(([s, e]) => fmt([sweep[s]!.frame, sweep[e]!.frame])).join(", ")}; ≈ ${Math.round((emptyInSpeech / Math.max(1, window.speech)) * 100)} % речи) — содержимое прижато к одной стороне`,
      fix_hint: "раскладка на весь кадр: герой на 30–40 % кадра в центре или по диагонали, подписи и вторичное — во второй половине; пустая сторона — место для данных фразы (ось, счётчик, сравнение)",
    });
  }

  // --- empty_open ---
  const openAt = window.lead + EMPTY_OPEN_AT;
  const open = sweep.find((f) => f.frame >= openAt);
  if (open && open.content < EMPTY_OPEN_SHARE) {
    out.push({
      code: "empty_open", severity: "warning", frame: open.frame, area: "spec",
      description: `на кадре ${open.frame} (начало речи + ${EMPTY_OPEN_AT}) содержимого ${Math.round(open.content * 100)} % кадра — первые секунды пустые`,
      fix_hint: "Director: с начала речи в кадре — постер или силуэт героя (контур графика, ось, рамка числа), вход — его проявление, а не появление из пустоты",
    });
  }

  // --- late_hero ---
  const m0 = [...(opts.moments ?? [])].sort((a, b) => a.frame - b.frame)[0];
  const top = (f: SweepFrame) => f.heroes[0]?.share ?? 0;
  const final = top(sweep.at(-1)!);
  if (m0 && final > 0) {
    const reach = sweep.find((f) => top(f) >= LATE_HERO_SHARE * final);
    if (reach && reach.frame > m0.frame + LATE_HERO_AFTER) {
      out.push({
        code: "late_hero", severity: "warning", frame: reach.frame, area: "spec",
        description: `герой набирает ${Math.round(LATE_HERO_SHARE * 100)} % своей финальной площади только к кадру ${reach.frame}, а первое ключевое слово («${m0.text}») звучит на кадре ${m0.frame}`,
        fix_hint: "Director: герой входит до первого ключевого слова (крупно с начала речи, дальше — его изменения), а не собирается к финалу",
      });
    }
  }

  // --- empty_container / placeholder_label посреди сцены ---
  const last = sweep.length - 1;
  const firstSeen = new Map<string, number>();
  for (const f of sweep) for (const b of f.boxes) if (!firstSeen.has(b.id)) firstSeen.set(b.id, f.frame);
  const boxIds = [...firstSeen.keys()];
  const emptyRuns: { id: string; kind: string; s: number; e: number }[] = [];
  for (const id of boxIds) {
    const after = (k: number) => sweep[k]!.frame >= firstSeen.get(id)! + enter;
    for (const [s, e] of runs(sweep.length, (k) => after(k) && sweep[k]!.boxes.some((b) => b.id === id && !b.filled))) {
      if (e === last || cover(s, e) < STABLE_FRAMES) continue;
      emptyRuns.push({ id, kind: sweep[s]!.boxes.find((b) => b.id === id)!.kind, s, e });
    }
  }
  if (emptyRuns.length > 0) {
    const kinds = [...new Set(emptyRuns.map((x) => x.kind))];
    out.push({
      code: "empty_container", severity: "blocking", frame: sweep[emptyRuns[0]!.s]!.frame, area: kinds.join(", "),
      description: `посреди сцены пустой контейнер (${kinds.join(", ")}; кадры ${emptyRuns.map((x) => fmt([sweep[x.s]!.frame, sweep[x.e]!.frame])).join(", ")}): рамка без текста и графики читается заглушкой`,
      fix_hint: "карточка появляется вместе со своим содержимым (число, имя, термин, мини-график) или позже — не пустой рамкой; герой сцены — графика из данных фразы",
    });
  }
  const seenText = new Map<string, number>();
  for (const f of sweep) for (const it of f.items) if (!seenText.has(it.id)) seenText.set(it.id, f.frame);
  const stubAt = sweep.map((f) => placeholderStubs({ items: f.items.filter((it) => f.frame >= seenText.get(it.id)! + enter), boxes: f.boxes }));
  const stubTexts = [...new Set(stubAt.flatMap((x) => x.map((y) => y.text)))];
  const stubRuns: { text: string; s: number; e: number; hard: boolean; count: number }[] = [];
  for (const t of stubTexts) {
    for (const [s, e] of runs(sweep.length, (k) => stubAt[k]!.some((x) => x.text === t))) {
      if (e === last || cover(s, e) < STABLE_FRAMES) continue;
      const xs = stubAt.slice(s, e + 1).flatMap((x) => x.filter((y) => y.text === t));
      stubRuns.push({ text: t, s, e, hard: xs.some((y) => y.hard), count: Math.max(...xs.map((y) => y.count)) });
    }
  }
  if (stubRuns.length > 0) {
    const hard = stubRuns.some((x) => x.hard);
    out.push({
      code: "placeholder_label", severity: hard ? "blocking" : "warning", frame: sweep[stubRuns[0]!.s]!.frame, area: [...new Set(stubRuns.map((x) => `«${x.text}»`))].join(", "),
      description: `посреди сцены подписи-заглушки: ${stubRuns.map((x) => `«${x.text}» ×${x.count} (кадры ${fmt([sweep[x.s]!.frame, sweep[x.e]!.frame])})`).join(", ")} — у объектов нет своего содержимого${hard ? "" : " (вне карточек и узлов — подсказка)"}`,
      fix_hint: PLACEHOLDER_HINT,
    });
  }
  return out;
}

