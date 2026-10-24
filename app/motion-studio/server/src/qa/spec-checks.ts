// Проверки спецификации без рендера (ТЗ §8.1–8.2): одинаковые входы, перекрытия по
// layout, safe area, наличие акцента, один акцент в момент; из дизайнер-ревью
// (motion-review-1) — нумерованные заглушки, ключевая мысль purpose на экране, повтор
// подписи кадра предыдущей сцены. `layout` элемента — доли safe area, а не кадра
// (prompts/motion-director.md §8): в кадр он переводится через safeRect настроек.
import { type Beat, type Element, type MotionSpec, type QAIssue, type SceneStructure, type Settings, isAccentBeat, phasesOf, structureOf } from "@ms/contracts";
import { arrivalInPass, pulsePass, pulseStarts, resolveStyle } from "@ms/render";
import { boundCounters } from "../pipeline/bound-counters.js";
import { isEmphasisRole } from "../pipeline/qa-frames.js";

type Layout = NonNullable<Element["layout"]>;

const UNIFORM_MIN = 3;
const UNIFORM_WARN_SHARE = 0.6;
/** Перекрытие двух элементов, доля площади кадра. */
const OVERLAP_MAX = 0.01;
/** Элемент на (почти) весь кадр — фон или атмосфера: не перекрывает и не выходит за safe area. */
const FULL_BLEED = 0.9;
const EPS = 1e-6;

const area = (l: Layout) => l.w * l.h;
const intersection = (a: Layout, b: Layout) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const contains = (a: Layout, b: Layout) => b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

export interface SpecCheckOpts {
  /**
   * Spec предыдущих сцен проекта (последние версии других сцен, новые первыми): подпись
   * кадра не повторяется. Замечание — по первой сцене с повтором.
   */
  previous?: MotionSpec | readonly MotionSpec[];
  /**
   * Структура, выбранная Concept по правилу: spec, которая ей следует, `structure_mismatch` не
   * получает (правило Concept сильнее эвристики формы), а подсказка к другой называет её.
   */
  concept?: SceneStructure;
  /**
   * Сцена сценария (S5, Р19): окно речи в кадрах. Основное действие — в `[lead; lead + speech)`,
   * финальное удержание ≥ `tail` (`speech_window`, blocking). Нет — проверки нет.
   */
  speechWindow?: { lead: number; speech: number; tail: number };
}

export function specChecks(spec: MotionSpec, settings: Settings, opts: SpecCheckOpts = {}): QAIssue[] {
  const out: Omit<QAIssue, "source">[] = [];

  // одинаковые входы (ТЗ §8.2): none — не вход
  const entering = spec.elements.filter((e) => e.entrance !== "none");
  if (entering.length >= UNIFORM_MIN) {
    const counts = new Map<string, string[]>();
    for (const e of entering) counts.set(e.entrance, [...(counts.get(e.entrance) ?? []), e.id]);
    const [kind, ids] = [...counts].sort((a, b) => b[1].length - a[1].length)[0]!;
    const share = ids.length / entering.length;
    if (share === 1 || share > UNIFORM_WARN_SHARE) {
      out.push({
        code: "uniform_entrance", severity: share === 1 ? "blocking" : "warning", area: ids.join(", "),
        description: share === 1
          ? `все ${ids.length} элементов входят одинаково (${kind})`
          : `${ids.length} из ${entering.length} элементов входят одинаково (${kind})`,
        fix_hint: "разные объекты — разные входы: заголовок rise/mask, число count, график draw, карточки scale/pop, подписи fade",
      });
    }
  }

  // layout → доли кадра: x_кадра = поле + x × ширина safe area
  const sx = settings.safe_area.x;
  const sy = settings.safe_area.y;
  const toFrame = (l: Layout): Layout => ({ x: sx + l.x * (1 - 2 * sx), y: sy + l.y * (1 - 2 * sy), w: l.w * (1 - 2 * sx), h: l.h * (1 - 2 * sy) });
  const placed = spec.elements
    .filter((e): e is Element & { layout: Layout } => e.layout !== undefined && e.kind !== "group" && area(e.layout) < FULL_BLEED)
    .map((e) => ({ ...e, frame: toFrame(e.layout) }));

  // перекрытия одного слоя глубины; вложенный элемент (подпись в карточке) не перекрытие
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i]!, placed[j]!];
      if ((a.depth_layer ?? 1) !== (b.depth_layer ?? 1)) continue;
      if (contains(a.layout, b.layout) || contains(b.layout, a.layout)) continue;
      const inter = intersection(a.frame, b.frame);
      if (inter > OVERLAP_MAX) {
        out.push({
          code: "overlap", severity: "blocking", area: `${a.id}, ${b.id}`,
          description: `layout ${a.id} и ${b.id} пересекаются на ${pct(inter)} кадра`,
          fix_hint: `разведи layout ${a.id} и ${b.id} (доли safe area) по сетке или вложи одно в другое явно; один слой — без наложений`,
        });
      }
    }
  }

  // layout — доли safe area: за неё выходит только layout с x + w > 1 или y + h > 1
  // (Zod-схема spec такое отклоняет; проверка — для spec, собранных в обход схемы)
  for (const e of placed) {
    const l = e.layout;
    if (l.x < -EPS || l.y < -EPS || l.x + l.w > 1 + EPS || l.y + l.h > 1 + EPS) {
      out.push({
        code: "outside_safe_area", severity: "warning", area: e.id,
        description: `layout ${e.id} выходит за безопасную зону: x + w = ${(l.x + l.w).toFixed(2)}, y + h = ${(l.y + l.h).toFixed(2)} (доли safe area)`,
        fix_hint: `layout — доли safe area от 0 до 1: x + w ≤ 1 и y + h ≤ 1 для ${e.id}`,
      });
    }
  }

  // счётчик за головой линии: бит счёта — окно головы (пайплайн нормализует после Director)
  for (const c of boundCounters(spec)) {
    const b = spec.beats.find((x) => x.id === c.beat)!;
    if (b.start_frame !== c.startFrame || b.end_frame !== c.endFrame) {
      out.push({
        code: "bound_counter_timing", severity: "warning", area: c.number,
        description: `бит счёта ${b.id} (${b.start_frame}–${b.end_frame}) не совпадает с окном головы ${c.chart} (${c.startFrame}–${c.endFrame})`,
        fix_hint: `значение ${c.number} — lineChartHead(...).value; бит ${b.id} — ${c.startFrame}–${c.endFrame}`,
      });
    }
  }

  if (opts.speechWindow) out.push(...speechWindowIssues(spec, opts.speechWindow));
  out.push(...beatReferenceIssues(spec));
  out.push(...accentConflicts(spec, settings));
  out.push(...structureMismatch(spec, opts.concept));
  out.push(...placeholderIssues(spec));
  out.push(...purposeClaimIssues(spec));
  for (const prev of [opts.previous ?? []].flat()) {
    const repeat = signatureRepeat(spec, prev);
    if (repeat.length === 0) continue;
    out.push(...repeat);
    break;
  }

  if (!spec.elements.some((e) => isEmphasisRole(e.role)) && !spec.beats.some((b) => isAccentBeat(b))) {
    out.push({
      code: "no_emphasis", severity: "warning",
      description: "в сцене нет акцента: ни элемента role = emphasis, ни бита emphasis/accent",
      fix_hint: "добавь главный акцент: бит emphasis на ключевом элементе (подсветка, пульс, итоговая плашка)",
    });
  }
  return out.map((i) => ({ source: "programmatic", ...i }));
}

/**
 * Окно речи сцены сценария (S5, Р19): фазы `action`/`turn`/`payoff` начинаются не раньше
 * `lead` (первые кадры — фон и мягкий вход, их обрежут в монтаже); фаза `hold` начинается не
 * позже `total − tail` и длится ≥ `tail`. Окно фазы — от первого до последнего кадра её битов;
 * spec без фаз — фазы по битам (`phasesOf`: вход до первого действия — setup).
 */
function speechWindowIssues(spec: MotionSpec, w: { lead: number; speech: number; tail: number }): Omit<QAIssue, "source">[] {
  const total = spec.duration_frames;
  const fix_hint = `основное действие — в окне речи [lead; lead+speech), первые lead кадров — фон и мягкий вход, удержание ≥ tail: окно [${w.lead}; ${w.lead + w.speech}), удержание ≥ ${w.tail} кадров до ${total}`;
  const issue = (area: string, description: string) => ({ code: "speech_window", severity: "blocking" as const, area, description, fix_hint });
  const phases = phasesOf(spec);
  const windowOf = (id: string): [number, number] | undefined => {
    const own = spec.phases ? spec.beats.filter((b) => b.phase === id) : spec.beats.filter((b) => b.id === id);
    return own.length > 0 ? [Math.min(...own.map((b) => b.start_frame)), Math.max(...own.map((b) => b.end_frame))] : undefined;
  };
  const out: Omit<QAIssue, "source">[] = [];
  for (const p of phases) {
    if (p.role !== "action" && p.role !== "turn" && p.role !== "payoff") continue;
    const win = windowOf(p.id);
    if (win && win[0] < w.lead) out.push(issue(p.id, `${p.role} ${p.id} начинается на кадре ${win[0]} — раньше окна речи (${w.lead})`));
  }
  const holds = phases.filter((p) => p.role === "hold").map((p) => ({ p, win: windowOf(p.id) })).filter((x) => x.win !== undefined);
  if (holds.length === 0) {
    out.push(issue("hold", `нет фазы hold: финальное удержание ≥ ${w.tail} кадров не задано`));
  } else {
    const last = holds.reduce((a, x) => (x.win![1] > a.win![1] ? x : a));
    const [s, e] = last.win!;
    if (s > total - w.tail || e - s < w.tail) {
      out.push(issue(last.p.id, `hold ${last.p.id} [${s}; ${e}) — нужно начало не позже ${total - w.tail} и длина ≥ ${w.tail} кадров`));
    }
  }
  return out;
}

/**
 * Форма spec расходится со структурой (S3a-fix): подсказка Director, не blocking — вкус не
 * стоит раунда. Две независимые стороны в setup — похоже на split-reveal; поток `back` —
 * на call-response (если Director не объяснил выбор в `structure_reason`); count-up без
 * числа в ведущей action — число не ведёт. Spec по структуре Concept — без подсказки
 * (s3afix-rereview m3): Concept выбрал её по правилу, эвристика формы ему не спорщик.
 */
function structureMismatch(spec: MotionSpec, concept?: SceneStructure): Omit<QAIssue, "source">[] {
  const phases = spec.phases;
  if (!phases) return [];
  const structure = structureOf(spec);
  if (concept !== undefined && structure === concept) return [];
  const reasoned = spec.composition?.structure_reason !== undefined;
  const out: Omit<QAIssue, "source">[] = [];
  const by = concept !== undefined ? `; Concept выбрал ${concept} — вернись к ней или объясни в structure_reason` : "";
  const warn = (area: string, description: string, fix_hint: string) => out.push({ code: "structure_mismatch", severity: "warning", area, description, fix_hint: `${fix_hint}${by}` });
  const setups = phases.filter((p) => p.role === "setup");
  const disjoint = setups.length >= 2 && setups.every((a, i) => setups.every((b, j) => i === j || !a.element_ids.some((id) => b.element_ids.includes(id))));
  if (structure !== "split-reveal" && disjoint && !reasoned) {
    warn(setups.map((p) => p.id).join(", "), `${structure}: ${setups.length} фазы setup с разными элементами — две независимые стороны`,
      "если это сравнение сторон — structure: split-reveal (стороны входят параллельно, вердикт растёт); иначе одна фаза setup или structure_reason");
  }
  const back = spec.elements.some((e) => Array.isArray(e.content.flows) && (e.content.flows as unknown[]).some((f) => (f as Record<string, unknown> | null)?.direction === "back"));
  if (structure !== "call-response" && back && !reasoned) {
    warn("flows", `${structure}: в графе поток back — данные возвращаются, это запрос и ответ`,
      "если сцена про запрос и ответ — structure: call-response (пауза перед ответом, ответ — событие); иначе structure_reason");
  }
  if (structure === "count-up") {
    const lead = phases.find((p) => p.role === "action");
    const kinds = new Map(spec.elements.map((e) => [e.id, e.kind]));
    if (lead && !lead.element_ids.some((id) => kinds.get(id) === "number")) {
      warn(lead.id, `count-up: в ведущей фазе ${lead.id} нет числа — число не ведёт`, `положи число (kind: number) в фазу ${lead.id} или выбери структуру по правилу Concept`);
    }
  }
  return out;
}

/** Вспышка узла FlowGraph (nodeFlash): удар за кадр до прихода, гаснет за ~22 кадра при 30 fps. */
export const FLASH_FRAMES_30 = 22;
/** Перекрытие короче — касание при передаче акцента, не конфликт. */
export const CONFLICT_MIN_FRAMES = 3;
/** Длина вспышки прихода в кадрах при fps сцены. */
export const flashFrames = (fps: number) => Math.round((FLASH_FRAMES_30 * fps) / 30);

type BeatLike = Pick<Beat, "id" | "action" | "element_ids"> & { kind?: Beat["kind"] };

/**
 * Вспышки прихода (`content.flash_on`): элемент и бит импульса, по концу которого он
 * вспыхивает — id бита в flash_on или единственный бит импульса этого элемента (без id
 * бита blocking не ставится наугад). Один расчёт для specChecks и планировщика (потолок
 * конца импульса перед ударом).
 */
export function flashSources(spec: { elements: readonly Element[]; beats: readonly BeatLike[] }): { element: string; beat: string }[] {
  const out: { element: string; beat: string }[] = [];
  for (const e of spec.elements) {
    const raw = (e.content as Record<string, unknown> | undefined)?.flash_on;
    const refs = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((x): x is string => typeof x === "string");
    for (const ref of refs) {
      const named = spec.beats.filter((b) => new RegExp(`(^|[^\\w-])${escapeRe(b.id)}($|[^\\w-])`).test(ref));
      const pulses = spec.beats.filter((b) => b.element_ids.includes(e.id) && isPulse(b));
      for (const b of named.length > 0 ? named : pulses.length === 1 ? pulses : []) out.push({ element: e.id, beat: b.id });
    }
  }
  return out;
}
/** Бит импульса по ребру: по нему считается кадр прихода, если в flash_on нет id бита. */
const PULSE_ACTION = /pulse|flow|signal|импульс|поток/i;
/** Установившийся поток удержания — фон системы в работе, а не событие. */
const STEADY_ACTION = /hold|loop|steady|idle|ambient|удержан|фон/i;
/**
 * Вход или прорисовка («flowgraph-in», «graph-draw», «labels-entrance»): данные ещё не летят.
 * Слова действия — через `-`, `_`, пробел; «in» — только последним словом («check-in-flow» —
 * поток, а не вход).
 */
function isEntranceAction(action: string): boolean {
  const words = action.toLowerCase().split(/[^a-zа-яё0-9]+/).filter(Boolean);
  if (words.at(-1) === "in") return true;
  return words.some((w) => w === "entrance" || w === "enter" || w === "draw" || /^(вход(?!ящ)|появ|прорис)/.test(w));
}
const isPulse = (b: Pick<Beat, "action">) => PULSE_ACTION.test(b.action) && !isEntranceAction(b.action);

interface AccentWindow { id: string; from: number; to: number; what: string; source: Beat }

/**
 * Один акцент в момент (prompts/motion-director.md §6): вспышка узла по приходу импульса
 * (`content.flash_on`) и бит акцента (`emphasis`/`accent` в action) другого объекта или два
 * бита акцента разных объектов перекрываются по кадрам — blocking: Director разводит их.
 * Удар акцента посреди полёта импульса — blocking, только если доказуемо, что импульс летит в
 * сам объект акцента и ещё не пришёл («итог приходит раньше данных»); удар по другому объекту
 * во время полёта или приход, который не вычислить, — warning.
 */
function accentConflicts(spec: MotionSpec, settings: Settings): Omit<QAIssue, "source">[] {
  const fps = spec.fps.num / spec.fps.den;
  const flashLen = flashFrames(fps);
  const byId = new Map(spec.elements.map((e) => [e.id, e]));

  // акценты битов: цели — элементы бита с ролью акцента, иначе все элементы бита
  const emph = spec.beats
    .filter((b) => isAccentBeat(b))
    .map((b) => {
      const marked = b.element_ids.filter((id) => isEmphasisRole(byId.get(id)?.role ?? ""));
      return { beat: b, ids: marked.length > 0 ? marked : b.element_ids };
    });

  // вспышки: кадр прихода — конец бита импульса (id бита в flash_on или единственный бит узла с импульсом)
  const flashes: AccentWindow[] = flashSources(spec).map(({ element, beat }) => {
    const b = spec.beats.find((x) => x.id === beat)!;
    return { id: element, from: b.end_frame - 1, to: b.end_frame + flashLen, source: b, what: `вспышка ${element} (приход импульса бита ${b.id}, кадры ${b.end_frame - 1}–${b.end_frame + flashLen})` };
  });

  const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.min(a.to, b.to) - Math.max(a.from, b.from);
  const out: Omit<QAIssue, "source">[] = [];
  // spec с фазами: кадры ставит планировщик — подсказка Director про фазы, а не про кадры
  const phased = spec.beats.some((b) => b.phase !== undefined);
  const phaseOf = (b: Beat) => b.phase ?? b.id;
  for (const f of flashes) {
    for (const { beat: b, ids } of emph) {
      if (ids.includes(f.id) || overlap(f, { from: b.start_frame, to: b.end_frame }) < CONFLICT_MIN_FRAMES) continue;
      out.push({
        code: "accent_conflict", severity: "blocking", area: `${f.id}, ${ids.join(", ")}`,
        description: `${f.what} и акцент ${ids.join(", ")} (бит ${b.id}, кадры ${b.start_frame}–${b.end_frame}) светятся одновременно: два акцента в один момент`,
        fix_hint: !phased
          ? `один акцент в момент: если приход импульса отмечает сам ${ids.join(", ")} — убери flash_on у ${f.id}; иначе начни бит ${b.id} не раньше кадра ${f.to}, когда вспышка погаснет`
          : b.start_frame >= f.source.end_frame - 1
            // акцент уже после импульса (в следующей фазе): переносить некуда
            ? `один акцент в момент: если приход импульса отмечает сам ${ids.join(", ")} — убери flash_on у ${f.id}; иначе пусть импульс ${f.source.id} кончится раньше — span: "slot" или фаза импульса с меньшим весом`
            : `один акцент в момент: если приход импульса отмечает сам ${ids.join(", ")} — убери flash_on у ${f.id}; иначе перенеси бит ${b.id} в фазу после той, где идёт импульс`,
      });
    }
  }
  // удар акцента посреди полёта импульса (не вход графа, не поток удержания)
  const same = sameObject(spec);
  for (const p of spec.beats.filter((b) => isPulse(b) && !STEADY_ACTION.test(b.action))) {
    const dest = pulseTargets(spec, settings, p);
    for (const { beat: b, ids } of emph) {
      if (b.id === p.id) continue;
      const strike = b.start_frame;
      if (!(strike > p.start_frame && strike < p.end_frame - CONFLICT_MIN_FRAMES)) continue;
      const matched = [...dest].filter(([d]) => ids.some((id) => same(id, d)));
      if (matched.length === 0) {
        if (!ids.some((id) => p.element_ids.includes(id))) {
          out.push({
            code: "accent_conflict", severity: "warning", area: `${p.id}, ${ids.join(", ")}`,
            description: `акцент ${ids.join(", ")} (бит ${b.id}) бьёт в кадр ${strike}, пока импульс бита ${p.id} летит к другому объекту (${p.start_frame}–${p.end_frame}): свет импульса и удар акцента могут спорить за взгляд`,
            fix_hint: `если удар — итог этого импульса, начни бит ${b.id} в кадр прихода ${p.end_frame}; если события независимы — оставь`,
          });
        }
        continue;
      }
      const hit = ids.filter((id) => matched.some(([d]) => same(id, d)));
      const known = matched.map(([, a]) => a).filter((a): a is number => a !== undefined);
      const arrival = known.length > 0 ? Math.min(...known) : undefined;
      // данные уже пришли (первый приход не позже удара) — итог не опережает их
      // допуск CONFLICT_MIN_FRAMES и у точного расписания kit: длина ребра — зазор карточек, а не
      // путь FlowGraph, и ребро ещё дорисовывается (ready) — удар на 1–3 кадра раньше не доказан
      if (arrival !== undefined && strike >= arrival - CONFLICT_MIN_FRAMES) continue;
      if (arrival === undefined) {
        out.push({
          code: "accent_conflict", severity: "warning", area: `${p.id}, ${hit.join(", ")}`,
          description: `акцент ${hit.join(", ")} (бит ${b.id}) бьёт в кадр ${strike}, пока поток бита ${p.id} (${p.start_frame}–${p.end_frame}) идёт к нему; кадр первого прихода не вычислить (нет travel и раскладки узлов)`,
          fix_hint: `итог — не раньше первого прихода: задай travel потока или начни бит ${b.id} позже`,
        });
        continue;
      }
      out.push({
        code: "accent_conflict", severity: "blocking", area: `${p.id}, ${hit.join(", ")}`,
        description: `акцент ${hit.join(", ")} (бит ${b.id}) бьёт в кадр ${strike}, пока импульс бита ${p.id} ещё летит к нему (${p.start_frame}–${p.end_frame}, приход ~${Math.round(arrival)}): итог приходит раньше данных`,
        fix_hint: phased
          ? `итог приходит вместе с данными: бит ${b.id} — в фазе после фазы ${phaseOf(p)} (импульса ${p.id}), или импульс короче — span: "slot"`
          : `итог приходит вместе с данными: начни бит ${b.id} в кадр прихода импульса — ${Math.ceil(arrival)}${arrival === p.end_frame ? ` (конец бита ${p.id})` : ""}, или заверши импульс раньше`,
      });
    }
  }
  for (let i = 0; i < emph.length; i++) {
    for (let j = i + 1; j < emph.length; j++) {
      const [a, b] = [emph[i]!, emph[j]!];
      if (a.ids.some((id) => b.ids.includes(id))) continue;
      if (overlap({ from: a.beat.start_frame, to: a.beat.end_frame }, { from: b.beat.start_frame, to: b.beat.end_frame }) < CONFLICT_MIN_FRAMES) continue;
      out.push({
        code: "accent_conflict", severity: "blocking", area: `${a.ids.join(", ")}, ${b.ids.join(", ")}`,
        description: `биты акцентов ${a.beat.id} (${a.ids.join(", ")}, ${a.beat.start_frame}–${a.beat.end_frame}) и ${b.beat.id} (${b.ids.join(", ")}, ${b.beat.start_frame}–${b.beat.end_frame}) перекрываются: два акцента в один момент`,
        fix_hint: phased
          ? `один акцент в момент: фазы ${phaseOf(a.beat)} и ${phaseOf(b.beat)} идут одновременно — перенеси бит ${b.beat.id} в фазу, которая идёт после, или сделай его не акцентом (kind: "enter"); в одной payoff планировщик сам передаёт акцент`
          : `передача акцента: бит ${a.beat.id} кончается до старта ${b.beat.id}, у прежнего акцента loop: false`,
      });
    }
  }
  return out;
}

/**
 * Висячие биты (Fix F, прогон 3): поток ссылается на бит, которого нет в `beats`, или
 * элемент не стоит ни в одном бите. Тогда Engineer гадает тайминг, а QA не выбирает кадры
 * элемента и не находит его — сцена падает на приёмке уже после рендера. Исправить может
 * только Director: blocking.
 */
function beatReferenceIssues(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const out: Omit<QAIssue, "source">[] = [];
  const ids = spec.beats.map((b) => b.id);
  for (const e of spec.elements) {
    const flows = (e.content as Record<string, unknown> | undefined)?.flows;
    if (!Array.isArray(flows)) continue;
    const lost = [...new Set(flows.map((f) => (f as Record<string, unknown> | null)?.beat).filter((r): r is string => typeof r === "string" && !ids.some((id) => beatRef(r, id))))];
    if (lost.length === 0) continue;
    out.push({
      code: "beat_reference", severity: "blocking", area: e.id,
      description: `потоки ${e.id} ссылаются на биты, которых нет в beats: ${lost.join(", ")}`,
      fix_hint: `добавь биты ${lost.join(", ")} в beats (с кадрами и element_ids) или сошлись на существующие: ${ids.join(", ")}`,
    });
  }
  const inBeat = new Set(spec.beats.flatMap((b) => b.element_ids));
  // вложенный элемент (подпись в карточке узла) входит вместе с родителем из бита
  const parents = spec.elements.filter((p) => inBeat.has(p.id) && p.layout && p.kind !== "group" && area(p.layout) < FULL_BLEED);
  for (const e of spec.elements) {
    if (inBeat.has(e.id)) continue;
    if (e.layout && parents.some((p) => contains(p.layout!, e.layout!))) continue;
    out.push({
      code: "beat_reference", severity: "blocking", area: e.id,
      description: `элемент ${e.id} не стоит ни в одном бите: его вход и кадры проверки не определены`,
      fix_hint: `поставь ${e.id} в element_ids бита, где он входит или действует`,
    });
  }
  return out;
}

/** Ссылка на бит в content (`flows[].beat`): id бита с префиксом `b-` или без. */
const beatRef = (ref: unknown, id: string) => typeof ref === "string" && (ref === id || ref.replace(/^b[-_]/, "") === id.replace(/^b[-_]/, ""));

/** Длина ребра для kit: зазор между прямоугольниками узлов в px кадра (layout — доли safe area). */
function edgeLength(spec: MotionSpec, settings: Settings, edge: Record<string, unknown>): number | undefined {
  const lay = (id: unknown) => (typeof id === "string" ? spec.elements.find((e) => e.id === id)?.layout : undefined);
  const [a, b] = [lay(edge.from), lay(edge.to)];
  if (!a || !b) return undefined;
  const W = settings.width * (1 - 2 * settings.safe_area.x);
  const H = settings.height * (1 - 2 * settings.safe_area.y);
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)) * W;
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)) * H;
  return Math.hypot(dx, dy);
}

/**
 * Кадр первого прихода потока бита `p` по ребру — расписание kit (choreo/pulse-timing.ts,
 * те же pulsePass / pulseStarts / arrivalInPass, что у PulseAlongPath): проход — `travel`
 * или длина ребра со скоростью и интенсивностью стиля сцены; `repeat` по умолчанию true, как
 * в kit. Длина ребра неизвестна (нет раскладки узлов): при `travel` — верхняя граница
 * старт + travel; одиночный импульс (`repeat: false`) без travel идёт весь бит — конец бита;
 * иначе `undefined`: доказать, что данные не пришли, нельзя.
 */
function flowArrival(spec: MotionSpec, settings: Settings, p: Beat, f: Record<string, unknown>, edge: Record<string, unknown>): number | undefined {
  const t = Number(f.travel);
  const travel = Number.isFinite(t) && t > 0 ? t : undefined;
  const len = edgeLength(spec, settings, edge);
  if (len === undefined && travel === undefined) return f.repeat === false ? p.end_frame : undefined;
  const style = resolveStyle({ preset: spec.style_preset, intensity: settings.animation_intensity, fps: spec.fps });
  const pass = pulsePass(len ?? 0, travel, spec.fps.num / spec.fps.den, style);
  const count = Number(f.count);
  const [t0] = pulseStarts({ start: p.start_frame, end: p.end_frame, pass, count: Number.isFinite(count) ? count : undefined, repeat: f.repeat === false ? false : undefined });
  if (t0 === undefined) return undefined;
  return arrivalInPass(t0, pass, len ?? Infinity);
}

/**
 * Куда летит импульс бита и когда приходит: узлы прихода `flows` графа, привязанных к биту
 * (`to`, у обратного — `from`), и счётчики, привязанные к приходам такого графа
 * (`bound_to: "<граф>.arrivals…"`, первый приход любого его потока). Без flows бита назначения
 * не угадываются по element_ids: там и источник, и сам импульс, и счётчик.
 */
function pulseTargets(spec: MotionSpec, settings: Settings, p: Beat): Map<string, number | undefined> {
  // кадр прихода — самый ранний из известных; неизвестный не затирает известный
  const put = (m: Map<string, number | undefined>, id: string, at: number | undefined) => {
    const prev = m.get(id);
    m.set(id, prev === undefined ? at : at === undefined ? prev : Math.min(prev, at));
  };
  const out = new Map<string, number | undefined>();
  const graphs = new Map<string, number | undefined>();
  for (const e of spec.elements) {
    const c = (e.content ?? {}) as Record<string, unknown>;
    const edges = Array.isArray(c.edges) ? (c.edges as Record<string, unknown>[]) : [];
    const flows = Array.isArray(c.flows) ? (c.flows as Record<string, unknown>[]).filter((f) => beatRef(f?.beat, p.id)) : [];
    for (const f of flows) {
      const edge = edges.find((x) => x?.id === f.edge);
      if (!edge) continue;
      const at = flowArrival(spec, settings, p, f, edge);
      const back = /back|reverse|обрат/i.test(String(f.direction ?? "")) || f.reverse === true;
      const node = back ? edge.from : edge.to;
      if (typeof node === "string") put(out, node, at);
      put(graphs, e.id, at);
    }
  }
  for (const e of spec.elements) {
    const bound = (e.content as Record<string, unknown> | undefined)?.bound_to;
    if (typeof bound !== "string") continue;
    for (const [g, at] of graphs) if (bound.startsWith(`${g}.arrivals`)) put(out, e.id, at);
  }
  return out;
}

/**
 * Один объект: тот же id или вложенный layout (подпись в карточке узла, счётчик на узле).
 * Контейнер (`group`) — не объект: подпись внутри дорожки не становится её узлом.
 */
function sameObject(spec: MotionSpec): (a: string, b: string) => boolean {
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  return (a, b) => {
    if (a === b) return true;
    const [ea, eb] = [byId.get(a), byId.get(b)];
    if (!ea?.layout || !eb?.layout || ea.kind === "group" || eb.kind === "group") return false;
    const [la, lb] = [ea.layout, eb.layout];
    if (area(la) >= FULL_BLEED || area(lb) >= FULL_BLEED) return false;
    return contains(la, lb) || contains(lb, la);
  };
}

/**
 * Строки content с ключами по фильтру; массивы строк — под ключами-списками подписей.
 * Ключи `skip` не обходятся вовсе (данные графика: точки, оси, ряды).
 */
function contentStrings(content: unknown, key: RegExp, skip?: RegExp): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const walk = (v: unknown, k: string) => {
    if (typeof v === "string") {
      if (key.test(k)) out.push({ key: k, value: v });
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, typeof x === "string" && LIST_KEY.test(k) ? "text" : k);
    } else if (v && typeof v === "object") {
      for (const [kk, x] of Object.entries(v)) if (!skip?.test(kk)) walk(x, kk);
    }
  };
  walk(content, "");
  return out;
}
/** Ключи-списки подписей (`stages: ["Сборка", …]`); списки id (`nodes`, `edges`) не подписи. */
const LIST_KEY = /^(stages|steps|items|labels|options|lines|words|milestones|events|phases)$/i;
/** Видимое имя объекта. caption не входит: «инструмент 1» под «Веб-поиск» — роль, не заглушка. */
const LABEL_KEY = /^(label|text|title|name|heading|headline)$/i;
/** Данные графика: подписи точек и делений осей («Step 1000», «Q1») — значения, не имена. */
const CHART_DATA_KEY = /^(points|data|series|values|datasets|axis|axes|x_?axis|y_?axis|ticks|x_?labels|y_?labels|categories|legend|bars|rows)$/i;

/**
 * Нумерованная заглушка вместо конкретного экземпляра («Инструмент 1», motion-review-1 §1):
 * весь текст подписи — родовое слово и номер. Доменная нумерация (Node, Item, Step, Stage,
 * Шаг, Этап, Модуль) — законная подпись (реплики Raft, шаги туториала): не ловится.
 */
const PLACEHOLDER = /^(инструмент|сервис|элемент|объект|компонент|tool|service|element|object|component|placeholder)\s*[№#]?\s*\d+$/i;

/** Ruling P10: эвристика по тексту — подсказка Director (warning), не blocking. */
function placeholderIssues(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const hits = spec.elements.flatMap((e) => contentStrings(e.content, LABEL_KEY, CHART_DATA_KEY).filter((x) => PLACEHOLDER.test(x.value.trim())).map((x) => ({ id: e.id, text: x.value.trim() })));
  if (hits.length === 0) return [];
  return [{
    code: "placeholder_label", severity: "warning", area: [...new Set(hits.map((h) => h.id))].join(", "),
    description: `похоже на нумерованные заглушки вместо конкретных экземпляров: ${hits.map((h) => `«${h.text}» (${h.id})`).join(", ")}`,
    fix_hint: "если запрос назвал количество без имён — дай правдоподобные конкретные экземпляры с ролями (Веб-поиск · search(), База знаний · retrieve(), Калькулятор · calc()); номер оставь, только если экземпляры и правда неотличимы",
  }];
}

/** Число: «24», «1,5», «1.5». */
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const num = (v: string) => Number(v.replace(",", "."));
/** Наречия кратности: «вдвое», «втрое» … */
const ADVERB: Record<string, number> = { вдвое: 2, втрое: 3, вчетверо: 4, впятеро: 5, вшестеро: 6, всемеро: 7, ввосьмеро: 8, вдевятеро: 9, вдесятеро: 10 };
/** Числительные в «в десять раз», «в полтора раза». */
const NUM_WORD: Record<string, number> = { полтора: 1.5, полторы: 1.5, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, двадцать: 20, сто: 100, тысячу: 1000 };
const NOT_WORD = String.raw`(?![\p{L}\p{N}])`;
/**
 * Кратность в тексте, по границам слов. ×N и N× — без числа по другую сторону знака («2×2»,
 * «4×100 м» — размер); латинская или кириллическая x (и заглавные X, Х) — только вплотную к числу и отдельным
 * словом («10x», «x10»; «Linux 6», «последних 5» — нет); «в N раз(а)» — не «в 3 разных».
 */
const MULT: RegExp[] = [
  new RegExp(String.raw`(?<![\p{N}]\s?)×\s?${NUM}(?!\s?[×\p{N}])`, "gu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])[xхXХ]${NUM}${NOT_WORD}`, "gu"),
  new RegExp(String.raw`(?<![\p{N}.,×]\s?)${NUM}\s?×(?!\s?\p{N})`, "gu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}.,])${NUM}[xхXХ]${NOT_WORD}`, "gu"),
  new RegExp(String.raw`(?<!\p{L})в\s+${NUM}\s*раза?${NOT_WORD}`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}.,])${NUM}[-\s]?кратн`, "giu"),
];
/** Только на экране: «10 раз быстрее», «10 times faster» — без «в», в purpose это не кратность («3 раза в день»). */
const MULT_BARE: RegExp[] = [
  new RegExp(String.raw`(?<![\p{L}\p{N}.,])${NUM}\s*раза?${NOT_WORD}`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}.,])${NUM}\s+times${NOT_WORD}`, "giu"),
];
const ADVERB_RE = new RegExp(String.raw`(?<!\p{L})(${Object.keys(ADVERB).join("|")})${NOT_WORD}`, "giu");
const NUM_WORD_RE = new RegExp(String.raw`(?<!\p{L})в\s+(${Object.keys(NUM_WORD).join("|")})\s+раза?${NOT_WORD}`, "giu");

/** Кратности в тексте (> 1); `bare` — ещё «N раз» без «в» (так пишут подпись на экране). */
function multipliers(text: string, bare = false): number[] {
  const out: number[] = [];
  for (const re of bare ? [...MULT, ...MULT_BARE] : MULT) for (const m of text.matchAll(re)) out.push(num(m[1]!));
  for (const m of text.matchAll(ADVERB_RE)) out.push(ADVERB[m[1]!.toLowerCase()]!);
  for (const m of text.matchAll(NUM_WORD_RE)) out.push(NUM_WORD[m[1]!.toLowerCase()]!);
  return out.filter((n) => Number.isFinite(n) && n > 1);
}

/**
 * Ключевая мысль на экране (motion-review-1 §10): явная кратность из purpose («в 100 раз»,
 * «×24», «втрое») видна текстом — в любой строке content, в склейке prefix + to + suffix
 * числа или приставкой × у числа с to = N. Качественное «в разы» без числа не проверяется.
 * Ruling P10: эвристика по тексту — warning.
 */
function purposeClaimIssues(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const claims = [...new Set(multipliers(spec.purpose))];
  if (claims.length === 0) return [];
  const shown = (n: number) => spec.elements.some((e) => {
    const c = (e.content ?? {}) as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    if (typeof c.to === "number") {
      if (c.to === n && [c.prefix, c.suffix].some((x) => typeof x === "string" && /[×xх]/.test(x))) return true;
      if (multipliers(`${str(c.prefix)}${c.to}${str(c.suffix)}`, true).includes(n)) return true;
    }
    return contentStrings(c, /.*/).some((x) => multipliers(x.value, true).includes(n));
  });
  const missing = claims.filter((n) => !shown(n));
  if (missing.length === 0) return [];
  return [{
    code: "purpose_claim", severity: "warning", area: "purpose",
    description: `ключевая мысль purpose («${missing.map((n) => `×${n}`).join("», «")}») не видна на экране: ни подписи с кратностью, ни числа с приставкой ×`,
    fix_hint: `покажи итог как утверждение: подпись или кикер «×${missing[0]}» / «в ${missing[0]} раз» рядом с героем (AnimatedNumber prefix="×" to={${missing[0]}} или текст)`,
  }];
}

/** Подпись кадра сцены (motion-review-1 §10): фон, акцент-таблетка, полоса заголовка, камера. */
export interface SceneSignature { background: string; pill: boolean; topTitle: boolean; staticCamera: boolean }

/** Фон kit по умолчанию (`<Background>` без variant и seed). */
const BG_DEFAULT = { variant: "aurora", seed: "bg" };
const BG_VARIANT = /\b(aurora|grid|solid|gradient|mesh|dots|spotlight|noise)\b/i;

/** Зона фокуса фона: сетка 3×3 кадра — близкие фокусы одной зоны дают одну карту света. */
const focusZone = (f: { x: number; y: number }) => `${Math.min(2, Math.floor(f.x * 3))}${Math.min(2, Math.floor(f.y * 3))}`;

export function sceneSignature(spec: MotionSpec): SceneSignature {
  const all = spec.elements.flatMap((e) => contentStrings(e.content, /.*/));
  const pill = all.some((x) => /\bpill\b|пилюл|таблетк/i.test(x.value));
  const staticCamera = (spec.camera?.length ?? 0) === 0;
  const topStrip = spec.elements.some((e) => e.kind === "text" && e.layout !== undefined && e.layout.y <= 0.1 && e.layout.h <= 0.15 && e.layout.w >= 0.3);
  const titleMode = spec.composition?.title_mode;
  const topTitle = titleMode === undefined ? topStrip : titleMode === "strip";
  // фон из composition (0.3): seed — id сцены у каждой своей, поэтому шаблон — вариант и фокус
  const bg = spec.composition?.background;
  if (bg?.variant !== undefined) {
    return { background: `${bg.variant}:${bg.focus ? focusZone(bg.focus) : "default"}`, pill, topTitle, staticCamera };
  }
  const bgEl = spec.elements.find((e) => /background|фон/i.test(`${e.id} ${String((e.content as Record<string, unknown> | undefined)?.component ?? "")}`));
  const bgContent = (bgEl?.content ?? {}) as Record<string, unknown>;
  const variant = (typeof bgContent.variant === "string" ? bgContent.variant : (all.map((x) => x.value).join(" ") + " " + JSON.stringify(spec.composition ?? {})).match(BG_VARIANT)?.[1] ?? BG_DEFAULT.variant).toLowerCase();
  const seed = typeof bgContent.seed === "string" || typeof bgContent.seed === "number" ? String(bgContent.seed) : BG_DEFAULT.seed;
  return { background: `${variant}:${seed}`, pill, topTitle, staticCamera };
}

/** Совпадений подписи с предыдущей сценой, с которых — шаблон. */
const SIGNATURE_REPEAT = 3;

function signatureRepeat(spec: MotionSpec, previous: MotionSpec): Omit<QAIssue, "source">[] {
  const [a, b] = [sceneSignature(spec), sceneSignature(previous)];
  const same = (Object.keys(a) as (keyof SceneSignature)[]).filter((k) => a[k] === b[k]);
  if (same.length < SIGNATURE_REPEAT) return [];
  const names: Record<keyof SceneSignature, string> = { background: `фон ${a.background}`, pill: a.pill ? "акцент-таблетка" : "без таблетки", topTitle: a.topTitle ? "полоса заголовка сверху" : "без полосы заголовка", staticCamera: a.staticCamera ? "камера стоит" : "камера движется" };
  return [{
    code: "scene_signature_repeat", severity: "warning", area: same.join(", "),
    description: `сцена повторяет подпись предыдущей «${previous.title}» (${same.length} из 4): ${same.map((k) => names[k]).join(", ")}`,
    fix_hint: "смени хотя бы два признака: фон (variant/seed/focus по id сцены), заголовок (нет, кикер, встроенный у героя), носитель акцента (данные, а не таблетка), камера по смыслу",
  }];
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
