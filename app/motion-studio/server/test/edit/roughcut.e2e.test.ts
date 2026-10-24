// Task 28 e2e: черновой монтаж через настоящий bootCore, очередь и раннер. `talk-ru-cfr.mp4`
// (`scripts/make-media-fixtures.mjs`, речь `say -v Milena` с паузами 1,5 с) → `media.import` →
// `asr.transcribe` (реальный воркер ai-platform) → `roughcut.propose { useAgent: false }` →
// принять всё → `roughcut.preview` (ffprobe, синхронность звука по 5 словам) → `roughcut.propose`
// с реальным `claude` (sonnet). Отдельно — превью 600 вырезок на 10-минутном синтетическом прокси.
// Хранилище — tmp/ репозитория (MS_ALLOW_SYSTEM_DISK=1), реальный MotionStudio не трогается.
// Запуск: `MS_E2E=1 npx vitest run server/test/edit/roughcut.e2e.test.ts`. Итоги — в консоль и
// tmp/roughcut-evidence/README.md.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type RoughCutAgentOutput, acceptedCuts, buildTimeline, frameToUs, verifyQuote } from "@ms/contracts";
import { initStore, macosProbe } from "@ms/core";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as edls from "../../src/db/repos/edls.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { currentEdl, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { currentTranscript } from "../../src/edit/transcript-ops.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { checkpointsRel } from "../../src/pipeline/checkpoints.js";
import { enqueue } from "../../src/jobs/queue.js";
import { type RoughcutPreviewResult, streamDurations } from "../../src/pipeline/roughcut-preview.js";
import type { RoughcutProposeResult } from "../../src/pipeline/roughcut-propose.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 30 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FIX = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, "tmp/roughcut-evidence");
const MS = join(REPO, "app/motion-studio");

let tmp: string;
let root: string;
let core: Core;
const mine = new Set<string>();
const notes: string[] = [];
/** Сторож хранилища ядра (для синхронной правки EDL в тесте). */
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];

beforeAll(async () => {
  execFileSync(process.execPath, [join(MS, "scripts/make-media-fixtures.mjs")], { stdio: "inherit" });
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  tmp = await mkdtemp(join(REPO, "tmp", "ms-roughcut-e2e-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [FIX] } }) + "\n");
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
    const md = ["# Черновой монтаж (Task 28) — e2e на tmp-хранилище", "", `Прогон ${new Date().toISOString()}.`, "", ...notes, ""].join("\n");
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
  const id = enqueue(core.db, { type, projectId, input, idempotencyKey: `e2e-t28-${newId("run")}` }).job.id;
  const j = await wait(id);
  expect(j.status, `${type}: ${JSON.stringify(j.error)}`).toBe("completed");
  return { j, s: (Date.now() - t0) / 1000 };
}

it("talk-ru-cfr: детекторы → принять всё → превью (длительность ± кадр, звук ≤ кадра) → агент sonnet (цитаты проверены)", async () => {
  const projectId = projects.create(core.db, { kind: "video", title: "roughcut e2e" }).id;
  await job("media.import", projectId, { projectId, method: "path", path: join(FIX, "talk-ru-cfr.mp4") });
  const asset = media.byProject(core.db, projectId)!;
  const asr = await job("asr.transcribe", projectId, { projectId, mediaId: asset.id, language: "ru" });
  const trn = transcripts.byProject(core.db, projectId)!;
  const words = currentTranscript(core.db, root, trn.id).words;
  notes.push(`- Транскрипт: ${words.length} слов за ${asr.s.toFixed(1)} с: «${words.map((w) => w.text).join(" ")}»`);

  // 1) детекторы
  const p1 = await job("roughcut.propose", projectId, { projectId, useAgent: false });
  const o1 = p1.j.output_refs as RoughcutProposeResult;
  const d1 = currentEdl(core.db, root, o1.edl_id);
  const pauses = d1.decisions.filter((d) => d.reason === "pause");
  // паузы [[slnc 1500]] между фразами (ASR видит ≈ 1,2–1,5 с) предложены
  expect(pauses.length).toBeGreaterThanOrEqual(2);
  expect(d1.decisions.every((d) => d.status === "proposed" && d.origin === "detector")).toBe(true);
  notes.push(`- propose без агента: ${p1.s.toFixed(1)} с, r${o1.revision}: ${d1.decisions.map((d) => `${d.reason} ${(d.source_start_us / 1e6).toFixed(2)}–${(d.source_end_us / 1e6).toFixed(2)} с`).join("; ")}`);

  // 2) принять всё → r2
  const store = new ArtifactStore({ root, db: core.db, guard });
  const saved = await saveEdlRevision({ db: core.db, store, root, roughcut: core.config.roughcut }, o1.edl_id, {
    base_revision: o1.revision, ops: d1.decisions.map((d) => ({ op: "set_status" as const, decision_id: d.id, status: "accepted" as const })),
  });
  const tl = saved.timeline;
  expect(tl.duration_us).toBeLessThan(asset.probe.duration_us);

  // 3) превью r2
  const pv = await job("roughcut.preview", projectId, { edlId: o1.edl_id, revision: saved.doc.revision });
  const po = pv.j.output_refs as RoughcutPreviewResult;
  const file = join(root, po.rel_path);
  const dur = await streamDurations(file);
  const frame = frameToUs(1, tl.fps);
  expect(Math.abs(dur.video! - tl.duration_us)).toBeLessThanOrEqual(frame);
  expect(Math.abs(dur.audio! - tl.duration_us)).toBeLessThanOrEqual(frame);
  expect(po.sync).toHaveLength(5);
  for (const x of po.sync!) expect(Math.abs(x.offset_us), JSON.stringify(po.sync)).toBeLessThanOrEqual(33_334);
  notes.push(`- Превью r${saved.doc.revision}: ${(tl.duration_us / 1e6).toFixed(2)} с из ${(asset.probe.duration_us / 1e6).toFixed(2)} с, ${po.clips} клипов, ${po.chunks} кусков, сборка ${pv.s.toFixed(1)} с; ffprobe видео ${(dur.video! / 1e6).toFixed(3)} с, звук ${(dur.audio! / 1e6).toFixed(3)} с; синхронность: ${po.sync!.map((x) => `${x.word_id} ${(x.offset_us / 1000).toFixed(2)} мс (corr ${x.corr})`).join(", ")}`);

  // 4) агент (реальный claude sonnet) поверх принятого r2
  const p2 = await job("roughcut.propose", projectId, { projectId });
  const o2 = p2.j.output_refs as RoughcutProposeResult;
  expect(o2.edl_id).toBe(o1.edl_id); // один EDL на проект
  expect(o2.agent).toBeDefined();
  expect(o2.agent!.status, o2.agent!.message).toBe("completed");
  const d2 = currentEdl(core.db, root, o2.edl_id);
  // прежние решения человека целы
  for (const d of saved.doc.decisions) expect(d2.decisions.find((x) => x.id === d.id)?.status).toBe("accepted");
  // все агентские вырезки — с проверенной цитатой (якоря есть, цитата в объяснении совпадает со словами)
  for (const d of d2.decisions.filter((x) => x.origin === "agent")) {
    expect(d.start_word_id).toBeDefined();
    const quote = /«([^»]+)»/.exec(d.explanation)?.[1] ?? "";
    expect(verifyQuote(words, d.start_word_id!, d.end_word_id!, quote).ok || d.explanation.includes(";"), d.explanation).toBe(true);
  }
  const log = (core.db.prepare("SELECT kind, message FROM job_events WHERE job_id = ? ORDER BY rowid").all(p2.j.id) as { kind: string; message: string }[])
    .filter((e) => /agent|budget|no_change|suppressed/.test(e.kind));
  notes.push(`- propose с агентом (sonnet): ${p2.s.toFixed(1)} с, $${o2.agent!.cost_usd} (справочно, подписка), вызовов ${o2.agent!.calls}, переотправка ${o2.agent!.retried ? "да" : "нет"}; ` +
    `решений агента ${o2.agent!.decisions} (принято кодом ${o2.agent!.accepted}, отклонено ${o2.agent!.rejected.length}: ${JSON.stringify(o2.agent!.rejected)}), вердиктов ${o2.agent!.reviews}; ` +
    `итог ${o2.no_change ? `no_change (r${o2.revision})` : `r${o2.revision}`}, подавлено ${o2.suppressed}; события: ${log.map((e) => e.kind).join(", ") || "—"}`);
  notes.push(`- Решения после агента: ${d2.decisions.map((d) => `${d.id} ${d.origin}/${d.reason}/${d.status}${d.agent_note ? ` (агент: ${d.agent_note})` : ""}`).join("; ")}`);
}, T);

it("talk-ru-takes: агент sonnet находит фальстарт и неудачный дубль; каждая его вырезка — с проверенной цитатой; превью после принятия", async () => {
  const projectId = projects.create(core.db, { kind: "video", title: "roughcut takes e2e" }).id;
  await job("media.import", projectId, { projectId, method: "path", path: join(FIX, "talk-ru-takes.mp4") });
  const asset = media.byProject(core.db, projectId)!;
  await job("asr.transcribe", projectId, { projectId, mediaId: asset.id, language: "ru" });
  const words = currentTranscript(core.db, root, transcripts.byProject(core.db, projectId)!.id).words;
  const p = await job("roughcut.propose", projectId, { projectId });
  const o = p.j.output_refs as RoughcutProposeResult;
  expect(o.agent!.status, o.agent!.message).toBe("completed");
  // сырой ответ агента — чекпоинт задачи: каждая принятая кодом вырезка проходит verifyQuote
  const cp = JSON.parse(readFileSync(join(root, checkpointsRel(p.j.id), "rough_cut_editor.json"), "utf8")) as { output: RoughCutAgentOutput };
  const verdicts = cp.output.decisions.map((d) => ({ d, q: verifyQuote(words, d.start_word_id, d.end_word_id, d.quote) }));
  expect(o.agent!.accepted + o.agent!.rejected.length).toBe(cp.output.decisions.length);
  // цитата не совпала — отклонено именно с quote_mismatch/unknown_word/order, совпала — не отклонено по цитате
  expect(o.agent!.rejected.filter((r) => ["quote_mismatch", "unknown_word", "order"].includes(r.code))).toHaveLength(verdicts.filter((x) => !x.q.ok).length);
  expect(o.agent!.accepted).toBeGreaterThanOrEqual(1);
  const doc = currentEdl(core.db, root, o.edl_id);
  const agentCuts = doc.decisions.filter((d) => d.origin === "agent");
  expect(agentCuts.length).toBeGreaterThanOrEqual(1);
  const text = (d: { start_word_id?: string; end_word_id?: string }) => {
    const a = words.findIndex((w) => w.id === d.start_word_id);
    const b = words.findIndex((w) => w.id === d.end_word_id);
    return a >= 0 && b >= 0 ? words.slice(a, b + 1).map((w) => w.text).join(" ") : "—";
  };
  notes.push(`- talk-ru-takes: «${words.map((w) => w.text).join(" ")}»`);
  notes.push(`- propose с агентом (sonnet): ${p.s.toFixed(1)} с, $${o.agent!.cost_usd} (справочно), вызовов ${o.agent!.calls}, переотправка ${o.agent!.retried ? "да" : "нет"}; ` +
    `решений агента ${o.agent!.decisions} (принято кодом ${o.agent!.accepted}, отклонено ${JSON.stringify(o.agent!.rejected)}), вердиктов ${o.agent!.reviews}`);
  for (const x of cp.output.decisions) notes.push(`  - агент: ${x.reason} ${x.start_word_id}…${x.end_word_id} «${x.quote}» (${x.confidence}) — ${x.explanation}`);
  for (const r of cp.output.reviews) notes.push(`  - вердикт: ${r.decision_id} ${r.verdict} — ${r.why}`);
  notes.push(`- EDL r${o.revision}: ${doc.decisions.map((d) => `${d.origin}/${d.reason} ${(d.source_start_us / 1e6).toFixed(2)}–${(d.source_end_us / 1e6).toFixed(2)} с «${text(d)}» (${d.confidence})`).join("; ")}`);

  const store = new ArtifactStore({ root, db: core.db, guard });
  const saved = await saveEdlRevision({ db: core.db, store, root, roughcut: core.config.roughcut }, o.edl_id, {
    base_revision: o.revision, ops: doc.decisions.map((d) => ({ op: "set_status" as const, decision_id: d.id, status: "accepted" as const })),
  });
  const pv = await job("roughcut.preview", projectId, { edlId: o.edl_id, revision: saved.doc.revision });
  const po = pv.j.output_refs as RoughcutPreviewResult;
  for (const x of po.sync!) expect(Math.abs(x.offset_us), JSON.stringify(po.sync)).toBeLessThanOrEqual(33_334);
  const kept = buildTimeline(asset.probe.duration_us, acceptedCuts(saved.doc), saved.doc.timeline_fps);
  notes.push(`- Превью после принятия всего: ${(kept.duration_us / 1e6).toFixed(2)} с из ${(asset.probe.duration_us / 1e6).toFixed(2)} с, синхронность ${po.sync!.map((x) => `${(x.offset_us / 1000).toFixed(2)} мс`).join(", ")}`);
}, T);

it("600 вырезок на 10-минутном прокси: превью кусками, длительность ± кадр, синхронность ≤ кадра; время", async () => {
  const k = newId("prj").slice(4);
  const projectId = projects.create(core.db, { kind: "video", title: "много вырезок" }).id;
  const mediaId = `med_${k}`;
  const DUR = 600_000_000;
  const pxRel = artifactPaths(root, projectId).proxy(mediaId);
  const dir = join(root, pxRel);
  await mkdir(dir, { recursive: true });
  const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
  ff(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "anoisesrc=c=pink:r=48000:a=0.3", "-t", "600",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", join(dir, "proxy.mp4")]);
  ff(["-i", join(dir, "proxy.mp4"), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", join(dir, "audio16k.wav")]);
  const base = media.byProject(core.db, projects.list(core.db).find((p) => p.title === "roughcut e2e")!.id)!;
  media.insert(core.db, { ...base, id: mediaId, project_id: projectId, rel_path: `${artifactPaths(root, projectId).source(mediaId)}/original.mp4`, probe: { ...base.probe, duration_us: DUR, video: { ...base.probe.video, width: 1280, height: 720 } } });
  media.setDerivative(core.db, mediaId, { kind: "proxy", rel_path: `${pxRel}/proxy.mp4`, sha256: "c".repeat(64), params: {} });
  media.setDerivative(core.db, mediaId, { kind: "audio16k", rel_path: `${pxRel}/audio16k.wav`, sha256: "d".repeat(64), params: {} });
  // слова по 400 мс каждую секунду; вырезка 0,4 с в каждой секунде после слова
  const words = Array.from({ length: 600 }, (_, i) => ({ id: `w_${String(i + 1).padStart(6, "0")}`, text: `слово${i}`, start_us: i * 1_000_000 + 100_000, end_us: i * 1_000_000 + 500_000, timing: "asr" as const, confidence: null }));
  const store = new ArtifactStore({ root, db: core.db, guard });
  const trnId = `trn_${k}`;
  const tr = { schema_version: 1 as const, transcript_id: trnId, revision: 1, media_sha256: base.sha256, language: "ru", author: "asr" as const, words, segments: [], removed_word_ids: [] };
  const tRel = artifactPaths(root, projectId).transcriptRev(trnId, 1);
  await store.writeRevision(tRel, "transcript.json", tr, (d, files) => {
    transcripts.create(d, { id: trnId, project_id: projectId, media_id: mediaId, language: "ru" });
    transcripts.insertRevision(d, { doc: tr, rel_path: `${tRel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  const edlId = `edl_${k}`;
  const fps = { num: 30, den: 1 };
  const decisions = Array.from({ length: 600 }, (_, i) => ({
    id: `d${i}`, reason: "pause" as const, origin: "detector" as const, status: "accepted" as const,
    source_start_us: frameToUs(i * 30 + 17, fps), source_end_us: frameToUs(i * 30 + 29, fps), confidence: 0.9, explanation: "пауза",
  }));
  const doc = { schema_version: 1 as const, edl_id: edlId, revision: 1, media_id: mediaId, media_sha256: base.sha256, transcript_id: trnId, timeline_fps: fps, decisions };
  const tl = buildTimeline(DUR, acceptedCuts(doc), fps);
  const eRel = artifactPaths(root, projectId).edlRev(edlId, 1);
  await store.writeRevision(eRel, "edl.json", doc, (d, files) => {
    edls.create(d, { id: edlId, project_id: projectId, media_id: mediaId, transcript_id: trnId });
    edls.insertRevision(d, { doc, rel_path: `${eRel}/edl.json`, sha256: files[0]!.sha256, timeline: tl });
  });
  const pv = await job("roughcut.preview", projectId, { edlId, revision: 1 });
  const po = pv.j.output_refs as RoughcutPreviewResult;
  const dur = await streamDurations(join(root, po.rel_path));
  expect(Math.abs(dur.video! - tl.duration_us)).toBeLessThanOrEqual(33_334);
  expect(Math.abs(dur.audio! - tl.duration_us)).toBeLessThanOrEqual(33_334);
  for (const x of po.sync!) expect(Math.abs(x.offset_us), JSON.stringify(po.sync)).toBeLessThanOrEqual(33_334);
  notes.push(`- 600 вырезок на 10-мин прокси 1280×720 (601 клип, ${po.chunks} кусков): превью ${(tl.duration_us / 1e6).toFixed(1)} с собрано за ${pv.s.toFixed(1)} с ` +
    `(для сравнения: один граф на 600 клипов на таком же прокси — 495 с, замер ffmpeg 7.1.1 вручную); синхронность: ${po.sync!.map((x) => `${(x.offset_us / 1000).toFixed(2)} мс`).join(", ")}`);
}, T);
