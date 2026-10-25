// Правка плана сценария человеком (спека §5.3, §7; трек A, S4): операции `ScriptPlanOp` →
// следующая ревизия того же плана. Цитату, слова, кадры и `at_s` считает код (`quoteOf`,
// `readingFrames`, `atSeconds`), проверки и разнообразие — заново, той же функцией, что у
// S3 (`planIssues`). Правка сцены меняет её отпечаток
// (`itemFingerprint`) — готовая сцена становится stale (§5.4). Синхронная публикация —
// `ArtifactStore.writeRevision` с замком `project:<id>:plan` (идёт `script.plan` — 409 `resource_busy`).
import {
  type PatternSlug, type ScriptPlanOp, type ScriptPlanRevisionDoc, type ScriptRevisionDoc,
  type ScriptSceneItem, ScriptPlanRevisionDocSchema, type Technique, atSeconds, normalizeToken, quoteOf, readingFrames,
} from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import { ApiError, notFound } from "../api/errors.js";
import { approvalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { ResourceBusyError } from "../artifacts/store.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import { scriptPlans, scripts } from "../db/repos/script.js";
import { RevisionConflictError } from "../edit/errors.js";
import type { EditDeps } from "../edit/transcript-ops.js";
import { projectLockKey, resourceBusy } from "../jobs/locks.js";
import { planIssues, quoteInFragment } from "./plan-validate.js";
import { planOutdated } from "./plan-state.js";
import { ruNumberParse } from "./ru-numbers.js";
import { SCRIPT_PLAN_FILE, currentScript, currentScriptPlan } from "./read.js";
import { TECHNIQUE_BY_PATTERN, pickTechnique } from "./technique.js";

export type ScriptPlanErrorCode = "unknown_item" | "bad_range" | "overlap" | "no_change";

/** Операция неприменима (422; сообщение начинается с кода, как у `EditError`); `extra` — поля тела ответа (`item_id` сцены пересечения и т. п.). */
export class ScriptPlanError extends ApiError {
  constructor(code: ScriptPlanErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(422, code, `${code}: ${message}`, extra);
    this.name = "ScriptPlanError";
  }
}

/** Паттерн приёма для сцены пользователя: паттерн, где приём первый, иначе первый, где он есть. */
export function patternOf(t: Technique): PatternSlug {
  const all = Object.entries(TECHNIQUE_BY_PATTERN) as [PatternSlug, readonly Technique[]][];
  return (all.find(([, ts]) => ts[0] === t) ?? all.find(([, ts]) => ts.includes(t)))?.[0] ?? "abstract-concepts";
}

/** 409 `plan_outdated`: план построен не по текущей ревизии текста. */
const planOutdatedError = (): ApiError => new ApiError(409, "plan_outdated", "текст сценария изменился после плана — перестройте план");

const clip = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Во фрагменте есть число: слово из цифр («1.24», «25%») или числительное словами («восемь»). */
function hasNumber(fragment: readonly string[]): boolean {
  return fragment.some((t) => /^-?\d+%?$/u.test(normalizeToken(t))) || ruNumberParse(fragment.join(" ")).values.length > 0;
}

/** Текст термина — слова текста с `word_id` подряд (по `normalizeToken`, без знаков и регистра). */
function termMatches(text: string, words: readonly { text: string }[], p: number, ei: number): boolean {
  const q = text.split(/\s+/u).map(normalizeToken).join("");
  if (q === "") return false;
  let acc = "";
  for (let j = p; j <= ei && acc.length < q.length; j++) {
    acc += normalizeToken(words[j]!.text);
    if (!q.startsWith(acc)) return false;
  }
  return acc === q;
}

/**
 * Операции над ревизией плана → следующая ревизия (`revision + 1`, `parent_revision`, `ops`).
 * `set_status` — снять/вернуть (вернуть сцену, пересекающую принятую, — `overlap`); `modify` —
 * приём (прежняя `structure_rule` снимается; без явного `pattern` — паттерн приёма, без явной
 * идеи — идея сброшена и в плане агента `fill: pending`, S16a F3), паттерн, идея (непустая снимает
 * `fill`), назначение, термины (по словам текста), границы
 * (пересчёт цитаты, слов, кадров, `at_s`; термины, числа и якоря вне нового фрагмента отпадают);
 * `add` — принятая сцена пользователя, следующий свободный `ss_NNN`, приём из запроса или
 * `pickTechnique` по паттерну (число во фрагменте — `quantities`) и соседям, в плане агента —
 * `fill: pending` (S16a F2: идею, назначение и числа дозаполнит Director); пропуски агента под
 * ней обрезаются; `set_reading` — кадры и `at_s` всех сцен. Сцены — по порядку текста. План не по
 * текущему тексту — 409 `plan_outdated`. Ошибки (`ScriptPlanError`, 422): `unknown_item`,
 * `bad_range` (нет слова, обратный порядок, другой блок, термин вне сцены или не по словам
 * текста), `overlap` (с принятой сценой), `no_change`.
 */
export function applyScriptPlanOps(doc: ScriptPlanRevisionDoc, ops: ScriptPlanOp[], script: ScriptRevisionDoc): ScriptPlanRevisionDoc {
  if (planOutdated(doc, script)) throw planOutdatedError();
  // S16a F2/F3: в плане агента сцену по выделению и сцену со сменённым приёмом дозаполняет Director
  const fills = doc.agent !== "skipped";
  const words = script.words;
  const pos = new Map(words.map((x, i) => [x.id, i]));
  const anchors = new Map(doc.analysis.anchors.map((a) => [a.id, a]));
  let reading = doc.reading;
  let items = doc.items.map((x) => structuredClone(x));
  let skipped = doc.skipped.map((x) => ({ ...x }));

  const span = (x: Pick<ScriptSceneItem, "start_word_id" | "end_word_id">): { si: number; ei: number } => ({
    si: pos.get(x.start_word_id) ?? -1, ei: pos.get(x.end_word_id) ?? -1,
  });
  const range = (startId: string, endId: string): { si: number; ei: number } => {
    const si = pos.get(startId);
    const ei = pos.get(endId);
    if (si === undefined || ei === undefined) throw new ScriptPlanError("bad_range", `в тексте нет слова ${si === undefined ? startId : endId}`);
    if (ei < si) throw new ScriptPlanError("bad_range", `начало ${startId} после конца ${endId}`);
    if (words[si]!.block_id !== words[ei]!.block_id) throw new ScriptPlanError("bad_range", `фрагмент ${startId}–${endId} в двух блоках (${words[si]!.block_id} → ${words[ei]!.block_id})`);
    return { si, ei };
  };
  const assertFree = (si: number, ei: number, selfId?: string): void => {
    const other = items.find((x) => x.id !== selfId && x.status === "accepted" && (() => {
      const o = span(x);
      return si <= o.ei && o.si <= ei;
    })());
    if (other) throw new ScriptPlanError("overlap", `фрагмент ${words[si]!.id}–${words[ei]!.id} пересекается со сценой ${other.id}`, { item_id: other.id });
  };
  const find = (id: string): number => {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) throw new ScriptPlanError("unknown_item", `в плане нет сцены ${id}`);
    return i;
  };
  const inRange = (wordId: string, si: number, ei: number): boolean => {
    const p = pos.get(wordId);
    return p !== undefined && p >= si && p <= ei;
  };
  const neighbours = (si: number): Technique[] => {
    const acc = items.filter((x) => x.status === "accepted").sort((a, b) => span(a).si - span(b).si);
    const next = acc.findIndex((x) => span(x).si > si);
    const prev = next < 0 ? acc.at(-1) : acc[next - 1];
    return [prev?.technique, next < 0 ? undefined : acc[next]?.technique].filter((t): t is Technique => t !== undefined);
  };

  for (const op of ops) {
    if (op.op === "set_status") {
      const i = find(op.item_id);
      const x = items[i]!;
      if (op.status === "accepted" && x.status !== "accepted") {
        const { si, ei } = span(x);
        assertFree(si, ei, x.id);
      }
      items[i] = { ...x, status: op.status };
    } else if (op.op === "modify") {
      const i = find(op.item_id);
      const x = items[i]!;
      const { start_word_id, end_word_id, key_terms, technique, ...fields } = op.patch;
      const next: ScriptSceneItem = { ...x, ...fields };
      if (technique !== undefined && technique !== x.technique) {
        next.technique = technique;
        delete next.structure_rule;
        // F3: идея и паттерн прежнего приёма новому не годятся — сброс (паттерн — приёма), дозаполнение;
        // в плане без агента дозаполнять некому — идея остаётся человеку (ревью S16a M7)
        if (fields.pattern === undefined) next.pattern = patternOf(technique);
        if (fields.idea === undefined && fills) {
          next.idea = "";
          next.fill = "pending";
        }
      }
      // идею вписал человек — сцена заполнена
      if (fields.idea !== undefined && fields.idea.trim() !== "") delete next.fill;
      const s = start_word_id ?? x.start_word_id;
      const e = end_word_id ?? x.end_word_id;
      const { si, ei } = range(s, e);
      if (s !== x.start_word_id || e !== x.end_word_id) {
        if (x.status === "accepted") assertFree(si, ei, x.id);
        const fragment = words.slice(si, ei + 1).map((w) => w.text);
        next.start_word_id = s;
        next.end_word_id = e;
        next.key_terms = next.key_terms.filter((k) => inRange(k.word_id, si, ei));
        next.data = next.data.filter((d) => quoteInFragment(d.quote, fragment));
        // якорь разбора остаётся, если хоть одно его слово во фрагменте
        next.anchor_ids = next.anchor_ids.filter((id) => {
          const a = anchors.get(id);
          const as = a ? pos.get(a.start_word_id) : undefined;
          const ae = a ? pos.get(a.end_word_id) : undefined;
          return as !== undefined && ae !== undefined && as <= ei && si <= ae;
        });
      }
      if (key_terms !== undefined) {
        const out = key_terms.find((k) => !inRange(k.word_id, si, ei));
        if (out) throw new ScriptPlanError("bad_range", `термин «${clip(out.text)}» (${out.word_id}) вне сцены ${x.id}`);
        const wrong = key_terms.find((k) => !termMatches(k.text, words, pos.get(k.word_id)!, ei));
        if (wrong) throw new ScriptPlanError("bad_range", `термин «${clip(wrong.text)}» не совпадает со словами текста с ${wrong.word_id} («${clip(words[pos.get(wrong.word_id)!]!.text)}»)`);
        next.key_terms = key_terms;
      }
      items[i] = next;
    } else if (op.op === "add") {
      const { si, ei } = range(op.start_word_id, op.end_word_id);
      assertFree(si, ei);
      const n = items.reduce((m, x) => Math.max(m, Number(x.id.slice(3))), 0) + 1;
      // без приёма: число во фрагменте — паттерн quantities, приём по нему и соседям
      const numeric = op.technique === undefined && hasNumber(words.slice(si, ei + 1).map((w) => w.text));
      const technique = op.technique ?? pickTechnique(numeric ? "quantities" : undefined, neighbours(si));
      const pattern: PatternSlug = numeric ? "quantities" : patternOf(technique);
      // пропуски агента под новой сценой обрезаются: остаются части вне её слов
      skipped = skipped.flatMap((k) => {
        const ks = pos.get(k.start_word_id);
        const ke = pos.get(k.end_word_id);
        if (ks === undefined || ke === undefined || ke < si || ei < ks) return [k];
        const part = (a: number, b: number) => ({ ...k, start_word_id: words[a]!.id, end_word_id: words[b]!.id, quote: quoteOf(script, words[a]!.id, words[b]!.id) });
        return [...(ks < si ? [part(ks, si - 1)] : []), ...(ei < ke ? [part(ei + 1, ke)] : [])];
      });
      items.push({
        id: `ss_${String(n).padStart(3, "0")}`, status: "accepted", origin: "user",
        start_word_id: op.start_word_id, end_word_id: op.end_word_id, quote: "", block_id: words[si]!.block_id, words: 1, at_s: 0,
        frames: readingFrames(1, reading, doc.fps),
        technique, pattern, purpose: op.purpose ?? "", idea: "", key_terms: [], data: [], importance: 2, anchor_ids: [],
        ...(fills ? { fill: "pending" as const } : {}),
      });
    } else {
      reading = op.reading;
    }
  }

  // время и цитата всех сцен — по формулам от итоговой скорости чтения; порядок — по тексту
  items = items.map((x) => {
    const { si, ei } = span(x);
    const blockId = words[si]!.block_id;
    const before = words.slice(0, si).filter((w) => w.block_id === blockId).length;
    const n = ei - si + 1;
    return { ...x, quote: quoteOf(script, x.start_word_id, x.end_word_id), block_id: blockId, words: n, at_s: atSeconds(before, reading), frames: readingFrames(n, reading, doc.fps) };
  });
  items = items.map((x, k) => ({ x, k, si: span(x).si })).sort((a, b) => a.si - b.si || a.k - b.k).map((r) => r.x);

  if (canonicalJson(items) === canonicalJson(doc.items) && canonicalJson(reading) === canonicalJson(doc.reading) && canonicalJson(skipped) === canonicalJson(doc.skipped)) {
    throw new ScriptPlanError("no_change", "правка не меняет план — новая ревизия не создаётся");
  }
  const { issues, diversity } = planIssues(items, script, reading, doc.fps);
  return ScriptPlanRevisionDocSchema.parse({
    ...doc, revision: doc.revision + 1, parent_revision: doc.revision, reading, items, skipped, issues, diversity, ops,
  });
}

/**
 * Синхронная правка плана сценария: новая ревизия от `base_revision`. Проект есть (404) и
 * сценарный (409 `not_script_project`); текст и план есть (409 `no_script`, `no_plan`); база —
 * текущая ревизия текущего плана (409 `revision_conflict`); план по текущему тексту (409
 * `plan_outdated`); план не пишет задача (409 `resource_busy`). Файл, индекс и устаревание
 * Approval B прежней ревизии — одна транзакция; гонка — те же 409.
 */
export async function savePlanOps(deps: EditDeps, projectId: string, body: { base_revision: number; ops: ScriptPlanOp[] }): Promise<ScriptPlanRevisionDoc> {
  const { db, store, root } = deps;
  const project = projects.get(db, projectId);
  if (!project) throw notFound(`проект ${projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
  const script = currentScript(db, root, projectId);
  if (!script) throw new ApiError(409, "no_script", "текста сценария нет");
  const cur = currentScriptPlan(db, root, projectId);
  if (!cur) throw new ApiError(409, "no_plan", "плана сценария нет");

  const lockKey = projectLockKey(projectId, "plan");
  const outdated = planOutdatedError;
  const conflict = (d: Db): Error | undefined => {
    const p = plans.byProject(d, projectId);
    const now = p?.current_revision ?? null;
    if (p?.id !== cur.planId || now !== body.base_revision) return new RevisionConflictError(`план сценария ${cur.planId}`, body.base_revision, p?.id === cur.planId ? now : null);
    if (scripts.byProject(d, projectId)?.current_revision !== script.revision) return outdated();
    return undefined;
  };
  const busy = resourceBusy(db, lockKey);
  if (busy) throw new ResourceBusyError(lockKey, busy.jobId);
  const early = conflict(db);
  if (early) throw early;
  if (planOutdated(cur.doc, script)) throw outdated();

  const doc = applyScriptPlanOps(cur.doc, body.ops, script);
  const destRel = artifactPaths(root, projectId).planRev(doc.plan_id, doc.revision);
  await store.writeRevision(destRel, SCRIPT_PLAN_FILE, doc, (d, files) => {
    scriptPlans.insertRevision(d, { doc, rel_path: `${destRel}/${SCRIPT_PLAN_FILE}`, sha256: files[0]!.sha256 });
    approvalState(d, projectId, "B", currentSubject(d, projectId, "B"));
  }, { lockKey, check: conflict });
  return doc;
}
