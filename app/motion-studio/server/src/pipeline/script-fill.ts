// Дозаполнение сцен плана сценария (S16a F2/F3): задача `script.plan` со входом `fill`. Сцены
// текущей ревизии плана с `fill: pending` (добавлены человеком по выделению или сменён приём) —
// по малому вызову Script Director на сцену (`buildSceneFillTask`: фрагмент, соседи, стиль
// проекта), ответ `ScriptDirectorPatchSchema` с одной сценой. Код берёт из ответа назначение,
// идею, паттерн (чужой приёму — паттерн приёма), форму времени, важность, термины фрагмента и числа
// с цитатой из фрагмента и совпавшим значением; слова и приём сцены — человека. Не удалось (два
// вызова) — `fill: failed`. Итог — следующая ревизия того же плана (fencing, Approval B
// пересчитывается), проверки — `planIssues`. Замок плана держит задача — правки человека ждут.
import { type PatternSlug, type ProjectStyleDoc, type ScriptDirectorPatch, ScriptDirectorPatchSchema, type ScriptPlanRevisionDoc, ScriptPlanRevisionDocSchema, type ScriptSceneItem } from "@ms/contracts";
import type { ZodType } from "zod";
import { type FillNeighbour, buildSceneFillTask } from "../agents/script-prompts.js";
import { approvalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore } from "../artifacts/store.js";
import { scriptPlans } from "../db/repos/script.js";
import type { HandlerResult, JobContext } from "../jobs/types.js";
import { patternOf } from "../script/plan-ops.js";
import { planOutdated } from "../script/plan-state.js";
import { planIssues, quoteInFragment, valueMatches } from "../script/plan-validate.js";
import { SCRIPT_PLAN_FILE, currentScript, currentScriptPlan } from "../script/read.js";
import { TECHNIQUE_BY_PATTERN } from "../script/technique.js";
import { planPublications } from "./plan-visual.js";
import { recordAgentRuns } from "./record.js";
import { type RunCtx, toolless } from "./steps.js";
import type { StorageStatus } from "@ms/core";

/** Вход `fill` задачи `script.plan`: план и ревизия, в которой сцены ждут дозаполнения. */
export interface FillInput {
  plan_id: string;
  revision: number;
}

export interface SceneFillResult {
  plan_id: string;
  /** Опубликованная ревизия (или текущая, если дозаполнять было нечего). */
  revision: number;
  filled: string[];
  failed: string[];
  reused?: boolean;
}

export interface SceneFillDeps {
  ctx: JobContext;
  root: string;
  storage: () => Promise<StorageStatus>;
  rc: RunCtx;
  projectId: string;
  fill: FillInput;
  patterns: Record<PatternSlug, string>;
  style: ProjectStyleDoc | undefined;
}

/** Ответ агента → поля сцены; `string` — почему не годится. */
function applyAnswer(item: ScriptSceneItem, out: ScriptDirectorPatch, fragment: readonly string[], ids: ReadonlySet<string>): ScriptSceneItem | string {
  const s = out.scenes.find((x) => x.decision === "plan");
  if (!s) return "в ответе нет сцены с decision: plan";
  if (s.idea.trim() === "") return "пустая идея";
  const pattern = s.pattern && TECHNIQUE_BY_PATTERN[s.pattern].includes(item.technique) ? s.pattern : patternOf(item.technique);
  const next: ScriptSceneItem = {
    ...item,
    // назначение, заданное человеком (сцена человека, непустое), — его; иначе — Director (ревью M1)
    purpose: item.origin === "user" && item.purpose.trim() !== "" ? item.purpose : s.purpose.trim() || item.purpose,
    idea: s.idea.trim(),
    pattern,
    importance: s.importance,
    key_terms: s.key_terms.filter((k) => ids.has(k.word_id)),
    data: s.data.filter((d) => quoteInFragment(d.quote, fragment) && valueMatches(d.value, d.quote) !== false),
  };
  delete next.structure_rule;
  if (s.structure_rule) next.structure_rule = s.structure_rule;
  delete next.fill;
  return next;
}

export async function sceneFill(d: SceneFillDeps): Promise<HandlerResult> {
  const { ctx, root, rc, projectId, fill } = d;
  const done = (r: SceneFillResult): HandlerResult => {
    ctx.progress(1, "done");
    return { status: "completed", outputRefs: r };
  };
  // M3: ревизия этой задачей уже опубликована
  const pub = planPublications(ctx.db, projectId, ctx.job.id).plan;
  if (pub) {
    ctx.emit("plan_reused", `дозаполнение: ревизия ${pub.id} r${pub.revision} опубликована прошлой попыткой`);
    return done({ plan_id: pub.id, revision: pub.revision, filled: [], failed: [], reused: true });
  }
  const cur = currentScriptPlan(ctx.db, root, projectId);
  const script = currentScript(ctx.db, root, projectId);
  // план устарел (текст сменили после постановки) — id слов к тексту не относятся (ревью M2)
  const pending = cur && script && cur.planId === fill.plan_id && !planOutdated(cur.doc, script) ? cur.doc.items.filter((x) => x.status === "accepted" && x.fill === "pending") : [];
  if (!cur || !script || pending.length === 0) {
    ctx.emit("fill_nothing", "дозаполнять нечего: план перестроен или устарел, или сцены уже заполнены");
    return done({ plan_id: cur?.planId ?? fill.plan_id, revision: cur?.doc.revision ?? fill.revision, filled: [], failed: [] });
  }
  const doc = cur.doc;
  const words = script.words;
  const pos = new Map(words.map((w, i) => [w.id, i]));
  const accepted = doc.items.filter((x) => x.status === "accepted");
  const nb = (x: ScriptSceneItem | undefined): FillNeighbour | undefined =>
    x && { start_word_id: x.start_word_id, end_word_id: x.end_word_id, technique: x.technique, idea: x.idea, quote: x.quote };

  const filled: string[] = [];
  const failed: string[] = [];
  const items = new Map(doc.items.map((x) => [x.id, x]));
  let seq = 0;
  // ревью S16a M8: время дозаполнения — в журнал задачи (по сцене и итогом): замок плана держится всё время
  const secs = (ms: number) => (ms / 1000).toFixed(1).replace(".", ",");
  const t0 = Date.now();
  for (const [k, item] of pending.entries()) {
    const ts = Date.now();
    const calls = seq;
    ctx.progress(0.1 + (0.8 * k) / pending.length, "agent");
    const at = accepted.findIndex((x) => x.id === item.id);
    const si = pos.get(item.start_word_id)!;
    const ei = pos.get(item.end_word_id)!;
    const fragment = words.slice(si, ei + 1).map((w) => w.text);
    const ids = new Set(words.slice(si, ei + 1).map((w) => w.id));
    let why: string | undefined;
    let result: ScriptSceneItem | undefined;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      const n = ++seq;
      const fix = why;
      const r = await toolless(rc, "script_director", "prepare", `Script Director (дозаполнение ${item.id})`, (workdir) => buildSceneFillTask({
        script, reading: doc.reading, patterns: d.patterns, style: d.style?.base ?? null,
        item: { id: item.id, start_word_id: item.start_word_id, end_word_id: item.end_word_id, technique: item.technique, purpose: item.purpose },
        prev: nb(accepted[at - 1]), next: nb(accepted[at + 1]), workdir, ...(fix ? { fix } : {}),
      }, { ...rc.taskRun, seq: n }), ScriptDirectorPatchSchema as ZodType<ScriptDirectorPatch>);
      if (!r.ok) {
        // отмена — исключением (итог задачи решает `planFailure` вызывающего), хранилище и orphaned — сразу
        if (r.stage === "cancelled" || ctx.signal.aborted) throw new DOMException(r.message, "AbortError");
        if (r.stage === "storage") return { status: "failed", error: { code: "storage_unavailable", stage: "storage", message: r.message } };
        if (r.stage === "orphaned") return { status: "blocked", error: { code: "stale_process", stage: "orphaned", message: r.message } };
        why = r.message;
        continue;
      }
      const next = applyAnswer(item, r.output, fragment, ids);
      if (typeof next === "string") why = next;
      else result = next;
    }
    const ms = Date.now() - ts;
    ctx.emit("fill_scene", `${item.id}: ${result ? "дозаполнена" : "не дозаполнена"} за ${secs(ms)} с (вызовов Director: ${seq - calls})`, { item_id: item.id, ok: result !== undefined, ms, calls: seq - calls });
    if (result) {
      items.set(item.id, result);
      filled.push(item.id);
    } else {
      items.set(item.id, { ...item, fill: "failed" });
      failed.push(item.id);
      ctx.emit("fill_failed", `${item.id}: дозаполнение не удалось (${(why ?? "").slice(0, 300)}) — сцена ждёт идею от человека`);
    }
  }
  recordAgentRuns(ctx.db, ctx.job.id, ctx.attempt, rc.records);

  ctx.progress(0.9, "publish");
  const nextItems = doc.items.map((x) => items.get(x.id)!);
  const { issues, diversity } = planIssues(nextItems, script, doc.reading, doc.fps);
  // ревизия агента: операций человека у неё нет
  const base: Partial<ScriptPlanRevisionDoc> = { ...doc };
  delete base.ops;
  const next: ScriptPlanRevisionDoc = ScriptPlanRevisionDocSchema.parse({
    ...base, revision: doc.revision + 1, parent_revision: doc.revision, items: nextItems, issues, diversity,
  });
  const destRel = artifactPaths(root, projectId).planRev(next.plan_id, next.revision);
  const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
  await store.publishJobDoc({ jobId: ctx.job.id, attempt: ctx.attempt }, destRel, SCRIPT_PLAN_FILE, next, (db, files) => {
    scriptPlans.insertRevision(db, { doc: next, rel_path: `${destRel}/${SCRIPT_PLAN_FILE}`, sha256: files[0]!.sha256 });
    approvalState(db, projectId, "B", currentSubject(db, projectId, "B"));
  });
  ctx.emit("fill_done", `дозаполнено сцен: ${filled.length}${failed.length > 0 ? `, не удалось: ${failed.join(", ")}` : ""} — ревизия плана r${next.revision}; сцен в работе: ${pending.length}, всего ${secs(Date.now() - t0)} с`);
  return done({ plan_id: next.plan_id, revision: next.revision, filled, failed });
}
