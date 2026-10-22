// Планировщик ритма (S3a): структура сцены и веса фаз → кадры. Director кадров не пишет:
// он выбирает форму времени (`composition.structure`) и веса фаз, а окна фаз считает эта
// чистая функция. Кадр удара лежит в полосе своей структуры (`TAKEAWAY_BAND`), место в
// полосе задают веса (доля фаз до удара); вывод держится не меньше времени чтения, а сдвиг
// от seed (±6–10 кадров при 30 fps) разводит сцены одной структуры.
import type { PhaseRole, SceneStructure } from "@ms/contracts";
import { type Intensity, intensityScale } from "../style/intensity.js";

export const STRUCTURES: readonly SceneStructure[] = ["build-strike", "cold-open", "continuous-flow", "split-reveal", "call-response", "count-up"];

/**
 * Полоса кадра удара (доли сцены) по структуре: число ведёт — удар рано, поток — к середине,
 * сборка и сравнение — позже, ответ на запрос — поздно. Место в полосе — доля веса фаз до
 * удара (setup, action, turn) от 0,3 до 0,8: больше веса объяснению — удар позже, больше
 * веса payoff и hold — раньше. Длинный вывод (чтение) не помещается под верх самой поздней
 * полосы — тогда все полосы сдвигаются вниз на одно число кадров (`BAND_TOP·D − (D − чтение)`):
 * ширина и порядок структур сохраняются (s3afix-rereview I2).
 * cold-open: полоса — возврат к итогу; кадр вывода у него — 0 (постер).
 */
export const TAKEAWAY_BAND: Readonly<Record<SceneStructure, readonly [number, number]>> = {
  "count-up": [0.26, 0.42],
  "continuous-flow": [0.42, 0.54],
  "split-reveal": [0.5, 0.62],
  "cold-open": [0.52, 0.64],
  "build-strike": [0.54, 0.66],
  "call-response": [0.58, 0.7],
};
/** Верх самой поздней полосы: под него сдвигаются все полосы, когда вывод длинный. */
const BAND_TOP = Math.max(...Object.values(TAKEAWAY_BAND).map(([, hi]) => hi));

/**
 * Потолки хвоста в секундах (S3-fix, user-cases): доли длины в 60-секундной сцене давали
 * 13–20 с почти статичного финала. Удержание — не дольше HOLD_MAX_S, payoff — не дольше
 * PAYOFF_MAX_S (или чтения и входа главного бита, если они дольше). Хвост длинной сцены
 * упирается в потолки — удар уходит позже полосы, время получает объяснение. Короткие сцены
 * (до ~12 с) потолков не достают.
 */
export const HOLD_MAX_S = 4;
export const PAYOFF_MAX_S = 6;

export interface PlanPhase {
  id: string;
  role: PhaseRole;
  /** Доля времени среди фаз своей группы (> 0). */
  weight: number;
  /** Символов текста, который надо прочитать (для payoff и hold). */
  chars?: number;
  /** Элементов, входящих в фазе: каскад входов задаёт её минимальную длину. */
  elements?: number;
  /**
   * payoff: кадров от старта фазы до входа последнего бита с текстом вывода (каскад,
   * передача акцента). Чтение считается от этого кадра.
   */
  delay?: number;
  /**
   * payoff: кадров от старта фазы до входа главного бита (после передачи акцента): фаза
   * не короче `max(delay, lead)` + вход — главный акцент успевает войти целиком.
   */
  lead?: number;
  /** Минимальная длина окна фазы, кадры (setup графа — пока не дорисованы рёбра). */
  minFrames?: number;
}

export interface PlanInput {
  structure: SceneStructure;
  phases: readonly PlanPhase[];
  /** Длительность сцены в кадрах. */
  duration: number;
  fps: number;
  intensity: Intensity;
  /** Элементов в сцене: плотной сцене (> 8) — удержание длиннее, глазу нужно время обойти кадр. */
  density?: number;
  /** Содержательный seed (id сцены): сдвиг удара. */
  seed: string;
}

/** Окно фазы. `open` — постер итога в начале cold-open (тот же payoff, до объяснения). */
export interface PlannedBeat {
  phase: string;
  role: PhaseRole;
  kind: "main" | "open";
  start_frame: number;
  end_frame: number;
}

export interface BeatPlan {
  structure: SceneStructure;
  beats: PlannedBeat[];
  /**
   * Кадр, с которого вывод на экране — метрика «кадр вывода»: старт payoff (без payoff —
   * старт hold); у cold-open — 0 (итог-постер с первого кадра).
   */
  takeaway: number;
  /** Кадр удара: старт payoff (без payoff — hold); у cold-open — возврат к итогу. */
  strike: number;
  /** Кадров на чтение вывода. */
  reading: number;
  /** Сдвиг удара от seed, кадры (0 — сдвигать некуда). */
  offset: number;
  /** call-response: пауза между запросом и ответом — новых событий нет. */
  pause?: { start_frame: number; end_frame: number };
}

/** Кадровые токены фаз (под fps и интенсивность) — общие для планировщика и шага пайплайна. */
export interface PhaseTokens {
  /** Вход элемента. */
  enter: number;
  /** Шаг каскада входов. */
  stagger: number;
  /** Шаг удара payoff: биты входят разом, через столько кадров. */
  step: number;
  /** Веер параллельных вызовов (потоки одной фазы): 3–4 кадра между стартами. */
  fan: number;
  /** Счётчик показывает «от» до начала счёта. */
  countFrom: number;
}

export function phaseTokens(fps: number, intensity: Intensity): PhaseTokens {
  const sc = fps / 30;
  const time = intensityScale(intensity).time;
  return {
    enter: Math.max(1, Math.round(12 * time * sc)),
    stagger: Math.max(1, Math.round(8 * time * sc)),
    step: Math.max(1, Math.round(6 * sc)),
    fan: Math.max(1, Math.round(4 * sc)),
    countFrom: Math.max(1, Math.round(15 * sc)),
  };
}

/**
 * Кадров на чтение текста: 0,6 с + 15 символов в секунду, от 2 до 4 с; в короткой сцене
 * (`duration`, кадры) — не больше 40 % её, но не меньше 2 с.
 */
export function readingFrames(chars: number, fps: number, duration?: number): number {
  const cap = duration === undefined ? 4 : Math.max(2, Math.min(4, (0.4 * duration) / fps));
  const sec = Math.min(cap, Math.max(2, 0.6 + Math.max(0, chars) / 15));
  return Math.round(sec * fps);
}

/** FNV-1a: детерминированный хэш строки. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // перемешивание (финализатор murmur3): младшие биты FNV плохо распределены
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Делит `total` кадров по весам; доле меньше `min` — её минимум, остаток снова по весам
 * между прочими (water-filling). Минимумов не хватает — пропорционально им. Округление по
 * наибольшему остатку, сумма — ровно `total`.
 */
function split(total: number, items: readonly { weight: number; min: number }[]): number[] {
  if (items.length === 0) return [];
  const minSum = items.reduce((a, x) => a + x.min, 0);
  let raw: number[];
  if (minSum >= total) raw = items.map((x) => (minSum > 0 ? (x.min * total) / minSum : total / items.length));
  else {
    const fixed = new Set<number>();
    for (;;) {
      const left = total - [...fixed].reduce((a, i) => a + items[i]!.min, 0);
      const w = items.reduce((a, x, i) => a + (fixed.has(i) ? 0 : x.weight), 0);
      raw = items.map((x, i) => (fixed.has(i) ? x.min : (left * x.weight) / w));
      const low = items.findIndex((x, i) => !fixed.has(i) && raw[i]! < x.min);
      if (low < 0) break;
      fixed.add(low);
    }
  }
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k]![1]]! += 1;
  return out;
}

/** Последовательные окна от `from`: длины `lens`. */
function chain(from: number, lens: readonly number[]): [number, number][] {
  let t = from;
  return lens.map((l) => {
    const w: [number, number] = [t, t + l];
    t += l;
    return w;
  });
}

/**
 * Окна фаз по структуре сцены:
 * - `build-strike` — setup → action → turn → payoff (удар) → hold, друг за другом;
 * - `cold-open` — итог-постер с кадра 0 (окно `open` фазы payoff), затем объяснение,
 *   затем короткий возврат к итогу и удержание;
 * - `continuous-flow` — удара нет: последняя action идёт до конца сцены, payoff длинный и
 *   входит поверх действия;
 * - `split-reveal` — все setup (стороны) параллельно с кадра 0, затем действие, вердикт растёт
 *   долго (≥ 25 % сцены);
 * - `call-response` — запрос, пауза (фаза turn или пустой зазор), ответ — короткое событие,
 *   долгое удержание (≥ 25 %);
 * - `count-up` — число ведёт: первая action (счёт) с кадра 0 до удара, setup и прочие фазы
 *   входят поверх счёта.
 * Кадр удара — в полосе структуры (`TAKEAWAY_BAND`) по доле веса фаз до удара.
 */
export function planBeats(input: PlanInput): BeatPlan {
  const { structure, phases, fps } = input;
  const D = Math.max(1, Math.round(input.duration));
  const sc = fps / 30;
  const tok = phaseTokens(fps, input.intensity);
  const time = intensityScale(input.intensity).time;
  const sec = (s: number) => Math.round(s * fps);
  // минимум фазы — вход и короткий каскад (до 3 шагов) или свой минимум фазы (рёбра графа):
  // дальше время делят веса
  const phaseMin = (p: PlanPhase) => Math.max(tok.enter + tok.stagger * Math.max(0, Math.min(p.elements ?? 1, 3) - 1), Math.round(p.minFrames ?? 0));

  const pre = phases.filter((p) => p.role === "setup" || p.role === "action" || p.role === "turn");
  const pays = phases.filter((p) => p.role === "payoff");
  const holds = phases.filter((p) => p.role === "hold");
  const sum = (xs: readonly PlanPhase[]) => xs.reduce((a, p) => a + p.weight, 0);
  const wTotal = sum(phases) || 1;
  const chars = [...pays, ...holds].reduce((a, p) => a + (p.chars ?? 0), 0);
  const reading = readingFrames(chars, fps, D);
  // текст вывода входит через `delay` кадров после удара: чтение — от его входа
  const delay = Math.max(0, ...pays.map((p) => Math.round(p.delay ?? 0)));
  const need = reading + delay;
  const tail = pays.length > 0 || holds.length > 0;

  // длина payoff (P) по весу, постер (O), пауза (G)
  let P0 = pays.length ? Math.min(Math.round(0.3 * D), Math.max(sec(0.5), Math.round((D * sum(pays)) / wTotal))) : 0;
  let O = 0;
  let G = 0;
  const turns = pre.filter((p) => p.role === "turn");
  if (structure === "cold-open" && pays.length) {
    O = Math.min(sec(1.5), Math.max(sec(0.8), Math.round(0.14 * D)));
    P0 = Math.max(sec(0.4), Math.round(P0 * 0.6));
  }
  if (structure === "continuous-flow" && pays.length) P0 = Math.max(P0, Math.round(0.22 * D));
  if (structure === "split-reveal" && pays.length) P0 = Math.max(P0, Math.round(0.25 * D));
  if (structure === "call-response") {
    if (pays.length) P0 = Math.min(sec(0.8), Math.max(sec(0.5), P0));
    if (turns.length === 0 && pays.length) G = Math.round(sec(0.45) * time);
  }
  // главный бит payoff (текст вывода или главный акцент после передачи) входит целиком
  const lead = Math.max(delay, ...pays.map((p) => Math.round(p.lead ?? 0)));
  const Pmin = pays.length ? lead + tok.enter : 0;
  // потолки в секундах: payoff — не дольше PAYOFF_MAX_S (чтение и вход главного бита — всегда)
  const Pcap = Math.max(sec(PAYOFF_MAX_S), need, Pmin);
  const Hcap = sec(HOLD_MAX_S);
  P0 = Math.max(Math.min(P0, Pcap), Pmin);
  const holdMin = Math.max(sec(1), Math.round(D * ((input.density ?? 0) > 8 ? 0.18 : 0.15)));
  const hMin = holds.length ? Math.min(Hcap, structure === "call-response" ? Math.max(holdMin, Math.round(0.25 * D)) : holdMin) : 0;
  // хвост (payoff + hold): желательно — чтение и минимумы обеих фаз, обязательно — чтение
  // вердикт split-reveal и вывод continuous-flow длинные по смыслу структуры — хвост под них
  const Pform = Math.min(Pcap, !pays.length ? 0 : structure === "split-reveal" ? Math.round(0.25 * D) : structure === "continuous-flow" ? Math.round(0.22 * D) : 0);
  const tailWant = tail ? Math.max(need, Math.max(Pmin, Pform) + hMin) : 0;
  const tailMin = tail ? Math.max(need, Pmin + (holds.length ? 1 : 0), pays.length + holds.length) : 0;
  // потолок хвоста: payoff по весу (не дольше Pcap) + удержание не дольше Hcap; без hold —
  // payoff до Pcap, без payoff — удержание до Hcap (но не короче чтения)
  const tailCap = !tail ? 0 : Math.max(tailWant, pays.length && holds.length ? P0 + Hcap : pays.length ? Pcap : Math.max(Hcap, need));

  const preMins = pre.map((p) => (structure === "call-response" && p.role === "turn" ? Math.max(phaseMin(p), sec(0.4)) : phaseMin(p)));
  // count-up: счёт (первая action) идёт с кадра 0 до удара, прочие фазы — поверх него после
  // короткого вступления: до удара нужно max(счёт, вступление + прочие), а не их сумма
  const leadAt = structure === "count-up" ? pre.findIndex((p) => p.role === "action") : -1;
  const preMin = leadAt >= 0
    ? Math.max(preMins[leadAt]!, Math.min(sec(0.5), preMins[leadAt]!) + preMins.reduce((a, x, i) => a + (i === leadAt ? 0 : x), 0))
    : preMins.reduce((a, x) => a + x, 0);
  // cold-open в тесной сцене: постер короче (до 0,5 с), фазам до удара — их минимумы
  if (O > 0 && pre.length) O = Math.max(Math.min(O, sec(0.5)), Math.min(O, D - tailMin - G - preMin));

  // кадр удара T: полоса структуры по доле веса фаз до удара
  let T: number;
  let offset = 0;
  if (!tail) T = D;
  else if (!pre.length) {
    // только хвост: постер и пауза — сколько влезет до чтения, кадр удара не меньше 0
    T = Math.max(0, Math.min(O + G, D - tailMin));
    const k = O + G > 0 ? T / (O + G) : 1;
    O = Math.floor(O * k);
    G = T - O;
  } else {
    const [lo, hi] = TAKEAWAY_BAND[structure];
    const x = Math.min(1, Math.max(0, (sum(pre) / wTotal - 0.3) / 0.5));
    // длинный вывод (чтение) не влезает под верх полос: все полосы сдвигаются вниз на одно и
    // то же число кадров — оно зависит только от чтения, не от структуры, так что ширина и
    // порядок структур сохраняются, а не срезаются по верху
    const shift = Math.max(0, BAND_TOP * D - (D - need));
    T = Math.round(D * (lo + (hi - lo) * x) - shift);
    T = Math.min(T, D - tailWant);
    // длинная сцена: хвост не длиннее потолка — удар позже полосы
    T = Math.max(T, D - tailCap);
    T = Math.max(T, O + G + preMin);
    T = Math.min(T, D - tailMin);
    // совсем короткая сцена: постер и пауза сжимаются, фазам до удара — хотя бы по кадру
    if (T - O - G < pre.length) {
      T = Math.min(D - pays.length - holds.length, Math.max(T, pre.length));
      const k = O + G > 0 ? Math.min(1, Math.max(0, T - pre.length) / (O + G)) : 1;
      O = Math.floor(O * k);
      G = Math.floor(G * k);
    }
    // сдвиг от seed: ±(6..10) кадров при 30 fps, если обе стороны остаются в своих минимумах
    const h = hash(`${structure}:${input.seed}`);
    const mag = Math.round((6 + (h % 5)) * sc);
    const sign = (h >>> 8) & 1 ? 1 : -1;
    // хвост, который уже влез (чтение и минимумы), сдвиг не отнимает
    const keep = Math.max(tailMin, Math.min(tailWant, D - T));
    const fits = (o: number) => T + o - O - G >= preMin && D - (T + o) >= keep && D - (T + o) <= Math.max(tailCap, D - T);
    if (fits(sign * mag)) offset = sign * mag;
    else if (fits(-sign * mag)) offset = -sign * mag;
    T += offset;
  }

  // payoff и hold делят хвост: payoff — по весу, hold — остаток (не меньше своего минимума)
  const A = D - T;
  let P = 0;
  let H = 0;
  if (pays.length && holds.length) {
    P = Math.min(P0, A - hMin);
    P = Math.max(P, Math.min(Pmin, A - 1), 1);
    H = A - P;
  } else if (pays.length) P = A;
  else if (holds.length) H = A;
  const R = T - O - G;

  const win = new Map<string, [number, number]>();
  const beats: PlannedBeat[] = [];
  let pause: BeatPlan["pause"];
  const ps = T; // старт payoff (удар)
  const preStart = O;

  if (structure === "split-reveal" && pre.some((p) => p.role === "setup")) {
    const sides = pre.filter((p) => p.role === "setup");
    const rest = pre.filter((p) => p.role !== "setup");
    const lens = split(R, pre.map((p, i) => ({ weight: p.weight, min: preMins[i]! })));
    const share = sides.reduce((a, p) => a + lens[pre.indexOf(p)]!, 0);
    const L = rest.length ? Math.min(share, Math.max(...sides.map((p) => preMins[pre.indexOf(p)]!), Math.round(share * 0.6))) : R;
    for (const p of sides) win.set(p.id, [preStart, preStart + L]);
    const rl = split(R - L, rest.map((p) => ({ weight: p.weight, min: preMins[pre.indexOf(p)]! })));
    chain(preStart + L, rl).forEach((w, i) => win.set(rest[i]!.id, w));
  } else if (structure === "count-up" && pre.some((p) => p.role === "action")) {
    const lead = pre.find((p) => p.role === "action")!;
    const rest = pre.filter((p) => p !== lead);
    win.set(lead.id, [preStart, preStart + R]);
    const leadIn = Math.min(sec(0.5), Math.round(0.15 * R), preMins[pre.indexOf(lead)]!);
    const rl = split(R - leadIn, rest.map((p) => ({ weight: p.weight, min: preMins[pre.indexOf(p)]! })));
    chain(preStart + leadIn, rl).forEach((w, i) => win.set(rest[i]!.id, w));
  } else if (structure === "call-response") {
    // пауза — перед ответом: фазы turn (по порядку) в конце, иначе пустой зазор G
    const order = [...pre.filter((p) => p.role !== "turn"), ...turns];
    const lens = split(R, order.map((p) => ({ weight: p.weight, min: preMins[pre.indexOf(p)]! })));
    chain(preStart, lens).forEach((w, i) => win.set(order[i]!.id, w));
    if (turns.length) pause = { start_frame: win.get(turns[0]!.id)![0], end_frame: win.get(turns.at(-1)!.id)![1] };
    else if (G > 0) pause = { start_frame: preStart + R, end_frame: preStart + R + G };
  } else {
    const lens = split(R, pre.map((p, i) => ({ weight: p.weight, min: preMins[i]! })));
    chain(preStart, lens).forEach((w, i) => win.set(pre[i]!.id, w));
  }

  // payoff и hold
  const pl = split(P, pays.map((p) => ({ weight: p.weight, min: 1 })));
  chain(ps, pl).forEach((w, i) => win.set(pays[i]!.id, w));
  const hl = split(H, holds.map((p) => ({ weight: p.weight, min: 1 })));
  chain(ps + P, hl).forEach((w, i) => win.set(holds[i]!.id, w));

  if (structure === "continuous-flow") {
    // удара нет: последнее действие идёт до конца сцены, вывод едет поверх
    const flow = [...pre].reverse().find((p) => p.role === "action") ?? pre.at(-1);
    if (flow) win.set(flow.id, [win.get(flow.id)![0], D]);
  }
  if (structure === "count-up" && !pre.some((p) => p.role === "action") && pays.length) {
    // счёт без отдельной фазы действия: число (payoff) с кадра 0, удар — в ps
    const first = pays[0]!;
    win.set(first.id, [0, win.get(first.id)![1]]);
  }

  // фазы без кадров (короткие сцены): одна клетка у ближайшего свободного места
  for (const p of phases) {
    const w = win.get(p.id)!;
    if (w[1] <= w[0]) win.set(p.id, [Math.min(w[0], D - 1), Math.min(w[0], D - 1) + 1]);
  }
  if (structure === "cold-open" && O > 0) for (const p of pays) beats.push({ phase: p.id, role: p.role, kind: "open", start_frame: 0, end_frame: O });
  for (const p of phases) {
    const [s, e] = win.get(p.id)!;
    beats.push({ phase: p.id, role: p.role, kind: "main", start_frame: s, end_frame: e });
  }
  // по старту; при равном старте постер раньше, иначе — порядок фаз
  beats.sort((a, b) => a.start_frame - b.start_frame || Number(b.kind === "open") - Number(a.kind === "open"));
  // без payoff и hold вывод — последняя фаза
  const strike = tail ? ps : win.get(pre.at(-1)!.id)![0];
  const takeaway = structure === "cold-open" && O > 0 ? 0 : strike;
  return { structure, beats, takeaway, strike, reading, offset, ...(pause ? { pause } : {}) };
}
