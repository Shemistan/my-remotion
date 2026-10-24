// Task 28: обработчик `roughcut.preview` на реальном ffmpeg. «Прокси» — 60 с, 30 fps, яркость
// кадра = (N·7) mod 250 (номер кадра читается из картинки превью), звук — розовый шум (для
// корреляции). Проверяется кадровая точность склейки по кускам, длительность, синхронность звука,
// иммутабельность и повтор без второй сборки, отмена во время ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EdlRevisionDoc, type Job, type TranscriptWord, acceptedCuts, buildTimeline, frameToUs } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore, isPublished } from "../../src/artifacts/store.js";
import { ROUGHCUT_DEFAULTS } from "../../src/config.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as edls from "../../src/db/repos/edls.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { clipFrames } from "../../src/edit/preview-filter.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { buildSegments } from "../../src/media/segments.js";
import { type RoughcutPreviewDeps, type RoughcutPreviewResult, roughcutPreview } from "../../src/pipeline/roughcut-preview.js";
import { asset } from "../db/video-fixtures.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { F30, dec, edlDoc, trDoc, w } from "../edit/helpers.js";

const DUR = 60_000_000;
let s: TestStore;
let db: Db;
let store: ArtifactStore;
let fx: string;
let n = 0;

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);

beforeAll(async () => {
  s = await makeStore("ms-preview-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  fx = join(s.tmp, "fx");
  await mkdir(fx, { recursive: true });
  ff(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=60,geq=lum='mod(N*7,250)':cb=128:cr=128", "-f", "lavfi", "-i", "anoisesrc=d=60:c=pink:r=48000:a=0.4",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", "60", join(fx, "proxy.mp4")]);
  ff(["-i", join(fx, "proxy.mp4"), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", join(fx, "audio16k.wav")]);
  // звук короче видео: 50 с из 60
  await mkdir(join(fx, "short"), { recursive: true });
  ff(["-i", join(fx, "proxy.mp4"), "-t", "50", "-vn", "-c:a", "copy", join(fx, "short", "a.m4a")]);
  ff(["-i", join(fx, "proxy.mp4"), "-i", join(fx, "short", "a.m4a"), "-map", "0:v", "-map", "1:a", "-c", "copy", join(fx, "short", "proxy.mp4")]);
  ff(["-i", join(fx, "short", "proxy.mp4"), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", join(fx, "short", "audio16k.wav")]);
}, 60_000);
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

/** Видеопроект с прокси, audio16k, транскриптом (слова по 300 мс каждые 600 мс) и EDL r1 с принятыми вырезками. */
async function seed(cuts: { start_us: number; end_us: number }[], src = fx): Promise<{ projectId: string; edlId: string; doc: EdlRevisionDoc }> {
  const k = ++n;
  const projectId = `p${k}`;
  const mediaId = `med_${k}`;
  const edlId = `edl_${k}`;
  projects.create(db, { id: projectId, kind: "video", title: `Превью ${k}` });
  const a = asset({ id: mediaId, project_id: projectId, rel_path: `workspace/projects/${projectId}/source/${mediaId}/original.mov` });
  media.insert(db, { ...a, probe: { ...a.probe, duration_us: DUR } });
  const pxRel = `workspace/projects/${projectId}/proxy/${mediaId}`;
  await mkdir(join(s.root, pxRel), { recursive: true });
  execFileSync("cp", [join(src, "proxy.mp4"), join(src, "audio16k.wav"), join(s.root, pxRel)]);
  media.setDerivative(db, mediaId, { kind: "proxy", rel_path: `${pxRel}/proxy.mp4`, sha256: "c".repeat(64), params: {} });
  media.setDerivative(db, mediaId, { kind: "audio16k", rel_path: `${pxRel}/audio16k.wav`, sha256: "d".repeat(64), params: {} });
  const words: TranscriptWord[] = Array.from({ length: 99 }, (_, i) => w(`w_${String(i + 1).padStart(6, "0")}`, `слово${i}`, 300_000 + i * 600_000, 600_000 + i * 600_000));
  const tr = trDoc(words, { transcript_id: `trn_${k}`, segments: buildSegments(words) });
  const tRel = artifactPaths(s.root, projectId).transcriptRev(`trn_${k}`, 1);
  await store.writeRevision(tRel, "transcript.json", tr, (d, files) => {
    transcripts.create(d, { id: `trn_${k}`, project_id: projectId, media_id: mediaId, language: "ru" });
    transcripts.insertRevision(d, { doc: tr, rel_path: `${tRel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  const doc = edlDoc(cuts.map((c, i) => dec(`d${i}`, { status: "accepted", source_start_us: c.start_us, source_end_us: c.end_us })), { edl_id: edlId, media_id: mediaId, transcript_id: `trn_${k}` });
  const eRel = artifactPaths(s.root, projectId).edlRev(edlId, 1);
  await store.writeRevision(eRel, "edl.json", doc, (d, files) => {
    edls.create(d, { id: edlId, project_id: projectId, media_id: mediaId, transcript_id: `trn_${k}` });
    edls.insertRevision(d, { doc, rel_path: `${eRel}/edl.json`, sha256: files[0]!.sha256, timeline: buildTimeline(DUR, acceptedCuts(doc), F30) });
  });
  return { projectId, edlId, doc };
}

const sem = () => new AttemptPermits(new Semaphore(2));
async function preview(projectId: string, edlId: string, o: { deps?: Partial<RoughcutPreviewDeps>; onStart?: (ac: AbortController, job: Job) => void } = {}) {
  enqueue(db, { type: "roughcut.preview", projectId, input: { edlId, revision: 1 }, idempotencyKey: `pv${++n}` });
  const { job, attempt } = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  const ac = new AbortController();
  const events: { kind: string; message: string; data?: unknown }[] = [];
  o.onStart?.(ac, job);
  const ctx: JobContext = {
    db, job, attempt, signal: ac.signal, run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message, data) => events.push({ kind, message, data }), progress: () => undefined, fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
  const r: HandlerResult = await roughcutPreview(() => ({ root: s.root, roughcut: ROUGHCUT_DEFAULTS, storage: s.guard, ...o.deps }))(ctx);
  finish(db, job.id, attempt, r);
  return { r, job, events, out: (r.status === "completed" ? r.outputRefs : undefined) as RoughcutPreviewResult | undefined };
}

/** Номера кадров источника по яркости кадров файла (яркость = N·7 mod 250). */
function lumas(file: string): number[] {
  const raw = execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-i", file, "-vf", "extractplanes=y,scale=8:8", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const out: number[] = [];
  for (let i = 0; i + 64 <= raw.length; i += 64) {
    let sum = 0;
    for (let k = 0; k < 64; k++) sum += raw[i + k]!;
    out.push(sum / 64);
  }
  return out;
}
const lumaOf = (frame: number) => (frame * 7) % 250;
const drafts = (jobId: string) => (existsSync(join(s.root, "workspace/drafts")) ? readdirSync(join(s.root, "workspace/drafts")).filter((x) => x.startsWith(jobId)) : []);

describe("roughcut.preview", () => {
  it("кадровая точность по кускам (151 клип, куски по 40), длительность ± кадр, синхронность ≤ кадра, иммутабельность; повтор — без пересборки", async () => {
    // каждые 12 кадров вырезаются 2: 150 вырезок
    const cuts = Array.from({ length: 150 }, (_, i) => ({ start_us: frameToUs(i * 12 + 5, F30), end_us: frameToUs(i * 12 + 7, F30) }));
    const { projectId, edlId } = await seed(cuts);
    const tl = buildTimeline(DUR, cuts, F30);
    const { r, out, events, job } = await preview(projectId, edlId);
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(out).toMatchObject({ edl_id: edlId, revision: 1, reused: false, clips: 151, chunks: 4 });
    const file = join(s.root, out!.rel_path);
    expect(out!.rel_path).toBe(`workspace/projects/${projectId}/preview/${edlId}/r1/preview.mp4`);
    expect(statSync(file).mode & 0o222).toBe(0);
    expect(Math.abs(out!.duration_us!.video - tl.duration_us)).toBeLessThanOrEqual(33_334);
    expect(Math.abs(out!.duration_us!.audio! - tl.duration_us)).toBeLessThanOrEqual(33_334);
    // кадры превью — ровно кадры клипов по порядку
    const expected = tl.clips.flatMap((c) => { const f = clipFrames(c, F30); return Array.from({ length: f.end - f.start }, (_, i) => lumaOf(f.start + i)); });
    const got = lumas(file);
    expect(got.length).toBe(expected.length);
    const wrong = got.map((g, i) => [i, g, expected[i]!] as const).filter(([, g, e]) => Math.abs(g - e) > 3);
    expect(wrong.slice(0, 5)).toEqual([]);
    // звук: 5 слов, |смещение| ≤ кадра
    expect(out!.sync).toHaveLength(5);
    // склейка по сэмплам точна: смещение — доли миллисекунды (порог приёмки — кадр)
    for (const x of out!.sync!) expect(Math.abs(x.offset_us), JSON.stringify(out!.sync)).toBeLessThanOrEqual(1_000);
    expect(events.map((e) => e.kind)).toContain("sync_check");
    expect(existsSync(join(s.root, `workspace/projects/${projectId}/preview/${edlId}/r1/preview.json`))).toBe(true);
    expect(drafts(job.id)).toEqual([]);
    expect(readdirSync(join(s.root, "run/tmp")).filter((x) => x.startsWith(job.id))).toEqual([]);

    // повтор той же ревизии: опубликованное не пересобирается
    const again = await preview(projectId, edlId);
    expect(again.out).toMatchObject({ reused: true, rel_path: out!.rel_path, clips: 151 });
    expect(again.events.map((e) => e.kind)).toContain("preview_reused");
    expect(isPublished(db, `workspace/projects/${projectId}/preview/${edlId}/r1`)).toBe(true);
  }, 60_000);

  it("вырезки на краях записи: начало и конец вырезаны — превью от первого оставленного кадра", async () => {
    const cuts = [{ start_us: 0, end_us: 2_000_000 }, { start_us: 58_000_000, end_us: DUR }];
    const { projectId, edlId } = await seed(cuts);
    const { r, out } = await preview(projectId, edlId, { deps: { chunkClips: 1 } });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(Math.abs(out!.duration_us!.video - 56_000_000)).toBeLessThanOrEqual(33_334);
    const got = lumas(join(s.root, out!.rel_path));
    expect(Math.abs(got[0]! - lumaOf(60))).toBeLessThanOrEqual(3);
    expect(Math.abs(got.at(-1)! - lumaOf(1739))).toBeLessThanOrEqual(3);
  }, 60_000);

  it("звук прокси короче видео: хвост превью добит тишиной, длительность звука = видео ± кадр", async () => {
    const cuts = [{ start_us: 10_000_000, end_us: 20_000_000 }, { start_us: 45_000_000, end_us: 48_000_000 }];
    const { projectId, edlId } = await seed(cuts, join(fx, "short"));
    const { r, out } = await preview(projectId, edlId, { deps: { chunkClips: 2 } });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(Math.abs(out!.duration_us!.audio! - out!.duration_us!.video)).toBeLessThanOrEqual(33_334);
    expect(Math.abs(out!.duration_us!.video - 47_000_000)).toBeLessThanOrEqual(33_334);
  }, 60_000);

  it("отмена во время ffmpeg → cancelled, процессы убиты, превью не опубликовано, draft убран", async () => {
    const cuts = Array.from({ length: 150 }, (_, i) => ({ start_us: frameToUs(i * 12 + 5, F30), end_us: frameToUs(i * 12 + 7, F30) }));
    const { projectId, edlId } = await seed(cuts);
    const reg = fileProcessRegistry(s.root);
    let ac!: AbortController;
    let job!: Job;
    const run = preview(projectId, edlId, { deps: { chunkClips: 1 }, onStart: (a, j) => ((ac = a), (job = j)) });
    for (let i = 0; i < 400 && (await reg.live({ runId: job?.id ?? "-" })).length === 0; i++) await new Promise((res) => setTimeout(res, 10));
    expect((await reg.live({ runId: job.id })).length).toBeGreaterThan(0);
    requestCancel(db, job.id, { attemptAlive: true });
    ac.abort();
    const { r } = await run;
    expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(await reg.live({ runId: job.id })).toEqual([]);
    expect(isPublished(db, `workspace/projects/${projectId}/preview/${edlId}/r1`)).toBe(false);
    expect(drafts(job.id)).toEqual([]);
  }, 60_000);

  it("всё вырезано — понятный отказ; EDL другого проекта — отказ", async () => {
    const { projectId, edlId } = await seed([{ start_us: 0, end_us: DUR }]);
    const { r } = await preview(projectId, edlId);
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare" } });
    const other = await seed([]);
    const x = await preview(projectId, other.edlId);
    expect(x.r).toMatchObject({ status: "failed", error: { stage: "prepare" } });
  }, 60_000);
});


