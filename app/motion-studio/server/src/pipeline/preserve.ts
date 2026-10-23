// Проверка «сохрани …» правки (Task 18, `04` §3): QA сверяет новую версию с базой по тому,
// что план обещал не трогать. Композиция — по тому, что сцена рисует: раскладка `props.content`
// (объекты `{x, y, w?, h?}`, элементы массивов — по `id`) и элементы spec (положение, размер,
// пропажа) ± tol кадра до рендера; после рендера — реестр раскладки кадра hold базы и новой
// версии (`compareHoldLayout`, `09` §4: «QA сравнивает кадры hold» — по позициям текста, не по
// пикселям: палитра и глубина правкой меняются). Палитра — разрешённые токены (resolveStyle от
// props.style, у версии среза — от spec), тексты — content текстовых элементов, тайминги —
// длительность и границы битов.
import { type EditPlan, type MotionSpec, type QAIssue, ScenePropsBaseSchema } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import type { LayoutFrame, LayoutItem } from "../qa/layout.js";

const issue = (code: string, area: string | undefined, description: string, fix_hint: string): QAIssue => ({
  source: "programmatic", code, severity: "blocking", ...(area ? { area } : {}), description, fix_hint,
});

/** Разрешённая палитра версии: props.style по контракту, иначе пресет и palette_overrides spec. */
export function resolvedPalette(spec: MotionSpec, props: unknown) {
  const p = ScenePropsBaseSchema.safeParse(props);
  if (p.success) return resolveStyle({ preset: p.data.style.preset, intensity: p.data.style.intensity, ...(p.data.style.palette_overrides ? { palette_overrides: p.data.style.palette_overrides } : {}) }).palette;
  return resolveStyle({ preset: spec.style_preset, intensity: "balanced", ...(spec.palette_overrides ? { palette_overrides: spec.palette_overrides } : {}) }).palette;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;

interface Place {
  x: number;
  y: number;
  w?: number;
  h?: number;
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Раскладка `props.content`: путь → место. Место — объект с числовыми `x` и `y` (`w`, `h` —
 * если есть); элементы массивов с `id` адресуются по id (порядок узлов не важен).
 */
export function contentLayouts(content: unknown): Map<string, Place> {
  const out = new Map<string, Place>();
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        const id = x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" ? (x as { id: string }).id : String(i);
        walk(x, `${path}[${id}]`);
      });
      return;
    }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (isNum(o.x) && isNum(o.y)) {
      out.set(path, { x: o.x, y: o.y, ...(isNum(o.w) ? { w: o.w } : {}), ...(isNum(o.h) ? { h: o.h } : {}) });
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
  };
  walk(content, "content");
  return out;
}

/** Опции сверки: размер кадра (раскладка content в px — доля по нему). */
export interface PreserveOpts {
  size?: { width: number; height: number };
}

/**
 * Сдвиг и изменение размера места в долях кадра: числа ≤ 2 по модулю — уже доли, больше —
 * px (делятся на размер кадра).
 */
function placeDelta(a: Place, b: Place, size: { width: number; height: number }) {
  const px = [a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h].some((v) => v !== undefined && Math.abs(v) > 2);
  const fx = (v: number) => (px ? v / size.width : v);
  const fy = (v: number) => (px ? v / size.height : v);
  const d = (u: number | undefined, v: number | undefined, f: (n: number) => number) => (u === undefined || v === undefined ? 0 : Math.abs(f(u) - f(v)));
  return { move: Math.max(d(a.x, b.x, fx), d(a.y, b.y, fy)), resize: Math.max(d(a.w, b.w, fx), d(a.h, b.h, fy)) };
}

const fmt = (p: Place) => `x ${p.x}, y ${p.y}${p.w !== undefined ? `, w ${p.w}` : ""}${p.h !== undefined ? `, h ${p.h}` : ""}`;

export function checkPreserve(
  base: MotionSpec,
  next: MotionSpec,
  baseProps: unknown,
  nextProps: unknown,
  preserve: EditPlan["preserve"],
  tol = 0.02,
  opts: PreserveOpts = {},
): QAIssue[] {
  const out: QAIssue[] = [];
  const baseEl = new Map(base.elements.map((e) => [e.id, e]));
  const size = opts.size ?? { width: 1920, height: 1080 };
  // 1e-9 — запас на сложение долей с плавающей точкой
  const over = (x: number) => x > tol + 1e-9;
  const place = (where: string, a: Place, b: Place | undefined, hint: string) => {
    if (!b) {
      out.push(issue("composition_changed", where, `${where} пропал (в базе: ${fmt(a)})`, `верни ${where} как в базовой версии — правка обещала сохранить композицию`));
      return;
    }
    const d = placeDelta(a, b, size);
    if (over(d.move) || over(d.resize)) {
      const what = over(d.move) ? `сдвинут на ${pct(d.move)}` : `изменён размер на ${pct(d.resize)}`;
      out.push(issue("composition_changed", where, `${where} ${what} (допуск ${pct(tol)} кадра): ${fmt(a)} → ${fmt(b)}`, hint));
    }
  };
  if (preserve.includes("composition")) {
    const nextEl = new Map(next.elements.map((e) => [e.id, e]));
    for (const b of base.elements) {
      if (!b.layout) continue;
      const e = nextEl.get(b.id);
      place(b.id, b.layout, e?.layout, `верни ${b.id} на место базовой версии: layout.x/y/w/h как в базе — правка обещала сохранить композицию`);
    }
    const pb = ScenePropsBaseSchema.safeParse(baseProps);
    const pn = ScenePropsBaseSchema.safeParse(nextProps);
    if (pb.success && pn.success) {
      const nl = contentLayouts(pn.data.content);
      for (const [path, a] of contentLayouts(pb.data.content)) {
        place(path, a, nl.get(path), `верни ${path} в props.json как в базе (${fmt(a)}) — правка обещала сохранить композицию; меняй стиль, а не раскладку`);
      }
    }
  }
  if (preserve.includes("palette")) {
    const a = resolvedPalette(base, baseProps);
    const b = resolvedPalette(next, nextProps);
    if (!same(a, b)) out.push(issue("palette_changed", undefined, `палитра изменилась: ${JSON.stringify(a)} → ${JSON.stringify(b)}`, "верни palette_overrides и пресет базовой версии — правка обещала сохранить палитру"));
  }
  if (preserve.includes("text")) {
    for (const e of next.elements) {
      const b = baseEl.get(e.id);
      if (e.kind !== "text" || !b || same(b.content, e.content)) continue;
      out.push(issue("text_changed", e.id, `текст ${e.id} изменился: ${JSON.stringify(b.content)} → ${JSON.stringify(e.content)}`, `верни content ${e.id} как в базе — правка обещала сохранить тексты`));
    }
  }
  if (preserve.includes("timing")) {
    const frames = (s: MotionSpec) => [s.duration_frames, ...s.beats.map((b) => [b.id, b.start_frame, b.end_frame])];
    if (!same(frames(base), frames(next))) {
      out.push(issue("timing_changed", undefined, `тайминги изменились: ${base.duration_frames} → ${next.duration_frames} кадров или границы битов`, "верни длительность и границы битов базовой версии — правка обещала сохранить тайминги"));
    }
  }
  return out;
}

/**
 * Ключ элемента реестра для сверки базы и правки: владелец kit с `data-ms-id` — роль и id
 * (порядковый номер владельца в кадре не важен); прочие — роль и текст.
 */
function holdKey(it: LayoutItem): string {
  const parts = it.id.split(":");
  return parts.length >= 3 && parts[1] ? `${it.role}:${parts[1]}` : `${it.role}|${it.text}`;
}

/** Роли реестра, которые в hold движутся по замыслу (данные в пути) — не композиция. */
const MOVING_ROLES = new Set(["token"]);

/**
 * Кадр hold базы и новой версии по реестру раскладки (`09` §4): каждый видимый текст базы —
 * на том же месте ± tol кадра (центр), текст того же содержания — того же размера. Пары — по
 * `holdKey`; текст, сменивший содержание, но оставшийся на месте той же роли, — норма.
 * Пропавший или сдвинутый — blocking `composition_changed` (кадр — новой версии).
 */
export function compareHoldLayout(base: LayoutFrame, next: LayoutFrame, size: { width: number; height: number }, tol = 0.02): QAIssue[] {
  const keep = (f: LayoutFrame) => f.items.filter((i) => !MOVING_ROLES.has(i.role)).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const cx = (i: LayoutItem) => (i.rect.x + i.rect.w / 2) / size.width;
  const cy = (i: LayoutItem) => (i.rect.y + i.rect.h / 2) / size.height;
  const move = (a: LayoutItem, b: LayoutItem) => Math.max(Math.abs(cx(a) - cx(b)), Math.abs(cy(a) - cy(b)));
  const free = keep(next);
  const pairs: [LayoutItem, LayoutItem | undefined][] = [];
  const left: LayoutItem[] = [];
  for (const a of keep(base)) {
    const k = free.findIndex((b) => holdKey(b) === holdKey(a));
    if (k >= 0) pairs.push([a, free.splice(k, 1)[0]]);
    else left.push(a);
  }
  // текст сменился, место то же: ближайший свободный той же роли в пределах допуска
  for (const a of left) {
    const near = free.filter((b) => b.role === a.role && move(a, b) <= tol + 1e-9).sort((x, y) => move(a, x) - move(a, y))[0];
    if (near) free.splice(free.indexOf(near), 1);
    pairs.push([a, near]);
  }
  const out: QAIssue[] = [];
  const box = (i: LayoutItem) => `(${Math.round(i.rect.x)}, ${Math.round(i.rect.y)}, ${Math.round(i.rect.w)}×${Math.round(i.rect.h)})`;
  for (const [a, b] of pairs) {
    const key = holdKey(a).split("|")[0]!;
    const where = holdKey(a).includes("|") ? `${key} «${a.text.slice(0, 40)}»` : key;
    const hint = `верни «${a.text.slice(0, 40)}» на место базовой версии (кадр hold ${base.frame}: ${box(a)}) — правка обещала сохранить композицию; меняй стиль, а не раскладку`;
    let what: string | undefined;
    if (!b) what = "пропал из кадра hold";
    else if (move(a, b) > tol + 1e-9) what = `сдвинут на ${pct(move(a, b))} кадра: ${box(a)} → ${box(b)}`;
    else if (a.text === b.text && Math.max(Math.abs(a.rect.w - b.rect.w) / size.width, Math.abs(a.rect.h - b.rect.h) / size.height) > tol + 1e-9) what = `изменил размер: ${box(a)} → ${box(b)}`;
    if (!what) continue;
    out.push({ ...issue("composition_changed", key, `кадр hold базы ${base.frame} ↔ новой версии ${next.frame}: «${a.text.slice(0, 40)}» (${where}) ${what}; допуск ${pct(tol)} кадра`, hint), frame: next.frame });
  }
  return out;
}
