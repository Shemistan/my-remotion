// Ритм сцены (S3a): Director выбирает структуру (`composition.structure`) и веса фаз, а
// кадры битов ставит этот шаг — как `bound-counters.ts` выставляет окно счётчика. Окна фаз
// считает `planBeats` kit; биты фазы встают в её окне по порядку. Счётчик приходов
// (`bound_to: "<граф>.arrivals.<ребро>"`) идёт в окне своего потока: QA-кадр «от» и OCR
// берутся по тем же кадрам, что и движение. Spec без фаз (старые, чекпоинты) — как была.
import type { Beat, DirectorBeat, DirectorSpec, Element, MotionSpec, Phase, PhaseRole, SceneStructure, Settings } from "@ms/contracts";
import { MotionSpecSchema, actionWords, beatKind, isAccentBeat, isHoldBeat, isProgressBeat, structureOf } from "@ms/contracts";
import { type BeatPlan, type PhaseTokens, type PlanPhase, graphSetupMin, phaseTokens, planBeats, resolveStyle } from "@ms/render";
import { CONFLICT_MIN_FRAMES, flashFrames, flashSources } from "../qa/spec-checks.js";
import { countBeat, isEmphasisRole } from "./qa-frames.js";

/** Ключи content с текстом, который зритель читает. */
const TEXT_KEY = /^(text|label|title|caption|subtitle|value|prefix|suffix|unit|note|verdict)$/i;
/** Слова действия «вызов, поток» (с формами): такие биты одной фазы стартуют веером (3–4 кадра). */
const FAN_WORD = /^(flow(s|ing)?|stream(s|ing)?|call(s|ing)?|request(s|ing)?|signal(s|ing)?|fan|pulse(s)?|pulsing)$/;

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
  /** `phases` — проверка фаз под структуру (текст уже говорит, что исправить); `schema` — spec не собрать. */
  | { ok: false; message: string; reason: "phases" | "schema" };

/**
 * Место бита в payoff: `at` — кадров от старта фазы; `until` — до кадра от старта (нет — до
 * конца фазы); `primary` — главный акцент (после передачи).
 */
interface PayoffSlot { b: AnyBeat; at: number; until?: number; primary?: boolean }

/**
 * Удар payoff: биты входят разом, но текст вывода — первым, и акцент в момент — один.
 * Неакцентные биты — каскадом по `step`, с текстом впереди. Акценты разных объектов
 * передают друг другу удар: второстепенные — по окну `window` (вход; в коротком payoff —
 * шаг), главный (с ролью акцента, иначе с текстом вывода, иначе последний) — после них и до
 * конца фазы.
 */
function payoffLayout(own: readonly AnyBeat[], hasText: (b: AnyBeat) => boolean, emphatic: (b: AnyBeat) => boolean, tok: PhaseTokens, window = tok.enter, first: (b: AnyBeat) => boolean = () => false): PayoffSlot[] {
  const accents = own.filter((b) => isAccentBeat(b));
  const primary = accents.find(emphatic) ?? accents.find(hasText) ?? accents.at(-1);
  const rest = own.filter((b) => !isAccentBeat(b));
  const slots: PayoffSlot[] = [...rest.filter(hasText), ...rest.filter((b) => !hasText(b))].map((b, k) => ({ b, at: k * tok.step }));
  const secondary = accents.filter((x) => x !== primary);
  let t = 0;
  for (const b of [...secondary.filter(first), ...secondary.filter((x) => !first(x))]) {
    slots.push({ b, at: t, until: t + window });
    t += window;
  }
  if (primary) slots.push({ b: primary, at: t, primary: true });
  return slots;
}

/** Проверки фаз под структуру: одна payoff у call-response, стороны у split-reveal. */
function structureProblems(phases: readonly Phase[], structure: SceneStructure): string[] {
  const out: string[] = [];
  if (structure === "call-response" && phases.filter((p) => p.role === "payoff").length > 1) out.push("call-response: ответ — одно событие, фаза payoff одна; вторую сделай hold или turn");
  if (structure === "split-reveal" && !phases.some((p) => p.role === "setup")) out.push("split-reveal: стороны сравнения — фазы setup (по одной на сторону), их нет");
  return out;
}

/**
 * Проверки фаз, которые Director может исправить в раунде: режим удержания и фазы под
 * структуру (`structureProblems`).
 */
function phaseProblems(spec: DirectorSpec | MotionSpec): string[] {
  const phases = spec.phases ?? [];
  const out: string[] = [];
  const hold = phases.find((p) => p.role === "hold");
  if (hold && !hold.hold_mode) out.push(`фаза ${hold.id} (hold): нужен hold_mode — чем живёт финал: steady-flow | repeat-result | data-shimmer | now-pulse | settle-push`);
  return [...out, ...structureProblems(phases, structureOf(spec))];
}

/**
 * Подходят ли фазы spec под структуру (s3afix-rereview m2: замена структуры на выбор
 * Concept — только если фазы под неё уже разложены). Пусто — подходят. Сверх
 * `structureProblems`: count-up — число в первой action, split-reveal — ≥ 2 стороны (setup),
 * cold-open и call-response — есть payoff.
 */
export function structureFit(spec: Pick<DirectorSpec, "phases" | "elements">, structure: SceneStructure): string[] {
  const phases = spec.phases ?? [];
  const out = structureProblems(phases, structure);
  if (structure === "count-up") {
    const lead = phases.find((p) => p.role === "action");
    const kinds = new Map(spec.elements.map((e) => [e.id, e.kind]));
    if (!lead || !lead.element_ids.some((id) => kinds.get(id) === "number")) out.push(`count-up: в первой фазе action${lead ? ` (${lead.id})` : ""} нет числа — счёту нечего вести`);
  }
  if (structure === "split-reveal" && phases.filter((p) => p.role === "setup").length === 1) out.push("split-reveal: одна фаза setup — сторон сравнения нужно ≥ 2");
  if ((structure === "cold-open" || structure === "call-response") && !phases.some((p) => p.role === "payoff")) out.push(`${structure}: нет фазы payoff — ${structure === "cold-open" ? "постеру итога" : "ответу"} нечего показать`);
  return out;
}

/** Узлов графа: концы рёбер (`content.edges`) и `content.nodes`, без повторов. */
function graphNodes(e: Element): number {
  const ids = new Set<string>();
  const edges = Array.isArray(e.content.edges) ? (e.content.edges as Record<string, unknown>[]) : [];
  for (const x of edges) for (const k of ["from", "to"]) if (typeof x?.[k] === "string") ids.add(x[k] as string);
  const nodes = Array.isArray(e.content.nodes) ? (e.content.nodes as unknown[]) : [];
  for (const n of nodes) {
    const id = typeof n === "string" ? n : typeof (n as Record<string, unknown> | null)?.id === "string" ? ((n as Record<string, unknown>).id as string) : undefined;
    if (id) ids.add(id);
  }
  return edges.length > 0 ? ids.size : 0;
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
 * Бит без фазы (с кадрами) не трогается. cold-open — бит-крючок итога с кадра 0.
 */
export function planSpecBeats(spec: DirectorSpec | MotionSpec, settings: Pick<Settings, "animation_intensity">): BeatPlanResult {
  const changes: string[] = [];
  const warnings: string[] = [];
  if (!spec.phases) {
    const parsed = MotionSpecSchema.safeParse(spec);
    if (!parsed.success) return { ok: false, reason: "schema", message: `spec без фаз: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    const a = alignArrivalCounters(parsed.data);
    return { ok: true, spec: a.spec, changes: a.changes, warnings };
  }
  const problems = phaseProblems(spec);
  if (problems.length) return { ok: false, reason: "phases", message: problems.join("; ") };
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
    if (p.role === "hold" && !own.some((b) => isHoldBeat(b))) {
      own = [...own, { id: freeId(taken, `${p.id}-hold`), phase: p.id, span: "phase", action: "hold", description: `удержание${p.hold_mode ? ` (${p.hold_mode})` : ""}`, element_ids: p.element_ids }];
      changes.push(`в фазе ${p.id} нет бита hold — добавлен`);
    }
    const outside = [...new Set(own.flatMap((b) => b.element_ids).filter((id) => !p.element_ids.includes(id)))];
    if (outside.length) warnings.push(`фаза ${p.id}: биты ведут элементы вне её element_ids (${outside.join(", ")})`);
    ownOf.set(p.id, own);
  }
  // раскладка удара до плана: чтение считается от входа текста вывода, а не от старта payoff
  const layouts = new Map<string, PayoffSlot[]>();
  // вспышки прихода (flash_on): акцент того же объекта принимает удар первым — вспышка
  // перетекает в него, а не спорит с акцентом другого объекта
  const flashes = flashSources({ elements: spec.elements, beats: directorBeats });
  const flashing = new Set(flashes.map((x) => x.beat));
  const flashEls = new Set(flashes.map((x) => x.element));
  /** Цели акцента — как в specChecks: элементы бита с ролью акцента, иначе все. */
  const targets = (b: AnyBeat) => {
    const marked = b.element_ids.filter((id) => isEmphasisRole(byId.get(id)?.role ?? ""));
    return marked.length > 0 ? marked : b.element_ids;
  };
  const onFlash = (b: AnyBeat) => targets(b).some((id) => flashEls.has(id));
  for (const p of phases.filter((x) => x.role === "payoff")) layouts.set(p.id, payoffLayout(ownOf.get(p.id)!, hasText, emphatic, tok, tok.enter, onFlash));

  // setup графа держится, пока рёбра не дорисованы (иначе поток action идёт по пустому месту)
  const style = resolveStyle({ preset: spec.style_preset, intensity: settings.animation_intensity, fps: spec.fps });
  const graphMin = (p: Phase) => p.role !== "setup" ? 0 : Math.max(0, ...p.element_ids.map((id) => {
    const e = byId.get(id);
    const n = e?.kind === "graph" ? graphNodes(e) : 0;
    return n > 0 ? graphSetupMin(style, n) : 0;
  }));

  const planPhases: PlanPhase[] = phases.map((p) => {
    const read = p.role === "payoff" || p.role === "hold";
    // текст hold, уже прочитанный в payoff, второй раз не считается
    const ids = p.role === "hold" ? p.element_ids.filter((id) => !payoffIds.has(id)) : p.element_ids;
    const chars = read ? charsOf(ids) : undefined;
    const lay = layouts.get(p.id);
    const delay = lay ? Math.max(0, ...lay.filter((s) => hasText(s.b)).map((s) => s.at)) : undefined;
    // главный акцент после передачи: payoff не короче его входа
    const lead = lay?.find((s) => s.primary)?.at;
    // фаза импульса со вспышкой прихода: импульсу хватает места на вход и вспышку до удара
    const flashMin = p.role !== "payoff" && p.role !== "hold" && ownOf.get(p.id)!.some((b) => flashing.has(b.id)) ? tok.enter + flashFrames(fps) - (CONFLICT_MIN_FRAMES - 1) : 0;
    const minFrames = Math.max(graphMin(p), flashMin);
    return { id: p.id, role: p.role, weight: p.weight, elements: p.element_ids.length, ...(chars !== undefined ? { chars } : {}), ...(delay ? { delay } : {}), ...(lead ? { lead } : {}), ...(minFrames ? { minFrames } : {}) };
  });
  const structure = structureOf(spec);
  const plan = planBeats({ structure, phases: planPhases, duration: D, fps, intensity: settings.animation_intensity, density: spec.elements.length, seed: `${spec.title}|${spec.purpose}` });

  const out: Beat[] = [];
  for (const b of directorBeats) {
    if (b.phase === undefined) out.push(b as Beat);
  }
  // крючок cold-open ставится после фаз: на повторном плане (чекпоинт) он не влияет на счёт
  const posters = new Set(phases.filter((p) => p.role === "payoff").map((p) => `${p.id}-open`));
  /** Первый кадр, с которого элемент на экране (по уже поставленным битам). */
  const seenAt = (id: string) => Math.min(Infinity, ...out.filter((x) => !posters.has(x.id) && x.element_ids.includes(id)).map((x) => x.start_frame));
  // вспышка прихода (flash_on) гаснет к удару: импульс до удара кончается за вспышку до
  // первого акцента другого объекта (акцент того же объекта её принимает) — данные пришли,
  // вспышка погасла, затем вывод; иначе вспышка спорит с акцентом payoff
  const otherAt = Math.min(Infinity, ...[...layouts.values()].flat().filter((x) => isAccentBeat(x.b) && !onFlash(x.b)).map((x) => x.at));
  const accentFrom = plan.strike + (Number.isFinite(otherAt) ? otherAt : D);
  const flashLen = flashFrames(fps);
  const flashCap = accentFrom - flashLen + CONFLICT_MIN_FRAMES - 1;
  const payoffEnd = Math.max(plan.strike, ...plan.beats.filter((x) => x.role === "payoff" && x.kind === "main").map((x) => x.end_frame));
  /** Вспышка прихода в кадр `e` попала бы на акцент payoff (перекрытие ≥ CONFLICT_MIN_FRAMES). */
  const flashHits = (e: number) => Math.min(e + flashLen, payoffEnd) - Math.max(e - 1, accentFrom) >= CONFLICT_MIN_FRAMES;
  // payoff и hold — после прочих фаз: удар видит, где кончились импульсы со вспышкой
  const order = [...phases.filter((x) => x.role !== "payoff" && x.role !== "hold"), ...phases.filter((x) => x.role === "payoff"), ...phases.filter((x) => x.role === "hold")];
  for (const p of order) {
    const w = plan.beats.find((x) => x.phase === p.id && x.kind === "main")!;
    // бит графа в setup с минимумом рёбер — всё окно с его начала: узлы графа входят каскадом
    // и рёбра дорисовываются к концу окна (span Director сильнее)
    const graphIds = graphMin(p) > 0 ? new Set(p.element_ids.filter((id) => byId.get(id)?.kind === "graph")) : new Set<string>();
    const pinned = ownOf.get(p.id)!.filter((b) => b.span === undefined && b.element_ids.some((id) => graphIds.has(id)));
    const own = ownOf.get(p.id)!.filter((b) => !pinned.includes(b));
    // фаза, которая идёт дальше удара (continuous-flow): старты битов — до удара, дальше
    // живут только длящиеся
    const past = p.role !== "payoff" && p.role !== "hold" && w.start_frame < plan.strike && w.end_frame > plan.strike;
    const len = (past ? plan.strike : w.end_frame) - w.start_frame;
    const step = Math.max(1, Math.min(tok.step, Math.floor(len / own.length)));
    const kind = (b: AnyBeat) => beatKind(b);
    const whole = own.map((b) => p.role === "hold" || (b.span ?? (["sustain", "count", "hold"].includes(kind(b) ?? "") ? "phase" : "slot")) === "phase");
    const fan = (k: number) => k > 0 && whole[k] === true && whole[k - 1] === true && [own[k]!, own[k - 1]!].every((b) => actionWords(b.action).some((x) => FAN_WORD.test(x)));
    const place = (b: AnyBeat, start: number, end: number) => {
      let s0 = Math.min(start, w.end_frame - 1);
      // счётчик: «от» видно не меньше 15 кадров (при 30 fps) после входа числа
      if (kind(b) === "count" && p.role !== "payoff" && p.role !== "hold") {
        const seen = Math.min(...b.element_ids.map(seenAt));
        if (Number.isFinite(seen) && seen < s0 + tok.countFrom) s0 = Math.min(Math.max(s0, seen + tok.countFrom), Math.max(s0, w.end_frame - tok.enter));
      }
      // рисование и счёт ведут к итогу: кончаются к удару, даже если фаза идёт дальше
      // (continuous-flow тянет действие до конца сцены — поток да, линия нет)
      const before = p.role !== "payoff" && p.role !== "hold";
      const cap = before && isProgressBeat(b) && s0 < plan.strike ? plan.strike : w.end_frame;
      let e = Math.max(Math.min(end, w.end_frame, cap), s0 + 1);
      // импульс со вспышкой, приход которого попал бы на удар payoff: кончается раньше (фаза
      // импульса держит минимум «вход + вспышка»; в тесной сцене полёт короче — но не короче
      // шага удара). Поток до конца сцены (continuous-flow) вспыхивает после payoff — не трогается
      if (before && flashing.has(b.id) && e > flashCap && flashHits(e) && flashCap >= s0 + tok.step) e = flashCap;
      out.push({ ...b, start_frame: s0, end_frame: e } as Beat);
    };
    for (const b of pinned) place(b, w.start_frame, w.end_frame);
    if (own.length === 0) continue;
    if (p.role === "payoff") {
      // удар разом: текст первым, акцент в момент — один (передача по окну входа); payoff
      // короче передачи с целым входом главного — второстепенные ужимаются до шага
      const L = w.end_frame - w.start_frame;
      let slots = layouts.get(p.id)!;
      const main = slots.find((s) => s.primary);
      if (main && main.at + tok.enter > L) slots = payoffLayout(own, hasText, emphatic, tok, tok.step, onFlash);
      // вспышка прихода, которую импульс не успел погасить до удара (тесная сцена): акценты
      // начинаются после неё — второстепенные делят время до главного, главный (текст вывода
      // читается от него) — на прежнем месте, если вспышка гаснет раньше
      // Хвост — только от импульсов, чей срез к удару не удался (вспышка всё ещё ложится на
      // акцент другого объекта); ждут его только акценты других объектов: акцент узла, который
      // вспыхивает, принимает вспышку на своём месте (s3afix2-rereview I1)
      const tail = Math.max(0, ...out.filter((x) => flashing.has(x.id) && x.end_frame > flashCap && flashHits(x.end_frame) && x.end_frame - 1 < w.end_frame).map((x) => x.end_frame + flashFrames(fps) - (CONFLICT_MIN_FRAMES - 1) - w.start_frame).filter((t) => t < L));
      const lead = slots.find((s) => s.primary);
      if (lead && tail > 0) {
        const movable = (s: PayoffSlot) => isAccentBeat(s.b) && !onFlash(s.b);
        const sec = slots.filter((s) => s.until !== undefined && movable(s));
        let at = movable(lead) ? Math.max(lead.at, tail) : lead.at;
        let win = sec.length > 0 ? Math.floor((at - tail) / sec.length) : 0;
        let merged = false;
        if (sec.length > 0 && win < tok.step) {
          // тесный payoff (s3afix2-rereview m1): второстепенным меньше шага — строб. Главный
          // сдвигается на `хвост + n·шаг`, если влезает с входом и чтением; иначе второстепенные
          // без своего окна — входят вместе с главным (предупреждение Director)
          const at2 = tail + sec.length * tok.step;
          const readOk = !hasText(lead.b) || w.start_frame + at2 + plan.reading <= D;
          if (movable(lead) && at2 + tok.enter <= L && readOk) {
            at = at2;
            win = tok.step;
          } else merged = true;
        }
        const moved = new Set(sec);
        slots = [
          ...slots.filter((s) => s !== lead && !moved.has(s)),
          ...sec.map((s, k) => (merged ? { ...s, at, until: undefined } : { ...s, at: tail + k * win, until: tail + (k + 1) * win })),
          { ...lead, at },
        ];
        if (merged) warnings.push(`payoff ${p.id} тесный: второстепенные акценты (${sec.map((s) => s.b.id).join(", ")}) слиты с главным ${lead.b.id} — дай payoff больше веса или убери лишние акценты`);
      }
      for (const s of slots) {
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
  // счёт фазы, что стоит в списке раньше фазы входа числа (count-up: action до setup), — тоже
  // не раньше «вход + countFrom» (S15a: смоук S14 считал с кадра 39 при входе «0» на 92)
  for (const [k, b] of out.entries()) {
    const p = phases.find((x) => x.id === b.phase);
    if (!p || p.role === "payoff" || p.role === "hold" || beatKind(b) !== "count") continue;
    // вход числа — бит входа с этим элементом, начатый внутри окна счёта (счёт сам по себе
    // показывает «от» с кадра 0, если отдельного входа нет)
    const seen = Math.min(Infinity, ...out.filter((x) => x !== b && !posters.has(x.id) && beatKind(x) === "enter" && x.start_frame > b.start_frame && x.start_frame < b.end_frame && b.element_ids.some((id) => x.element_ids.includes(id))).map((x) => x.start_frame));
    if (!Number.isFinite(seen) || seen + tok.countFrom <= b.start_frame) continue;
    const s0 = Math.min(seen + tok.countFrom, b.end_frame - tok.enter);
    if (s0 > b.start_frame) {
      out[k] = { ...b, start_frame: s0 };
      changes.push(`бит ${b.id}: счёт с кадра ${s0} — «от» видно ${tok.countFrom} кадров после входа`);
    }
  }
  // бит графа в setup короче прорисовки рёбер (span: "slot" Director или тесная сцена) —
  // рёбра не успеют, kit_misuse вернётся: предупреждение в журнал и раунд (s3afix2-rereview m3)
  for (const p of phases.filter((x) => graphMin(x) > 0)) {
    for (const b of out.filter((x) => x.phase === p.id && x.element_ids.some((id) => byId.get(id)?.kind === "graph"))) {
      const n = Math.max(0, ...b.element_ids.map((id) => (byId.get(id)?.kind === "graph" ? graphNodes(byId.get(id)!) : 0)));
      const need = n > 0 ? graphSetupMin(style, n) : 0;
      if (b.end_frame - b.start_frame < need) warnings.push(`бит ${b.id} (граф, ${n} узлов): окно ${b.end_frame - b.start_frame} кадров короче прорисовки рёбер (${need}) — span: "phase" или больше веса фазе ${p.id}`);
    }
  }
  // cold-open (S3-fix2): крючок — итог в полную силу с кадра 0, к концу бита уходит из кадра
  // целиком (не приглушается: «призрак» итога на объяснении судья читает как спойлер);
  // возвращается ударом в своей фазе (kit `<ColdOpen open strike>`)
  for (const o of plan.beats.filter((x) => x.kind === "open")) {
    const p = phases.find((x) => x.id === o.phase)!;
    const id = `${p.id}-open`;
    const prev = out.findIndex((b) => b.id === id);
    const poster: Beat = {
      id,
      start_frame: o.start_frame,
      end_frame: o.end_frame,
      action: "cold-open-hook",
      description: `крючок: итог в полную силу с кадра 0, к концу бита уходит целиком (<ColdOpen open strike>); на объяснении его нет; возвращается ударом в фазе ${p.id}`,
      element_ids: p.element_ids,
    };
    if (prev >= 0) out[prev] = { ...out[prev]!, start_frame: o.start_frame, end_frame: o.end_frame };
    else out.push(poster);
  }
  out.sort(byTime);
  // settle-push — наезд камеры: у пресета без zoom (light-clean) он молча стоит — финал
  // живёт волной от героя (s3b-review m7)
  let planPhasesOut = spec.phases;
  if (!style.camera.allow_zoom && phases.some((p) => p.hold_mode === "settle-push")) {
    planPhasesOut = phases.map((p) => (p.hold_mode === "settle-push" ? { ...p, hold_mode: "now-pulse" as const } : p));
    warnings.push(`hold_mode settle-push → now-pulse: пресет ${spec.style_preset} без наезда камеры`);
  }
  const planned = { ...spec, phases: planPhasesOut, beats: out };
  const parsed = MotionSpecSchema.safeParse(planned);
  if (!parsed.success) return { ok: false, reason: "schema", message: `план битов: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
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
