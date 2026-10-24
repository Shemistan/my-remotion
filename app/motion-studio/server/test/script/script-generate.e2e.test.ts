// S5 e2e: первая сквозная генерация сцен сценария — реальный claude и реальный рендер.
// Текст человека block-2 (`tmp/script-mvp/block-2.txt`, первая строка — заголовок) →
// `script.plan` (Script Director) → из плана берутся 3 сцены разных приёмов (предпочтительно
// hero-number «1/256», process-steps «эвакуация», split-versus «6,5 против 6,2») →
// `startScriptBatch` с `itemIds` (соседи в брифе — из полного плана, как у человека) → все
// задачи до конечного статуса; упавшая — один повтор новым ключом пакета (`:try-n`).
// [A] версии ready; duration_frames = frames.total; spec без `speech_window`; отпечаток сцены =
// `itemFingerprint` после публикации; brief.json содержит подокна предложений; Concept без
// уточнений; props.style — палитра проекта. Синхронизация (ревью S5 Minor 2): кадры фаз/битов
// против подокон предложений — таблица в tmp/s5-e2e/sync.txt.
// Затем полноразмерный MP4 (`scene.export`, crf 18) и по 3 кадра на сцену (начало речи,
// середина речи, удержание): полноразмерные — tmp/s5-e2e/frames/, ≤ 480 px —
// docs/evidence/script-mvp/generate/.
// Хранилище — временный каталог SSD (`MS_DATA_DIR`, по умолчанию
// /Volumes/External SSD/MotionStudio-e2e-script): новый проект на прогон.
// Запуск: `MS_E2E=1 npx vitest run server/test/script/script-generate.e2e.test.ts`.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  type Job, type MotionSpec, type ScriptPlanRevisionDoc, type ScriptRevisionDoc, type ScriptSceneItem, type Settings, type VersionManifest,
  phasesOf,
} from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe } from "@ms/core";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { currentProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptScenes } from "../../src/db/repos/script.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import type { ScriptPlanResult } from "../../src/pipeline/script-plan.js";
import { specChecks } from "../../src/qa/spec-checks.js";
import { newId } from "../../src/scenes/ids.js";
import { sceneRel } from "../../src/scenes/store.js";
import { batchStatus, startScriptBatch } from "../../src/script/batch.js";
import { type SentenceWindow, sentenceWindows } from "../../src/script/brief.js";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { currentScript, currentScriptPlan } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";

const T = 150 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio-e2e-script";
const EVIDENCE = join(REPO, "docs/evidence/script-mvp/generate");
const TMP = join(REPO, "tmp/s5-e2e");
const FINAL = ["completed", "failed", "cancelled", "blocked"];
const run = promisify(execFile);

let core: Core;
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];
const mine = new Set<string>();
/** Статусы, которые видели у задач (Concept в пакете не должен ждать ответа). */
const seen = new Map<string, Set<string>>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

beforeAll(async () => {
  expect(existsSync("/Volumes/External SSD") || process.env.MS_DATA_DIR !== undefined, "внешний SSD не подключён").toBe(true);
  if (!existsSync(join(ROOT, MARKER_FILE))) await initStore(ROOT, macosProbe, {});
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => {
      guard = svc.storageCheck;
      return registerHandlers(svc, { log: (l) => console.log(`  ${l}`) });
    },
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(TMP, { recursive: true });
}, T);

afterAll(async () => {
  writeFileSync(join(TMP, "run.log"), log.join("\n") + "\n");
  await core?.close();
});

async function wait(id: string, poll = 2000): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j) {
      if (!seen.has(id)) seen.set(id, new Set());
      seen.get(id)!.add(j.status);
      // уточнения Concept в пакете — skip; если задача всё же ждёт — фиксируем дефект и отвечаем skip
      if (j.status === "awaiting_input") provideInput(core.db, j.id, "skip");
      if (FINAL.includes(j.status)) return j;
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}

const cost = (jobId: string): number =>
  (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(jobId) as { c: number }).c;
const minutes = (ms: number) => (ms / 60_000).toFixed(1);

/** Первые 3 сцены разных приёмов: сначала желаемые (по смыслу из брифа контроллера), потом любые. */
function pick(doc: ScriptPlanRevisionDoc): ScriptSceneItem[] {
  const acc = doc.items.filter((x) => x.status === "accepted");
  const want: ((x: ScriptSceneItem) => boolean)[] = [
    (x) => x.technique === "hero-number" && (x.data.some((d) => d.value === 256 || Math.abs(d.value - 1 / 256) < 1e-9) || /двумстам|256/.test(x.quote)),
    (x) => x.technique === "process-steps" && /эвакуац|инкремент|порци/i.test(x.quote + x.idea),
    (x) => x.technique === "split-versus" && /6[,.]5|6[,.]2|шесть/i.test(x.quote + x.idea),
    (x) => x.technique === "process-steps",
    (x) => x.technique === "split-versus",
    (x) => x.technique === "hero-number",
  ];
  const out: ScriptSceneItem[] = [];
  const add = (x: ScriptSceneItem | undefined) => {
    if (x && out.length < 3 && !out.includes(x) && !out.some((o) => o.technique === x.technique)) out.push(x);
  };
  for (const f of want) add(acc.find(f));
  for (const x of acc) add(x);
  return out.sort((a, b) => acc.indexOf(a) - acc.indexOf(b));
}

interface SceneRun {
  item: ScriptSceneItem;
  n: number;
  sceneId: string;
  jobs: Job[];
  version?: versions.VersionRow;
  dir?: string;
  manifest?: VersionManifest;
  spec?: MotionSpec;
  settings?: Settings;
  windows: SentenceWindow[];
  exportFile?: string;
  wallMs: number;
}

const state: {
  projectId?: string;
  script?: ScriptRevisionDoc;
  doc?: ScriptPlanRevisionDoc;
  planId?: string;
  plan?: { s: number; res: ScriptPlanResult };
  runs: SceneRun[];
  gen?: { ms: number; retry: boolean };
} = { runs: [] };

it("script.plan по block-2 реальным claude: completed, ≥ 3 принятые сцены разных приёмов", async () => {
  const [title, ...rest] = readFileSync(join(REPO, "tmp/script-mvp/block-2.txt"), "utf8").split("\n");
  const projectId = projects.create(core.db, { kind: "script", title: `e2e S5 block-2 ${new Date().toISOString()}` }).id;
  const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
  await saveScriptText({ db: core.db, store, root: ROOT }, projectId, { blocks: [{ title: title!.trim(), text: rest.join("\n").trim() }] });
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "script.plan", projectId, input: { projectId }, idempotencyKey: `e2e-s5-plan-${newId("run")}` }).job.id;
  const j = await wait(id, 500);
  const s = (Date.now() - t0) / 1000;
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const res = j.output_refs as ScriptPlanResult;
  const cur = currentScriptPlan(core.db, ROOT, projectId)!;
  Object.assign(state, { projectId, script: currentScript(core.db, ROOT, projectId)!, doc: cur.doc, planId: cur.planId, plan: { s, res } });
  writeFileSync(join(TMP, "plan-block-2.json"), JSON.stringify(cur.doc, null, 2) + "\n");
  say(`script.plan: ${s.toFixed(0)} с, $${res.agent.cost_usd}, вызовов ${res.agent.calls}, сцен ${cur.doc.items.length}, blocking ${res.issues.blocking}`);
  for (const x of cur.doc.items) say(`  ${x.id} ${x.status} ${x.technique}/${x.structure_rule ?? "—"} ${x.frames.total} кадров «${x.quote.slice(0, 80)}»`);
  const chosen = pick(cur.doc);
  expect(chosen.map((x) => x.technique).length).toBe(3);
  say(`выбраны: ${chosen.map((x) => `${x.id} ${x.technique}`).join(", ")}`);
  state.runs = chosen.map((item) => ({ item, n: cur.doc.items.filter((x) => x.status === "accepted").indexOf(item) + 1, sceneId: "", jobs: [], windows: sentenceWindows(item, state.script!, cur.doc.reading, cur.doc.fps), wallMs: 0 }));
}, T);

it("generate: пакет из 3 сцен доходит до конечного статуса; упавшая — один повтор", async () => {
  expect(state.runs).toHaveLength(3);
  const { projectId, doc } = state as Required<typeof state>;
  const t0 = Date.now();
  const batch = startScriptBatch(core, { projectId, revision: doc.revision, itemIds: state.runs.map((r) => r.item.id), idempotencyKey: `e2e-s5-gen-${newId("run")}` });
  expect(batch.items).toHaveLength(3);
  await Promise.all(batch.items.map(async (bi) => {
    const r = state.runs.find((x) => x.item.id === bi.item_id)!;
    r.sceneId = bi.scene_id;
    const j = await wait(bi.job!.id);
    r.jobs.push(j);
    r.wallMs = Date.now() - t0;
    say(`${r.item.id} ${r.item.technique}: ${j.status} за ${minutes(r.wallMs)} мин, $${cost(j.id).toFixed(2)}${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
  }));
  const failed = state.runs.filter((r) => r.jobs.at(-1)!.status !== "completed");
  state.gen = { ms: Date.now() - t0, retry: failed.length > 0 };
  if (failed.length > 0) {
    const t1 = Date.now();
    const retry = startScriptBatch(core, { projectId, revision: doc.revision, itemIds: failed.map((r) => r.item.id), idempotencyKey: `e2e-s5-retry-${newId("run")}` });
    expect(retry.items.map((x) => x.item_id).sort()).toEqual(failed.map((r) => r.item.id).sort());
    for (const bi of retry.items) {
      const k = jobs.get(core.db, bi.job!.id)!.idempotency_key;
      say(`повтор ${bi.item_id}: ключ ${k}`);
      expect(k).toMatch(/:try-\d+$/);
    }
    await Promise.all(retry.items.map(async (bi) => {
      const r = state.runs.find((x) => x.item.id === bi.item_id)!;
      const j = await wait(bi.job!.id);
      r.jobs.push(j);
      say(`повтор ${r.item.id}: ${j.status} за ${minutes(Date.now() - t1)} мин, $${cost(j.id).toFixed(2)}${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
    }));
    state.gen.ms = Date.now() - t0;
  }
  for (const r of state.runs) {
    const last = r.jobs.at(-1)!;
    const v = versions.listByJob(core.db, last.id).filter((x) => x.status === "ready").at(-1);
    if (!v) continue;
    r.version = v;
    r.dir = join(ROOT, v.path);
    r.manifest = JSON.parse(readFileSync(join(r.dir, "manifest.json"), "utf8")) as VersionManifest;
    r.spec = JSON.parse(readFileSync(join(r.dir, "spec.json"), "utf8")) as MotionSpec;
    r.settings = r.manifest.settings;
  }
  const st = batchStatus(core.db, ROOT, batch.id);
  say(`пакет ${batch.id}: ${JSON.stringify(st.counts)}`);
  for (const r of state.runs) for (const j of r.jobs) expect(FINAL).toContain(j.status);
  expect(state.runs.filter((r) => r.version).length, "хотя бы одна ready").toBeGreaterThan(0);
}, T);

it("[A] версии ready, длительность = frames.total, без speech_window, отпечатки, бриф с подокнами, Concept без уточнений, палитра проекта", async () => {
  const { projectId, planId } = state as Required<typeof state>;
  const style = currentProjectStyle(core.db, ROOT, projectId)!;
  const styleRef = { id: style.style_id, revision: style.revision };
  const problems: string[] = [];
  const check = (ok: boolean, msg: string) => {
    say(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
    if (!ok) problems.push(msg);
  };
  for (const r of state.runs) {
    const { item } = r;
    const fr = item.frames;
    say(`${item.id} ${item.technique} (lead ${fr.lead}, speech ${fr.speech}, tail ${fr.tail}, total ${fr.total}):`);
    check(r.version !== undefined && r.manifest?.status === "ready", `${item.id}: версия ready`);
    for (const j of r.jobs) check(!seen.get(j.id)?.has("awaiting_input"), `${item.id}: задача ${j.id} без awaiting_input`);
    const brief = JSON.parse(readFileSync(join(ROOT, sceneRel(projectId, r.sceneId), "brief.json"), "utf8")) as { prompt: string };
    writeFileSync(join(TMP, `brief-${item.id}.txt`), brief.prompt + "\n");
    check(r.windows.length > 0 && r.windows.every((w) => brief.prompt.includes(`[${w.start}; ${w.end})`)), `${item.id}: brief.json содержит подокна ${r.windows.map((w) => `[${w.start}; ${w.end})`).join(", ")}`);
    const row = scriptScenes.get(core.db, planId, item.id, "16:9")!;
    const fp = itemFingerprint(item, styleRef);
    check(row.item_fingerprint === fp, `${item.id}: отпечаток script_scenes = itemFingerprint`);
    check((r.jobs.at(-1)!.input as { script_fingerprint?: string }).script_fingerprint === fp, `${item.id}: отпечаток во входе задачи`);
    if (!r.version || !r.spec || !r.settings) continue;
    check(scenes.get(core.db, r.sceneId)!.current_version_id === r.version.id, `${item.id}: версия текущая у сцены`);
    check(r.settings.duration_frames === fr.total && r.spec.duration_frames === fr.total, `${item.id}: duration_frames ${r.settings.duration_frames}/${r.spec.duration_frames} = frames.total ${fr.total}`);
    const sw = specChecks(r.spec, r.settings, { speechWindow: { lead: fr.lead, speech: fr.speech, tail: fr.tail } }).filter((i) => i.code === "speech_window");
    check(sw.length === 0, `${item.id}: speech_window без нарушений${sw.length ? ` — ${sw.map((i) => i.description).join("; ")}` : ""}`);
    const props = JSON.parse(readFileSync(join(r.dir!, "props.json"), "utf8")) as { style?: { palette_overrides?: Record<string, unknown>; preset?: string } };
    const lock = r.settings.style_lock?.palette_overrides ?? {};
    const want = style.base.palette_overrides ?? {};
    check(Object.entries(lock).every(([k, v]) => JSON.stringify(props.style?.palette_overrides?.[k]) === JSON.stringify(v)) && Object.keys(lock).every((k) => k in want),
      `${item.id}: props.style.palette_overrides = палитра проекта (${JSON.stringify(lock)})`);
    check(props.style?.preset === style.base.preset, `${item.id}: пресет ${props.style?.preset} = ${style.base.preset}`);
    const events = r.jobs.flatMap((j) => jobEvents.listSince(core.db, 0, { jobId: j.id, limit: 2000 })).filter((e) => e.kind !== "progress");
    writeFileSync(join(TMP, `events-${item.id}.txt`), events.map((e) => `${e.ts} ${e.level} ${e.kind}: ${e.message}`).join("\n") + "\n");
  }
  writeFileSync(join(TMP, "sync.txt"), state.runs.map(syncTable).join("\n\n") + "\n");
  say(readFileSync(join(TMP, "sync.txt"), "utf8"));
  expect(problems).toEqual([]);
}, T);

/** Таблица «подокна предложений ↔ фазы и биты» сцены (кадры; биты, начавшиеся в окне предложения). */
function syncTable(r: SceneRun): string {
  const { item } = r;
  const fr = item.frames;
  const L = [`## ${item.id} ${item.technique} — lead ${fr.lead}, речь [${fr.lead}; ${fr.lead + fr.speech}), hold ≥ ${fr.tail}, total ${fr.total}`];
  if (!r.spec) return [...L, "  версии нет"].join("\n");
  const beats = [...r.spec.beats].sort((a, b) => a.start_frame - b.start_frame);
  const phases = phasesOf(r.spec).map((p) => {
    const own = r.spec!.phases ? beats.filter((b) => b.phase === p.id) : beats.filter((b) => b.id === p.id);
    return { role: p.role, id: p.id, s: Math.min(...own.map((b) => b.start_frame)), e: Math.max(...own.map((b) => b.end_frame)) };
  });
  L.push("Предложения:");
  for (const w of r.windows) {
    const inside = beats.filter((b) => b.start_frame >= w.start && b.start_frame < w.end).map((b) => `${b.id}@${b.start_frame}`);
    L.push(`  [${w.start}; ${w.end}) «${w.text.slice(0, 90)}» ← биты: ${inside.join(", ") || "—"}`);
  }
  L.push("Фазы:");
  for (const p of phases) L.push(`  ${p.role.padEnd(7)} ${p.id} [${Number.isFinite(p.s) ? p.s : "—"}; ${Number.isFinite(p.e) ? p.e : "—"})`);
  L.push("Биты:");
  for (const b of beats) L.push(`  ${b.id} [${b.start_frame}; ${b.end_frame}) ${b.kind ?? ""} ${b.phase ?? ""} — ${b.action}`);
  return L.join("\n");
}

it("экспорт MP4 полного размера и кадры: начало речи, середина, удержание", async () => {
  const ready = state.runs.filter((r) => r.version);
  expect(ready.length).toBeGreaterThan(0);
  mkdirSync(join(TMP, "frames"), { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
  for (const r of ready) {
    const t0 = Date.now();
    const id = enqueue(core.db, { type: "scene.export", projectId: state.projectId!, versionId: r.version!.id, input: { versionId: r.version!.id, request: { format: "mp4", crf: 18, scale: 1 } }, idempotencyKey: `e2e-s5-exp-${newId("run")}` }).job.id;
    const j = await wait(id, 1000);
    say(`экспорт ${r.item.id}: ${j.status} за ${((Date.now() - t0) / 1000).toFixed(0)} с${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    const ex = exportsRepo.get(core.db, (j.output_refs as { export_id: string }).export_id)!;
    const name = `e2e-block2-${String(r.n).padStart(2, "0")}-${r.item.technique}`;
    r.exportFile = join(TMP, `${name}.mp4`);
    copyFileSync(join(ROOT, ex.path), r.exportFile);
    const probe = await ffprobe(r.exportFile);
    say(`  ${name}.mp4: ${probe.codec} ${probe.width}×${probe.height} ${probe.durationMs} мс`);
    const fr = r.item.frames;
    const at = { speech: fr.lead + 2, mid: fr.lead + Math.floor(fr.speech / 2), hold: fr.total - Math.ceil(fr.tail / 2) };
    for (const [k, f] of Object.entries(at)) {
      const full = join(TMP, "frames", `${name}-${k}-f${f}.png`);
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", r.exportFile, "-vf", `select=eq(n\\,${f})`, "-vframes", "1", full]);
      await run("/usr/bin/sips", ["-Z", "480", full, "--out", join(EVIDENCE, `${name}-${k}-f${f}.png`)]);
    }
  }
  const total = state.runs.flatMap((r) => r.jobs).reduce((a, j) => a + cost(j.id), 0);
  const summary = {
    project_id: state.projectId, plan_id: state.planId, plan_revision: state.doc?.revision,
    plan: { seconds: state.plan?.s, cost_usd: state.plan?.res.agent.cost_usd, calls: state.plan?.res.agent.calls },
    generate: { minutes: Number(minutes(state.gen?.ms ?? 0)), retry: state.gen?.retry, cost_usd: Number(total.toFixed(3)) },
    scenes: state.runs.map((r) => ({
      item_id: r.item.id, n: r.n, technique: r.item.technique, quote: r.item.quote, frames: r.item.frames, scene_id: r.sceneId,
      jobs: r.jobs.map((j) => ({ id: j.id, status: j.status, cost_usd: Number(cost(j.id).toFixed(3)), key: j.idempotency_key, error: j.error ?? null })),
      version_id: r.version?.id ?? null, export: r.exportFile ?? null, windows: r.windows,
    })),
  };
  writeFileSync(join(TMP, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  say(JSON.stringify(summary.generate));
}, T);
