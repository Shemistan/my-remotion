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
  /** Части текста `text`/`number` по строкам (kit, Task 37′ fix 2); нет — старая проба. */
  lines?: { text: string; rect: Box; fontPx: number; opacity: number }[];
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
  /** Активные акценты кадра (`data-ms-accent` > 0,5; kit 0.5.6+). */
  accents?: { id: string; level: number }[];
  /** Кандидаты героя кадра по убыванию площади (kit 0.5.8+). */
  heroes?: HeroFrame["heroes"];
}

/** accent_conflict подтверждён пробой, если два акцента сразу — в стольких QA-кадрах (S15a). */
export const ACCENT_CONFLICT_FRAMES = 2;

/** QA-кадры, где светятся ≥ 2 акцента сразу (kit 0.5.6: Emphasis, Highlight, шаг ProcessSteps). */
export function accentConflictFrames(frames: readonly LayoutFrame[]): number[] {
  return frames.filter((f) => (f.accents?.length ?? 0) >= 2).map((f) => f.frame);
}

/** Графики в hold меньше этой доли кадра при тексте вдвое больше — «текст вместо героя» (S14). */
export const HERO_GRAPHIC_MIN = 0.12;
/** Строгий порог text_dominant (S15b): графики меньше 10 % при тексте больше 3× графики. */
export const HERO_GRAPHIC_STRICT = 0.1;
/** Герой меньше этой доли кадра и на пике payoff, и в удержании — сцены без героя (S15b). */
export const NO_HERO_SHARE = 0.18;
/** Два кандидата одного вида ближе этого отношения площадей — герой раздвоен (S15b). */
export const HERO_SPLIT_RATIO = 1.25;
/**
 * Включены ли blocking `no_hero` и строгий `text_dominant` (S15b): только если калибровка на
 * сценах прошлых смоуков отделила оценки дизайнера ≤ 5,5 от ≥ 7 (tmp/s15-calibration.json);
 * иначе — warning.
 */
export const HERO_BLOCKING: { noHero: boolean; textDominant: boolean } = { noHero: false, textDominant: false };
/** Приёмы с графикой kit (S15b): у них текст вместо графики — брак, а не вкус. */
const GRAPHIC_TECHNIQUES: ReadonlySet<string> = new Set(["hero-number", "timeline", "flow-graph", "bar-compare", "line-trend"]);

/** Кадр для проверки героя: кандидаты пробы (kit 0.5.8) и доли площади. */
export interface HeroFrame {
  frame: number;
  heroes: { kind: "graph" | "box" | "graphic" | "number"; share: number; accent: boolean; rect: Box }[];
  areas?: { text: number; graphic: number };
}

/**
 * Один герой сцены сценария (S15b) — на пике payoff (начало payoff + 10) и в удержании:
 * - `no_hero`: крупнейший кандидат < NO_HERO_SHARE на обоих кадрах (blocking — если включено
 *   калибровкой, иначе warning);
 * - `hero_split`: два крупнейших кандидата одного вида, отношение < 1,25, ни один не под
 *   акцентом — warning;
 * - `text_dominant` (удержание): графики < 10 % и текст > 3× у приёмов с графикой kit
 *   (hero-number, timeline, flow-graph, bar/line, split-versus с метром стороны) — blocking, если
 *   включено калибровкой; иначе и у прочих приёмов (checklist — всегда) — warning; мягкий порог
 *   S14 (графики < 12 %, текст > 2×) — warning.
 */
export function heroIssues(i: { peak?: HeroFrame; hold?: HeroFrame; technique?: string; metric?: boolean; blocking: { noHero: boolean; textDominant: boolean } }): Issue[] {
  const out: Issue[] = [];
  const frames = [i.peak, i.hold].filter((f): f is HeroFrame => f !== undefined);
  if (frames.length > 0 && frames.every((f) => (f.heroes[0]?.share ?? 0) < NO_HERO_SHARE)) {
    out.push({
      code: "no_hero", severity: i.blocking.noHero ? "blocking" : "warning", frame: frames[0]!.frame, area: "hero",
      description: `нет визуального героя: крупнейшая графика ${frames.map((f) => `${pctOf(f.heroes[0]?.share ?? 0)} на кадре ${f.frame}`).join(", ")} (меньше ${pctOf(NO_HERO_SHARE)} кадра)`,
      fix_hint: "один герой из данных фразы — график, ось, схема, число со счётом — на 30–40 % кадра к пику payoff и в удержании; подписи и вторичное — мельче вокруг него",
    });
  }
  const split = frames.filter((f) => {
    const [a, b] = f.heroes;
    return a && b && a.kind === b.kind && a.share / Math.max(b.share, 1e-9) < HERO_SPLIT_RATIO && !a.accent && !b.accent;
  });
  if (split.length > 0) {
    out.push({
      code: "hero_split", severity: "warning", frame: split[0]!.frame, area: split[0]!.heroes[0]!.kind,
      description: `герой раздвоен: два объекта одного вида почти равны (${split.map((f) => `${pctOf(f.heroes[0]!.share)} и ${pctOf(f.heroes[1]!.share)} на кадре ${f.frame}`).join(", ")}), акцента ни на одном`,
      fix_hint: "один объект крупнее в 1,6× или акцент на одном (Emphasis, подсветка, яркость), второй — спокойнее и мельче",
    });
  }
  const a = i.hold?.areas;
  if (a) {
    const strict = a.graphic < HERO_GRAPHIC_STRICT && a.text > 3 * a.graphic;
    const kitGraphic = i.technique !== undefined && (GRAPHIC_TECHNIQUES.has(i.technique) || (i.technique === "split-versus" && i.metric === true));
    if (strict || (a.graphic < HERO_GRAPHIC_MIN && a.text > 2 * a.graphic)) {
      out.push({
        code: "text_dominant", severity: strict && kitGraphic && i.blocking.textDominant ? "blocking" : "warning", frame: i.hold!.frame, area: "hold",
        description: `в финале текст занимает ${pctOf(a.text)} кадра, графика — ${pctOf(a.graphic)}: сцена читается подписью, а не картинкой`,
        fix_hint: "визуальный герой — одна не-текстовая графика из данных фразы (ось, схема, столбцы, сетка, число со счётом) на 30–40 % кадра; текст — подписи к ней",
      });
    }
  }
  return out;
}
/** Повтор одной общей подписи у стольких объектов — заглушки (как в specChecks). */
const PLACEHOLDER_REPEAT = 3;
/** Знак вместо подписи: вопрос или многоточие. */
const GLYPH_ONLY = /^\s*(?:[?？]+|…|\.{3})\s*$/u;
/** Контейнеры kit, чья подпись-повтор — заглушка (S15a): карточка, узел графа, панель сравнения. */
const CONTAINER_KINDS: ReadonlySet<string> = new Set(["card", "node", "panel"]);
/** Общая подпись: 1–2 слова без цифр. */
const GENERIC = /^[\p{L}]+(?: [\p{L}]+)?$/u;
const pctOf = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Сцена сценария (S14): «иллюстрированные подписи» по реестру финального кадра (последний
 * QA-кадр, hold). Пустой контейнер kit и подписи-заглушки (одна общая подпись у ≥ 3 объектов,
 * знак вместо подписи у ≥ 2) — blocking: Engineer исправляет. Проба без полей kit 0.5.5 —
 * только заглушки по тексту. Текст вместо графики (`text_dominant`) — в `heroIssues` (S15b).
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
  const stubs = placeholderStubs(last);
  if (stubs.length > 0) {
    const hard = stubs.some((x) => x.hard);
    out.push({
      code: "placeholder_label", severity: hard ? "blocking" : "warning", frame: last.frame, area: stubs.map((x) => q(x.text)).join(", "),
      description: `подписи-заглушки в финальном кадре: ${stubs.map((x) => `${q(x.text)} ×${x.count}`).join(", ")} — у объектов нет своего содержимого${hard ? "" : " (вне карточек и узлов — подсказка)"}`,
      fix_hint: PLACEHOLDER_HINT,
    });
  }
  return out;
}

/** Подсказка Engineer к подписям-заглушкам. */
export const PLACEHOLDER_HINT = "у каждого объекта — своё содержимое из spec (имя, число, термин фразы), не одна общая подпись и не «?»; нет различий — один объект с числом вместо копий";

/** Кадр для поиска заглушек: строки (id, роль, текст, рамка) и контейнеры kit. */
export interface StubFrame {
  items: readonly { id: string; role: string; text: string; rect: Box }[];
  boxes?: readonly { kind: string; rect: Box }[];
}

/**
 * Подписи-заглушки кадра (S14 → S15b, чистая функция): одна общая подпись (1–2 слова без цифр)
 * у ≥ 3 объектов или знак вместо подписи («?», «…») у ≥ 2. `hard` — заглушка в контейнерах kit
 * (карточка, узел, панель) или знак: брак; повтор вне контейнеров (подписи оси, легенда) —
 * подсказка. Подпись-тип в контейнере со своим именем и единица у числа — не заглушки.
 */
export function placeholderStubs(f: StubFrame): { text: string; count: number; ids: string[]; hard: boolean }[] {
  const own = f.items.filter((it) => it.role !== "status" && it.role !== "token" && it.role !== "hold-tick");
  // подпись-тип в карточке со своим именем («Веб-поиск» · «инструмент») — не заглушка: считаем
  // только подписи, у которых в их контейнере нет другого текста
  const mid = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const inBox = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const boxes = f.boxes ?? [];
  const alone = (it: StubFrame["items"][number]) => {
    const box = boxes.find((b) => inBox(mid(it.rect), b.rect));
    return !box || !f.items.some((o) => o !== it && o.text.trim() !== it.text.trim() && inBox(mid(o.rect), box.rect));
  };
  // S15a: подпись в контейнере kit (карточка, узел, панель) — объект без своего содержимого;
  // повтор вне контейнеров (подписи оси, легенда) — только подсказка
  const contained = (it: StubFrame["items"][number]) => boxes.some((b) => CONTAINER_KINDS.has(b.kind) && inBox(mid(it.rect), b.rect));
  // единица у числа («12 мс»): короткий токен на строке с цифрой — не подпись
  const sameLine = (a: Box, b: Box) => Math.abs(mid(a).y - mid(b).y) <= Math.max(a.h, b.h) / 2;
  const unit = (it: StubFrame["items"][number], t: string) => t.length <= 3 && f.items.some((o) => o !== it && /\d/.test(o.text) && sameLine(o.rect, it.rect));
  const groups = new Map<string, { all: Set<string>; boxed: Set<string> }>();
  for (const it of own) {
    const t = it.text.trim().toLowerCase().replace(/ё/g, "е");
    if ((!GENERIC.test(t) && !GLYPH_ONLY.test(t)) || !alone(it) || (!GLYPH_ONLY.test(t) && unit(it, t))) continue;
    const g = groups.get(t) ?? { all: new Set<string>(), boxed: new Set<string>() };
    g.all.add(it.id);
    if (contained(it)) g.boxed.add(it.id);
    groups.set(t, g);
  }
  return [...groups]
    .filter(([t, g]) => g.all.size >= (GLYPH_ONLY.test(t) ? 2 : PLACEHOLDER_REPEAT))
    .map(([t, g]) => ({ text: t, count: g.all.size, ids: [...g.all].sort(), hard: GLYPH_ONLY.test(t) || g.boxed.size >= PLACEHOLDER_REPEAT }));
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
        // один и тот же текст друг на друге — это ghost_text (свод призраков), не вторая проблема (S15a)
        if (a.text.trim() === b.text.trim()) continue;
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

/** Зазор между соседними текстами одной строки меньше этой доли кегля — слова слиплись (fix I3). */
export const WORD_GAP_EM = 0.2;
/** Части стабильны (не вход и не уход): прозрачность обеих не ниже. */
export const WORD_GAP_OPACITY = 0.9;
/** Разница кеглей больше — не стык слов фразы (число и единица, подпись к числу). */
export const WORD_GAP_FONT_RATIO = 1.5;
/** Крупный текст (blocking): оба кегля не меньше этой доли высоты кадра; мельче — warning. */
export const WORD_GAP_BIG = 0.04;

/** Буква или цифра (любой алфавит): стык слов, а не пунктуация, знак, эмодзи. */
const WORDISH = /[\p{L}\p{N}]/u;
type Part = { text: string; rect: Box; fontPx: number; opacity: number };
/** Части элемента: строки пробы kit; старая проба — элемент целиком. */
const partsOf = (it: LayoutItem): Part[] => it.lines ?? [{ text: it.text, rect: it.rect, fontPx: it.fontPx, opacity: it.opacity }];
/** Строк у элемента: по частям (разные ряды) или оценкой по высоте охвата. */
function rowsOf(it: LayoutItem): number {
  if (!it.lines) return Math.max(1, Math.round(it.rect.h / Math.max(1, it.fontPx * 1.2)));
  const tops: number[] = [];
  for (const l of it.lines) if (!tops.some((t) => Math.abs(t - l.rect.y) < 0.5 * l.rect.h)) tops.push(l.rect.y);
  return tops.length;
}

/**
 * Слипшиеся слова (Task 37′ fix I3 → fix 2, чистая функция): фраза, разбитая на соседние тексты
 * kit (`data-ms-layout="text"`/`"number"`, напр. два `KineticText` во flex с зазором в em
 * родителя), стоит на одной строке с зазором меньше `WORD_GAP_EM` кегля — «прерываясоединения»
 * читается одним словом. Сравниваются части (строки, слова) соседних элементов, а не охват
 * владельца; стык — буква/цифра к букве/цифре, кегли в пределах `WORD_GAP_FONT_RATIO`.
 * Blocking — крупный текст (`WORD_GAP_BIG`), стабильный (прозрачность ≥ `WORD_GAP_OPACITY`) на
 * ≥ 2 QA-кадрах или на кадре удержания (последний); только вход/уход, один кадр, мелкий текст,
 * абзац > 2 строк — warning. Сильное наложение — `text_overlap`, не зазор.
 */
export function wordGapIssues(frames: LayoutFrame[]): Issue[] {
  const hold = frames.reduce((m, f) => Math.max(m, f.frame), -Infinity);
  type Pair = { a: string; b: string; ids: string; gap: number; font: number; stable: number[]; moving: number[]; big: boolean; para: boolean };
  const pairs = new Map<string, Pair>();
  for (const f of frames) {
    const texts = f.items.filter((it) => it.role === "text" || it.role === "number");
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const [x, y] = [texts[i]!, texts[j]!];
        if (x.id === y.id || (x.el !== undefined && x.el === y.el)) continue;
        if (overlap(x.rect, y.rect) >= OVERLAP_SHARE) continue;
        for (const pa of partsOf(x)) {
          for (const pb of partsOf(y)) {
            const [l, r] = pa.rect.x <= pb.rect.x ? [pa, pb] : [pb, pa];
            const vy = Math.min(l.rect.y + l.rect.h, r.rect.y + r.rect.h) - Math.max(l.rect.y, r.rect.y);
            if (vy < 0.5 * Math.min(l.rect.h, r.rect.h)) continue;
            const big = Math.max(l.fontPx, r.fontPx);
            const font = Math.min(l.fontPx, r.fontPx);
            if (big > WORD_GAP_FONT_RATIO * font) continue;
            if (!WORDISH.test(l.text.trim().slice(-1)) || !WORDISH.test(Array.from(r.text.trim())[0] ?? "")) continue;
            const gap = r.rect.x - (l.rect.x + l.rect.w);
            if (gap >= WORD_GAP_EM * font || gap < -0.5 * font) continue;
            const key = `${l.text}|${r.text}`;
            const e = pairs.get(key) ?? { a: l.text, b: r.text, ids: `${x.id} / ${y.id}`, gap, font, stable: [], moving: [], big: true, para: false };
            e.gap = Math.min(e.gap, gap);
            e.font = Math.min(e.font, font);
            e.big &&= font >= WORD_GAP_BIG * f.height;
            e.para ||= rowsOf(x) > 2 || rowsOf(y) > 2;
            (l.opacity >= WORD_GAP_OPACITY && r.opacity >= WORD_GAP_OPACITY ? e.stable : e.moving).push(f.frame);
            pairs.set(key, e);
          }
        }
      }
    }
  }
  return [...pairs.values()].map((p) => {
    const stable = [...new Set(p.stable)];
    const hard = p.big && !p.para && (stable.length >= 2 || stable.includes(hold));
    const all = [...p.stable, ...p.moving];
    const why = hard ? "" : !p.big ? " (мелкий текст — подсказка)" : p.para ? " (абзац больше 2 строк — подсказка)" : stable.length === 0 ? " (только на входе/уходе — подсказка)" : " (один кадр — подсказка)";
    return {
      code: "word_gap", severity: hard ? ("blocking" as const) : ("warning" as const), frame: Math.min(...all), area: p.ids,
      description: `слова ${q(p.a)} и ${q(p.b)} слиплись: зазор ${Math.max(0, p.gap).toFixed(1)} px при кегле ${p.font.toFixed(0)} px (меньше ${WORD_GAP_EM} кегля; кадры ${list(all)}) — читается одним словом${why}`,
      fix_hint: "фраза — одним KineticText, акцентное слово — его проп highlight (не дроби фразу на соседние тексты); если тексты всё же рядом — зазор в единицах кегля текста (от его fontSize, не em родителя 16 px)",
    };
  });
}
