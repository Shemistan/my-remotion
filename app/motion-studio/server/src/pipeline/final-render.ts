// Задача `final.render` (Task 43, ADR 0010): финал ревизии таймлайна по настройкам экспорта. Гейт
// (`assembleGate`, решение final того же субъекта) → место на томе (`estimateFinalBytes` + master, если
// его нет в кэше, + WAV) → `ensureMaster` (CFR, BT.709) → `buildEditedAudio` по оригиналу →
// `renderTimelineRange` целиком в draft (master и WAV целиком, BT.709) → `verifyFinal` (матрица bt709)
// → гейт повторно (за время рендера могло устареть: тогда ничего не публикуется) → публикация
// `final/<id>/{final.mp4,final-manifest.json,verify.json,project-snapshot.json}` с fencing, a-w, и
// строка `final_exports`. Проверка не пройдена — файл публикуется со статусом `failed_verification`,
// задача — `failed(verify_failed)`, события успеха нет. Общее ядро `runFinal` берёт и
// `final.reproduce` (те же входы по манифесту, без гейта свежести).
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { type FinalExportRequest, type FinalManifest, type FinalVerifyReport, type JobError, type ProbeResult, ProbeResultSchema } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { safeMkdir } from "@ms/core";
import { type TimelineRenderResult, renderTimelineRange } from "@ms/render";
import { finalSubject } from "../approvals/subjects.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactExistsError, ArtifactStore, isPublished } from "../artifacts/store.js";
import * as approvals from "../db/repos/approvals.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as transcripts from "../db/repos/transcripts.js";
import { finalExports, videoTimelines } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { timelineFor } from "../edit/timeline-store.js";
import type { compareExports } from "../final/compare.js";
import { assembleGate, gateJobError } from "../final/gate.js";
import { FINAL_FILE, FINAL_MANIFEST_FILE, SNAPSHOT_FILE, VERIFY_FILE, buildFinalManifest } from "../final/manifest.js";
import { FINAL_COLOR_SPACE, FinalPropsError, finalProps, outFrame } from "../final/render.js";
import { projectSnapshot } from "../final/snapshot.js";
import { verifyFinal } from "../final/verify.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { extractAudio16k } from "../media/audio.js";
import { buildEditedAudio } from "../media/edited-audio.js";
import { FfmpegError } from "../media/ffmpeg.js";
import { HdrUnsupportedError, ensureMaster } from "../media/master.js";
import { type Demuxer, demuxerFor, demuxerForExt } from "../media/probe.js";
import { checkImportSpace, gib } from "../media/space.js";
import { finalSpacePlan } from "../final/space-plan.js";
import { sha256, sha256File } from "../scenes/hash.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { timelinePlan } from "../timeline/build.js";
import { TimelineError, readTimelineDoc, timelineRow } from "../timeline/ops.js";
import { FinalRenderInputSchema } from "../final/request.js";
import { type Phase46Deps } from "./phase46-deps.js";
import { renderEnv } from "./render-env.js";
import { errText, isStorageError } from "./steps.js";

export type FinalRenderDeps = Phase46Deps;

/** Подмены для тестов (реестр `handlers.ts` зовёт обработчики без них). */
export interface FinalImpl {
  master?: typeof ensureMaster;
  editedAudio?: typeof buildEditedAudio;
  audio16k?: typeof extractAudio16k;
  render?: typeof renderTimelineRange;
  verify?: typeof verifyFinal;
  compare?: typeof compareExports;
  renderEnv?: typeof renderEnv;
}

/** Итог задачи (`output_refs`). */
export interface FinalRenderResult {
  export_id: string;
  rel_path: string;
  status: "ready" | "failed_verification";
  verdict: "pass" | "fail";
  timeline_id: string;
  revision: number;
  width: number;
  height: number;
  frames: number;
  elapsed_ms: number;
  /** Повтор (`final.reproduce`): исходный экспорт и сравнение. */
  reproduced_from?: string;
  compare?: Awaited<ReturnType<typeof compareExports>>;
}

export class FinalFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** id экспорта задачи: один на задачу (повтор попытки публикует тот же каталог). */
export const exportIdFor = (jobId: string): string => `fin_${jobId.replace(/^job_/, "")}`;

/** Что делает ядро: финал по решению (гейт) или повтор по манифесту (входы сверяются с ним). */
export interface FinalPlan {
  timelineId: string;
  revision: number;
  request: FinalExportRequest;
  approvalId: string | null;
  /** Повтор: манифест исходного экспорта — входы обязаны совпасть (`inputs_changed`). */
  expect?: FinalManifest;
  /** Перед публикацией (повтор — сравнение с исходным): файлы в draft и поля итога; `error` — задача failed после публикации. */
  beforePublish?: (i: { draftDir: string; finalPath: string; manifest: FinalManifest; workDir: string }) => Promise<{ outputRefs: Partial<FinalRenderResult>; error?: JobError }>;
}

const inputsChanged = (what: string) => new FinalFail({ code: "verify_failed", message: `inputs_changed: ${what} не тот, что в манифесте исходного экспорта` });

async function dropDraft(dir: string | undefined): Promise<void> {
  if (!dir || !existsSync(dir) || existsSync(join(dir, QUARANTINE))) return;
  await setWritable(dir).catch(() => undefined);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Ядро финала и повтора. */
export async function runFinal(ctx: JobContext, deps: FinalRenderDeps, impl: FinalImpl, plan: FinalPlan): Promise<HandlerResult> {
  const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
  // этап — только у кода `pipeline` (у прочих кодов этапа нет: JobErrorSchema)
  const prep = (message: string, code: JobError["code"] = "pipeline") => new FinalFail(code === "pipeline" ? { code, stage: "prepare", message } : { code, message });
  const { svc, options } = deps;
  const root = svc.root;
  const storage = svc.storageCheck;
  const { signal, run } = ctx;
  const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
  const started = Date.now();
  const exportId = exportIdFor(ctx.job.id);
  const { timelineId, revision, request } = plan;
  let stage = "prepare";
  let draftDir: string | undefined;
  let workdir: string | undefined;
  const reproduce = plan.expect !== undefined;

  try {
    const t = timelineRow(ctx.db, timelineId);
    if (!t) throw prep(`таймлайна ${timelineId} нет`);
    if (t.project_id !== ctx.job.project_id) throw prep(`таймлайн ${timelineId} не из проекта задачи ${ctx.job.project_id}`);
    const projectId = t.project_id;
    const destRel = artifactPaths(root, projectId).finalExport(exportId);
    const published = finalExports.get(ctx.db, exportId);
    if (published && isPublished(ctx.db, destRel)) return outcome(published.status === "ready" ? "pass" : "fail", published.rel_path);
    // Решение final задачи (только `valid`: отозванное новым final той же области или человеком и
    // устаревшее не годятся) и гейт: до работы и ещё раз в транзакции публикации (`db` — её соединение).
    const gate = (db = ctx.db) => {
      if (reproduce) return;
      const a = plan.approvalId ? approvals.get(db, plan.approvalId) : undefined;
      const subject = finalSubject(timelineId, revision, request);
      if (!a || a.kind !== "final" || a.project_id !== projectId || a.subject_ref !== subject.ref || a.subject_hash !== subject.hash || a.status !== "valid") {
        throw prep(`решения final на ${subject.ref} с этими настройками нет, оно отозвано или устарело${a ? ` (${a.status})` : ""}: «Смонтировать и экспортировать» заново`, "approval_required");
      }
      const g = assembleGate(db, root, projectId, { timelineId, revision });
      if (!g.ok) throw new FinalFail(gateJobError(g.errors));
    };
    gate();

    let doc;
    try {
      doc = readTimelineDoc(ctx.db, root, timelineId, revision);
    } catch (e) {
      if (e instanceof TimelineError) throw prep(errText(e));
      throw e;
    }
    const rev = videoTimelines.revision(ctx.db, timelineId, revision)!;
    const edl = edls.get(ctx.db, doc.inputs.edl.id);
    const asset = edl ? media.get(ctx.db, edl.media_id) : undefined;
    if (!edl || !asset) throw prep(`нет EDL ${doc.inputs.edl.id} или его исходника`);
    if (asset.sha256 !== doc.inputs.media_sha256) throw prep(`исходник ${asset.id} не тот, по которому собран таймлайн r${revision} (media_sha256): пересоберите таймлайн`, "timeline_stale");
    if (!asset.probe.audio) throw prep(`у исходника ${asset.id} нет звука: финал — MP4 со звуком исходника`, "no_audio");
    const tl = timelineFor(ctx.db, edl.id, doc.inputs.edl.revision);
    const planDoc = timelinePlan(ctx.db, root, doc.inputs);
    const words = transcripts.words(ctx.db, planDoc.inputs.transcript.id, planDoc.inputs.transcript.revision).map((w) => ({ id: w.word_id, start_us: w.start_us, end_us: w.end_us }));
    const scenes: FinalManifest["inputs"]["scenes"] = [];
    const versionsMap: Record<string, { dir: string; props: Record<string, unknown> }> = {};
    for (const c of doc.scenes) {
      const v = versions.get(ctx.db, c.version_id);
      if (!v || v.status !== "ready" || v.broken_reason !== null) throw new FinalFail({ code: "version_failed", message: `версия ${c.version_id} сцены ${c.item_id} не готова или сломана` });
      const dir = join(root, v.path);
      versionsMap[c.version_id] = { dir, props: JSON.parse(await readFile(join(dir, "props.json"), "utf8")) as Record<string, unknown> };
      // повтор: manifest_sha256 и файлы версии — по диску (порча файлов при прежней строке БД → inputs_changed)
      if (reproduce && (await versionOnDisk(dir, c.version_id)) !== v.manifest_sha256) throw inputsChanged(`manifest.json версии ${c.version_id} (sha256 на диске ≠ БД)`);
      scenes.push({ clip_id: c.clip_id, version_id: c.version_id, manifest_sha256: v.manifest_sha256 });
    }
    const envNow = await (impl.renderEnv ?? renderEnv)();
    if (plan.expect) {
      const x = plan.expect;
      const same = (a: unknown, b: unknown) => canonicalHash(a) === canonicalHash(b);
      if (x.timeline.hash !== rev.hash) throw inputsChanged(`документ ревизии таймлайна ${timelineId} r${revision}`);
      if (!same(x.inputs.edl, doc.inputs.edl) || !same(x.inputs.plan, doc.inputs.plan) || !same(x.inputs.style, doc.inputs.style)) throw inputsChanged("EDL, план или стиль");
      if (x.inputs.media_sha256 !== asset.sha256) throw inputsChanged("исходник (sha256)");
      if (!same(x.inputs.scenes, scenes)) throw inputsChanged("состав или версии сцен (manifest_sha256)");
      if (x.render_env.render_lock_sha256 !== envNow.render_lock_sha256) throw inputsChanged("окружение рендера (render_lock_sha256)");
    }

    // место (ADR 0010): файл финала + запас; копия master и WAV, которые Remotion качает в TMPDIR
    // попытки; сам master, если его нет в кэше; WAV в рабочем каталоге
    const status = await storage();
    if (!status.ok) throw new FinalFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
    const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
    // Task 49b: master в разрешении выхода — ступень короткой стороны выхода (4K — только для 4K и
    // «source»). Повтор экспорта до 49b: полный master его манифеста, если он опубликован. Та же
    // оценка — у API (`finalSpacePlan`).
    const { out, masterHeight, masterCached, bytes: est } = await finalSpacePlan(ctx.db, root, projectId, asset, doc, request, plan.expect);
    const minFree = svc.minFreeBytes ?? 0;
    const space = checkImportSpace(est, status.freeBytes, minFree);
    if (!space.ok) {
      throw new FinalFail({
        code: "low_space",
        message: `low_space: для финала нужно свободно ${gib(space.needBytes)} (оценка ${gib(est)}${masterCached ? "" : " с master"} + порог ${gib(minFree)}), на томе хранилища ${gib(status.freeBytes)}`,
      });
    }

    // этапы прогресса — из словаря `stage.*` (ru.ts правит только 35′): master и звук — «медиа», проверка — «проверка видео»
    stage = "media";
    ctx.progress(0.03, "media");
    let master;
    try {
      // долгая сборка master (4K — десятки минут): тики `-progress` ffmpeg держат сторожа
      // (`perf/watchdog.ts`), свой таймаут — `final.timeoutMs` (как у рендера)
      let tick = 0;
      const onProgress = (p: number) => {
        const now = Date.now();
        if (now - tick < 1_000 && p < 1) return;
        tick = now;
        ctx.progress(0.03 + 0.069 * Math.min(1, Math.max(0, p)), "media");
      };
      master = await (impl.master ?? ensureMaster)({ root, db: ctx.db, storage, run, signal, crf: svc.config.final.masterCrf, timeoutMs: svc.config.final.timeoutMs, onProgress }, asset.id, doc.fps, masterHeight);
    } catch (e) {
      if (e instanceof HdrUnsupportedError) throw prep(e.message);
      throw e;
    }
    if (plan.expect && plan.expect.inputs.master_sha256 !== master.sha256) throw inputsChanged("master исходника (sha256)");

    const tmpRoot = await safeMkdir(root, "run/tmp");
    workdir = await mkdtemp(join(tmpRoot, `${fence.jobId}-a${fence.attempt}-final-`));
    draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
    const cacheDir = await safeMkdir(root, "cache");

    ctx.progress(0.1, "media");
    const original = join(root, asset.rel_path);
    const demuxer = demuxerOf(asset.probe.container, original);
    const audio = await (impl.editedAudio ?? buildEditedAudio)({ input: original, demuxer, tl, fadeUs: svc.config.roughcut.fadeUs, out: join(workdir, "edited-audio.wav"), run, signal });
    if (plan.expect && plan.expect.inputs.audio_sha256 !== audio.sha256) throw inputsChanged("смонтированный звук (sha256)");
    const a16 = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "audio16k");
    let source16k: string;
    if (a16) source16k = join(root, a16.rel_path);
    else {
      // импорт без audio16k (фикстуры) — извлечь во временный каталог попытки
      source16k = join(workdir, "audio16k.wav");
      await (impl.audio16k ?? extractAudio16k)(original, source16k, demuxer, { run, signal });
    }

    stage = "render";
    ctx.progress(0.15, "render");
    const finalPath = join(draftDir, FINAL_FILE);
    const stillsDir = join(workdir, "stills");
    let req;
    try {
      req = finalProps(doc, request, { master: master.path, audio: audio.path, out: finalPath, stillsDir, cacheDir, versions: versionsMap, tl }, display, {
        check: options.check ?? checkSceneDir, timeoutMs: svc.config.final.timeoutMs, run,
      });
    } catch (e) {
      if (e instanceof FinalPropsError) throw prep(e.message);
      throw e;
    }
    const release = await ctx.renders.acquire(signal);
    let r: TimelineRenderResult;
    try {
      r = await (impl.render ?? renderTimelineRange)(req, signal);
    } finally {
      release();
    }
    if (!r.ok) {
      const e = r.error!;
      if (e.stage === "orphaned") throw new FinalFail({ code: "stale_process", stage: "orphaned", message: `рендер финала: ${e.message}` }, "blocked");
      if (e.stage === "aborted") throw Object.assign(new Error(`рендер финала прерван: ${e.message}`), { name: "AbortError" });
      throw new FinalFail({ code: "pipeline", stage: "render", message: `рендер финала: ${e.stage}: ${e.message}` });
    }
    if (!r.probe) throw new FinalFail({ code: "pipeline", stage: "probe", message: "рендер финала не вернул ffprobe файла" });

    stage = "probe";
    ctx.progress(0.8, "probe");
    const report: FinalVerifyReport = await (impl.verify ?? verifyFinal)({
      finalPath, doc, request, master: master.path, editedAudio: audio.path, source16k, words, tl, workDir: workdir, colorMatrix: FINAL_COLOR_SPACE, expectColorTags: FINAL_COLOR_SPACE, run, signal,
      stillsFor: async (frames) => frames.map((f) => join(stillsDir, `${outFrame(f, doc.fps, out.fps)}.png`)),
    });

    stage = "publish";
    ctx.progress(0.95, "publish");
    gate(); // за время рендера и проверки решение или ревизия могли устареть — тогда не публикуется ничего
    const manifest = buildFinalManifest({
      export_id: exportId, project_id: projectId, timeline: { id: timelineId, revision, hash: rev.hash },
      inputs: { edl: doc.inputs.edl, plan: doc.inputs.plan, style: doc.inputs.style, media_sha256: asset.sha256, master_sha256: master.sha256, audio_sha256: audio.sha256, scenes },
      request, output: out, render_env: envNow, ffprobe: probeOf(r.probe), verify: { verdict: report.verdict, report: VERIFY_FILE },
      created_at: new Date().toISOString(),
    });
    const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
    await fsyncWrite(join(draftDir, VERIFY_FILE), json(report));
    await fsyncWrite(join(draftDir, FINAL_MANIFEST_FILE), json(manifest));
    await fsyncWrite(join(draftDir, SNAPSHOT_FILE), json(projectSnapshot(ctx.db, root, projectId, { timelineId, revision })));
    const extra = plan.beforePublish ? await plan.beforePublish({ draftDir, finalPath, manifest, workDir: workdir }) : { outputRefs: {} };
    const relPath = `${destRel}/${FINAL_FILE}`;
    const rowStatus = report.verdict === "pass" ? "ready" : "failed_verification";
    const store = new ArtifactStore({ root, db: ctx.db, guard: storage });
    try {
      await store.publish(draftDir, destRel, (db, files) => {
        // окно между проверкой выше и COMMIT (хеширование draft) закрыто: та же проверка под write-lock БД
        gate(db);
        const f = files.find((x) => x.path.endsWith(FINAL_FILE));
        if (!f) throw new Error(`в публикации финала нет ${FINAL_FILE}`);
        finalExports.insert(db, {
          id: exportId, project_id: projectId, timeline_id: timelineId, timeline_revision: revision, approval_id: plan.approvalId, request,
          inputs_hash: manifest.inputs_hash, rel_path: relPath, sha256: f.sha256, status: rowStatus, job_id: ctx.job.id,
        });
      }, fence);
    } catch (e) {
      if (e instanceof ArtifactExistsError) {
        await dropDraft(draftDir);
        await dropWork();
        const row = finalExports.get(ctx.db, exportId);
        if (row) return outcome(row.status === "ready" ? "pass" : "fail", row.rel_path);
      }
      throw e;
    }
    await dropWork();
    const res: FinalRenderResult = {
      export_id: exportId, rel_path: relPath, status: rowStatus, verdict: report.verdict, timeline_id: timelineId, revision,
      width: out.width, height: out.height, frames: out.frames, elapsed_ms: Date.now() - started, ...extra.outputRefs,
    };
    if (report.verdict !== "pass") {
      const why = [...report.failures, ...(report.probe.length > 0 ? [`ffprobe: ${report.probe.join("; ")}`] : [])];
      return fail({ code: "verify_failed", message: `проверка финала ${exportId} не пройдена: ${why.join(", ")} (файл сохранён со статусом failed_verification, ${VERIFY_FILE})` });
    }
    if (extra.error) return fail(extra.error);
    const note = `финал ${exportId}: ${out.width}×${out.height}, ${out.frames} кадров, проверка pass за ${((Date.now() - started) / 1000).toFixed(1)} с`;
    if (reproduce) ctx.emit("final_reproduce", note);
    else ctx.emit("final_render", note);
    ctx.progress(1, "done");
    return { status: "completed", outputRefs: res };
  } catch (e) {
    return await failed(e);
  }

  function outcome(verdict: "pass" | "fail", relPath: string): HandlerResult {
    // попытка до этой уже опубликовала экспорт задачи
    if (verdict !== "pass") return fail({ code: "verify_failed", message: `проверка финала ${exportId} не пройдена (опубликован прежней попыткой)` });
    ctx.progress(1, "done");
    return { status: "completed", outputRefs: { export_id: exportId, rel_path: relPath, reused: true } };
  }

  async function dropWork(): Promise<void> {
    if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }

  async function failed(e: unknown): Promise<HandlerResult> {
    const msg = errText(e);
    const alive = (e instanceof FfmpegError && e.kind === "orphaned") || (e instanceof FinalFail && e.error.code === "stale_process");
    if (alive) {
      // процесс жив — draft в карантин, рабочий каталог не трогаем (ADR 0007, rulings п. 13)
      if (draftDir && existsSync(draftDir)) await quarantineDir(draftDir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
      return fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
    }
    await dropWork();
    if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
    if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
    await dropDraft(draftDir);
    if (e instanceof FinalFail) return fail(e.error, e.status);
    if (signal.aborted || (e instanceof FfmpegError && e.kind === "aborted") || (e instanceof Error && e.name === "AbortError")) {
      if (jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true) return fail({ code: "cancelled", stage: "cancelled", message: `финал отменён на этапе ${stage}` }, "cancelled");
      return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
    }
    if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
    const now = await storage().catch(() => undefined);
    if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
    if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
    if (stage === "prepare") return fail({ code: "pipeline", stage: "prepare", message: msg });
    return fail({ code: "pipeline", stage: "render", message: `${stage}: ${msg}` });
  }
}

/**
 * sha256 `manifest.json` версии на диске; файлы из его `files` сверяются по sha256. Нет файла,
 * не тот sha256 — `inputs_changed` (повтор не воспроизведёт испорченную версию).
 */
async function versionOnDisk(dir: string, versionId: string): Promise<string> {
  let text: Buffer;
  try {
    text = await readFile(join(dir, "manifest.json"));
  } catch {
    throw inputsChanged(`manifest.json версии ${versionId} (файла нет)`);
  }
  let files: unknown;
  try {
    files = (JSON.parse(text.toString("utf8")) as { files?: unknown }).files;
  } catch {
    files = undefined;
  }
  for (const f of Array.isArray(files) ? files : []) {
    const e = f as { path?: unknown; sha256?: unknown };
    if (typeof e.path !== "string" || typeof e.sha256 !== "string") continue;
    if (isAbsolute(e.path) || e.path.split(/[\\/]/).includes("..")) throw inputsChanged(`путь ${e.path} в manifest.json версии ${versionId}`);
    const got = await sha256File(join(dir, e.path)).catch(() => undefined);
    if (got !== e.sha256) throw inputsChanged(`файл ${e.path} версии ${versionId} (sha256 по manifest.json)`);
  }
  return sha256(text);
}

/** `-f` по контейнеру probe; запись без узнаваемого контейнера — по расширению копии (тоже явный демультиплексор). */
function demuxerOf(container: string, path: string): Demuxer {
  try {
    return demuxerFor(container);
  } catch {
    return demuxerForExt(path);
  }
}

/** ffprobe рендера в форме `ProbeResultSchema` (лишние поля отброшены). */
function probeOf(p: ProbeResult): ProbeResult {
  const keys = Object.keys(ProbeResultSchema.shape) as (keyof ProbeResult)[];
  return ProbeResultSchema.parse(Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])));
}

export function finalRenderWith(depsOf: () => FinalRenderDeps, impl: FinalImpl = {}): JobHandler {
  return async (ctx) => {
    const parsed = FinalRenderInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return { status: "failed", error: { code: "pipeline", stage: "prepare", message: `вход final.render не годится: ${parsed.error.message}` } };
    const i = parsed.data;
    return runFinal(ctx, depsOf(), impl, { timelineId: i.timelineId, revision: i.revision, request: i.request, approvalId: i.approvalId });
  };
}

export const finalRender: (depsOf: () => FinalRenderDeps) => JobHandler = (depsOf) => finalRenderWith(depsOf);

