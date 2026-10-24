// Окна транскрипта для Semantic Director (Task 31) и объединение ответов окон.
//
// До `maxWords` оставленных слов — одно окно. Длиннее — окна по `window` слов с перекрытием
// `overlap`: агент окна видит контекст до и после стыка. Хвост, не длиннее перекрытия, отдельным
// окном не идёт — последнее окно доходит до конца.
//
// Объединение: каждое слово «принадлежит» ровно одному окну — граница между соседними окнами
// проходит по середине их перекрытия (`ownedRanges`). У обоих окон там ещё ≥ overlap/2 слов
// контекста, поэтому:
// - якорь, число, спорное место берутся из окна, которому принадлежит их первое слово (дубли из
//   перекрытия отпадают сами); точные дубли (тот же вид и слова) схлопываются;
// - главы задаются границами (первыми словами глав): из каждого окна — только границы в своём
//   отрезке; глава тянется до следующей границы, поэтому покрытие без пропусков и пересечений по
//   построению; начало окна (> 0) — не граница. Две границы из разных окон в одном перекрытии
//   ближе `NEAR_BOUNDARY_WORDS` — одна мысль, увиденная окнами с разным контекстом: остаётся граница
//   раннего окна. Первая глава всегда начинается с первого слова;
// - связи переносятся на итоговые id якорей; якорь чужого отрезка — через его точный дубль в
//   окне-владельце, дубля нет — связь отбрасывается (`dropped.causal`);
// - сущности склеиваются по имени (без регистра, `normalizeToken`) и виду, упоминания — только из
//   своих отрезков, без повторов, по порядку.
// id в итоге: главы `ch_01…`, якоря `a_0001…` по порядку слов.
import { type SemanticAgentOutput, normalizeToken } from "@ms/contracts";

export interface WindowOptions {
  /** Слов, при которых окно одно. */
  maxWords: number;
  window: number;
  overlap: number;
}

export const WINDOW_DEFAULTS: WindowOptions = { maxWords: 6000, window: 3000, overlap: 300 };

/** Границы глав из разных окон ближе этого числа слов — одна граница. */
export const NEAR_BOUNDARY_WORDS = 30;

export interface Span {
  /** Индекс первого слова окна. */
  start: number;
  /** Индекс за последним словом окна. */
  end: number;
}

/** Окна по `n` словам: `[start, end)`. */
export function windowSpans(n: number, o: WindowOptions = WINDOW_DEFAULTS): Span[] {
  if (!(Number.isInteger(o.window) && Number.isInteger(o.overlap) && o.overlap >= 0 && o.window > 2 * o.overlap && o.maxWords >= o.window)) {
    throw new RangeError(`окна: нужно window > 2·overlap ≥ 0 и maxWords ≥ window, получено ${JSON.stringify(o)}`);
  }
  if (n <= 0) return [];
  if (n <= o.maxWords) return [{ start: 0, end: n }];
  const out: Span[] = [];
  let start = 0;
  for (;;) {
    let end = Math.min(start + o.window, n);
    if (n - end <= o.overlap) end = n; // хвост не длиннее перекрытия — в это окно
    out.push({ start, end });
    if (end >= n) return out;
    start = end - o.overlap;
  }
}

export function windowWords<T>(items: T[], o: WindowOptions = WINDOW_DEFAULTS): T[][] {
  return windowSpans(items.length, o).map((s) => items.slice(s.start, s.end));
}

/** Отрезки-владения окон: граница соседних — середина их перекрытия. */
export function ownedRanges(spans: Span[], n: number): { from: number; to: number }[] {
  const mids = spans.slice(1).map((s, k) => Math.floor((s.start + spans[k]!.end) / 2));
  return spans.map((_, k) => ({ from: k === 0 ? 0 : mids[k - 1]!, to: k === spans.length - 1 ? n : mids[k]! }));
}

export interface MergeResult {
  timeline: SemanticAgentOutput;
  dropped: { causal: number; boundaries: number };
}

type Anchor = SemanticAgentOutput["anchors"][number];

/**
 * Объединяет проверенные ответы окон (`parts[k]` — окно `spans[k]`; id — локальные id агента
 * окна) в разметку всего ролика по оставленным словам `visible`.
 */
export function mergeWindows(parts: SemanticAgentOutput[], spans: Span[], visible: { id: string }[]): MergeResult {
  if (parts.length !== spans.length) throw new Error(`окон ${spans.length}, ответов ${parts.length}`);
  const n = visible.length;
  const pos = new Map(visible.map((w, i) => [w.id, i]));
  const at = (id: string): number => {
    const i = pos.get(id);
    if (i === undefined) throw new Error(`слово ${id} не из оставленных`);
    return i;
  };
  const owned = ownedRanges(spans, n);
  const own = (k: number, id: string) => {
    const i = at(id);
    return i >= owned[k]!.from && i < owned[k]!.to;
  };
  const dropped = { causal: 0, boundaries: 0 };

  // --- главы: границы своих отрезков
  const bounds: { i: number; k: number; c: SemanticAgentOutput["chapters"][number] }[] = [];
  parts.forEach((p, k) => {
    for (const c of p.chapters) {
      const i = at(c.start_word_id);
      if (i === spans[k]!.start && i > 0) continue; // начало окна — не граница
      if (own(k, c.start_word_id)) bounds.push({ i, k, c });
    }
  });
  bounds.sort((a, b) => a.i - b.i || a.k - b.k);
  const inOverlap = (i: number, k: number) => k + 1 < spans.length && i >= spans[k + 1]!.start && i < spans[k]!.end;
  const kept: typeof bounds = [];
  for (const b of bounds) {
    const prev = kept.at(-1);
    if (prev && prev.i === b.i) continue;
    if (prev && prev.k !== b.k && b.i - prev.i < NEAR_BOUNDARY_WORDS) {
      const k = Math.min(prev.k, b.k);
      if (inOverlap(prev.i, k) && inOverlap(b.i, k)) {
        dropped.boundaries++;
        if (b.k < prev.k) kept[kept.length - 1] = b; // остаётся граница раннего окна
        continue;
      }
    }
    kept.push(b);
  }
  if (kept.length > 0 && kept[0]!.i > 0) kept[0] = { ...kept[0]!, i: 0 }; // первая глава — с первого слова
  const chapters = kept.map((b, j) => ({
    ...b.c,
    id: `ch_${String(j + 1).padStart(2, "0")}`,
    start_word_id: visible[b.i]!.id,
    end_word_id: visible[(kept[j + 1]?.i ?? n) - 1]!.id,
  }));

  // --- якоря: из окна-владельца первого слова; точные дубли схлопываются
  const key = (a: Anchor) => `${a.kind}|${a.start_word_id}|${a.end_word_id}`;
  const picked: { a: Anchor; k: number }[] = [];
  const byKey = new Map<string, number>();
  parts.forEach((p, k) => {
    for (const a of p.anchors) {
      if (!own(k, a.start_word_id) || byKey.has(key(a))) continue;
      byKey.set(key(a), picked.length);
      picked.push({ a, k });
    }
  });
  const order = picked.map((_, j) => j).sort((x, y) => {
    const a = picked[x]!.a;
    const b = picked[y]!.a;
    return at(a.start_word_id) - at(b.start_word_id) || at(a.end_word_id) - at(b.end_word_id) || x - y;
  });
  const newId = new Map<number, string>();
  order.forEach((j, r) => newId.set(j, `a_${String(r + 1).padStart(4, "0")}`));
  const anchors = order.map((j) => ({ ...picked[j]!.a, id: newId.get(j)! }));
  // локальный id якоря окна → итоговый (свой или через точный дубль)
  const mapId = (k: number, local: string): string | undefined => {
    const a = parts[k]!.anchors.find((x) => x.id === local);
    if (!a) return undefined;
    const j = byKey.get(key(a));
    return j === undefined ? undefined : newId.get(j);
  };
  const causal: SemanticAgentOutput["causal"] = [];
  const seenLink = new Set<string>();
  parts.forEach((p, k) => {
    for (const c of p.causal) {
      const cause = mapId(k, c.cause_anchor_id);
      const effect = mapId(k, c.effect_anchor_id);
      if (!cause || !effect) {
        dropped.causal++;
        continue;
      }
      const lk = `${cause}>${effect}`;
      if (cause === effect || seenLink.has(lk)) continue;
      seenLink.add(lk);
      causal.push({ cause_anchor_id: cause, effect_anchor_id: effect });
    }
  });

  // --- числа и спорное: окно-владелец первого слова, точные дубли — один раз
  const numbers = dedupe(parts.flatMap((p, k) => p.numbers.filter((x) => own(k, x.start_word_id))), (x) => `${x.start_word_id}|${x.end_word_id}|${x.value}`)
    .sort((a, b) => at(a.start_word_id) - at(b.start_word_id));
  const disputed = dedupe(parts.flatMap((p, k) => p.disputed.filter((x) => own(k, x.start_word_id))), (x) => `${x.start_word_id}|${x.end_word_id}`)
    .sort((a, b) => at(a.start_word_id) - at(b.start_word_id));

  // --- сущности: по имени и виду, упоминания из своих отрезков
  const ents = new Map<string, SemanticAgentOutput["entities"][number]>();
  parts.forEach((p, k) => {
    for (const e of p.entities) {
      const mentions = e.mention_word_ids.filter((x) => own(k, x));
      const ek = `${normalizeToken(e.name)}|${normalizeToken(e.kind)}`;
      const cur = ents.get(ek);
      if (cur) cur.mention_word_ids.push(...mentions);
      else ents.set(ek, { ...e, mention_word_ids: [...mentions] });
    }
  });
  const entities = [...ents.values()]
    .map((e) => ({ ...e, mention_word_ids: [...new Set(e.mention_word_ids)].sort((a, b) => at(a) - at(b)) }))
    .filter((e) => e.mention_word_ids.length > 0);

  return { timeline: { chapters, anchors, entities, numbers, causal, disputed }, dropped };
}

function dedupe<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
