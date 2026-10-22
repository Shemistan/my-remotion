// Планировщик ритма (S3a): структура сцены и веса фаз → кадры. Director кадров не пишет:
// он выбирает форму времени (`composition.structure`) и веса фаз, а окна фаз считает эта
// чистая функция. Вывод держится не меньше времени чтения, а сдвиг от seed (±6–10 кадров
// при 30 fps) разводит сцены одной структуры, чтобы удар не приходился на один кадр.
import type { PhaseRole, SceneStructure } from "@ms/contracts";
import { type Intensity, intensityScale } from "../style/intensity.js";

export const STRUCTURES: readonly SceneStructure[] = ["build-strike", "cold-open", "continuous-flow", "split-reveal", "call-response", "count-up"];

export interface PlanPhase {
  id: string;
  role: PhaseRole;
  /** Доля времени среди фаз своей группы (> 0). */
  weight: number;
  /** Символов текста, который надо прочитать (для payoff и hold). */
  chars?: number;
  /** Элементов, входящих в фазе: каскад входов задаёт её минимальную длину. */
  elements?: number;
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
  /** Кадр, с которого вывод на экране (старт payoff; без payoff — старт hold). */
  takeaway: number;
  /** Кадров на чтение вывода. */
  reading: number;
  /** Сдвиг удара от seed, кадры (0 — сдвигать некуда). */
  offset: number;
  /** call-response: пауза между запросом и ответом — новых событий нет. */
  pause?: { start_frame: number; end_frame: number };
}

/**
 * Кадров на чтение текста: 0,6 с + 15 символов в секунду, от 2 до 4 с; в короткой сцене
 * (`duration`, кадры) — не больше 45 % её, но не меньше 2 с.
 */
export function readingFrames(chars: number, fps: number, duration?: number): number {
  const cap = duration === undefined ? 4 : Math.max(2, Math.min(4, (0.45 * duration) / fps));
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
 * Делит `total` кадров по весам, каждому не меньше `min` (если хватает): сначала минимумы,
 * остаток — по весам, округление по наибольшему остатку. Сумма — ровно `total`.
 */
function split(total: number, items: readonly { weight: number; min: number }[]): number[] {
  if (items.length === 0) return [];
  const minSum = items.reduce((a, x) => a + x.min, 0);
  const mins = minSum <= total ? items.map((x) => x.min) : items.map((x) => (x.min * total) / minSum);
  const rest = Math.max(0, total - mins.reduce((a, x) => a + x, 0));
  const w = items.reduce((a, x) => a + x.weight, 0);
  const raw = items.map((x, i) => mins[i]! + (rest * x.weight) / w);
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
 */
export function planBeats(input: PlanInput): BeatPlan {
  const { structure, phases, fps } = input;
  const D = Math.max(1, Math.round(input.duration));
  const sc = fps / 30;
  const time = intensityScale(input.intensity).time;
  const sec = (s: number) => Math.round(s * fps);
  const enter = Math.round(12 * time * sc);
  const stagger = Math.round(8 * time * sc);
  const phaseMin = (p: PlanPhase) => enter + stagger * Math.max(0, Math.min(p.elements ?? 1, 6) - 1);

  const pre = phases.filter((p) => p.role === "setup" || p.role === "action" || p.role === "turn");
  const pays = phases.filter((p) => p.role === "payoff");
  const holds = phases.filter((p) => p.role === "hold");
  const wTotal = phases.reduce((a, p) => a + p.weight, 0) || 1;
  const chars = [...pays, ...holds].reduce((a, p) => a + (p.chars ?? 0), 0);
  const reading = readingFrames(chars, fps, D);

  // длины payoff (P), hold (H), постера (O), паузы (G)
  const wPay = pays.reduce((a, p) => a + p.weight, 0);
  let P = pays.length ? Math.min(Math.round(0.3 * D), Math.max(sec(0.5), Math.round((D * wPay) / wTotal))) : 0;
  let O = 0;
  let G = 0;
  const turns = pre.filter((p) => p.role === "turn");
  if (structure === "cold-open" && pays.length) {
    O = Math.min(sec(1.5), Math.max(sec(0.8), Math.round(0.14 * D)));
    P = Math.max(sec(0.4), Math.round(P * 0.6));
  }
  if (structure === "continuous-flow" && pays.length) P = Math.max(P, Math.round(0.22 * D));
  if (structure === "split-reveal" && pays.length) P = Math.max(P, Math.round(0.25 * D));
  if (structure === "call-response") {
    if (pays.length) P = Math.min(sec(0.8), Math.max(sec(0.5), P));
    if (turns.length === 0 && pays.length) G = Math.round(sec(0.45) * time);
  }
  const holdMin = Math.max(sec(1), Math.round(D * ((input.density ?? 0) > 8 ? 0.18 : 0.15)));
  // сдвиг удара от seed: ±(6..10) кадров при 30 fps; удержанию — запас на него сверх чтения
  const h = hash(`${structure}:${input.seed}`);
  const mag = Math.round((6 + (h % 5)) * sc);
  const sign = (h >>> 8) & 1 ? 1 : -1;
  let H = holds.length ? Math.max(holdMin, reading - P + mag) : 0;
  if (structure === "call-response" && holds.length) H = Math.max(H, Math.round(0.25 * D));
  // вывод едет поверх действия: входит к середине сцены
  if (structure === "continuous-flow" && holds.length) H = Math.max(H, Math.round(0.45 * D) - P);
  if (!holds.length) P = pays.length ? Math.max(P, reading) : 0;

  const preMins = pre.map((p) => (structure === "call-response" && p.role === "turn" ? Math.max(phaseMin(p), sec(0.4)) : phaseMin(p)));
  const preMin = preMins.reduce((a, x) => a + x, 0);
  // не влезает: удержание сжимается до времени чтения; фазы до удара — ниже своих минимумов
  // (split делит их пропорционально); вывод не короче чтения
  const over = O + G + preMin + P + H - D;
  if (over > 0 && holds.length) H = Math.max(Math.max(1, reading - P), H - over);
  let R = D - O - G - P - H;
  if (R < pre.length) {
    // совсем короткая сцена: всё пропорционально, фазам до удара — хотя бы по кадру
    const k = Math.max(0, D - pre.length) / Math.max(1, O + G + P + H);
    O = Math.floor(O * k);
    G = Math.floor(G * k);
    P = pays.length ? Math.max(1, Math.floor(P * k)) : 0;
    H = holds.length ? Math.max(1, Math.floor(H * k)) : 0;
    R = D - O - G - P - H;
  }
  if (!pre.length) {
    // нечего объяснять: остаток — удержанию (или payoff, если нет hold)
    if (holds.length) H += R;
    else P += R;
    R = 0;
  }

  // сдвиг — за счёт удержания (или payoff без hold), если обе стороны остаются в своих минимумах
  const fits = (o: number) => R + o >= preMin && (holds.length ? H - o >= Math.max(1, reading - P) : P - o >= Math.max(1, reading)) && (holds.length ? H - o >= 1 : true);
  let offset = 0;
  if (pre.length && (holds.length || pays.length)) {
    if (fits(sign * mag)) offset = sign * mag;
    else if (fits(-sign * mag)) offset = -sign * mag;
  }
  R += offset;
  if (holds.length) H -= offset;
  else P -= offset;

  const win = new Map<string, [number, number]>();
  const beats: PlannedBeat[] = [];
  let pause: BeatPlan["pause"];
  const ps = O + G + R; // старт payoff (удар)
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
  const takeaway = pays.length || holds.length ? ps : win.get(pre.at(-1)!.id)![0];
  return { structure, beats, takeaway, reading, offset, ...(pause ? { pause } : {}) };
}
