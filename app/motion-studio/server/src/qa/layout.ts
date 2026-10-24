// Реестр раскладки motion-kit 0.4.0 → программные проблемы QA. На QA-кадрах kit печатает
// строку `[motion-kit:layout] {frame, height, items, ghosts}` (render/src/motion-kit/
// layout-probe.tsx): прямоугольники видимого текста по владельцам. Здесь — наложения
// (text_overlap, token_on_label), «призраки» следа (ghost_text) и мелкий кегль (min_font) —
// по данным, а не догадкой зрения.
import type { QAIssue } from "@ms/contracts";

type Issue = Omit<QAIssue, "source">;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LayoutItem {
  id: string;
  role: string;
  /** Ключ DOM-элемента (строки одного элемента не сравниваются друг с другом). */
  el?: string;
  text: string;
  rect: Box;
  fontPx: number;
  opacity: number;
}
export interface LayoutFrame {
  frame: number;
  height: number;
  items: LayoutItem[];
  ghosts: { text: string; count: number }[];
  /** Режимы, которые в кадре ведёт hold engine (kit 0.5.2+); нет поля — старая проба. */
  holds?: string[];
  /** Контейнеры kit (`data-ms-box`) с признаком содержимого (kit 0.5.5+). */
  boxes?: { id: string; kind: string; rect: Box; filled: boolean; graphic: boolean }[];
  /** Доли кадра под текстом и под графикой (kit 0.5.5+). */
  areas?: { text: number; graphic: number };
}

/** Графики в hold меньше этой доли кадра при тексте вдвое больше — «текст вместо героя» (S14). */
export const HERO_GRAPHIC_MIN = 0.12;
/** Повтор одной общей подписи у стольких объектов — заглушки (как в specChecks). */
const PLACEHOLDER_REPEAT = 3;
/** Знак вместо подписи: вопрос или многоточие. */
const GLYPH_ONLY = /^\s*(?:[?？]+|…|\.{3})\s*$/u;
/** Общая подпись: 1–2 слова без цифр. */
const GENERIC = /^[\p{L}]+(?: [\p{L}]+)?$/u;
const pctOf = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Сцена сценария (S14): «иллюстрированные подписи» по реестру финального кадра (последний
 * QA-кадр, hold). Пустой контейнер kit и подписи-заглушки (одна общая подпись у ≥ 3 объектов,
 * знак вместо подписи у ≥ 2) — blocking: Engineer исправляет. Графики меньше 12 % кадра при
 * тексте вдвое больше — warning `text_dominant` (подсказка «визуальный герой»). Проба без
 * полей kit 0.5.5 — только заглушки по тексту.
 */
export function scriptLayoutIssues(frames: LayoutFrame[]): Issue[] {
  const last = frames.reduce<LayoutFrame | undefined>((a, f) => (!a || f.frame > a.frame ? f : a), undefined);
  if (!last) return [];
  const out: Issue[] = [];
  const empty = (last.boxes ?? []).filter((b) => !b.filled);
  if (empty.length > 0) {
    out.push({
      code: "empty_container", severity: "blocking", frame: last.frame, area: empty.map((b) => b.kind).join(", "),
      description: `в финальном кадре ${empty.length === 1 ? "пустой контейнер" : `${empty.length} пустых контейнера`} (${empty.map((b) => b.kind).join(", ")}): рамка без текста и графики читается заглушкой`,
      fix_hint: "положи в каждую карточку содержимое из spec (число, имя, термин, мини-график) или убери её; герой сцены — графика из данных фразы",
    });
  }
  const own = last.items.filter((it) => it.role !== "status" && it.role !== "token" && it.role !== "hold-tick");
  // подпись-тип в карточке со своим именем («Веб-поиск» · «инструмент») — не заглушка: считаем
  // только подписи, у которых в их контейнере нет другого текста
  const mid = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const inBox = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const alone = (it: LayoutItem) => {
    const box = (last.boxes ?? []).find((b) => inBox(mid(it.rect), b.rect));
    return !box || !last.items.some((o) => o !== it && o.text.trim() !== it.text.trim() && inBox(mid(o.rect), box.rect));
  };
  const groups = new Map<string, Set<string>>();
  for (const it of own) {
    const t = it.text.trim().toLowerCase().replace(/ё/g, "е");
    if ((!GENERIC.test(t) && !GLYPH_ONLY.test(t)) || !alone(it)) continue;
    groups.set(t, (groups.get(t) ?? new Set()).add(it.id));
  }
  const stubs = [...groups].filter(([t, ids]) => ids.size >= (GLYPH_ONLY.test(t) ? 2 : PLACEHOLDER_REPEAT));
  if (stubs.length > 0) {
    out.push({
      code: "placeholder_label", severity: "blocking", frame: last.frame, area: stubs.map(([t]) => q(t)).join(", "),
      description: `подписи-заглушки в финальном кадре: ${stubs.map(([t, ids]) => `${q(t)} ×${ids.size}`).join(", ")} — у объектов нет своего содержимого`,
      fix_hint: "у каждого объекта — своё содержимое из spec (имя, число, термин фразы), не одна общая подпись и не «?»; нет различий — один объект с числом вместо копий",
    });
  }
  const a = last.areas;
  if (a && a.graphic < HERO_GRAPHIC_MIN && a.text > 2 * a.graphic) {
    out.push({
      code: "text_dominant", severity: "warning", frame: last.frame, area: "hold",
      description: `в финале текст занимает ${pctOf(a.text)} кадра, графика — ${pctOf(a.graphic)}: сцена читается подписью, а не картинкой`,
      fix_hint: "визуальный герой — одна не-текстовая графика из данных фразы (ось, схема, столбцы, сетка, число со счётом) на 30–40 % кадра; текст — подписи к ней",
    });
  }
  return out;
}

const TAG = "[motion-kit:layout]";
/** Наложение: пересечение не меньше этой доли меньшего прямоугольника. */
export const OVERLAP_SHARE = 0.2;
/** Предел кегля, px при 1080 (MIN_TEXT_PX kit). */
export const MIN_FONT_1080 = 22;

/** Строки реестра из логов браузера (битые пропускаются). */
export function parseLayout(logs: string[]): LayoutFrame[] {
  const out: LayoutFrame[] = [];
  for (const l of logs) {
    const i = l.indexOf(TAG);
    if (i < 0) continue;
    try {
      const f = JSON.parse(l.slice(i + TAG.length)) as LayoutFrame;
      if (typeof f.frame === "number" && Array.isArray(f.items)) out.push({ ...f, ghosts: f.ghosts ?? [] });
    } catch {
      // строка обрезана или чужая — не реестр
    }
  }
  return out.sort((a, b) => a.frame - b.frame);
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, Math.min(area(a), area(b)));
}
const q = (t: string) => `«${t.length > 40 ? `${t.slice(0, 39)}…` : t}»`;
const list = (frames: number[]) => [...new Set(frames)].sort((a, b) => a - b).join(", ");

/** Проблемы по реестру всех QA-кадров: одна проблема на пару текстов (кадры — списком). */
export function layoutIssues(frames: LayoutFrame[]): Issue[] {
  const pairs = new Map<string, { code: "token_on_label" | "text_overlap"; a: LayoutItem; b: LayoutItem; frames: number[] }>();
  const ghosts = new Map<string, { count: number; frames: number[] }>();
  const small = new Map<string, { px: number; frames: number[] }>();
  for (const f of frames) {
    const k = 1080 / Math.max(1, f.height);
    for (const g of f.ghosts) {
      const e = ghosts.get(g.text) ?? { count: 0, frames: [] };
      e.count = Math.max(e.count, g.count);
      e.frames.push(f.frame);
      ghosts.set(g.text, e);
    }
    for (const it of f.items) {
      const px = it.fontPx * k;
      if (px < MIN_FONT_1080 - 0.5) {
        const e = small.get(it.text) ?? { px, frames: [] };
        e.px = Math.min(e.px, px);
        e.frames.push(f.frame);
        small.set(it.text, e);
      }
    }
    for (let i = 0; i < f.items.length; i++) {
      for (let j = i + 1; j < f.items.length; j++) {
        const [a, b] = [f.items[i]!, f.items[j]!];
        // строки и узлы одного элемента (перенос, `В {n} раз`) — не наложение (S2-fix2 N3)
        if (a.el !== undefined && a.el === b.el) continue;
        if (overlap(a.rect, b.rect) < OVERLAP_SHARE) continue;
        const token = a.role === "token" ? a : b.role === "token" ? b : null;
        const other = token === a ? b : a;
        const code = token && other.role !== "token" ? "token_on_label" : "text_overlap";
        const [x, y] = code === "token_on_label" ? [token!, other] : [a, b].sort((p, r) => p.text.localeCompare(r.text));
        const key = `${code}|${x!.text}|${y!.text}`;
        const e = pairs.get(key) ?? { code, a: x!, b: y!, frames: [] };
        e.frames.push(f.frame);
        pairs.set(key, e);
      }
    }
  }
  const out: Issue[] = [];
  for (const [text, g] of ghosts) {
    out.push({
      code: "ghost_text", severity: "blocking", frame: Math.min(...g.frames), area: text,
      description: `текст ${q(text)} виден в ${g.count} копиях друг на друге (кадры ${list(g.frames)}) — след из копий читается мусором`,
      fix_hint: "движущийся текст рисуется один раз за кадр: след — форма без текста (DataToken trail \"streak\"), не копии карточки со смещением",
    });
  }
  for (const p of pairs.values()) {
    out.push(p.code === "token_on_label"
      ? {
          code: "token_on_label", severity: "blocking", frame: p.frames[0], area: `${p.a.id} / ${p.b.id}`,
          description: `токен ${q(p.a.text)} лежит на тексте ${q(p.b.text)} (кадры ${list(p.frames)})`,
          fix_hint: "токен идёт по ребру и встаёт перед портом или в полосу данных узла (FlowNode.slot / kind queue, store, cache); без полосы — consume; не ставь dock со смещением на карточку",
        }
      : {
          code: "text_overlap", severity: "blocking", frame: p.frames[0], area: `${p.a.id} / ${p.b.id}`,
          description: `тексты ${q(p.a.text)} и ${q(p.b.text)} перекрываются (кадры ${list(p.frames)})`,
          fix_hint: "разведи элементы по раскладке (отступ, другая строка или сторона), статус — на место статуса узла (StatusChip anchor без side), счётчик — рядом со своей группой",
        });
  }
  for (const [text, s] of small) {
    out.push({
      code: "min_font", severity: "warning", frame: Math.min(...s.frames), area: text,
      description: `текст ${q(text)} — ${s.px.toFixed(0)} px при 1080 (меньше ${MIN_FONT_1080}; кадры ${list(s.frames)}): на телефоне не читается`,
      fix_hint: `кегль подписи не меньше ${MIN_FONT_1080} px при 1080 (уровень caption kit); не уменьшай текст масштабом блока`,
    });
  }
  return out;
}
