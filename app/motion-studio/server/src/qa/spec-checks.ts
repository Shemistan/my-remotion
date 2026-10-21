// Проверки спецификации без рендера (ТЗ §8.1–8.2): одинаковые входы, перекрытия по
// layout, safe area, наличие акцента. `layout` элемента — доли safe area, а не кадра
// (prompts/motion-director.md §8): в кадр он переводится через safeRect настроек.
import type { Beat, Element, MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { boundCounters } from "../pipeline/bound-counters.js";
import { ACCENT_ACTION, isEmphasisRole } from "../pipeline/qa-frames.js";

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

export function specChecks(spec: MotionSpec, settings: Settings): QAIssue[] {
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

  out.push(...accentConflicts(spec));

  if (!spec.elements.some((e) => isEmphasisRole(e.role)) && !spec.beats.some((b) => ACCENT_ACTION.test(b.action))) {
    out.push({
      code: "no_emphasis", severity: "warning",
      description: "в сцене нет акцента: ни элемента role = emphasis, ни бита emphasis/accent",
      fix_hint: "добавь главный акцент: бит emphasis на ключевом элементе (подсветка, пульс, итоговая плашка)",
    });
  }
  return out.map((i) => ({ source: "programmatic", ...i }));
}

/** Вспышка узла FlowGraph (nodeFlash): удар за кадр до прихода, гаснет за ~22 кадра при 30 fps. */
const FLASH_FRAMES_30 = 22;
/** Перекрытие короче — касание при передаче акцента, не конфликт. */
const CONFLICT_MIN_FRAMES = 3;
/** Бит импульса по ребру: по нему считается кадр прихода, если в flash_on нет id бита. */
const PULSE_ACTION = /pulse|flow|signal|импульс|поток/i;
/** Установившийся поток удержания — фон системы в работе, а не событие. */
const STEADY_ACTION = /hold|loop|steady|idle|ambient|удержан|фон/i;

interface AccentWindow { id: string; from: number; to: number; what: string }

/**
 * Один акцент в момент (prompts/motion-director.md §6): вспышка узла по приходу импульса
 * (`content.flash_on`) и бит акцента (`emphasis`/`accent` в action) другого объекта, два
 * бита акцента разных объектов, или удар акцента посреди полёта импульса к другому
 * объекту перекрываются по кадрам — blocking: Director разводит их.
 */
function accentConflicts(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const fps = spec.fps.num / spec.fps.den;
  const flashLen = Math.round((FLASH_FRAMES_30 * fps) / 30);
  const byId = new Map(spec.elements.map((e) => [e.id, e]));

  // акценты битов: цели — элементы бита с ролью акцента, иначе все элементы бита
  const emph = spec.beats
    .filter((b) => ACCENT_ACTION.test(b.action))
    .map((b) => {
      const marked = b.element_ids.filter((id) => isEmphasisRole(byId.get(id)?.role ?? ""));
      return { beat: b, ids: marked.length > 0 ? marked : b.element_ids };
    });

  // вспышки: кадр прихода — конец бита импульса (id бита в flash_on или единственный бит узла с импульсом)
  const flashes: AccentWindow[] = [];
  for (const e of spec.elements) {
    const raw = (e.content as Record<string, unknown> | undefined)?.flash_on;
    const refs = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((x): x is string => typeof x === "string");
    for (const ref of refs) {
      const named = spec.beats.filter((b) => new RegExp(`(^|[^\\w-])${escapeRe(b.id)}($|[^\\w-])`).test(ref));
      // без id бита — только однозначный бит импульса узла: blocking не ставится наугад
      const pulses = spec.beats.filter((b) => b.element_ids.includes(e.id) && PULSE_ACTION.test(b.action));
      const beats: Beat[] = named.length > 0 ? named : pulses.length === 1 ? pulses : [];
      for (const b of beats) flashes.push({ id: e.id, from: b.end_frame - 1, to: b.end_frame + flashLen, what: `вспышка ${e.id} (приход импульса бита ${b.id}, кадры ${b.end_frame - 1}–${b.end_frame + flashLen})` });
    }
  }

  const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.min(a.to, b.to) - Math.max(a.from, b.from);
  const out: Omit<QAIssue, "source">[] = [];
  for (const f of flashes) {
    for (const { beat: b, ids } of emph) {
      if (ids.includes(f.id) || overlap(f, { from: b.start_frame, to: b.end_frame }) < CONFLICT_MIN_FRAMES) continue;
      out.push({
        code: "accent_conflict", severity: "blocking", area: `${f.id}, ${ids.join(", ")}`,
        description: `${f.what} и акцент ${ids.join(", ")} (бит ${b.id}, кадры ${b.start_frame}–${b.end_frame}) светятся одновременно: два акцента в один момент`,
        fix_hint: `один акцент в момент: если приход импульса отмечает сам ${ids.join(", ")} — убери flash_on у ${f.id}; иначе начни бит ${b.id} не раньше кадра ${f.to}, когда вспышка погаснет`,
      });
    }
  }
  // удар акцента посреди полёта импульса к другому объекту: итог «приходит» раньше данных
  for (const p of spec.beats.filter((b) => PULSE_ACTION.test(b.action) && !STEADY_ACTION.test(b.action))) {
    for (const { beat: b, ids } of emph) {
      if (b.id === p.id || ids.some((id) => p.element_ids.includes(id))) continue;
      if (!(b.start_frame > p.start_frame && b.start_frame < p.end_frame - CONFLICT_MIN_FRAMES)) continue;
      out.push({
        code: "accent_conflict", severity: "blocking", area: `${p.id}, ${ids.join(", ")}`,
        description: `акцент ${ids.join(", ")} (бит ${b.id}) бьёт в кадр ${b.start_frame}, пока импульс бита ${p.id} ещё летит (${p.start_frame}–${p.end_frame}): свет импульса и удар акцента спорят за взгляд`,
        fix_hint: `итог приходит вместе с данными: начни бит ${b.id} в кадр прихода импульса — ${p.end_frame} (конец бита ${p.id}), или заверши импульс раньше`,
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
        fix_hint: `передача акцента: бит ${a.beat.id} кончается до старта ${b.beat.id}, у прежнего акцента loop: false`,
      });
    }
  }
  return out;
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
