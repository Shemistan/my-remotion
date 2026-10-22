// Ритм сцены (S3a): Director выбирает структуру (`composition.structure`) и веса фаз, а
// кадры битов ставит этот шаг — как `bound-counters.ts` выставляет окно счётчика. Окна фаз
// считает `planBeats` kit; биты фазы встают в её окне по порядку. Счётчик приходов
// (`bound_to: "<граф>.arrivals.<ребро>"`) идёт в окне своего потока: QA-кадр «от» и OCR
// берутся по тем же кадрам, что и движение. Spec без фаз (старые, чекпоинты) — как была.
import type { Beat, DirectorBeat, DirectorSpec, Element, MotionSpec, Phase, PhaseRole, Settings } from "@ms/contracts";
import { MotionSpecSchema, structureOf } from "@ms/contracts";
import { type BeatPlan, type PlanPhase, planBeats } from "@ms/render";
import { countBeat } from "./qa-frames.js";

/** Действия, которые идут всё окно фазы: фон, рисование, счёт, поток, удержание. */
const SUSTAIN = /(hold|draw|count|flow|stream|background|bg-|loop|idle|travel|run)/i;
/** Ключи content с текстом, который зритель читает. */
const TEXT_KEY = /^(text|label|title|caption|subtitle|value|prefix|suffix|unit|note|verdict)$/i;

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

export type BeatPlanResult =
  | { ok: true; spec: MotionSpec; plan?: BeatPlan; phases?: PlanPhase[]; changes: string[]; warnings: string[] }
  | { ok: false; message: string };

/**
 * Кадры битов из фаз. Без `phases` — биты Director как есть. С фазами: окна фаз —
 * `planBeats` (структура, веса, длина текста вывода, seed — заголовок и мысль сцены);
 * биты фазы — по порядку: `span: "slot"` (по умолчанию) — своя доля окна, но не короче
 * входа, `span: "phase"` (и по умолчанию у фона, рисования, счёта, потоков, hold) — всё
 * окно; биты payoff — каскадом в 6 кадров от старта фазы, все до её конца. Если в фазе
 * есть и входы, и длящиеся биты, входы короткие (≤ 2 входов), длящийся бит стартует сразу
 * за предыдущим. Фаза без битов получает бит по роли; у фазы hold всегда есть бит `hold` до конца.
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
  const phases: Phase[] = spec.phases;
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const fps = spec.fps.num / spec.fps.den;
  const D = spec.duration_frames;
  const enter = Math.round(12 * (fps / 30));
  const payoffIds = new Set(phases.filter((p) => p.role === "payoff").flatMap((p) => p.element_ids));
  const planPhases: PlanPhase[] = phases.map((p) => {
    const read = p.role === "payoff" || p.role === "hold";
    // текст hold, уже прочитанный в payoff, второй раз не считается
    const ids = p.role === "hold" ? p.element_ids.filter((id) => !payoffIds.has(id)) : p.element_ids;
    const chars = read ? ids.reduce((a, id) => a + (byId.get(id) ? textChars(byId.get(id)!) : 0), 0) : undefined;
    return { id: p.id, role: p.role, weight: p.weight, elements: p.element_ids.length, ...(chars !== undefined ? { chars } : {}) };
  });
  const structure = structureOf(spec);
  const plan = planBeats({ structure, phases: planPhases, duration: D, fps, intensity: settings.animation_intensity, density: spec.elements.length, seed: `${spec.title}|${spec.purpose}` });

  const taken = new Set(spec.beats.map((b) => b.id));
  const directorBeats = spec.beats as readonly (DirectorBeat | Beat)[];
  const out: Beat[] = [];
  for (const b of directorBeats) {
    if (b.phase === undefined) out.push(b as Beat);
  }
  for (const p of phases) {
    const w = plan.beats.find((x) => x.phase === p.id && x.kind === "main")!;
    let own = directorBeats.filter((b) => b.phase === p.id);
    if (own.length === 0) {
      own = [{ id: freeId(taken, p.id), phase: p.id, span: "phase", action: ROLE_ACTION[p.role], description: `фаза ${p.id} (${p.role})`, element_ids: p.element_ids }];
      changes.push(`фаза ${p.id} без битов — бит ${own[0]!.id}`);
    }
    if (p.role === "hold" && !own.some((b) => /hold/i.test(b.action))) {
      own = [...own, { id: freeId(taken, `${p.id}-hold`), phase: p.id, span: "phase", action: "hold", description: `удержание${p.hold_mode ? ` (${p.hold_mode})` : ""}`, element_ids: p.element_ids }];
      changes.push(`в фазе ${p.id} нет бита hold — добавлен`);
    }
    const len = w.end_frame - w.start_frame;
    // payoff — удар разом: каскад в 6 кадров (при 30 fps), всё до конца фазы — вывод не
    // входит в хвосте удара и читается всё время payoff + hold
    const payoff = p.role === "payoff";
    const step = Math.max(1, Math.min(Math.round(6 * (fps / 30)), Math.floor(len / own.length)));
    const whole = own.map((b) => payoff || p.role === "hold" || (b.span ?? (SUSTAIN.test(b.action) ? "phase" : "slot")) === "phase");
    const place = (b: DirectorBeat | Beat, start: number, end: number) => {
      const s0 = Math.min(start, w.end_frame - 1);
      out.push({ ...b, start_frame: s0, end_frame: Math.max(Math.min(end, w.end_frame), s0 + 1) } as Beat);
    };
    if (payoff) {
      own.forEach((b, k) => place(b, w.start_frame + k * step, w.end_frame));
    } else if (p.role !== "hold" && whole.some(Boolean) && whole.some((x) => !x)) {
      // есть длящийся бит: входы идут коротко (до двух входов), длящийся стартует сразу за
      // предыдущим входом и живёт до конца фазы — ведущее действие не ждёт равной доли
      const slot = Math.min(Math.ceil(len / own.length), 2 * enter);
      let t = w.start_frame;
      own.forEach((b, k) => {
        if (whole[k]) {
          place(b, t, w.end_frame);
          t += step;
        } else {
          place(b, t, t + Math.max(slot, Math.min(enter, len)));
          t += slot;
        }
      });
    } else {
      own.forEach((b, k) => {
        const start = w.start_frame + Math.floor((k * len) / own.length);
        place(b, start, whole[k] ? w.end_frame : start + Math.max(Math.ceil(len / own.length), enter));
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
  changes.unshift(`план ${structure}: ${windows}; вывод с кадра ${plan.takeaway} (чтение ${plan.reading}, сдвиг ${plan.offset})`);
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
