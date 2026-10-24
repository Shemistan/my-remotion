// Task 31 e2e: смысловой анализ через настоящий bootCore, очередь и раннер. `talk-ru-cfr.mp4`
// (`scripts/make-media-fixtures.mjs`, речь `say -v Milena`) → `media.import` → `asr.transcribe`
// (реальный воркер ai-platform) → `roughcut.propose { useAgent: false }` → принять всё →
// Approval A → `semantic.analyze` (реальный `claude`, sonnet). Второй тест — то же на реальном
// talking-head ролике `MS_TEST_TALKING_HEAD` (личный ролик пользователя, согласие V4; без
// переменной тест пропускается — синтетика выше обязательна): читаемое резюме — в
// tmp/semantic-evidence/. Хранилище — tmp/ репозитория (MS_ALLOW_SYSTEM_DISK=1).
// Запуск: `MS_E2E=1 npx vitest run server/test/analysis/semantic.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type EditedTimeline, type Job, type SemanticAgentOutput, type SemanticTimeline, SemanticTimelineSchema, type TranscriptWord, mapWords, verifyQuote } from "@ms/contracts";
import { initStore, macosProbe } from "@ms/core";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as edls from "../../src/db/repos/edls.js";
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
import type { RoughcutProposeResult } from "../../src/pipeline/roughcut-propose.js";
import type { SemanticAnalyzeResult } from "../../src/pipeline/semantic-analyze.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 30 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FIX = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, "tmp/semantic-evidence");
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
  tmp = await mkdtemp(join(REPO, "tmp", "ms-semantic-e2e-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  const roots = [FIX, ...(REAL ? [join(REAL, "..")] : [])];
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
    const md = ["# Смысловой анализ (Task 31) — e2e на tmp-хранилище", "", `Прогон ${new Date().toISOString()}.`, "", ...notes, ""].join("\n");
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
  const id = enqueue(core.db, { type, projectId, input, idempotencyKey: `e2e-t31-${newId("run")}` }).job.id;
  const j = await wait(id);
  expect(j.status, `${type}: ${JSON.stringify(j.error)}`).toBe("completed");
  return { j, s: (Date.now() - t0) / 1000 };
}

/** Импорт → ASR → детекторы → принять всё → Approval A. */
async function approvedProject(path: string, title: string) {
  const projectId = projects.create(core.db, { kind: "video", title }).id;
  const imp = await job("media.import", projectId, { projectId, method: "path", path });
  const asset = media.byProject(core.db, projectId)!;
  const asr = await job("asr.transcribe", projectId, { projectId, mediaId: asset.id, language: "ru" });
  const p = await job("roughcut.propose", projectId, { projectId, useAgent: false });
  const o = p.j.output_refs as RoughcutProposeResult;
  const d = currentEdl(core.db, root, o.edl_id);
  if (d.decisions.length > 0) {
    const store = new ArtifactStore({ root, db: core.db, guard });
    await saveEdlRevision({ db: core.db, store, root, roughcut: core.config.roughcut }, o.edl_id, {
      base_revision: o.revision, ops: d.decisions.map((x) => ({ op: "set_status" as const, decision_id: x.id, status: "accepted" as const })),
    });
  }
  approveRoughCut(core.db, projectId);
  const words = currentTranscript(core.db, root, transcripts.byProject(core.db, projectId)!.id).words;
  const edl = edls.byProject(core.db, projectId)!;
  const tl = timelineFor(core.db, edl.id);
  return { projectId, asset, words, tl, decisions: d.decisions, times: { import: imp.s, asr: asr.s, propose: p.s } };
}

/** Слова, которые слышит зритель: оставленные монтажом. */
const heard = (words: TranscriptWord[], tl: EditedTimeline) => {
  const m = mapWords(tl, words);
  return words.filter((w) => m[w.id]!.state !== "removed");
};

/** Каждая цитата якоря и числа — дословно оставленные слова своего диапазона. */
function expectQuotes(doc: SemanticTimeline, visible: TranscriptWord[]): void {
  for (const a of [...doc.anchors, ...doc.numbers]) {
    const i = visible.findIndex((w) => w.id === a.start_word_id);
    const k = visible.findIndex((w) => w.id === a.end_word_id);
    expect(i >= 0 && k >= i, `${a.start_word_id}…${a.end_word_id}`).toBe(true);
    expect(verifyQuote(visible.slice(i, k + 1), a.start_word_id, a.end_word_id, a.quote).ok, a.quote).toBe(true);
  }
}

const sec = (us: number) => `${(us / 1e6).toFixed(1).replace(".", ",")} с`;
const CLAIM: Record<string, string> = { fact: "факт", assumption: "предположение", opinion: "мнение" };

/** Читаемое резюме разметки: главы, якоря, числа, сущности, связи, спорное, отклонённое. */
function summary(doc: SemanticTimeline, words: TranscriptWord[], tl: EditedTimeline): string {
  const m = mapWords(tl, words);
  const text = (s: string, e: string) => {
    const a = words.findIndex((w) => w.id === s);
    const b = words.findIndex((w) => w.id === e);
    return words.slice(a, b + 1).filter((w) => m[w.id]!.state !== "removed").map((w) => w.text).join(" ");
  };
  const at = (s: string) => {
    const x = m[s];
    return x && x.state !== "removed" ? sec(x.edited_start_us) : "—";
  };
  const L: string[] = [];
  L.push(`Главы (${doc.chapters.length}):`);
  for (const c of doc.chapters) L.push(`  ${c.id} [${at(c.start_word_id)}] «${c.title}» — ${c.summary}`, `     текст: ${text(c.start_word_id, c.end_word_id)}`);
  L.push("", `Якоря (${doc.anchors.length}):`);
  for (const a of doc.anchors) {
    const emph = a.emphasis_word_ids.map((x) => words.find((w) => w.id === x)?.text).join(", ");
    L.push(`  ${a.id} [${at(a.start_word_id)}] ${a.kind}, ${CLAIM[a.claim_type]}, важность ${a.importance}: «${a.quote}»${emph ? ` (акцент: ${emph})` : ""}${a.uncertainty ? ` — сомнение: ${a.uncertainty}` : ""}`);
  }
  L.push("", `Числа (${doc.numbers.length}):`);
  for (const x of doc.numbers) L.push(`  [${at(x.start_word_id)}] ${x.value}${x.unit ? ` ${x.unit}` : ""} — «${x.quote}», ${CLAIM[x.claim_type]}`);
  L.push("", `Сущности (${doc.entities.length}):`);
  for (const e of doc.entities) L.push(`  ${e.name} (${e.kind}), упоминаний ${e.mention_word_ids.length}`);
  L.push("", `Причина → следствие (${doc.causal.length}):`);
  for (const c of doc.causal) L.push(`  ${c.cause_anchor_id} → ${c.effect_anchor_id}`);
  L.push("", `Спорное (${doc.disputed.length}):`);
  for (const x of doc.disputed) L.push(`  [${at(x.start_word_id)}] «${text(x.start_word_id, x.end_word_id)}» — ${x.why}`);
  L.push("", `Отклонено кодом (${doc.rejected?.length ?? 0}):`);
  for (const r of doc.rejected ?? []) L.push(`  ${r.kind}${r.id ? ` ${r.id}` : ""}: ${r.code} — ${r.detail ?? ""}`);
  return L.join("\n");
}

async function analyze(projectId: string) {
  const r = await job("semantic.analyze", projectId, { projectId });
  const o = r.j.output_refs as SemanticAnalyzeResult;
  const doc = SemanticTimelineSchema.parse(JSON.parse(readFileSync(join(root, o.rel_path), "utf8")));
  const events = (core.db.prepare("SELECT kind, message FROM job_events WHERE job_id = ? ORDER BY rowid").all(r.j.id) as { kind: string; message: string }[])
    .filter((e) => /agent|semantic|window|nothing|budget/.test(e.kind));
  let raw: SemanticAgentOutput | undefined;
  try {
    const cp = JSON.parse(readFileSync(join(root, checkpointsRel(r.j.id), "semantic_director.json"), "utf8")) as { output: Record<string, SemanticAgentOutput> };
    raw = Object.values(cp.output)[0];
  } catch {
    raw = undefined;
  }
  return { r, o, doc, events, raw };
}

it("talk-ru-cfr: Approval A → semantic.analyze (sonnet): главы, якорь-число, все цитаты дословны", async () => {
  const p = await approvedProject(join(FIX, "talk-ru-cfr.mp4"), "semantic e2e");
  notes.push(`- talk-ru-cfr: «${p.words.map((w) => w.text).join(" ")}»; вырезок принято ${p.decisions.length}, ролик ${sec(p.tl.duration_us)} из ${sec(p.asset.probe.duration_us)}`);
  // без A — отказ (проверка гейта на настоящем ядре): отдельный проект без утверждения не нужен —
  // юнит-тесты; здесь A валиден
  const { r, o, doc, events } = await analyze(p.projectId);
  expect(o.agent!.status).toBe("completed");
  expect(doc.chapters.length).toBeGreaterThanOrEqual(1);
  const visible = heard(p.words, p.tl);
  expectQuotes(doc, visible);
  // в речи фикстуры числа — «миллиона», «10» (ASR пишет цифрами), «пяти», «полгода»; «тысяч»/«000» плана здесь нет
  const numberAnchors = doc.anchors.filter((a) => a.kind === "number");
  expect(numberAnchors.length, JSON.stringify(doc.anchors)).toBeGreaterThanOrEqual(1);
  expect(numberAnchors.some((a) => /\d|миллион|тысяч|пят|десят|полгод/i.test(a.quote)), JSON.stringify(numberAnchors)).toBe(true);
  for (const x of doc.rejected ?? []) expect(x.code).toBeTruthy();
  notes.push(`- semantic.analyze (sonnet): ${r.s.toFixed(1)} с, $${o.agent!.cost_usd} (справочно, подписка), вызовов ${o.agent!.calls}, переотправок ${o.agent!.retried}; ` +
    `глав ${o.counts.chapters}, якорей ${o.counts.anchors}, чисел ${o.counts.numbers}, сущностей ${o.counts.entities}, связей ${o.counts.causal}, спорного ${o.counts.disputed}, отклонено ${o.counts.rejected}; события: ${events.map((e) => e.kind).join(", ") || "—"}`);
  notes.push("", "```text", summary(doc, p.words, p.tl), "```", "");
}, T);

it.runIf(REAL !== undefined)("реальный talking-head (MS_TEST_TALKING_HEAD): Approval A → semantic.analyze (sonnet); резюме глазами", async () => {
  const sha = (f: string) => execFileSync("shasum", ["-a", "256", f]).toString().split(" ")[0];
  const before = sha(REAL!);
  const p = await approvedProject(REAL!, "semantic real");
  const { r, o, doc, events, raw } = await analyze(p.projectId);
  expect(sha(REAL!)).toBe(before);
  expect(o.agent!.status).toBe("completed");
  expect(doc.chapters.length).toBeGreaterThanOrEqual(1);
  expectQuotes(doc, heard(p.words, p.tl));
  const text = [
    `Ролик: ${REAL} (sha256 ${before}, до и после прогона совпадает)`,
    `Импорт ${p.times.import.toFixed(1)} с, ASR ${p.times.asr.toFixed(1)} с, черновой монтаж без агента ${p.times.propose.toFixed(1)} с; слов ${p.words.length}, вырезок принято ${p.decisions.length} (${p.decisions.map((d) => d.reason).join(", ")}), ролик ${sec(p.tl.duration_us)} из ${sec(p.asset.probe.duration_us)}`,
    `semantic.analyze: ${r.s.toFixed(1)} с, $${o.agent!.cost_usd} (справочно, подписка), вызовов ${o.agent!.calls}, переотправок ${o.agent!.retried}, окон ${o.windows}; события: ${events.map((e) => e.kind).join(", ") || "—"}`,
    "",
    `Транскрипт после монтажа: ${heard(p.words, p.tl).map((w) => w.text).join(" ")}`,
    "",
    summary(doc, p.words, p.tl),
    "",
    raw ? `Сырой ответ агента: якорей ${raw.anchors.length}, чисел ${raw.numbers.length}, глав ${raw.chapters.length}` : "Сырой ответ агента: нет чекпоинта",
  ].join("\n");
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, "real-summary.txt"), text + "\n");
  notes.push(`- Реальный ролик: ${r.s.toFixed(1)} с, $${o.agent!.cost_usd}; резюме — tmp/semantic-evidence/real-summary.txt`);
}, T);
