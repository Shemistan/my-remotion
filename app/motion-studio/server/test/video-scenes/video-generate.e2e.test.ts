// Task 37′ e2e: генерация видеосцен реальными claude и рендером по плану реального видеопроекта.
// Хранилище — КОПИЯ хранилища приёмки Phase 3 (`MS_DATA_DIR`, по умолчанию
// `materialsPath("e2e", "v37-video")`; оригинал не трогается): проект с визуальным планом
// (`MS_V37_PROJECT` или первый видеопроект с планом). Две сцены разных режимов: прозрачная
// (overlay/callout с ключевым словом, самая короткая) и fullscreen — её режим, если в плане
// такой нет, ставится новой ревизией плана (Д2: режим — только через план). По сцене —
// `playground.generate` с входом `video`, до конечного статуса.
// [A] версия ready (или failed с причиной), duration_frames = план, коды проверок в qa.json,
// `qa/ctx-*.png` у прозрачной; отпечаток после публикации. MP4 (crf 18), у прозрачной ещё
// ProRes 4444 с альфой и превью «сцена поверх исходника» — `materialsPath("examples",
// "phase4", "v37")` с README.txt; кадры ≤ 480 px — docs/evidence/phase-4/generate/.
// Запуск: `MS_E2E=1 ./scripts/with-node.sh npx vitest run server/test/video-scenes/video-generate.e2e.test.ts`.
import { execFile } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type QAReport, type ScenePlanItem, type Settings, type VersionManifest, type VisualPlanRevisionDoc, videoSceneFrames } from "@ms/contracts";
import { MARKER_FILE, assertSsdWriteAllowed, materialsPath } from "@ms/core";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { currentPlan, savePlanRevision } from "../../src/analysis/plan-ops.js";
import { currentProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { videoScenes } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import { newId } from "../../src/scenes/ids.js";
import { writeBriefSync } from "../../src/scenes/store.js";
import { buildVideoSceneBrief, videoSceneSettings } from "../../src/video-scenes/brief.js";
import { planFps, videoNarration, videoSceneContext } from "../../src/video-scenes/context.js";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";

const T = 150 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? materialsPath("e2e", "v37-video");
const EXAMPLES = process.env.MS_V37_EXAMPLES ?? materialsPath("examples", "phase4", "v37");
const EVIDENCE = join(REPO, "docs/evidence/phase-4/generate");
/** Префикс имён примеров и кадров evidence (fix-раунд — `v37-fix`). */
const TAG = process.env.MS_V37_TAG ?? "v37";
const TMP = join(REPO, `tmp/${TAG}-e2e`);
/** Режим/зона прозрачной сцены (`overlay/lower_third`); нет такой в плане — новой ревизией плана (Д2). */
const OVERLAY = process.env.MS_V37_OVERLAY?.split("/") as [ScenePlanItem["composition_mode"], ScenePlanItem["zone"]] | undefined;
/** `overlay` — только прозрачная сцена (fullscreen не генерируется). */
const ONLY = process.env.MS_V37_ONLY;
const FINAL = ["completed", "failed", "cancelled", "blocked"];
const run = promisify(execFile);

let core: Core;
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];
const mine = new Set<string>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

beforeAll(async () => {
  expect(existsSync(join(ROOT, MARKER_FILE)), `нет копии хранилища в ${ROOT} — скопируйте studio.db, ${MARKER_FILE} и каталог проекта из acceptance/store`).toBe(true);
  assertSsdWriteAllowed(ROOT);
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
    if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
    if (j && FINAL.includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, poll));
  }
}

const cost = (jobId: string): number =>
  (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(jobId) as { c: number }).c;

interface SceneRun {
  item: ScenePlanItem;
  label: string;
  sceneId: string;
  fp: string;
  settings: Settings;
  job?: Job;
  ms: number;
  version?: versions.VersionRow;
  dir?: string;
}

const state: { projectId?: string; doc?: VisualPlanRevisionDoc; runs: SceneRun[]; planEdit?: string } = { runs: [] };

it("план видеопроекта: прозрачная сцена с ключевым словом и fullscreen (режим — новой ревизией плана)", async () => {
  const pid = process.env.MS_V37_PROJECT
    ?? (core.db.prepare("SELECT p.id FROM projects p JOIN visual_plans v ON v.project_id = p.id WHERE p.kind = 'video' AND v.current_revision IS NOT NULL ORDER BY p.created_at DESC LIMIT 1").get() as { id: string } | undefined)?.id;
  expect(pid, "видеопроекта с планом нет").toBeDefined();
  const plan = plans.byProject(core.db, pid!)!;
  let doc = currentPlan(core.db, ROOT, plan.id);
  const accepted = doc.items.filter((x) => x.status === "accepted");
  const dur = (x: ScenePlanItem) => videoSceneFrames(x);
  let overlay = OVERLAY
    ? accepted.find((x) => x.composition_mode === OVERLAY[0] && x.zone === OVERLAY[1] && x.key_terms.length > 0)
    : accepted.filter((x) => x.composition_mode !== "fullscreen" && x.key_terms.length > 0 && x.face_overlap.ratio === 0).sort((a, b) => dur(a) - dur(b))[0];
  if (!overlay && OVERLAY) {
    // нет сцены в нужном режиме — самая короткая прозрачная с ключевым словом без лица переводится в него ревизией плана (Д2)
    const cand = accepted.filter((x) => x.composition_mode !== "fullscreen" && x.key_terms.length > 0 && x.face_overlap.ratio === 0).sort((a, b) => dur(a) - dur(b))[0]!;
    const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
    doc = await savePlanRevision({ db: core.db, store, root: ROOT, planning: core.config.planning }, plan.id, {
      base_revision: doc.revision, ops: [{ op: "modify", item_id: cand.id, patch: { composition_mode: OVERLAY[0], zone: OVERLAY[1] } }],
    });
    overlay = doc.items.find((x) => x.id === cand.id)!;
    state.planEdit = `${cand.id}: ${cand.composition_mode}/${cand.zone} → ${OVERLAY.join("/")}, ревизия плана r${doc.revision}`;
    say(`план: ${state.planEdit}`);
  }
  expect(overlay, "нет прозрачной сцены с ключевым словом без лица").toBeDefined();
  let full = accepted.find((x) => x.composition_mode === "fullscreen");
  if (!full && ONLY !== "overlay") {
    const cand = accepted.filter((x) => x.id !== overlay!.id && dur(x) <= 12 * 30).sort((a, b) => dur(a) - dur(b))[0]!;
    const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
    doc = await savePlanRevision({ db: core.db, store, root: ROOT, planning: core.config.planning }, plan.id, {
      base_revision: doc.revision, ops: [{ op: "modify", item_id: cand.id, patch: { composition_mode: "fullscreen", zone: "full" } }],
    });
    full = doc.items.find((x) => x.id === cand.id)!;
    state.planEdit = `${cand.id}: ${cand.composition_mode}/${cand.zone} → fullscreen/full, ревизия плана r${doc.revision}`;
    say(`план: ${state.planEdit}`);
  }
  const ov = doc.items.find((x) => x.id === overlay!.id)!;
  state.projectId = pid!;
  state.doc = doc;
  const style = currentProjectStyle(core.db, ROOT, pid!)!;
  const project = projects.get(core.db, pid!)!;
  const asset = media.byProject(core.db, pid!)!;
  const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
  const fps = planFps(core.db, doc);
  const order = doc.items.filter((x) => x.status === "accepted").sort((a, b) => a.frames.start - b.frames.start);
  const pairs: [string, ScenePlanItem][] = [["overlay", ov], ...(ONLY === "overlay" ? [] : [["fullscreen", doc.items.find((x) => x.id === full!.id)!] as [string, ScenePlanItem]])];
  for (const [label, item] of pairs) {
    const ctx = videoSceneContext(core.db, ROOT, { projectId: pid!, doc, item });
    const settings = videoSceneSettings(project.settings ?? { ...defaultsOf(display) }, display, fps, item, style.base);
    const at = order.findIndex((x) => x.id === item.id);
    const brief = buildVideoSceneBrief({
      item, index: at + 1, total: order.length, ...(order[at - 1] ? { prev: order[at - 1] } : {}), ...(order[at + 1] ? { next: order[at + 1] } : {}),
      projectTitle: project.title, fps, narration: videoNarration(core.db, ROOT, doc, item), moments: ctx.key_moments ?? [], placement: ctx.placement,
    });
    const fp = videoItemFingerprint(item, { id: style.style_id, revision: style.revision });
    const sceneId = newId("scn");
    writeBriefSync(ROOT, sceneId, { prompt: brief, settings, created_at: new Date().toISOString() }, pid!);
    scenes.create(core.db, { id: sceneId, project_id: pid!, title: `v37 ${label} ${item.id}` });
    const row = videoScenes.get(core.db, doc.plan_id, item.id);
    if (row) core.db.prepare("UPDATE video_scenes SET scene_id = ? WHERE plan_id = ? AND item_id = ?").run(sceneId, doc.plan_id, item.id);
    else videoScenes.insert(core.db, { project_id: pid!, plan_id: doc.plan_id, item_id: item.id, scene_id: sceneId, batch_id: null, job_id: null, item_fingerprint: "" });
    writeFileSync(join(TMP, `brief-${label}.txt`), brief + "\n");
    writeFileSync(join(TMP, `ctx-${label}.json`), JSON.stringify(ctx, null, 2) + "\n");
    say(`${label}: ${item.id} ${item.composition_mode}/${item.zone} ${dur(item)} кадров (${(dur(item) / 30).toFixed(1)} с), ${item.visual_type}, ключевые: ${item.key_terms.map((k) => k.text).join(", ") || "—"}, кадр ${settings.width}×${settings.height}, лицо ${JSON.stringify(ctx.face ?? null)}, кадр исходника ${ctx.context_frame_rel ?? "—"}`);
    state.runs.push({ item, label, sceneId, fp, settings, ms: 0 });
    const job = enqueue(core.db, {
      type: "playground.generate", projectId: pid!, sceneId,
      input: { sceneId, prompt: brief, settings, video: ctx, video_fingerprint: fp, answers: "skip" }, idempotencyKey: `e2e-v37-${label}-${newId("run")}`,
    }).job;
    state.runs.at(-1)!.job = job;
  }
}, T);

function defaultsOf(display: { width: number; height: number }): Settings {
  return { aspect_ratio: "16:9", width: display.width, height: display.height, fps: { num: 30, den: 1 }, duration_frames: 180, style_preset: "dark-premium", animation_intensity: "balanced", background: "#0b0d12", transparent_export: false, safe_area: { x: 0.05, y: 0.05 } };
}

it("generate: обе сцены до конечного статуса (параллельно)", async () => {
  expect(state.runs).toHaveLength(ONLY === "overlay" ? 1 : 2);
  const t0 = Date.now();
  await Promise.all(state.runs.map(async (r) => {
    r.job = await wait(r.job!.id);
    r.ms = Date.now() - t0;
    say(`${r.label} ${r.item.id}: ${r.job.status} за ${(r.ms / 60_000).toFixed(1)} мин, $${cost(r.job.id).toFixed(2)}${r.job.error ? ` — ${JSON.stringify(r.job.error)}` : ""}`);
    const v = versions.listByJob(core.db, r.job.id).filter((x) => x.status === "ready").at(-1);
    if (v) {
      r.version = v;
      r.dir = join(ROOT, v.path);
    }
  }));
  for (const r of state.runs) expect(FINAL).toContain(r.job!.status);
}, T);

it("[A] ready, длительность = план, коды проверок в qa.json, композиты у прозрачной, отпечаток", async () => {
  const problems: string[] = [];
  const check = (ok: boolean, msg: string) => {
    say(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
    if (!ok) problems.push(msg);
  };
  for (const r of state.runs) {
    say(`${r.label} ${r.item.id}:`);
    check(r.version !== undefined, `${r.label}: версия ready (${r.job!.status}${r.job!.error ? `: ${JSON.stringify(r.job!.error)}` : ""})`);
    if (!r.dir) continue;
    const manifest = JSON.parse(readFileSync(join(r.dir, "manifest.json"), "utf8")) as VersionManifest;
    const spec = JSON.parse(readFileSync(join(r.dir, "spec.json"), "utf8")) as { duration_frames: number };
    const want = videoSceneFrames(r.item);
    check(manifest.settings.duration_frames === want && spec.duration_frames === want, `${r.label}: duration_frames ${manifest.settings.duration_frames}/${spec.duration_frames} = план ${want}`);
    const qa = JSON.parse(readFileSync(join(r.dir, "qa.json"), "utf8")) as QAReport;
    writeFileSync(join(TMP, `qa-${r.label}.json`), JSON.stringify(qa, null, 2) + "\n");
    say(`  qa: gate ${JSON.stringify(qa.gate)}, overall ${qa.scores?.overall ?? "—"}, коды: ${[...new Set(qa.issues.map((x) => `${x.code}/${x.severity}`))].join(", ") || "—"}`);
    const props = JSON.parse(readFileSync(join(r.dir, "props.json"), "utf8")) as { layout?: { rect: unknown } };
    if (r.label === "overlay") {
      check(JSON.stringify(props.layout?.rect) === JSON.stringify(r.item.rect), `${r.label}: props.layout.rect = зона плана ${JSON.stringify(r.item.rect)}`);
      const ctxFiles = existsSync(join(r.dir, "qa")) ? readdirSync(join(r.dir, "qa")).filter((f) => /^ctx-\d+\.png$/.test(f)) : [];
      check(ctxFiles.length > 0, `${r.label}: qa/ctx-*.png (${ctxFiles.join(", ")})`);
      check(!qa.issues.some((x) => ["face_ink", "outside_zone", "layout_rect"].includes(x.code) && x.severity === "blocking"), `${r.label}: без blocking face_ink/outside_zone/layout_rect`);
    } else {
      check(props.layout === undefined, `${r.label}: без props.layout`);
    }
    check(videoScenes.bySceneId(core.db, r.sceneId)?.item_fingerprint === r.fp, `${r.label}: отпечаток video_scenes = videoItemFingerprint`);
  }
  expect(problems).toEqual([]);
}, T);

it("MP4 (и ProRes с альфой, превью поверх исходника у прозрачной) — в примеры; кадры ≤ 480 px — evidence", async () => {
  const ready = state.runs.filter((r) => r.version);
  expect(ready.length).toBeGreaterThan(0);
  mkdirSync(EXAMPLES, { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
  const notes: string[] = [];
  const proxy = media.derivatives(core.db, media.byProject(core.db, state.projectId!)!.id).find((x) => x.kind === "proxy")!;
  for (const r of ready) {
    const name = `${TAG}-${r.label}-${r.item.id}`;
    const exp = async (request: Record<string, unknown>, ext: string): Promise<string> => {
      const t0 = Date.now();
      const id = enqueue(core.db, { type: "scene.export", projectId: state.projectId!, versionId: r.version!.id, input: { versionId: r.version!.id, request }, idempotencyKey: `e2e-v37-exp-${newId("run")}` }).job.id;
      const j = await wait(id, 1000);
      say(`экспорт ${name} ${JSON.stringify(request)}: ${j.status} за ${((Date.now() - t0) / 1000).toFixed(0)} с${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
      expect(j.status, JSON.stringify(j.error)).toBe("completed");
      const ex = exportsRepo.get(core.db, (j.output_refs as { export_id: string }).export_id)!;
      const out = join(EXAMPLES, `${name}.${ext}`);
      copyFileSync(join(ROOT, ex.path), out);
      return out;
    };
    const mp4 = await exp({ format: "mp4", crf: 18, scale: 1 }, "mp4");
    const p = await ffprobe(mp4);
    say(`  ${name}.mp4: ${p.codec} ${p.width}×${p.height} ${p.durationMs} мс`);
    notes.push(`${name}.mp4 — сцена ${r.item.id} (${r.item.composition_mode}/${r.item.zone}, ${r.item.visual_type}) как отдельный клип ${p.width}×${p.height}, ${(p.durationMs / 1000).toFixed(1)} с; фраза: «${r.item.evidence.map((e) => e.quote).join(" … ")}».`);
    const frames: string[] = [];
    if (r.label === "overlay") {
      const mov = await exp({ format: "prores4444", overlay: true }, "mov");
      // превью «сцена поверх исходника»: альфа-клип поверх отрезка прокси (source-время сцены, со звуком)
      const ctxMp4 = join(EXAMPLES, `${name}-поверх-видео.mp4`);
      const ss = (r.item.source.start_us / 1e6).toFixed(3);
      const t = (p.durationMs / 1000).toFixed(3);
      await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", ss, "-t", t, "-i", join(ROOT, proxy.rel_path), "-i", mov,
        "-filter_complex", `[0:v]scale=${r.settings.width}:${r.settings.height}[bg];[bg][1:v]overlay=0:0:shortest=1[v]`, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", ctxMp4]);
      notes.push(`${name}.mov — та же сцена ProRes 4444 с прозрачностью (для наложения в монтажке).`);
      notes.push(`${name}-поверх-видео.mp4 — превью: прозрачная сцена поверх отрезка вашего ролика (исходник ${ss} с, прокси); без вырезок монтажа внутри сцены.`);
      for (const f of readdirSync(join(r.dir!, "qa")).filter((x) => /^ctx-\d+\.png$/.test(x))) frames.push(join(r.dir!, "qa", f));
    }
    const at = Math.floor(videoSceneFrames(r.item) * 0.6);
    const still = join(TMP, `${name}-f${at}.png`);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", `select=eq(n\\,${at})`, "-vframes", "1", still]);
    frames.push(still);
    for (const f of frames) await run("/usr/bin/sips", ["-Z", "480", f, "--out", join(EVIDENCE, `${name}-${f.split("/").at(-1)}`)]);
  }
  const readme = join(EXAMPLES, "README.txt");
  const head = existsSync(readme) ? "" : "Примеры Task 37′ (генерация видеосцены по визуальному плану): сцены вашего ролика IMG_0685 (отрезок приёмки Phase 3), сгенерированные реальными агентами на копии хранилища приёмки.\n";
  appendFileSync(readme, `${head}\n${new Date().toISOString()} — проект ${state.projectId}, план ${state.doc!.plan_id}@r${state.doc!.revision}${state.planEdit ? ` (${state.planEdit})` : ""}:\n${notes.map((n) => `- ${n}`).join("\n")}\n`);
  const summary = {
    project_id: state.projectId, plan: `${state.doc!.plan_id}@r${state.doc!.revision}`, plan_edit: state.planEdit ?? null,
    scenes: state.runs.map((r) => ({ label: r.label, item_id: r.item.id, mode: r.item.composition_mode, zone: r.item.zone, frames: videoSceneFrames(r.item), job: r.job?.id, status: r.job?.status, minutes: Number((r.ms / 60_000).toFixed(1)), cost_usd: r.job ? Number(cost(r.job.id).toFixed(3)) : null, version_id: r.version?.id ?? null, error: r.job?.error ?? null })),
  };
  writeFileSync(join(TMP, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  say(JSON.stringify(summary));
}, T);
