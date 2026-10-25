// Доработка плана сценария только по проблемным сценам (S16a F1): вместо переотправки всего
// плана Script Director получает перечень проблемных фрагментов (отклонённые сцены и сцены с
// blocking) с контекстом остального плана и отвечает только их сценами
// (`ScriptDirectorPatchSchema`). Код сливает частичный ответ с прошлым: проблемные сцены
// заменяются, разбор и стиль остаются. Сцена доработки, задевшая сцену плана, отбрасывается —
// готовая сцена важнее — и становится проблемой следующего раунда (`PatchDrop`).
import type { ScriptDirectorOutput, ScriptDirectorScene, ScriptRevisionDoc } from "@ms/contracts";
import { safeLine } from "../agents/script-prompts.js";
import type { RejectCode, ScriptPlanValidation } from "./plan-validate.js";

/** Сцена доработки, отброшенная при слиянии: пересекает сцену плана. */
export interface PatchDrop {
  start_word_id: string;
  end_word_id: string;
  code: RejectCode;
  detail: string;
}

/** Проблемный фрагмент: сцена ответа `n` (с 1; 0 — отброшенная сцена доработки) и что с ней. */
export interface PatchProblem {
  n: number;
  start_word_id: string;
  end_word_id: string;
  problems: string[];
}

const clip = (s: string, n = 80): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Проблемные фрагменты ответа: отклонённые сцены, сцены с blocking и отброшенные сцены прошлой
 * доработки. Blocking без сцены (проблема всего плана) — `undefined`: нужен весь план заново.
 */
export function patchProblems(o: ScriptDirectorOutput, v: ScriptPlanValidation, drops: readonly PatchDrop[] = []): PatchProblem[] | undefined {
  const byN = new Map<number, PatchProblem>();
  const add = (n: number, s: ScriptDirectorScene, line: string) => {
    const p = byN.get(n) ?? { n, start_word_id: s.start_word_id, end_word_id: s.end_word_id, problems: [] };
    p.problems.push(line);
    byN.set(n, p);
  };
  for (const r of v.rejected) {
    const s = o.scenes[r.n - 1];
    if (s) add(r.n, s, `${r.code} — ${r.detail}`);
  }
  for (const x of v.issues) {
    if (x.severity !== "blocking") continue;
    const n = x.item_id ? v.sources[x.item_id] : undefined;
    const s = n === undefined ? undefined : o.scenes[n - 1];
    if (n === undefined || !s) return undefined;
    add(n, s, `${x.code} — ${x.message}`);
  }
  const out = [...byN.values()];
  for (const d of drops) out.push({ n: 0, start_word_id: d.start_word_id, end_word_id: d.end_word_id, problems: [`${d.code} — ${d.detail}`] });
  return out;
}

/** Свободные слова вокруг фрагмента: от конца предыдущей сцены плана до начала следующей, в своём блоке. */
function freeRange(doc: ScriptRevisionDoc, kept: readonly { si: number; ei: number }[], si: number): { from: string; to: string } | undefined {
  const words = doc.words;
  const inside = kept.find((k) => k.si <= si && si <= k.ei);
  const anchor = inside ? inside.ei + 1 : si;
  if (anchor >= words.length) return undefined;
  const block = words[Math.min(si, words.length - 1)]!.block_id;
  let from = Math.max(-1, ...kept.filter((k) => k.ei < anchor).map((k) => k.ei)) + 1;
  let to = Math.min(words.length, ...kept.filter((k) => k.si >= anchor).map((k) => k.si)) - 1;
  while (from <= to && words[from]!.block_id !== block) from++;
  while (to >= from && words[to]!.block_id !== block) to--;
  return from <= to ? { from: words[from]!.id, to: words[to]!.id } : undefined;
}

/**
 * Раздел задачи доработки: сцены плана как контекст («не меняется») и проблемные фрагменты со
 * свободными словами вокруг; ответ — только сцены этих фрагментов. Строки ответа агента — `safeLine`.
 */
export function scriptPatchSection(doc: ScriptRevisionDoc, o: ScriptDirectorOutput, problems: readonly PatchProblem[]): string {
  const pos = new Map(doc.words.map((w, i) => [w.id, i]));
  const redo = new Set(problems.map((p) => p.n));
  const kept = o.scenes
    .map((s, i) => ({ s, n: i + 1, si: pos.get(s.start_word_id), ei: pos.get(s.end_word_id) }))
    .filter((x): x is { s: ScriptDirectorScene; n: number; si: number; ei: number } => !redo.has(x.n) && x.s.decision === "plan" && x.si !== undefined && x.ei !== undefined && x.si <= x.ei)
    .sort((a, b) => a.si - b.si);
  const L: string[] = ["# Доработка плана: только проблемные фрагменты", "",
    "Остальной план принят. Его сцены — контекст (соседние сцены — другим приёмом и формой времени), их не переделывай:", ""];
  for (const k of kept) L.push(`- ${k.s.start_word_id}–${k.s.end_word_id} · ${k.s.technique ?? "—"} · ${safeLine(clip(k.s.idea))} — не меняется`);
  if (kept.length === 0) L.push("- (сцен нет)");
  L.push("", "Переделай только эти фрагменты:", "");
  for (const p of problems) {
    const si = pos.get(p.start_word_id);
    const free = si === undefined ? undefined : freeRange(doc, kept, si);
    L.push(`- ${p.start_word_id}–${p.end_word_id}${free ? ` (свободные слова ${free.from}–${free.to})` : ""}: ${p.problems.map((x) => safeLine(clip(x, 400))).join("; ")}`);
  }
  L.push("",
    "Ответь только сценами этих фрагментов: `{ \"scenes\": [...] }`, поля сцены — как в полном ответе, на каждый фрагмент — сцена или пропуск.",
    "Границы — только внутри свободных слов (на слова сцен плана не заходи), цитата — дословно слова от start_word_id до end_word_id. Разбор и стиль не нужны.");
  return L.join("\n");
}

/**
 * Слияние частичного ответа: сцены прошлого ответа без проблемных (`redo` — номера с 1) и сцены
 * доработки по порядку текста. Сцена доработки, пересекающая оставшуюся сцену плана, отбрасывается
 * (`drops` для сцены `plan`; пропуск отбрасывается молча). Разбор и стиль — прошлого ответа.
 */
export function mergePatch(doc: ScriptRevisionDoc, prev: ScriptDirectorOutput, redo: ReadonlySet<number>, patch: readonly ScriptDirectorScene[]): { output: ScriptDirectorOutput; drops: PatchDrop[] } {
  const pos = new Map(doc.words.map((w, i) => [w.id, i]));
  const keptScenes = prev.scenes.filter((_, i) => !redo.has(i + 1));
  const span = (s: ScriptDirectorScene) => ({ si: pos.get(s.start_word_id) ?? -1, ei: pos.get(s.end_word_id) ?? -1 });
  const planRanges = keptScenes.filter((s) => s.decision === "plan").map(span).filter((r) => r.si >= 0 && r.ei >= r.si);
  const drops: PatchDrop[] = [];
  const added: ScriptDirectorScene[] = [];
  for (const s of patch) {
    const r = span(s);
    const hit = r.si >= 0 && r.ei >= 0 ? planRanges.find((k) => r.si <= k.ei && k.si <= r.ei) : undefined;
    if (hit) {
      if (s.decision === "plan") {
        drops.push({
          start_word_id: s.start_word_id, end_word_id: s.end_word_id, code: "scene_overlap",
          detail: `сцена доработки ${s.start_word_id}–${s.end_word_id} заходит на сцену плана ${doc.words[hit.si]!.id}–${doc.words[hit.ei]!.id} — отброшена`,
        });
      }
      continue;
    }
    added.push(s);
  }
  const order = (s: ScriptDirectorScene) => pos.get(s.start_word_id) ?? Number.MAX_SAFE_INTEGER;
  const scenes = [...keptScenes, ...added].map((s, k) => ({ s, k })).sort((a, b) => order(a.s) - order(b.s) || a.k - b.k).map((x) => x.s);
  return { output: { ...prev, scenes }, drops };
}
