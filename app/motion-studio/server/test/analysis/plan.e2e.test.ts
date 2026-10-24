// Task 32 e2e: визуальный план через настоящий bootCore, очередь и раннер. (а) `talk-ru-cfr.mp4`
// (`scripts/make-media-fixtures.mjs`, речь `say -v Milena`) → `media.import` → `asr.transcribe`
// (реальный воркер ai-platform) → `roughcut.propose { useAgent: false }` → принять всё → Approval A
// → `footage.analyze { useAgent: false }` (Apple Vision) → `semantic.analyze` → `plan.visual`
// (реальный `claude`) → принять сцены → Approval B (если нет blocking) → правка EDL → `plan.recheck`
// встаёт в очередь сама → B `stale`. (б) То же на реальном talking-head отрезке `MS_TEST_TALKING_HEAD`
// (личный ролик пользователя, согласие V4 / решение 2026-10-24; обрезка — копией; без переменной тест
// пропускается): footage с агентом; читаемое резюме плана, plan.json и анализ видеоряда (кадры) —
// в tmp/plan-evidence/ для `scripts/draw-plan.mjs`. Хранилище — tmp/ репозитория (MS_ALLOW_SYSTEM_DISK=1).
// Запуск: `MS_E2E=1 npx vitest run server/test/analysis/plan.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  type EditedTimeline, type Job, type TranscriptWord, type VisualPlanRevisionDoc, type VisualPlannerOutput, VisualPlanRevisionDocSchema, mapWords,
  usToFrame, verifyQuote,
} from "@ms/contracts";
import { initStore, macosProbe } from "@ms/core";
import { approvalState } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { savePlanRevision } from "../../src/analysis/plan-ops.js";
import { currentProjectStyle, projectStyleFrom } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as edls from "../../src/db/repos/edls.js";
import * as footageRepo from "../../src/db/repos/footage.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { currentEdl, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { currentTranscript } from "../../src/edit/transcript-ops.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import { checkpointsRel } from "../../src/pipeline/checkpoints.js";
import type { FootageAnalyzeResult } from "../../src/pipeline/footage-analyze.js";
import type { PlanRecheckResult } from "../../src/pipeline/plan-recheck.js";
import type { PlanVisualResult } from "../../src/pipeline/plan-visual.js";
import type { RoughcutProposeResult } from "../../src/pipeline/roughcut-propose.js";
import type { SemanticAnalyzeResult } from "../../src/pipeline/semantic-analyze.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 40 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FIX = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, "tmp/plan-evidence");
const MS = join(REPO, "app/motion-studio");
const REAL = process.env.MS_TEST_TALKING_HEAD ? (isAbsolute(process.env.MS_TEST_TALKING_HEAD) ? process.env.MS_TEST_TALKING_HEAD : join(REPO, process.env.MS_TEST_TALKING_HEAD)) : undefined;

let tmp: string;
let root: string;
let core: Core;
const mine = new Set<string>();
const notes: string[] = [];
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];

beforeAll(async () => {
  execFileSync(process.execPath, [join(MS, "scripts/make-media-fixtures.mjs")], { stdio: "inherit" });
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  tmp = await mkdtemp(join(REPO, "tmp", "ms-plan-e2e-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  const roots = [FIX, ...(REAL ? [dirname(REAL)] : [])];
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: roots } }) + "\n");
  core = await bootCore({
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => {
      guard = svc.storageCheck;
      return registerHandlers(svc, { log: (l) => console.log(`  ${l}`) });
    },
  });
}, T);

afterAll(async () => {
  await core?.close();
  if (notes.length) {
    const md = ["# Визуальный план (Task 32) — e2e на tmp-хранилище", "", `Прогон ${new Date().toISOString()}.`, "", ...notes, ""].join("\n");
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(join(EVIDENCE, "README.md"), md);
    console.log(md);
  }
  if (tmp) await removeStore({ tmp, root, marker: undefined as never, guard: undefined as never });
});

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 200));
  }
}
async function job(type: Job["type"], projectId: string, input: Record<string, unknown>): Promise<{ j: Job; s: number }> {
  const t0 = Date.now();
  const id = enqueue(core.db, { type, projectId, input, idempotencyKey: `e2e-t32-${newId("run")}` }).job.id;
  const j = await wait(id);
  expect(j.status, `${type}: ${JSON.stringify(j.error)}`).toBe("completed");
  return { j, s: (Date.now() - t0) / 1000 };
}
const store = () => new ArtifactStore({ root, db: core.db, guard });

/** Импорт → ASR → детекторы → принять всё → Approval A → footage → semantic. */
async function analyzedProject(path: string, title: string, footageAgent: boolean) {
  const projectId = projects.create(core.db, { kind: "video", title }).id;
  const imp = await job("media.import", projectId, { projectId, method: "path", path });
  const asset = media.byProject(core.db, projectId)!;
  const asr = await job("asr.transcribe", projectId, { projectId, mediaId: asset.id, language: "ru" });
  const p = await job("roughcut.propose", projectId, { projectId, useAgent: false });
  const o = p.j.output_refs as RoughcutProposeResult;
  const d = currentEdl(core.db, root, o.edl_id);
  if (d.decisions.length > 0) {
    await saveEdlRevision({ db: core.db, store: store(), root, roughcut: core.config.roughcut }, o.edl_id, {
      base_revision: o.revision, ops: d.decisions.map((x) => ({ op: "set_status" as const, decision_id: x.id, status: "accepted" as const })),
    });
  }
  approveRoughCut(core.db, projectId);
  const ftg = await job("footage.analyze", projectId, { projectId, mediaId: asset.id, useAgent: footageAgent });
  const sem = await job("semantic.analyze", projectId, { projectId });
  const words = currentTranscript(core.db, root, transcripts.byProject(core.db, projectId)!.id).words;
  const edl = edls.byProject(core.db, projectId)!;
  const tl = timelineFor(core.db, edl.id);
  return {
    projectId, asset, words, tl, edlId: edl.id, decisions: d.decisions,
    ftg: ftg.j.output_refs as FootageAnalyzeResult, sem: sem.j.output_refs as SemanticAnalyzeResult,
    times: { import: imp.s, asr: asr.s, propose: p.s, footage: ftg.s, semantic: sem.s },
  };
}

const heard = (words: TranscriptWord[], tl: EditedTimeline) => {
  const m = mapWords(tl, words);
  return words.filter((w) => m[w.id]!.state !== "removed");
};

async function plan(projectId: string) {
  const r = await job("plan.visual", projectId, { projectId });
  const o = r.j.output_refs as PlanVisualResult;
  const doc = VisualPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, o.rel_path), "utf8")));
  const events = (core.db.prepare("SELECT kind, message FROM job_events WHERE job_id = ? ORDER BY rowid").all(r.j.id) as { kind: string; message: string }[])
    .filter((e) => /agent|plan|style|nothing|budget|edl/.test(e.kind));
  let raw: VisualPlannerOutput | undefined;
  try {
    raw = (JSON.parse(readFileSync(join(root, checkpointsRel(r.j.id), "visual_planner.json"), "utf8")) as { output: VisualPlannerOutput }).output;
  } catch {
    raw = undefined;
  }
  return { r, o, doc, events, raw };
}

/** Инварианты плана: цитаты дословны, кадры из µs, лицо не закрыто без причины, стиль читаем. */
function expectPlan(doc: VisualPlanRevisionDoc, words: TranscriptWord[], tl: EditedTimeline, projectId: string): void {
  expect(doc.items.length + doc.skipped.length, "ни сцен, ни пропусков с причинами").toBeGreaterThanOrEqual(1);
  for (const s of doc.skipped) expect(s.reason.length).toBeGreaterThan(0);
  const visible = heard(words, tl);
  for (const it of doc.items) {
    expect(it.evidence.length, it.id).toBeGreaterThanOrEqual(1);
    for (const e of it.evidence) {
      const i = visible.findIndex((w) => w.id === e.start_word_id);
      const k = visible.findIndex((w) => w.id === e.end_word_id);
      expect(i >= 0 && k >= i, `${it.id}: ${e.start_word_id}…${e.end_word_id}`).toBe(true);
      expect(verifyQuote(visible.slice(i, k + 1), e.start_word_id, e.end_word_id, e.quote).ok, `${it.id}: ${e.quote}`).toBe(true);
    }
    expect(it.frames.start, it.id).toBe(usToFrame(it.edited.start_us, tl.fps));
    if (["overlay", "callout", "pip"].includes(it.composition_mode) && it.face_overlap.ratio > core.config.planning.faceOverlapMax) {
      expect(it.face_overlap.override_reason, `${it.id}: лицо закрыто без причины`).toBeTruthy();
    }
  }
  expect(doc.issues.filter((x) => x.code === "face_overlap" && x.severity === "blocking")).toEqual([]);
  const style = currentProjectStyle(core.db, root, projectId)!;
  expect(projectStyleFrom(style.base).issues.filter((x) => x.severity === "blocking")).toEqual([]);
}

/** Принять все предложенные сцены и утвердить B, если blocking нет; иначе — причина. */
async function acceptAndApprove(projectId: string, doc: VisualPlanRevisionDoc): Promise<string> {
  const open = doc.items.filter((x) => x.status === "proposed");
  if (open.length > 0) {
    await savePlanRevision({ db: core.db, store: store(), root, planning: core.config.planning }, doc.plan_id, {
      base_revision: doc.revision, ops: open.map((x) => ({ op: "set_status" as const, item_id: x.id, status: "accepted" as const })),
    });
  }
  try {
    const b = approveVisualPlan(core.db, projectId, root);
    return `B утверждён: ${b.subject_ref}`;
  } catch (e) {
    return `B не утверждён: ${(e as Error).message}`;
  }
}

const sec = (us: number) => `${(us / 1e6).toFixed(1).replace(".", ",")} с`;

/** Читаемое резюме плана. */
function summary(doc: VisualPlanRevisionDoc, words: TranscriptWord[], tl: EditedTimeline): string {
  const m = mapWords(tl, words);
  const text = (s: string, e: string) => {
    const a = words.findIndex((w) => w.id === s);
    const b = words.findIndex((w) => w.id === e);
    return words.slice(a, b + 1).filter((w) => m[w.id]!.state !== "removed").map((w) => w.text).join(" ");
  };
  const L: string[] = [];
  const total = doc.items.reduce((s, x) => s + (x.edited.end_us - x.edited.start_us), 0);
  L.push(`Сцены (${doc.items.length}), покрытие ${((100 * total) / tl.duration_us).toFixed(1)} % из ${sec(tl.duration_us)}:`);
  for (const x of doc.items) {
    L.push(`  ${x.id} [${sec(x.edited.start_us)}–${sec(x.edited.end_us)}, source ${sec(x.source.start_us)}–${sec(x.source.end_us)}, кадры ${x.frames.start}–${x.frames.end}] ` +
      `${x.composition_mode} / ${x.zone} / ${x.visual_type}, ${x.status}; лицо ${x.face_overlap.ratio.toFixed(2)}${x.face_overlap.override_reason ? ` (причина: ${x.face_overlap.override_reason})` : ""}`);
    L.push(`     зачем: ${x.purpose}; образ: ${x.metaphor || "—"}; польза ${x.usefulness}, трудоёмкость ${x.effort}, нагрузка ${x.visual_load}, сложность ${x.complexity}`);
    L.push(`     текст: «${text(x.start_word_id, x.end_word_id)}»`);
    L.push(`     ключевые: ${x.key_terms.map((k) => `${k.text} @ ${sec(k.edited_at_us)}`).join(", ") || "—"}; цитаты: ${x.evidence.map((e) => `«${e.quote}»`).join(" ")}`);
  }
  L.push("", `Пропуски (${doc.skipped.length}):`);
  for (const s of doc.skipped) L.push(`  [${s.anchor_ids.join(", ") || "—"}] ${s.reason}`);
  L.push("", `Проблемы (${doc.issues.length}):`);
  for (const i of doc.issues) L.push(`  ${i.severity} ${i.code}${i.item_id ? ` ${i.item_id}` : ""}: ${i.message}`);
  return L.join("\n");
}

it("talk-ru-cfr: A → footage → semantic → plan.visual (claude): инварианты; принять → B; правка EDL → plan.recheck → B stale", async () => {
  const p = await analyzedProject(join(FIX, "talk-ru-cfr.mp4"), "plan e2e", false);
  const { r, o, doc, events } = await plan(p.projectId);
  expect(o.agent!.status).toBe("completed");
  expectPlan(doc, p.words, p.tl, p.projectId);
  const b = await acceptAndApprove(p.projectId, doc);
  notes.push(`- talk-ru-cfr: «${heard(p.words, p.tl).map((w) => w.text).join(" ")}» (${sec(p.tl.duration_us)})`);
  notes.push(`- plan.visual: ${r.s.toFixed(1)} с, $${o.agent!.cost_usd} (справочно, подписка), вызовов ${o.agent!.calls}, переотправок ${o.agent!.retried}; ` +
    `сцен ${o.counts.items}, пропусков ${o.counts.skipped}, отклонено ${o.counts.rejected}, blocking ${o.counts.blocking}; стиль ${o.style!.style_id} r${o.style!.revision} (${o.style!.author}); ${b}; события: ${events.map((e) => e.kind).join(", ") || "—"}`);
  notes.push("", "```text", summary(doc, p.words, p.tl), "```", "");

  // правка EDL после плана: перепроверка встаёт в очередь сама, B (если был) — stale
  const hadB = b.startsWith("B утверждён");
  const visible = heard(p.words, p.tl);
  const target = doc.items[0] ? visible.find((w) => w.id === doc.items[0]!.start_word_id)! : visible[Math.floor(visible.length / 2)]!;
  const edlNow = edls.get(core.db, p.edlId)!.current_revision!;
  await saveEdlRevision({ db: core.db, store: store(), root, roughcut: core.config.roughcut }, p.edlId, {
    base_revision: edlNow, ops: [{ op: "add_cut", start_word_id: target.id, end_word_id: target.id }],
  });
  const queued = jobs.list(core.db, { projectId: p.projectId }).filter((j) => j.type === "plan.recheck" && j.status === "pending");
  expect(queued).toHaveLength(1);
  const rj = await wait(queued[0]!.id);
  expect(rj.status, JSON.stringify(rj.error)).toBe("completed");
  const re = rj.output_refs as PlanRecheckResult;
  expect(re.edl_revision).toBe(edlNow + 1);
  if (doc.items[0]) expect(re.changed).toContainEqual({ item_id: doc.items[0].id, change: "anchor_cut" });
  if (hadB) expect(approvalState(core.db, p.projectId, "B", currentSubject(core.db, p.projectId, "B")).state).toBe("stale");
  notes.push(`- Правка EDL (вырезано «${target.text}») → plan.recheck: r${re.revision}, изменения ${JSON.stringify(re.changed)}; B ${hadB ? "stale" : "не был утверждён"}`, "");
}, T);

it.runIf(REAL !== undefined)("реальный talking-head (MS_TEST_TALKING_HEAD): полный путь до Approval B; резюме и кадры для просмотра", async () => {
  const sha = (f: string) => execFileSync("shasum", ["-a", "256", f]).toString().split(" ")[0];
  const before = sha(REAL!);
  const p = await analyzedProject(REAL!, "plan real", true);
  const { r, o, doc, events, raw } = await plan(p.projectId);
  expect(sha(REAL!)).toBe(before);
  expect(o.agent!.status).toBe("completed");
  const b = await acceptAndApprove(p.projectId, doc);
  const style = currentProjectStyle(core.db, root, p.projectId)!;
  // для scripts/draw-plan.mjs: план, анализ видеоряда (кадры — личный материал, только tmp/)
  const out = join(EVIDENCE, "real");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "plan.json"), JSON.stringify(doc, null, 2) + "\n");
  writeFileSync(join(out, "style.json"), JSON.stringify(style, null, 2) + "\n");
  const ftgRow = footageRepo.latest(core.db, p.projectId)!;
  cpSync(join(root, dirname(ftgRow.rel_path)), join(out, "footage"), { recursive: true });
  execFileSync("chmod", ["-R", "u+w", out]); // опубликованное read-only; копия — обычная
  const total = doc.items.reduce((s, x) => s + (x.edited.end_us - x.edited.start_us), 0);
  const text = [
    `Ролик: ${REAL} (sha256 ${before}, до и после прогона совпадает)`,
    `Импорт ${p.times.import.toFixed(1)} с, ASR ${p.times.asr.toFixed(1)} с, черновой монтаж без агента ${p.times.propose.toFixed(1)} с, footage (агент) ${p.times.footage.toFixed(1)} с, ` +
      `semantic ${p.times.semantic.toFixed(1)} с ($${p.sem.agent?.cost_usd ?? 0}); слов ${p.words.length}, вырезок принято ${p.decisions.length}, ролик ${sec(p.tl.duration_us)} из ${sec(p.asset.probe.duration_us)}`,
    `plan.visual: ${r.s.toFixed(1)} с, $${o.agent!.cost_usd} (справочно, подписка), вызовов ${o.agent!.calls}, переотправок ${o.agent!.retried}; события: ${events.map((e) => `${e.kind}: ${e.message}`).join(" | ") || "—"}`,
    `Стиль: ${style.style_id} r${style.revision} (${style.author}) ${JSON.stringify(style.base)} — ${style.rationale}`,
    `Покрытие ${((100 * total) / p.tl.duration_us).toFixed(1)} %; ${b}`,
    "",
    `Транскрипт после монтажа: ${heard(p.words, p.tl).map((w) => w.text).join(" ")}`,
    "",
    summary(doc, p.words, p.tl),
    "",
    raw ? `Сырой ответ агента: возможностей ${raw.opportunities.length} (plan ${raw.opportunities.filter((x) => x.decision === "plan").length}, skip ${raw.opportunities.filter((x) => x.decision === "skip").length})` : "Сырой ответ агента: нет чекпоинта",
  ].join("\n");
  writeFileSync(join(out, "summary.txt"), text + "\n");
  if (raw) writeFileSync(join(out, "agent-output.json"), JSON.stringify(raw, null, 2) + "\n");
  // проверки — после записи резюме: при отказе видно, что именно предложил агент
  expectPlan(doc, p.words, p.tl, p.projectId);
  expect(total / p.tl.duration_us).toBeLessThanOrEqual(core.config.planning.maxCoverage);
  notes.push(`- Реальный отрезок: plan.visual ${r.s.toFixed(1)} с, $${o.agent!.cost_usd}; сцен ${o.counts.items}, пропусков ${o.counts.skipped}, отклонено ${o.counts.rejected}; ${b}; резюме — tmp/plan-evidence/real/summary.txt`);
}, T);
