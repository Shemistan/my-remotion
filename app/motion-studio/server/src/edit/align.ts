// Выравнивание слов транскрипта и нового текста правки (Task 27): какие слова остались (id и
// время ASR сохраняются), какие вставлены, какие удалены. Сравнение — по `normalizeToken`.
import { normalizeToken, type TranscriptWord } from "@ms/contracts";
import { EditError } from "./errors.js";

/**
 * Предел таблицы LCS (клеток) после отсечения общего начала и конца. Правка — участок текста,
 * а не весь транскрипт: 2000 × 2000 слов — ~8 МБ и десятки мс; больше — `span_too_large`
 * (правьте частями), а не минуты O(n·m) на 20 000 слов.
 */
export const MAX_LCS_CELLS = 4_000_000;

export interface EditTokens {
  /** Слова нового текста; пунктуация отдельным токеном приклеена к соседу (`attachAfter`/`attachBefore`). */
  tokens: string[];
  /** Текст без слов, только пунктуация («!»): вызывающий приклеивает её к слову рядом с участком. */
  punctuation: string;
}

/**
 * Вид отдельного знака (токен, пустой после `normalizeToken`): `dash` — только тире и дефисы
 * (`\p{Pd}`: в речи «—» отдельный токен, остаётся через пробел); `opening` — только открывающие
 * (`\p{Ps}`, `\p{Pi}`: `«(“„[`); остальное — `closing` (`,.!?…:;»)”` и прочие, в т. ч. прямая
 * кавычка `"`). `normalizeToken` такие знаки отбрасывает, поэтому склейка на выравнивание не влияет.
 */
export function punctKind(p: string): "dash" | "opening" | "closing" {
  if (/^\p{Pd}+$/u.test(p)) return "dash";
  if (/^[\p{Ps}\p{Pi}]+$/u.test(p)) return "opening";
  return "closing";
}

/** Знак справа от слова: закрывающий — без пробела («привет,»), тире и открывающий — через пробел. */
export function attachAfter(word: string, p: string): string {
  return punctKind(p) === "closing" ? `${word}${p}` : `${word} ${p}`;
}

/** Знак слева от слова: открывающий — без пробела («(мир»), тире и закрывающий — через пробел. */
export function attachBefore(p: string, word: string): string {
  return punctKind(p) === "opening" ? `${p}${word}` : `${p} ${word}`;
}

/** Ключ сравнения слова: `normalizeToken`; у знака (пустой ключ) — сам знак, чтобы «–» ≠ «,». */
export function alignKey(text: string): string {
  return normalizeToken(text) || `\u0000${text.trim()}`;
}

/** Индексы `a`, попавшие в LCS `a` и `b` по точному совпадению (короткие списки знаков). */
function lcsMatched(a: string[], b: string[]): Set<number> {
  const out = new Set<number>();
  if (a.length === 0 || b.length === 0 || a.length * b.length > MAX_LCS_CELLS) return out;
  const w = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
  }
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      out.add(i++);
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Токены текста правки: NFC, невидимые форматирующие символы (`\p{Cf}`) убраны, управляющие и
 * разделители строк — пробел, деление по пробельным. Токен, пустой после `normalizeToken`, — знак
 * (`punctKind`): закрывающий и тире — к предыдущему слову, открывающий — к следующему; нет соседа
 * с этой стороны — к соседу с другой. Знаки подряд сохраняют порядок («да ) » ;» → «да)»;»).
 * `asrPunct` — знаки, которые в участке были отдельными словами ASR («–», «,»), по порядку: знак
 * текста, сопоставленный с ними (LCS по точному тексту), остаётся отдельным токеном — его слово
 * сохраняет id и время (S17c). Остальные знаки приклеиваются, как выше.
 */
export function tokenizeEdit(text: string, asrPunct: string[] = []): EditTokens {
  const clean = text.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ");
  const raw = clean.split(/\s+/u).filter((t) => t !== "");
  const punctAt = raw.flatMap((t, i) => (normalizeToken(t) === "" ? [i] : []));
  const standalone = new Set([...lcsMatched(punctAt.map((i) => raw[i]!), asrPunct)].map((k) => punctAt[k]!));
  const tokens: string[] = [];
  const lead: string[] = []; // знаки, ждущие следующего слова
  for (const [r, t] of raw.entries()) {
    if (normalizeToken(t) === "" && !standalone.has(r)) {
      if (tokens.length > 0 && lead.length === 0 && punctKind(t) !== "opening") tokens[tokens.length - 1] = attachAfter(tokens[tokens.length - 1]!, t);
      else lead.push(t);
      continue;
    }
    tokens.push(lead.reduceRight((acc, p) => attachBefore(p, acc), t));
    lead.length = 0;
  }
  if (lead.length > 0 && tokens.length > 0) {
    // открывающий знак в конце текста — к последнему слову (через пробел)
    for (const p of lead) tokens[tokens.length - 1] = attachAfter(tokens[tokens.length - 1]!, p);
    lead.length = 0;
  }
  return { tokens, punctuation: lead.slice(1).reduce((acc, p) => attachAfter(acc, p), lead[0] ?? "") };
}

/**
 * Шаг выравнивания по порядку текста: слово осталось (с новым текстом, время прежнее), заменено
 * (id прежний, время пересчитывается из диапазона заменённых слов серии), удалено или вставлено.
 * В серии между соседними оставшимися словами: заменённые, затем удалённые, затем вставленные.
 */
export type AlignStep =
  | { kind: "kept"; word_id: string; text: string }
  | { kind: "replaced"; word_id: string; text: string }
  | { kind: "removed"; word_id: string }
  | { kind: "inserted"; text: string };

/**
 * Выравнивание слов `old` и токенов `tokens`: общее начало и конец, затем LCS по
 * `alignKey` (`normalizeToken`, у знака — сам знак) на середине. Между соседними совпадениями поровну удалённых и вставленных —
 * замена один к одному (то же слово, новый текст: исправление ошибки ASR не теряет время).
 * N удалённых и M вставленных (N ≠ M, оба > 0) — первые min(N, M) id сохраняются по порядку
 * (`replaced`), лишние старые — `removed`, лишние новые — `inserted`: слияние «семь сот» →
 * «семьсот» и разбиение не рвут якоря EDL и плана. `removed` — id удалённых по порядку.
 */
export function alignTokenList(old: Pick<TranscriptWord, "id" | "text">[], tokens: string[]): { steps: AlignStep[]; removed: string[] } {
  const a = old.map((x) => alignKey(x.text));
  const b = tokens.map((t) => alignKey(t));
  const n = a.length;
  const m = b.length;
  let p = 0;
  while (p < n && p < m && a[p] === b[p]) p++;
  let q = 0;
  while (q < n - p && q < m - p && a[n - 1 - q] === b[m - 1 - q]) q++;
  const rows = n - p - q;
  const cols = m - p - q;
  if (rows * cols > MAX_LCS_CELLS) {
    throw new EditError("span_too_large", `участок правки слишком велик для выравнивания (${rows} × ${cols} слов) — правьте частями`);
  }
  // ops по порядку: m — совпадение (i, j), d — удаление i, i — вставка j
  type Op = { t: "m"; i: number; j: number } | { t: "d"; i: number } | { t: "i"; j: number };
  const ops: Op[] = [];
  for (let k = 0; k < p; k++) ops.push({ t: "m", i: k, j: k });
  if (rows > 0 && cols > 0) {
    // dp[i][j] — LCS суффиксов a[p+i..], b[p+j..]; значения ≤ min(rows, cols) ≤ √MAX < 2^16
    const w = cols + 1;
    const dp = new Uint16Array((rows + 1) * w);
    for (let i = rows - 1; i >= 0; i--) {
      for (let j = cols - 1; j >= 0; j--) {
        dp[i * w + j] = a[p + i] === b[p + j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (a[p + i] === b[p + j] && dp[i * w + j] === dp[(i + 1) * w + j + 1]! + 1) ops.push({ t: "m", i: p + i++, j: p + j++ });
      else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) ops.push({ t: "d", i: p + i++ });
      else ops.push({ t: "i", j: p + j++ });
    }
    while (i < rows) ops.push({ t: "d", i: p + i++ });
    while (j < cols) ops.push({ t: "i", j: p + j++ });
  } else {
    for (let i = 0; i < rows; i++) ops.push({ t: "d", i: p + i });
    for (let j = 0; j < cols; j++) ops.push({ t: "i", j: p + j });
  }
  for (let k = 0; k < q; k++) ops.push({ t: "m", i: n - q + k, j: m - q + k });

  const steps: AlignStep[] = [];
  const removed: string[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k]!;
    if (op.t === "m") {
      steps.push({ kind: "kept", word_id: old[op.i]!.id, text: tokens[op.j]! });
      k++;
      continue;
    }
    // серия без совпадений между соседними якорями
    const dels: number[] = [];
    const ins: number[] = [];
    for (; k < ops.length && ops[k]!.t !== "m"; k++) {
      const o = ops[k]!;
      if (o.t === "d") dels.push(o.i);
      else if (o.t === "i") ins.push(o.j);
    }
    if (dels.length === ins.length) {
      dels.forEach((i, x) => steps.push({ kind: "kept", word_id: old[i]!.id, text: tokens[ins[x]!]! }));
    } else {
      const r = Math.min(dels.length, ins.length);
      for (let x = 0; x < r; x++) steps.push({ kind: "replaced", word_id: old[dels[x]!]!.id, text: tokens[ins[x]!]! });
      for (const i of dels.slice(r)) {
        removed.push(old[i]!.id);
        steps.push({ kind: "removed", word_id: old[i]!.id });
      }
      for (const j of ins.slice(r)) steps.push({ kind: "inserted", text: tokens[j]! });
    }
  }
  return { steps, removed };
}

export interface AlignResult {
  /** Слова с сохранённым id, включая заменённые при N → M (`replaced`). */
  kept: { word_id: string; text: string }[];
  /** `after_word_id` — оставшееся слово перед вставкой; `null` — перед первым оставшимся. */
  inserted: { after_word_id: string | null; text: string }[];
  removed: string[];
}

/** Выравнивание слов участка и нового текста (LCS по `normalizeToken`, пунктуация — к соседу). */
export function alignTokens(oldWords: Pick<TranscriptWord, "id" | "text">[], newText: string): AlignResult {
  const { steps, removed } = alignTokenList(oldWords, tokenizeEdit(newText).tokens);
  const out: AlignResult = { kept: [], inserted: [], removed };
  let after: string | null = null;
  for (const s of steps) {
    if (s.kind === "kept" || s.kind === "replaced") {
      out.kept.push({ word_id: s.word_id, text: s.text });
      after = s.word_id;
    } else if (s.kind === "inserted") out.inserted.push({ after_word_id: after, text: s.text });
  }
  return out;
}
