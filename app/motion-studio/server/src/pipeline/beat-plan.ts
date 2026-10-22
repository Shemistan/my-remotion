// Ритм сцены (S3a): Director выбирает структуру (`composition.structure`) и веса фаз, а
// кадры битов ставит этот шаг — как `bound-counters.ts` выставляет окно счётчика. Окна фаз
// считает `planBeats` kit; биты фазы встают в её окне по порядку. Счётчик приходов
// (`bound_to: "<граф>.arrivals.<ребро>"`) идёт в окне своего потока: QA-кадр «от» и OCR
// берутся по тем же кадрам, что и движение. Spec без фаз (старые, чекпоинты) — как была.
import type { Beat, DirectorBeat, DirectorSpec, Element, MotionSpec, Phase, PhaseRole, Settings } from "@ms/contracts";
import { MotionSpecSchema, actionWords, beatKind, isAccentBeat, isProgressBeat, structureOf } from "@ms/contracts";
import { type BeatPlan, type PhaseTokens, type PlanPhase, phaseTokens, planBeats } from "@ms/render";
import { countBeat, isEmphasisRole } from "./qa-frames.js";

/** Ключи content с текстом, который зритель читает. */
const TEXT_KEY = /^(text|label|title|caption|subtitle|value|prefix|suffix|unit|note|verdict)$/i;
/** Слова действия «вызов, поток»: такие биты одной фазы стартуют веером (3–4 кадра). */
const FAN_WORDS = new Set(["flow", "flows", "stream", "call", "calls", "request", "requests", "signal", "fan", "pulse", "pulses"]);

/** Символов читаемого текста элемента: строки content по ключам и итог числа. */
function textChars(e: Element): number {
  let n = 0;
  for (const [k, v] of Object.entries(e.content)) {
    if (typeof v === "string" && TEXT_KEY.test(k)) n += v.length;
  }
  if (e.kind === "number" && (typeof e.content.to === "number" || typeof e.content.to === "string")) n += String(e.content.to).length;
  return n;
}

const ROLE_ACTION: Record<PhaseRole, string> = { setup: "setup-in", action: "action", turn: "turn", payoff: "payoff-emphasis", hold: "hold" };

function freeId(taken: Set<string>, base: string): string {
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
  taken.add(id);
  return id;
}

type AnyBeat = DirectorBeat | Beat;

export type BeatPlanResult =
  | { ok: true; spec: MotionSpec; plan?: BeatPlan; phases?: PlanPhase[]; changes: string[]; warnings: string[] }
  | { ok: false; message: string };

/** Место бита в payoff: `at` — кадров от старта фазы; `until` — до кадра от старта (нет — до конца фазы). */
interface PayoffSlot { b: AnyBeat; at: number; until?: number }

/**
 * Удар payoff: биты входят разом, но текст вывода — первым, и акцент в момент — один.
 * Неакцентные биты — каскадом по `step`, с текстом впереди. Акценты разных объектов
 * передают друг другу удар: второстепенные — по окну входа, главный (с ролью акцента, иначе
 * с текстом вывода, иначе последний) — после них и до конца фазы.
 */
function payoffLayout(own: readonly AnyBeat[], hasText: (b: AnyBeat) => boolean, emphatic: (b: AnyBeat) => boolean, tok: PhaseTokens): PayoffSlot[] {
  const accents = own.filter((b) => isAccentBeat(b));
  const primary = accents.find(emphatic) ?? accents.find(hasText) ?? accents.at(-1);
  const rest = own.filter((b) => !isAccentBeat(b));
  const slots: PayoffSlot[] = [...rest.filter(hasText), ...rest.filter((b) => !hasText(b))].map((b, k) => ({ b, at: k * tok.step }));
  let t = 0;
  for (const b of accents.filter((x) => x !== primary)) {
    slots.push({ b, at: t, until: t + tok.enter });
    t += tok.enter;
  }
  if (primary) slots.push({ b: primary, at: t });
  return slots;
}

/**
 * Проверки фаз под структуру, которые Director может исправить в раунде: режим удержания,
 * одна payoff у call-response, стороны у split-reveal.
 */
function phaseProblems(spec: DirectorSpec | MotionSpec): string[] {
  const phases = spec.phases ?? [];
  const out: string[] = [];
  const hold = phases.find((p) => p.role === "hold");
  if (hold && !hold.hold_mode) out.push(`фаза ${hold.id} (hold): нужен hold_mode — чем живёт финал: steady-flow | repeat-result | data-shimmer | now-pulse | settle-push`);
  const structure = structureOf(spec);
  if (structure === "call-response" && phases.filter((p) => p.role === "payoff").length > 1) out.push("call-response: ответ — одно событие, фаза payoff одна; вторую сделай hold или turn");
  if (structure === "split-reveal" && !phases.some((p) => p.role === "setup")) out.push("split-reveal: стороны сравнения — фазы setup (по одной на сторону), их нет");
  return out;
}

/**
 * Кадры битов из фаз. Без `phases` — биты Director как есть. С фазами: окна фаз —
 * `planBeats` (структура, веса, длина текста вывода, seed — заголовок и мысль сцены);
 * биты фазы — по порядку: `span: "slot"` (по умолчанию) — своя доля окна, но не короче
 * входа, `span: "phase"` (и по умолчанию у фона, рисования, счёта, потоков, hold) — всё
 * окно; payoff — удар разом (`payoffLayout`). Если в фазе есть и входы, и длящиеся биты,
 * входы короткие (≤ 2 входов), длящийся бит стартует сразу за предыдущим. Потоки фазы —
 * веером через 3–4 кадра; счёт числа — не раньше 15 кадров после его входа («от» видно).
 * Фаза без битов получает бит по роли; у фазы hold всегда есть бит `hold` до конца.
 * Бит без фазы (с кадрами) не трогается. cold-open — бит-постер итога с кадра 0.
 */
export function planSpecBeats(spec: DirectorSpec | MotionSpec, settings: Pick<Settings, "animation_intensity">): BeatPlanResult {
  const changes: string[] = [];
  const warnings: string[] = [];
  if (!spec.phases) {
    const parsed = MotionSpecSchema.safeParse(spec);
    if (!parsed.success) return { ok: false, message: `spec без фаз: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    const a = alignArrivalCounters(parsed.data);
    return { ok: true, spec: a.spec, changes: a.changes, warnings };
  }
  const problems = phaseProblems(spec);
  if (problems.length) return { ok: false, message: problems.join("; ") };
  const phases: Phase[] = spec.phases;
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const fps = spec.fps.num / spec.fps.den;
  const D = spec.duration_frames;
  const tok = phaseTokens(fps, settings.animation_intensity);
  const payoffIds = new Set(phases.filter((p) => p.role === "payoff").flatMap((p) => p.element_ids));
  const charsOf = (ids: readonly string[]) => ids.reduce((a, id) => a + (byId.get(id) ? textChars(byId.get(id)!) : 0), 0);
  /** Бит несёт текст вывода: текст или число payoff с читаемым содержимым (подпись узла — нет). */
  const hasText = (b: AnyBeat) => b.element_ids.some((id) => {
    const e = byId.get(id);
    return payoffIds.has(id) && e !== undefined && (e.kind === "text" || e.kind === "number") && textChars(e) > 0;
  });
  const emphatic = (b: AnyBeat) => b.element_ids.some((id) => isEmphasisRole(byId.get(id)?.role ?? ""));

  // биты по фазам: фаза без битов — бит по роли, hold без бита hold — добавляется
  const taken = new Set(spec.beats.map((b) => b.id));
  const directorBeats = spec.beats as readonly AnyBeat[];
  const ownOf = new Map<string, AnyBeat[]>();
  for (const p of phases) {
    let own = directorBeats.filter((b) => b.phase === p.id);
    if (own.length === 0) {
      own = [{ id: freeId(taken, p.id), phase: p.id, span: "phase", action: ROLE_ACTION[p.role], description: `фаза ${p.id} (${p.role})`, element_ids: p.element_ids }];
      changes.push(`фаза ${p.id} без битов — бит ${own[0]!.id}`);
    }
    if (p.role === "hold" && !own.some((b) => beatKind(b) === "hold")) {
      own = [...own, { id: freeId(taken, `${p.id}-hold`), phase: p.id, span: "phase", action: "hold", description: `удержание${p.hold_mode ? ` (${p.hold_mode})` : ""}`, element_ids: p.element_ids }];
      changes.push(`в фазе ${p.id} нет бита hold — добавлен`);
    }
    const outside = [...new Set(own.flatMap((b) => b.element_ids).filter((id) => !p.element_ids.includes(id)))];
    if (outside.length) warnings.push(`фаза ${p.id}: биты ведут элементы вне её element_ids (${outside.join(", ")})`);
    ownOf.set(p.id, own);
  }
  // раскладка удара до плана: чтение считается от входа текста вывода, а не от старта payoff
  const layouts = new Map<string, PayoffSlot[]>();
  for (const p of phases.filter((x) => x.role === "payoff")) layouts.set(p.id, payoffLayout(ownOf.get(p.id)!, hasText, emphatic, tok));

  const planPhases: PlanPhase[] = phases.map((p) => {
    const read = p.role === "payoff" || p.role === "hold";
    // текст hold, уже прочитанный в payoff, второй раз не считается
    const ids = p.role === "hold" ? p.element_ids.filter((id) => !payoffIds.has(id)) : p.element_ids;
    const chars = read ? charsOf(ids) : undefined;
    const lay = layouts.get(p.id);
    const delay = lay ? Math.max(0, ...lay.filter((s) => hasText(s.b)).map((s) => s.at)) : undefined;
    return { id: p.id, role: p.role, weight: p.weight, elements: p.element_ids.length, ...(chars !== undefined ? { chars } : {}), ...(delay ? { delay } : {}) };
  });
  const structure = structureOf(spec);
  const plan = planBeats({ structure, phases: planPhases, duration: D, fps, intensity: settings.animation_intensity, density: spec.elements.length, seed: `${spec.title}|${spec.purpose}` });

  const out: Beat[] = [];
  for (const b of directorBeats) {
    if (b.phase === undefined) out.push(b as Beat);
  }
  // постер cold-open ставится после фаз: на повторном плане (чекпоинт) он не влияет на счёт
  const posters = new Set(phases.filter((p) => p.role === "payoff").map((p) => `${p.id}-open`));
  /** Первый кадр, с которого элемент на экране (по уже поставленным битам). */
  const seenAt = (id: string) => Math.min(Infinity, ...out.filter((x) => !posters.has(x.id) && x.element_ids.includes(id)).map((x) => x.start_frame));
  for (const p of phases) {
    const w = plan.beats.find((x) => x.phase === p.id && x.kind === "main")!;
    const own = ownOf.get(p.id)!;
    // фаза, которая идёт дальше удара (continuous-flow): старты битов — до удара, дальше
    // живут только длящиеся
    const past = p.role !== "payoff" && p.role !== "hold" && w.start_frame < plan.strike && w.end_frame > plan.strike;
    const len = (past ? plan.strike : w.end_frame) - w.start_frame;
    const step = Math.max(1, Math.min(tok.step, Math.floor(len / own.length)));
    const kind = (b: AnyBeat) => beatKind(b);
    const whole = own.map((b) => p.role === "hold" || (b.span ?? (["sustain", "count", "hold"].includes(kind(b) ?? "") ? "phase" : "slot")) === "phase");
    const fan = (k: number) => k > 0 && whole[k] === true && whole[k - 1] === true && [own[k]!, own[k - 1]!].every((b) => actionWords(b.action).some((x) => FAN_WORDS.has(x)));
    const place = (b: AnyBeat, start: number, end: number) => {
      let s0 = Math.min(start, w.end_frame - 1);
      // счётчик: «от» видно не меньше 15 кадров (при 30 fps) после входа числа
      if (kind(b) === "count" && p.role !== "payoff" && p.role !== "hold") {
        const seen = Math.min(...b.element_ids.map(seenAt));
        if (Number.isFinite(seen) && seen < s0 + tok.countFrom) s0 = Math.min(Math.max(s0, seen + tok.countFrom), Math.max(s0, w.end_frame - tok.enter));
      }
      // рисование и счёт ведут к итогу: кончаются к удару, даже если фаза идёт дальше
      // (continuous-flow тянет действие до конца сцены — поток да, линия нет)
      const cap = p.role !== "payoff" && p.role !== "hold" && isProgressBeat(b) && s0 < plan.strike ? plan.strike : w.end_frame;
      out.push({ ...b, start_frame: s0, end_frame: Math.max(Math.min(end, w.end_frame, cap), s0 + 1) } as Beat);
    };
    if (p.role === "payoff") {
      // удар разом: текст первым, акцент в момент — один (передача по окну входа)
      const L = w.end_frame - w.start_frame;
      for (const s of layouts.get(p.id)!) {
        const at = Math.min(s.at, Math.max(0, L - 1));
        place(s.b, w.start_frame + at, s.until === undefined ? w.end_frame : w.start_frame + Math.max(at + 1, Math.min(s.until, L)));
      }
    } else if (p.role !== "hold" && whole.some(Boolean) && whole.some((x) => !x)) {
      // есть длящийся бит: входы идут коротко (до двух входов), длящийся стартует сразу за
      // предыдущим входом и живёт до конца фазы — ведущее действие не ждёт равной доли
      const slot = Math.min(Math.ceil(len / own.length), 2 * tok.enter);
      let t = w.start_frame;
      own.forEach((b, k) => {
        if (whole[k]) {
          if (fan(k)) t = t - step + tok.fan;
          place(b, t, w.end_frame);
          t += step;
        } else {
          place(b, t, t + Math.max(slot, Math.min(tok.enter, len)));
          t += slot;
        }
      });
    } else {
      let prev = w.start_frame;
      own.forEach((b, k) => {
        const start = fan(k) ? prev + tok.fan : w.start_frame + Math.floor((k * len) / own.length);
        prev = start;
        place(b, start, whole[k] ? w.end_frame : start + Math.max(Math.ceil(len / own.length), tok.enter));
      });
    }
  }
  // cold-open: итог виден с кадра 0, затем уступает объяснению; возвращается в своей фазе
  for (const o of plan.beats.filter((x) => x.kind === "open")) {
    const p = phases.find((x) => x.id === o.phase)!;
    const id = `${p.id}-open`;
    const prev = out.findIndex((b) => b.id === id);
    const poster: Beat = {
      id,
      start_frame: o.start_frame,
      end_frame: o.end_frame,
      action: "cold-open-poster",
      description: `итог виден с кадра 0 (постер), затем уходит на второй план; возвращается в фазе ${p.id}`,
      element_ids: p.element_ids,
    };
    if (prev >= 0) out[prev] = { ...out[prev]!, start_frame: o.start_frame, end_frame: o.end_frame };
    else out.push(poster);
  }
  out.sort(byTime);
  const planned = { ...spec, beats: out };
  const parsed = MotionSpecSchema.safeParse(planned);
  if (!parsed.success) return { ok: false, message: `план битов: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  const windows = plan.beats.filter((b) => b.kind === "main").map((b) => `${b.phase} ${b.start_frame}–${b.end_frame}`).join(", ");
  changes.unshift(`план ${structure}: ${windows}; вывод с кадра ${plan.takeaway}, удар ${plan.strike} (чтение ${plan.reading}, сдвиг ${plan.offset})`);
  const a = alignArrivalCounters(parsed.data);
  return { ok: true, spec: a.spec, plan, phases: planPhases, changes: [...changes, ...a.changes], warnings };
}

/** По старту, затем по концу и id: порядок не зависит от порядка вставки (идемпотентность). */
const byTime = (a: Beat, b: Beat) => a.start_frame - b.start_frame || a.end_frame - b.end_frame || a.id.localeCompare(b.id);

const ARRIVALS = /^(.+)\.arrivals(?:\.(.+))?$/;

/**
 * Счётчик приходов (`bound_to: "<граф>.arrivals[.<ребро>]"`): его бит счёта — окно потоков
 * этого ребра (от старта первого до конца последнего). Бит, который делят другие элементы,
 * не меняется.
 */
export function alignArrivalCounters(spec: MotionSpec): { spec: MotionSpec; changes: string[] } {
  const changes: string[] = [];
  let beats = spec.beats;
  for (const e of spec.elements.filter((x) => x.kind === "number")) {
    const m = typeof e.content.bound_to === "string" ? ARRIVALS.exec(e.content.bound_to.trim()) : null;
    const graph = m ? spec.elements.find((x) => x.id === m[1]) : undefined;
    if (!m || !graph) continue;
    const flows = Array.isArray(graph.content.flows) ? (graph.content.flows as Record<string, unknown>[]) : [];
    const ids = new Set(flows.filter((f) => m[2] === undefined || f?.edge === m[2]).map((f) => f?.beat).filter((x): x is string => typeof x === "string"));
    const fb = beats.filter((b) => ids.has(b.id));
    if (fb.length === 0) continue;
    const start = Math.min(...fb.map((b) => b.start_frame));
    const end = Math.max(...fb.map((b) => b.end_frame));
    const b = countBeat({ ...spec, beats }, e);
    if (!b || ids.has(b.id) || !b.element_ids.every((id) => id === e.id)) continue;
    if (b.start_frame === start && b.end_frame === end) continue;
    beats = beats.map((x) => (x.id === b.id ? { ...x, start_frame: start, end_frame: end } : x));
    changes.push(`бит ${b.id} ${b.start_frame}–${b.end_frame} → ${start}–${end}: счётчик ${e.id} считает приходы ${m[1]}${m[2] ? `.${m[2]}` : ""}`);
  }
  if (beats === spec.beats) return { spec, changes };
  return { spec: { ...spec, beats: [...beats].sort(byTime) }, changes };
}
