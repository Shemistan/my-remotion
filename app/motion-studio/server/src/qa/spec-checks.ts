// Проверки спецификации без рендера (ТЗ §8.1–8.2): одинаковые входы, перекрытия по
// layout, safe area, наличие акцента, один акцент в момент; из дизайнер-ревью
// (motion-review-1) — нумерованные заглушки, ключевая мысль purpose на экране, повтор
// подписи кадра предыдущей сцены. `layout` элемента — доли safe area, а не кадра
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

export interface SpecCheckOpts {
  /** Spec предыдущей сцены (последняя версия другой сцены): подпись кадра не повторяется. */
  previous?: MotionSpec;
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

  out.push(...accentConflicts(spec));
  out.push(...placeholderIssues(spec));
  out.push(...purposeClaimIssues(spec));
  if (opts.previous) out.push(...signatureRepeat(spec, opts.previous));

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
/** Вход или прорисовка («flowgraph-in», «graph-draw»): данные ещё не летят. */
const ENTRANCE_ACTION = /(^|[^a-z])(in|entrance|enter|draw)([^a-z]|$)|вход|появ|прорис/i;
const isPulse = (b: Beat) => PULSE_ACTION.test(b.action) && !ENTRANCE_ACTION.test(b.action);

interface AccentWindow { id: string; from: number; to: number; what: string }

/**
 * Один акцент в момент (prompts/motion-director.md §6): вспышка узла по приходу импульса
 * (`content.flash_on`) и бит акцента (`emphasis`/`accent` в action) другого объекта или два
 * бита акцента разных объектов перекрываются по кадрам — blocking: Director разводит их.
 * Удар акцента посреди полёта импульса — blocking, только если импульс летит в сам объект
 * акцента («итог приходит раньше данных»); удар по другому объекту во время полёта — warning.
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
      const pulses = spec.beats.filter((b) => b.element_ids.includes(e.id) && isPulse(b));
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
  // удар акцента посреди полёта импульса (не вход графа, не поток удержания)
  const same = sameObject(spec);
  for (const p of spec.beats.filter((b) => isPulse(b) && !STEADY_ACTION.test(b.action))) {
    const dest = pulseTargets(spec, p);
    for (const { beat: b, ids } of emph) {
      if (b.id === p.id) continue;
      if (!(b.start_frame > p.start_frame && b.start_frame < p.end_frame - CONFLICT_MIN_FRAMES)) continue;
      const hit = ids.filter((id) => [...dest].some((d) => same(id, d)));
      if (hit.length > 0) {
        out.push({
          code: "accent_conflict", severity: "blocking", area: `${p.id}, ${hit.join(", ")}`,
          description: `акцент ${hit.join(", ")} (бит ${b.id}) бьёт в кадр ${b.start_frame}, пока импульс бита ${p.id} ещё летит к нему (${p.start_frame}–${p.end_frame}): итог приходит раньше данных`,
          fix_hint: `итог приходит вместе с данными: начни бит ${b.id} в кадр прихода импульса — ${p.end_frame} (конец бита ${p.id}), или заверши импульс раньше`,
        });
      } else if (!ids.some((id) => p.element_ids.includes(id))) {
        out.push({
          code: "accent_conflict", severity: "warning", area: `${p.id}, ${ids.join(", ")}`,
          description: `акцент ${ids.join(", ")} (бит ${b.id}) бьёт в кадр ${b.start_frame}, пока импульс бита ${p.id} летит к другому объекту (${p.start_frame}–${p.end_frame}): свет импульса и удар акцента могут спорить за взгляд`,
          fix_hint: `если удар — итог этого импульса, начни бит ${b.id} в кадр прихода ${p.end_frame}; если события независимы — оставь`,
        });
      }
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

/** Ссылка на бит в content (`flows[].beat`): id бита с префиксом `b-` или без. */
const beatRef = (ref: unknown, id: string) => typeof ref === "string" && (ref === id || ref.replace(/^b[-_]/, "") === id.replace(/^b[-_]/, ""));

/**
 * Куда летит импульс бита: узлы прихода `flows` графа, привязанных к биту (`to`, у обратного
 * — `from`), иначе элементы бита, кроме самих графов; плюс счётчики, привязанные к приходам
 * этого графа (`bound_to: "<граф>.arrivals…"`).
 */
function pulseTargets(spec: MotionSpec, p: Beat): Set<string> {
  const out = new Set<string>();
  const graphs = new Set<string>();
  for (const e of spec.elements) {
    const c = (e.content ?? {}) as Record<string, unknown>;
    const edges = Array.isArray(c.edges) ? (c.edges as Record<string, unknown>[]) : [];
    const flows = Array.isArray(c.flows) ? (c.flows as Record<string, unknown>[]).filter((f) => beatRef(f?.beat, p.id)) : [];
    for (const f of flows) {
      graphs.add(e.id);
      const edge = edges.find((x) => x?.id === f.edge);
      if (!edge) continue;
      const back = /back|reverse|обрат/i.test(String(f.direction ?? "")) || f.reverse === true;
      const node = back ? edge.from : edge.to;
      if (typeof node === "string") out.add(node);
    }
  }
  if (out.size === 0) {
    for (const id of p.element_ids) {
      if (byKind(spec, id) === "graph") graphs.add(id);
      else out.add(id);
    }
  }
  for (const e of spec.elements) {
    const bound = (e.content as Record<string, unknown> | undefined)?.bound_to;
    if (typeof bound === "string" && [...graphs].some((g) => bound.startsWith(`${g}.arrivals`))) out.add(e.id);
  }
  return out;
}

const byKind = (spec: MotionSpec, id: string) => spec.elements.find((e) => e.id === id)?.kind;

/** Один объект: тот же id или вложенный layout (подпись в карточке узла, счётчик на узле). */
function sameObject(spec: MotionSpec): (a: string, b: string) => boolean {
  const lay = new Map(spec.elements.map((e) => [e.id, e.layout]));
  return (a, b) => {
    if (a === b) return true;
    const [la, lb] = [lay.get(a), lay.get(b)];
    if (!la || !lb || area(la) >= FULL_BLEED || area(lb) >= FULL_BLEED) return false;
    return contains(la, lb) || contains(lb, la);
  };
}

/** Строки content с ключами по фильтру; массивы строк — под ключами-списками подписей. */
function contentStrings(content: unknown, key: RegExp): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const walk = (v: unknown, k: string) => {
    if (typeof v === "string") {
      if (key.test(k)) out.push({ key: k, value: v });
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, typeof x === "string" && LIST_KEY.test(k) ? "text" : k);
    } else if (v && typeof v === "object") {
      for (const [kk, x] of Object.entries(v)) walk(x, kk);
    }
  };
  walk(content, "");
  return out;
}
/** Ключи-списки подписей (`stages: ["Сборка", …]`); списки id (`nodes`, `edges`) не подписи. */
const LIST_KEY = /^(stages|steps|items|labels|options|lines|words|milestones|events|phases)$/i;
/** Видимое имя объекта. caption не входит: «инструмент 1» под «Веб-поиск» — роль, не заглушка. */
const LABEL_KEY = /^(label|text|title|name|heading|headline)$/i;
/** Весь видимый текст: имя, подписи, приставки числа. */
const DISPLAY_KEY = /^(label|text|title|name|heading|headline|caption|subtitle|kicker|statement|prefix|suffix|unit)$/i;

/**
 * Нумерованная заглушка вместо конкретного экземпляра («Инструмент 1», «Этап 2»,
 * motion-review-1 §1): весь текст подписи — родовое слово и номер.
 */
const PLACEHOLDER = /^(инструмент|сервис|этап|шаг|узел|модуль|компонент|элемент|пункт|tool|step|service|stage|node|module|component|item)\s*[№#]?\s*\d+$/i;

function placeholderIssues(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const out: Omit<QAIssue, "source">[] = [];
  const hits = spec.elements.flatMap((e) => contentStrings(e.content, LABEL_KEY).filter((x) => PLACEHOLDER.test(x.value.trim())).map((x) => ({ id: e.id, text: x.value.trim() })));
  if (hits.length === 0) return out;
  out.push({
    code: "placeholder_label", severity: "blocking", area: [...new Set(hits.map((h) => h.id))].join(", "),
    description: `нумерованные заглушки вместо конкретных экземпляров: ${hits.map((h) => `«${h.text}» (${h.id})`).join(", ")}`,
    fix_hint: "запрос назвал количество без имён — придумай правдоподобные конкретные экземпляры с ролями (Веб-поиск · search(), База знаний · retrieve(), Калькулятор · calc()); номера вместо имён запрещены",
  });
  return out;
}

/** Кратность в purpose: «в 100 раз», «×24», «24×», «100-кратный». */
const CLAIM = /в\s+(\d+(?:[.,]\d+)?)\s*раз|[×xх]\s?(\d+(?:[.,]\d+)?)(?!\d)|(\d+(?:[.,]\d+)?)\s?×|(\d+(?:[.,]\d+)?)[-\s]?кратн/gi;
const num = (v: string) => Number(v.replace(",", "."));

/**
 * Ключевая мысль на экране (motion-review-1 §10): явная кратность из purpose («в 100 раз»)
 * видна текстом — «×100», «в 100 раз», «100×» в подписи, или приставка × у числа с to = N.
 * Качественное «в разы» без числа программно не проверяется.
 */
function purposeClaimIssues(spec: MotionSpec): Omit<QAIssue, "source">[] {
  const claims = [...new Set([...spec.purpose.matchAll(CLAIM)].map((m) => num((m[1] ?? m[2] ?? m[3] ?? m[4])!)).filter((n) => Number.isFinite(n) && n > 1))];
  if (claims.length === 0) return [];
  const shown = (n: number) => spec.elements.some((e) => {
    const c = (e.content ?? {}) as Record<string, unknown>;
    if (typeof c.to === "number" && c.to === n && [c.prefix, c.suffix].some((x) => typeof x === "string" && /[×xх]/.test(x))) return true;
    return contentStrings(c, DISPLAY_KEY).some((x) => [...x.value.matchAll(CLAIM)].some((m) => num((m[1] ?? m[2] ?? m[3] ?? m[4])!) === n));
  });
  const missing = claims.filter((n) => !shown(n));
  if (missing.length === 0) return [];
  return [{
    code: "purpose_claim", severity: "blocking", area: "purpose",
    description: `ключевая мысль purpose («${missing.map((n) => `×${n}`).join("», «")}») не видна на экране: ни подписи с кратностью, ни числа с приставкой ×`,
    fix_hint: `покажи итог как утверждение: подпись или кикер «×${missing[0]}» / «в ${missing[0]} раз» рядом с героем (AnimatedNumber prefix="×" to={${missing[0]}} или текст)`,
  }];
}

/** Подпись кадра сцены (motion-review-1 §10): фон, акцент-таблетка, полоса заголовка, камера. */
export interface SceneSignature { background: string; pill: boolean; topTitle: boolean; staticCamera: boolean }

/** Фон kit по умолчанию (`<Background>` без variant и seed). */
const BG_DEFAULT = { variant: "aurora", seed: "bg" };
const BG_VARIANT = /\b(aurora|grid|solid|gradient|mesh|dots|spotlight|noise)\b/i;

export function sceneSignature(spec: MotionSpec): SceneSignature {
  const all = spec.elements.flatMap((e) => contentStrings(e.content, /.*/));
  const bgEl = spec.elements.find((e) => /background|фон/i.test(`${e.id} ${String((e.content as Record<string, unknown> | undefined)?.component ?? "")}`));
  const bgContent = (bgEl?.content ?? {}) as Record<string, unknown>;
  const variant = (typeof bgContent.variant === "string" ? bgContent.variant : (all.map((x) => x.value).join(" ") + " " + JSON.stringify(spec.composition ?? {})).match(BG_VARIANT)?.[1] ?? BG_DEFAULT.variant).toLowerCase();
  const seed = typeof bgContent.seed === "string" || typeof bgContent.seed === "number" ? String(bgContent.seed) : BG_DEFAULT.seed;
  return {
    background: `${variant}:${seed}`,
    pill: all.some((x) => /\bpill\b|пилюл|таблетк/i.test(x.value)),
    topTitle: spec.elements.some((e) => e.kind === "text" && e.layout !== undefined && e.layout.y <= 0.1 && e.layout.h <= 0.15 && e.layout.w >= 0.3),
    staticCamera: (spec.camera?.length ?? 0) === 0,
  };
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
    description: `сцена повторяет подпись предыдущей (${same.length} из 4): ${same.map((k) => names[k]).join(", ")}`,
    fix_hint: "смени хотя бы два признака: фон (variant/seed/focus по id сцены), заголовок (нет, кикер, встроенный у героя), носитель акцента (данные, а не таблетка), камера по смыслу",
  }];
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
