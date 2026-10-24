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
  /** Слова нового текста; пунктуация отдельным токеном приклеена к соседу (через пробел). */
  tokens: string[];
  /** Текст без слов, только пунктуация («!»): вызывающий приклеивает её к слову рядом с участком. */
  punctuation: string;
}

/**
 * Токены текста правки: NFC, невидимые форматирующие символы (`\p{Cf}`) убраны, управляющие и
 * разделители строк — пробел, деление по пробельным. Токен, пустой после `normalizeToken`
 * (пунктуация, тире), приклеивается к предыдущему слову, в начале — к следующему.
 */
export function tokenizeEdit(text: string): EditTokens {
  const clean = text.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ");
  const tokens: string[] = [];
  let lead = "";
  for (const t of clean.split(/\s+/u)) {
    if (t === "") continue;
    if (normalizeToken(t) === "") {
      if (tokens.length > 0) tokens[tokens.length - 1] += ` ${t}`;
      else lead = lead ? `${lead} ${t}` : t;
      continue;
    }
    tokens.push(lead ? `${lead} ${t}` : t);
    lead = "";
  }
  return { tokens, punctuation: tokens.length > 0 ? "" : lead };
}

/**
 * Шаг выравнивания по порядку текста: слово осталось (с новым текстом), удалено или вставлено.
 * В серии между соседними оставшимися словами удалённые идут перед вставленными.
 */
export type AlignStep =
  | { kind: "kept"; word_id: string; text: string }
  | { kind: "removed"; word_id: string }
  | { kind: "inserted"; text: string };

/**
 * Выравнивание слов `old` и токенов `tokens`: общее начало и конец, затем LCS по
 * `normalizeToken` на середине. Между соседними совпадениями поровну удалённых и вставленных —
 * замена один к одному (то же слово, новый текст: исправление ошибки ASR не теряет время),
 * иначе — удаление и вставка. `removed` — id удалённых по порядку (те же, что шаги `removed`).
 */
export function alignTokenList(old: Pick<TranscriptWord, "id" | "text">[], tokens: string[]): { steps: AlignStep[]; removed: string[] } {
  const a = old.map((x) => normalizeToken(x.text));
  const b = tokens.map((t) => normalizeToken(t));
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
      for (const i of dels) {
        removed.push(old[i]!.id);
        steps.push({ kind: "removed", word_id: old[i]!.id });
      }
      for (const j of ins) steps.push({ kind: "inserted", text: tokens[j]! });
    }
  }
  return { steps, removed };
}

export interface AlignResult {
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
    if (s.kind === "kept") {
      out.kept.push({ word_id: s.word_id, text: s.text });
      after = s.word_id;
    } else if (s.kind === "inserted") out.inserted.push({ after_word_id: after, text: s.text });
  }
  return out;
}
