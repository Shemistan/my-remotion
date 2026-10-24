// Вход Visual Planner (Task 32): смысловые якоря с примерным временем (ориентир для модели, обратно
// не принимается), лицо и свободные зоны кадра в момент якоря, словарь паттернов KB, предел
// покрытия. Занятость кадра — по окнам времени шотов (`occupancyForRange`, уточнение Task 30), а не
// худший случай за весь шот: на talking-head с жестами шот целиком занят руками почти везде.
import {
  type EditedTimeline, type FootageAnalysis, type NormRect, PATTERN_SLUGS, type PatternSlug, type ProjectStyleBase, type SemanticTimeline,
  type TranscriptWord, type Zone, mapWords, rangeFromWords,
} from "@ms/contracts";
import { type FreeZone, DEFAULT_ZONES, ZONE_RECTS, dedupRects, freeZones, occupancyForRange } from "./zones.js";

/** Зоны, которые показываются планировщику: трети, полосы и углы PiP. */
export const PLANNER_ZONES: Zone[] = [...DEFAULT_ZONES, "pip_tl", "pip_tr", "pip_bl", "pip_br"];

/**
 * Однострочные описания 12 паттернов KB (`knowledge/patterns/<slug>.md`, первый абзац) — запасной
 * словарь, когда KB недоступна; обработчик берёт текст из KB (`patternSummaries`).
 */
export const PATTERN_FALLBACK: Record<PatternSlug, string> = {
  "growth-decline": "рост или падение величины во времени: график, столбики, счётчик с направлением",
  comparison: "два или несколько объектов на одной шкале: «до и после», «А против Б», плюсы и минусы",
  "cause-effect": "причина и следствие: стрелка от одного к другому, цепочка событий",
  "sequence-steps": "шаги или этапы по порядку: нумерованный процесс, лестница, путь",
  "system-structure": "устройство системы: блоки и связи, слои, архитектура",
  relationships: "связи между сущностями: сеть, граф, пересечения множеств",
  timeline: "события на шкале времени: даты, эпохи, вехи",
  transformation: "превращение одного в другое: морфинг, было → стало",
  quantities: "величины и доли: число крупно, проценты, пропорции, части целого",
  spatial: "место и расположение: карта, схема помещения, направление",
  "abstract-concepts": "абстрактная идея через метафору: образ, который объясняет понятие",
  "key-point-emphasis": "ключевая мысль крупно: цитата, слово-акцент, тезис на экране",
};

export interface PlannerAnchor {
  id: string;
  kind: string;
  quote: string;
  start_word_id: string;
  end_word_id: string;
  /** Примерное начало и конец в смонтированном ролике, с (0,1 с) — ориентир, в ответе времени нет. */
  edited_s: [number, number];
  importance: number;
  claim_type: string;
}

export interface FootageAtAnchor {
  face_zone: "left" | "center" | "right" | "absent";
  free_zones: { zone: Zone; free_ratio: number }[];
  /**
   * Зоны, задевающие лицо (доля лица под зоной > `faceOverlapMax`): свободная доля зоны считает всю
   * занятость, а `face_overlap` — долю лица, поэтому «свободная на 0,86» полоса сверху может закрывать
   * лицо. Планировщику — явная пометка (e2e Task 32: без неё агент ставил overlay на лицо).
   */
  face_zones: Zone[];
}

export interface PlannerInput {
  anchors: PlannerAnchor[];
  footage_at_anchor: Record<string, FootageAtAnchor>;
  patterns: { slug: PatternSlug; summary: string }[];
  budget: { max_coverage: number; edited_duration_s: number };
  /** Оставленные монтажом слова: id и текст. */
  words: { id: string; text: string }[];
  chapters: { id: string; title: string; start_word_id: string; end_word_id: string }[];
  numbers: { value: number; unit?: string; quote: string; start_word_id: string; end_word_id: string }[];
  frame: { orientation: "landscape" | "portrait" | "square"; author_position: "left" | "center" | "right" | "absent" };
  /** Текущий стиль проекта; `locked` — задан пользователем, агент его не меняет. Нет — стиль выбирает агент. */
  style?: { preset: string; intensity: string; depth: number; font?: string; palette_overrides?: Record<string, unknown>; locked: boolean };
}

const r1 = (us: number): number => Math.round(us / 100_000) / 10;

/** Шоты, пересекающие диапазон исходника `[start, end)`. */
function shotsIn(footage: FootageAnalysis, src: { start_us: number; end_us: number }) {
  return footage.shots.filter((s) => s.source_start_us < src.end_us && src.start_us < s.source_end_us);
}

/**
 * Занятые области кадра на диапазоне исходника: по каждому пересекающему шоту — объединение окон,
 * пересекающих свою часть диапазона (`occupancyForRange`; окон нет — занятость шота).
 */
export function occupiedAt(footage: FootageAnalysis, src: { start_us: number; end_us: number }): NormRect[] {
  return dedupRects(shotsIn(footage, src).flatMap((s) =>
    occupancyForRange(s, Math.max(src.start_us, s.source_start_us), Math.min(src.end_us, s.source_end_us)).occupied));
}

/** Рамки лица (`face.union` шотов, уже с полем `faceMargin`) на диапазоне исходника. */
export function facesAt(footage: FootageAnalysis, src: { start_us: number; end_us: number }): NormRect[] {
  return dedupRects(shotsIn(footage, src).flatMap((s) => (s.face.union ? [s.face.union] : [])));
}

/** Сторона кадра крупнейшего лица: центр < 0,4 — слева, > 0,6 — справа. */
export function faceSide(faces: readonly NormRect[]): FootageAtAnchor["face_zone"] {
  if (faces.length === 0) return "absent";
  const big = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  const cx = big.x + big.w / 2;
  return cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
}

/** Свободные зоны в долях (без прямоугольников) — то, что видит планировщик. */
const freeOf = (occupied: NormRect[]): FootageAtAnchor["free_zones"] =>
  freeZones(occupied, PLANNER_ZONES).map((z: FreeZone) => ({ zone: z.zone, free_ratio: Math.round(z.free_ratio * 100) / 100 }));

export interface PlannerInputOptions {
  maxCoverage: number;
  /** Размер кадра с учётом поворота (`display_*`). */
  frame: { width: number; height: number };
  patterns?: { slug: PatternSlug; summary: string }[];
  /** Порог доли лица под зоной (`planning.faceOverlapMax`, по умолчанию 0,02). */
  faceOverlapMax?: number;
}

/** Наибольшая доля лица под прямоугольником (как `faceOverlapRatio` плана). */
function faceShare(rect: NormRect, faces: readonly NormRect[]): number {
  let best = 0;
  for (const f of faces) {
    const w = Math.min(rect.x + rect.w, f.x + f.w) - Math.max(rect.x, f.x);
    const h = Math.min(rect.y + rect.h, f.y + f.h) - Math.max(rect.y, f.y);
    if (w > 0 && h > 0 && f.w * f.h > 0) best = Math.max(best, (w * h) / (f.w * f.h));
  }
  return best;
}

export function plannerInput(
  sem: SemanticTimeline, footage: FootageAnalysis, tl: EditedTimeline, words: TranscriptWord[],
  style: { base: ProjectStyleBase; author: "agent" | "user" } | undefined, o: PlannerInputOptions,
): PlannerInput {
  const map = mapWords(tl, words);
  const heard = words.filter((w) => map[w.id]?.state !== "removed" && map[w.id] !== undefined);
  const anchors: PlannerAnchor[] = [];
  const atAnchor: Record<string, FootageAtAnchor> = {};
  for (const a of sem.anchors) {
    let r: ReturnType<typeof rangeFromWords>;
    try {
      r = rangeFromWords(tl, words, a.start_word_id, a.end_word_id, { preUs: 0, postUs: 0 });
    } catch {
      continue; // якорь на вырезанном — смысловая разметка не на этом монтаже; планировать по нему нечего
    }
    anchors.push({
      id: a.id, kind: a.kind, quote: a.quote, start_word_id: a.start_word_id, end_word_id: a.end_word_id,
      edited_s: [r1(r.edited.start_us), r1(r.edited.end_us)], importance: a.importance, claim_type: a.claim_type,
    });
    const faces = facesAt(footage, r.source);
    atAnchor[a.id] = {
      face_zone: faceSide(faces), free_zones: freeOf(occupiedAt(footage, r.source)),
      face_zones: PLANNER_ZONES.filter((z) => faceShare(ZONE_RECTS[z], faces) > (o.faceOverlapMax ?? 0.02)),
    };
  }
  const all = { start_us: 0, end_us: tl.source_duration_us };
  const { width, height } = o.frame;
  return {
    anchors,
    footage_at_anchor: atAnchor,
    patterns: o.patterns ?? PATTERN_SLUGS.map((slug) => ({ slug, summary: PATTERN_FALLBACK[slug] })),
    budget: { max_coverage: o.maxCoverage, edited_duration_s: r1(tl.duration_us) },
    words: heard.map((w) => ({ id: w.id, text: w.text })),
    chapters: sem.chapters.map((c) => ({ id: c.id, title: c.title, start_word_id: c.start_word_id, end_word_id: c.end_word_id })),
    numbers: sem.numbers.map((x) => ({ value: x.value, ...(x.unit !== undefined ? { unit: x.unit } : {}), quote: x.quote, start_word_id: x.start_word_id, end_word_id: x.end_word_id })),
    frame: { orientation: width > height ? "landscape" : width < height ? "portrait" : "square", author_position: faceSide(facesAt(footage, all)) },
    ...(style ? {
      style: {
        preset: style.base.preset, intensity: style.base.intensity, depth: style.base.depth, ...(style.base.font ? { font: style.base.font } : {}),
        ...(style.base.palette_overrides ? { palette_overrides: style.base.palette_overrides } : {}), locked: style.author === "user",
      },
    } : {}),
  };
}

/** Первый абзац курируемого текста паттерна KB (без заголовка) в одну строку, ≤ 200 символов. */
export function patternSummaryFromKb(text: string): string | undefined {
  const para = text.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 0 && !p.startsWith("#"));
  if (!para) return undefined;
  const line = para.replace(/\s+/g, " ").trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}
