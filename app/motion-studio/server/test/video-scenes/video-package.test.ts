// Task 5L: задача `video.package` — папка клипов видеопроекта: утверждённые (C) версии сцен плана →
// MP4 + ProRes 4444 с альфой (кроме fullscreen) через exportOne (фейк), шпаргалка с таймкодами
// ролика и исходника, манифест; неутверждённые/устаревшие — в «не вошли»; пусто — package_empty;
// повтор задачи — тот же пакет.
import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type QAReport, VideoPackageManifestSchema, VideoScenesStateDtoSchema, videoSceneFrames, videoSceneWindow } from "@ms/contracts";
import type { CoreServices } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { videoPackages, videoScenes } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, fenceOk, finish } from "../../src/jobs/queue.js";
import type { JobRunner } from "../../src/jobs/runner.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext, JobHandler } from "../../src/jobs/types.js";
import type { ExportOneInput } from "../../src/pipeline/scene-export.js";
import { type VideoPackageDeps, videoPackage, videoPackagesForProject } from "../../src/pipeline/video-package.js";
import { sha256File } from "../../src/scenes/hash.js";
import { newId } from "../../src/scenes/ids.js";
import { exportRel } from "../../src/scenes/store.js";
import { OVERLAY_IMPOSSIBLE } from "../../src/script/overlay-check.js";
import { approveScene } from "../../src/video-scenes/approval-c.js";
import { startVideoBatch } from "../../src/video-scenes/batch.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { okStatus } from "../pipeline/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { P, TERMINAL, type VideoEnv, nextRevision, seedVideoBatchProject, startRunner } from "./batch-helpers.js";

const F30 = { num: 30, den: 1 };
let env: JobsEnv;
let v: VideoEnv;
let runner: JobRunner | undefined;
/** item_id → сцена и её версия. */
const sceneOf = new Map<string, string>();
const versionOf = new Map<string, string>();
/** Длительность версии в кадрах, если не по плану (item_id → кадры). */
const durationOf = new Map<string, number>();
const qaOf = new Map<string, QAReport>();

/** Фейк генерации: версия с настройками входа (длительность — по плану) и отпечатком. */
const generate: JobHandler = async (c: JobContext): Promise<HandlerResult> => {
  const input = c.job.input as { sceneId: string; settings: Record<string, unknown>; video: { item_id: string }; video_fingerprint: string };
  const draft = await makeDraft(env.s.root, { runId: c.job.id, attempt: c.attempt, sceneId: input.sceneId, projectId: P });
  const qa = qaOf.get(input.video.item_id);
  if (qa) writeFileSync(join(draft.dir, "qa.json"), JSON.stringify(qa));
  const frames = durationOf.get(input.video.item_id);
  const settings = { ...input.settings, ...(frames ? { duration_frames: frames } : {}) } as never;
  const ver = await v.repo.publish(draft, meta(input.sceneId, { settings }), { jobId: c.job.id, attempt: c.attempt });
  videoScenes.setFingerprint(env.db, input.sceneId, input.video_fingerprint);
  return { status: "completed", outputRefs: { version_id: ver.versionId } };
};

async function generateAll(): Promise<void> {
  const b = startVideoBatch({ db: env.db, root: env.s.root }, { projectId: P, revision: v.doc.revision, idempotencyKey: `g${++k}`, regenerate: true });
  runner = startRunner(v, { "playground.generate": generate });
  await until(() => b.items.every((x) => TERMINAL.has(jobs.get(env.db, x.job!.id)!.status)), "генерация", 10_000);
  await runner.stop({ abortRunning: true });
  runner = undefined;
  for (const x of b.items) {
    sceneOf.set(x.item_id, x.scene_id);
    versionOf.set(x.item_id, scenes.get(env.db, x.scene_id)!.current_version_id!);
  }
}

const approve = (itemId: string) => approveScene(env.db, { sceneId: sceneOf.get(itemId)!, versionId: versionOf.get(itemId)!, root: env.s.root });

beforeEach(async () => {
  env = await setupDb("ms-video-package-");
  v = await seedVideoBatchProject(env);
  sceneOf.clear();
  versionOf.clear();
  durationOf.clear();
  qaOf.clear();
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  env.db.close();
  await removeStore(env.s);
});

interface Call extends ExportOneInput { jobId: string }

/** Фейковый exportOne: публикует экспорт как настоящий (каталог a-w, манифест, строка) или падает. */
function fakeExport(o: { fail?: (c: Call) => string | undefined } = {}) {
  const calls: Call[] = [];
  const fn = async (ctx: JobContext, _d: unknown, input: ExportOneInput): Promise<HandlerResult> => {
    const call = { ...input, jobId: ctx.job.id };
    calls.push(call);
    const msg = o.fail?.(call);
    if (msg) return { status: "failed", error: { code: "pipeline", stage: "export", message: msg } };
    const id = newId("exp");
    const ext = input.request.format === "prores4444" ? "mov" : "mp4";
    const dir = join(env.s.root, exportRel(P, id));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `scene.${ext}`);
    writeFileSync(file, `video ${input.versionId} ${ext}`);
    const prores = ext === "mov";
    const ffprobe = { durationMs: 3000, width: 1920, height: 1080, fps: F30, codec: prores ? "prores" : "h264", ...(prores ? { pixFmt: "yuva444p12le", profile: "4444" } : { audioCodec: "aac" }) };
    writeFileSync(join(dir, "export-manifest.json"), JSON.stringify({ request: input.request, ffprobe }));
    for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o444);
    chmodSync(dir, 0o555);
    const sha256 = await sha256File(file);
    exportsRepo.insert(env.db, { id, version_id: input.versionId, job_id: ctx.job.id, format: input.request.format, path: `${exportRel(P, id)}/scene.${ext}`, sha256 });
    return { status: "completed", outputRefs: { export_id: id, sha256, ffprobe } };
  };
  return { fn, calls };
}

function ctxOf(jobId: string, attempt: number): JobContext {
  const job = jobs.get(env.db, jobId)!;
  return {
    db: env.db, job, attempt, signal: new AbortController().signal,
    run: { root: env.s.root, runId: job.id, attempt, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
    emit: () => undefined, progress: () => undefined, fenceOk: () => fenceOk(env.db, job.id, attempt),
    agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
  };
}

function deps(exp: ReturnType<typeof fakeExport>): VideoPackageDeps {
  const svc = { root: env.s.root, storageCheck: () => okStatus(env.s.root) } as unknown as CoreServices;
  return { svc, options: {}, exporter: { repo: v.repo, deps: () => { throw new Error("не вызывается"); } }, exportOne: exp.fn as VideoPackageDeps["exportOne"] };
}

let k = 0;
/** Новая задача (или новая попытка той же) → обработчик. */
async function run(d: VideoPackageDeps, o: { jobId?: string; only_approved?: boolean } = {}) {
  const input = { projectId: P, ...(o.only_approved !== undefined ? { only_approved: o.only_approved } : {}) };
  const id = o.jobId ?? enqueue(env.db, { type: "video.package", projectId: P, input, idempotencyKey: `pk${++k}` }).job.id;
  if (o.jobId) {
    releaseLocks(env.db, jobs.get(env.db, id)!);
    jobs.update(env.db, id, { status: "pending", lease_owner: null, lease_until: null });
  }
  const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([id]) })!;
  const r = await videoPackage(() => d)(ctxOf(id, c.attempt));
  finish(env.db, id, c.attempt, r);
  return { id, r };
}

type Refs = { package_id: string; rel_path: string; files: number; missing: { item_id: string; reason: string }[] };
const refsOf = (r: HandlerResult) => (r as { outputRefs: Refs }).outputRefs;
const manifestOf = (refs: Refs) => VideoPackageManifestSchema.parse(JSON.parse(readFileSync(join(env.s.root, refs.rel_path, "package-manifest.json"), "utf8")));

describe("videoPackage", () => {
  it("по умолчанию — только утверждённые (C): MP4 + альфа, fullscreen без альфы; остальные в «не вошли»; шпаргалка с таймкодами", async () => {
    await generateAll();
    const [a, b, c, d] = v.doc.items;
    expect(c!.composition_mode).toBe("fullscreen");
    approve(a!.id);
    approve(c!.id);
    const exp = fakeExport();
    const { r } = await run(deps(exp));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const refs = refsOf(r);
    expect(refs.files).toBe(2);
    expect(refs.missing).toEqual([{ item_id: b!.id, reason: "не утверждена (C)" }, { item_id: d!.id, reason: "не утверждена (C)" }]);
    const dir = join(env.s.root, refs.rel_path);
    const files = readdirSync(dir).sort();
    expect(files.filter((f) => f.startsWith("01_"))).toHaveLength(2);
    expect(files.filter((f) => f.startsWith("03_"))).toEqual([expect.stringMatching(/^03_[a-z0-9-]+\.mp4$/)]);
    expect(files.filter((f) => !/^0\d_/.test(f))).toEqual(["package-manifest.json", "шпаргалка.csv", "шпаргалка.md", "шпаргалка.txt"]);
    for (const f of [".", ...files]) expect(statSync(join(dir, f)).mode & 0o222, f).toBe(0);

    // экспорт: MP4 и альфа первой, только MP4 fullscreen; кадры проверки альфы — окно речи плана
    expect(exp.calls.map((x) => x.draftKey)).toEqual(["1-mp4", "1-alpha", "3-mp4"]);
    expect(exp.calls[1]!.request).toEqual({ format: "prores4444", crf: 18, scale: 1, overlay: true });
    const w = videoSceneWindow(a!, F30);
    const total = videoSceneFrames(a!);
    expect(exp.calls[1]!.frames).toEqual({ lead: w.lead, speech: total - w.lead - w.tail, tail: w.tail, total });

    const m = manifestOf(refs);
    expect(m.scenes.map((s) => [s.n, s.item_id, s.approved, s.mode, s.alpha === null])).toEqual([[1, a!.id, true, a!.composition_mode, false], [3, c!.id, true, "fullscreen", true]]);
    expect(m.scenes[0]).toMatchObject({ source: a!.source, edited: a!.edited, frames: a!.frames, version_id: versionOf.get(a!.id), version_number: 1, duration_frames: total });
    // куски исходника — по таймлайну EDL (вырезка 2,2–3,7 с): ролик 2,3–4,4 с = исходник 3,8–5,9 с
    expect(m.scenes[0]!.source_pieces).toEqual([{ start_us: 3_800_000, end_us: 5_900_000 }]);
    expect(m.missing[0]!.source_pieces).toEqual([b!.source]);
    expect(m.missing.map((x) => [x.item_id, x.n, x.frames])).toEqual([[b!.id, 2, b!.frames], [d!.id, 4, d!.frames]]);

    // шпаргалка: строк = сцен плана; таймкоды ролика из кадров плана
    const csv = readFileSync(join(dir, "шпаргалка.csv"), "utf8").slice(1).trimEnd().split("\r\n");
    expect(csv).toHaveLength(1 + 4);
    const tc = (f: number) => `00:00:${String(Math.floor(f / 30)).padStart(2, "0")}:${String(f % 30).padStart(2, "0")}`;
    expect(csv[1]!.split(";").slice(0, 3)).toEqual(["01", tc(a!.frames.start), tc(a!.frames.end)]);
    expect(csv[3]!).toContain("без альфы: сцена на весь кадр");
    expect(csv[2]!).toContain("не вошла: не утверждена (C)");
    const md = readFileSync(join(dir, "шпаргалка.md"), "utf8");
    expect(md).toContain("## Не вошли в папку (2)");

    // пакет — в состоянии сцен проекта и списке пакетов
    const st = videoScenesState(env.db, env.s.root, P);
    expect(VideoScenesStateDtoSchema.parse(st).packages.map((p) => p.id)).toEqual([refs.package_id]);
    expect(videoPackagesForProject(env.db, env.s.root, P)[0]!.manifest.package_id).toBe(refs.package_id);
  });

  it("only_approved: false — неутверждённая текущая версия в папке с пометкой; длительность не по плану — замечание", async () => {
    const [a, b] = v.doc.items;
    durationOf.set(b!.id, videoSceneFrames(b!) + 30);
    await generateAll();
    approve(a!.id);
    const { r } = await run(deps(fakeExport()), { only_approved: false });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const m = manifestOf(refsOf(r));
    expect(m.scenes.map((s) => [s.n, s.approved])).toEqual([[1, true], [2, false], [3, false], [4, false]]);
    expect(m.missing).toEqual([]);
    expect(m.scenes[1]!.warnings[0]).toMatch(/^duration_off_plan: длительность не по плану/);
    const txt = readFileSync(join(env.s.root, refsOf(r).rel_path, "шпаргалка.txt"), "utf8").split("\n");
    expect(txt[1]).toContain("C: нет");
    const csv = readFileSync(join(env.s.root, refsOf(r).rel_path, "шпаргалка.csv"), "utf8");
    expect(csv).toMatch(/не утверждена \(C\); длительность не по плану/);
  });

  it("режим и альфа — по размещению, с которым сделана версия (не по текущему плану)", async () => {
    await generateAll();
    const [a] = v.doc.items;
    expect(a!.composition_mode).toBe("overlay");
    // версия первой сцены сделана как fullscreen (непрозрачная): альфа ей не положена
    const gen = jobs.get(env.db, versions.get(env.db, versionOf.get(a!.id)!)!.created_by_job_id!)!;
    const input = gen.input as { video: { placement: Record<string, unknown> } };
    const video = { ...input.video, placement: { ...input.video.placement, mode: "fullscreen", zone: "full", transparent: false } };
    env.db.prepare("UPDATE jobs SET input_refs_json = ? WHERE id = ?").run(JSON.stringify({ ...input, video }), gen.id);
    const exp = fakeExport();
    const { r } = await run(deps(exp), { only_approved: false });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const m = manifestOf(refsOf(r));
    expect(m.scenes[0]).toMatchObject({ item_id: a!.id, mode: "fullscreen", zone: "full", alpha: null });
    expect(exp.calls.map((x) => x.draftKey).filter((k) => k?.startsWith("1-"))).toEqual(["1-mp4"]);
    expect(m.missing).toEqual([]);
    expect(readFileSync(join(env.s.root, refsOf(r).rel_path, "шпаргалка.csv"), "utf8").split("\r\n")[1]).toContain("без альфы: сцена на весь кадр");
  });

  it("сцена плана изменилась после утверждения — «сцена устарела»; альфа невозможна — сцена без альфы с причиной", async () => {
    const [a, b] = v.doc.items;
    qaOf.set(b!.id, {
      gate: { technical: "pass", visual: "warn", semantic: "not_checked", style: "not_checked" }, checked_frames: [0], ocr: [], automated: true,
      issues: [{ source: "programmatic", code: "overlay_opaque", severity: "warning", description: "сцена рисует свой фон", fix_hint: "фон — только Background" }],
    });
    await generateAll();
    approve(a!.id);
    approve(b!.id);
    await nextRevision(v, (items) => items.map((x) => (x.id === a!.id ? { ...x, zone: "right_third" as const } : x)));
    const exp = fakeExport();
    const { r } = await run(deps(exp));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const refs = refsOf(r);
    expect(refs.missing).toEqual(expect.arrayContaining([{ item_id: a!.id, reason: "сцена устарела" }, { item_id: b!.id, reason: OVERLAY_IMPOSSIBLE }]));
    expect(exp.calls.map((x) => x.draftKey)).toEqual(["2-mp4"]);
    const m = manifestOf(refs);
    expect(m.scenes.map((s) => [s.item_id, s.alpha])).toEqual([[b!.id, null]]);
    expect(readFileSync(join(env.s.root, refs.rel_path, "шпаргалка.csv"), "utf8")).toContain(OVERLAY_IMPOSSIBLE);
  });

  it("ничего не утверждено — failed package_empty с причинами; сбой экспорта одной сцены — остальные идут", async () => {
    await generateAll();
    const { r } = await run(deps(fakeExport()));
    expect(r).toMatchObject({ status: "failed", error: { code: "package_empty" } });
    expect((r as { error: { message: string } }).error.message).toMatch(/сцена 1: не утверждена \(C\)/);
    expect(videoPackages.listByProject(env.db, P)).toEqual([]);

    const [a, b] = v.doc.items;
    approve(a!.id);
    approve(b!.id);
    const exp = fakeExport({ fail: (c) => (c.versionId === versionOf.get(a!.id) && c.request.format === "mp4" ? "экспорт не удался: кодек упал" : undefined) });
    const ok = await run(deps(exp));
    expect(ok.r.status).toBe("completed");
    expect(refsOf(ok.r).missing).toEqual([
      { item_id: a!.id, reason: "экспорт не удался: кодек упал" },
      expect.objectContaining({ item_id: v.doc.items[2]!.id }), expect.objectContaining({ item_id: v.doc.items[3]!.id }),
    ]);
  });

  it("повтор задачи (новая попытка после публикации) — тот же пакет без новых экспортов", async () => {
    await generateAll();
    approve(v.doc.items[0]!.id);
    const exp = fakeExport();
    const first = await run(deps(exp));
    const n = exp.calls.length;
    const again = await run(deps(exp), { jobId: first.id });
    expect(again.r.status).toBe("completed");
    expect(refsOf(again.r).package_id).toBe(refsOf(first.r).package_id);
    expect(exp.calls).toHaveLength(n);
    expect(videoPackages.listByProject(env.db, P)).toHaveLength(1);
    // вторая сборка той же версии — готовые экспорты тех же запросов переиспользуются
    const second = await run(deps(exp));
    expect(refsOf(second.r).package_id).not.toBe(refsOf(first.r).package_id);
    expect(exp.calls).toHaveLength(n);
    expect(versions.get(env.db, versionOf.get(v.doc.items[0]!.id)!)?.status).toBe("ready");
  });

  it("сцены ещё не генерировались — package_empty «сцена ещё не сгенерирована» (а не «не утверждена»)", async () => {
    const { r } = await run(deps(fakeExport()));
    expect(r).toMatchObject({ status: "failed", error: { code: "package_empty" } });
    expect((r as { error: { message: string } }).error.message).toMatch(/сцена 1: сцена ещё не сгенерирована/);
  });

  it("не видеопроект — failed prepare", async () => {
    const id = enqueue(env.db, { type: "video.package", projectId: "playground", input: { projectId: "playground" }, idempotencyKey: "pg" }).job.id;
    const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([id]) })!;
    const r = await videoPackage(() => deps(fakeExport()))(ctxOf(id, c.attempt));
    expect(r).toMatchObject({ status: "failed", error: { stage: "prepare" } });
  });
});
