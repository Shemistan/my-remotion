// Task 25 e2e: `media.import` через настоящий bootCore, очередь и раннер; реальные ffmpeg/ffprobe
// на фикстурах `scripts/make-media-fixtures.mjs` (tmp/media-fixtures/). Хранилище — во временном
// каталоге tmp/ репозитория (MS_ALLOW_SYSTEM_DISK=1), реальный SSD не трогается.
// Запуск: `MS_E2E=1 npx vitest run server/test/media/import.e2e.test.ts`.
// Время импорта и размер прокси — в консоль и tmp/media-import-evidence/README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type MediaAsset, STANDARD_FPS } from "@ms/contracts";
import { fileProcessRegistry, initStore, macosProbe } from "@ms/core";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, requestCancel } from "../../src/jobs/queue.js";
import { probeMedia } from "../../src/media/probe.js";
import type { ImportStage, MediaImportResult } from "../../src/pipeline/media-import.js";
import { sha256File } from "../../src/scenes/hash.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 10 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FIX = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, "tmp/media-import-evidence");
const fixture = (n: string) => join(FIX, n);

let tmp: string;
let root: string;
let core: Core;
const mine = new Set<string>();
let onStage: ((stage: ImportStage, jobId: string) => void) | undefined;
const rows: { name: string; status: string; s: number; proxyMb?: number; note: string }[] = [];

beforeAll(async () => {
  execFileSync(process.execPath, [join(REPO, "app/motion-studio/scripts/make-media-fixtures.mjs")], { stdio: "inherit" });
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  tmp = await mkdtemp(join(REPO, "tmp", "ms-media-e2e-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [FIX] } }) + "\n");
  copyFileSync(fixture("talk-ru-cfr.mp4"), fixture("Мой ролик с пробелами.mp4"));
  core = await bootCore({
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { onImportStage: (st) => onStage?.(st, currentJob), log: (l) => console.log(`  ${l}`) }),
  });
}, T);

afterAll(async () => {
  await core?.close();
  if (rows.length) {
    const md = [
      "# Импорт видео (Task 25) — e2e на tmp-хранилище",
      "",
      `Прогон ${new Date().toISOString()}; время — от постановки задачи до итога (копия, прокси, audio16k, waveform, миниатюры, публикация).`,
      "",
      "| Фикстура | Итог | Время, с | Прокси, МБ | Заметка |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} | ${r.status} | ${r.s.toFixed(2)} | ${r.proxyMb?.toFixed(2) ?? "—"} | ${r.note} |`),
      "",
    ].join("\n");
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(join(EVIDENCE, "README.md"), md);
    console.log(md);
  }
  if (tmp) await removeStore({ tmp, root, marker: undefined as never, guard: undefined as never });
});

let currentJob = "";

async function wait(id: string): Promise<Job> {
  mine.add(id);
  currentJob = id;
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function importFile(name: string, projectId = projects.create(core.db, { title: name, kind: "video" }).id) {
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "media.import", projectId, input: { projectId, method: "path", path: fixture(name) }, idempotencyKey: `e2e-t25-${newId("run")}` }).job.id;
  const job = await wait(id);
  const s = (Date.now() - t0) / 1000;
  const a = media.byProject(core.db, projectId);
  const px = a && media.derivatives(core.db, a.id).find((d) => d.kind === "proxy");
  const proxyMb = px ? statSync(join(root, px.rel_path)).size / 1e6 : undefined;
  rows.push({ name, status: job.status, s, ...(proxyMb !== undefined ? { proxyMb } : {}), note: job.error?.code ?? (a ? `${a.probe.video.display_width}×${a.probe.video.display_height} ${a.probe.timeline_fps.num}/${a.probe.timeline_fps.den}${a.probe.vfr ? " VFR" : ""}` : "") });
  console.log(`${name}: ${job.status} за ${s.toFixed(1)} с ${JSON.stringify(job.error ?? job.output_refs)}`);
  return { job, projectId, asset: a };
}

const derivative = (a: MediaAsset, kind: string) => join(root, media.derivatives(core.db, a.id).find((d) => d.kind === kind)!.rel_path);
const ls = (rel: string) => (existsSync(join(root, rel)) ? readdirSync(join(root, rel)) : []);

it("CFR: оригинал не меняется, копия read-only, прокси 720p 30/1 CFR той же длительности", async () => {
  const before = await sha256File(fixture("talk-ru-cfr.mp4"));
  const { job, asset: a } = await importFile("talk-ru-cfr.mp4");
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(await sha256File(fixture("talk-ru-cfr.mp4"))).toBe(before);
  expect(a!.sha256).toBe(before);
  expect(statSync(join(root, a!.rel_path)).mode & 0o222).toBe(0);
  const px = await probeMedia(derivative(a!, "proxy"));
  expect(px.video.height).toBe(720);
  expect(px.timeline_fps).toEqual({ num: 30, den: 1 });
  expect(px.vfr).toBe(false);
  expect(Math.abs(px.duration_us - a!.probe.duration_us)).toBeLessThanOrEqual(33_334);
  expect(px.audio).toMatchObject({ codec: "aac", sample_rate: 48000 });
  expect(job.output_refs as MediaImportResult).toMatchObject({ cloned: true, timings_ms: expect.any(Object) });
}, T);

it("файл с пробелами и кириллицей в имени", async () => {
  const { job, asset } = await importFile("Мой ролик с пробелами.mp4");
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(asset!.original_name).toBe("Мой ролик с пробелами.mp4");
}, T);

it("VFR: исходник vfr, прокси CFR, длительность сохранена", async () => {
  const { job, asset: v } = await importFile("talk-ru-vfr.mov");
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(v!.probe.vfr).toBe(true);
  // ревью I2: таймлайн — стандартная частота (части 25 и 30 fps → 30/1), не 41250/1501
  expect(STANDARD_FPS).toContainEqual(v!.probe.timeline_fps);
  expect(v!.probe.timeline_fps).toEqual({ num: 30, den: 1 });
  const px = await probeMedia(derivative(v!, "proxy"));
  expect(px.vfr).toBe(false);
  const frame = (1e6 * v!.probe.timeline_fps.den) / v!.probe.timeline_fps.num;
  expect(Math.abs(px.duration_us - v!.probe.duration_us)).toBeLessThanOrEqual(2 * frame);
}, T);

it("поворот: прокси в отображаемой ориентации 720×1280", async () => {
  const { job, asset: r, projectId } = await importFile("rotated.mov");
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect((await probeMedia(derivative(r!, "proxy"))).video).toMatchObject({ width: 720, height: 1280, rotation: 0 });
  expect(projects.get(core.db, projectId)!.settings).toMatchObject({ aspect_ratio: "9:16" });
}, T);

it("без аудио — успех, has_audio 0; битый файл — media_invalid, source/ пуст", async () => {
  const { job, asset } = await importFile("no-audio.mp4");
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(core.db.prepare("SELECT has_audio FROM media_assets WHERE id = ?").pluck().get(asset!.id)).toBe(0);
  const bad = await importFile("broken.mp4");
  expect(bad.job).toMatchObject({ status: "failed", error: { code: "media_invalid" } });
  expect(ls(`workspace/projects/${bad.projectId}/source`)).toEqual([]);
}, T);

it("повторный импорт того же файла → тот же media id (deduplicated); другой файл в тот же проект → media_exists", async () => {
  const first = await importFile("no-audio.mp4");
  const again = await importFile("no-audio.mp4", first.projectId);
  expect(again.job).toMatchObject({ status: "completed", output_refs: { media_id: first.asset!.id, deduplicated: true } });
  const other = await importFile("talk-ru-cfr.mp4", first.projectId);
  expect(other.job).toMatchObject({ status: "failed", error: { code: "media_exists" } });
}, T);

it("отмена во время прокси → группа ffmpeg убита, реестр пуст, source/ пуст, draft убран", async () => {
  onStage = (st, jobId) => {
    if (st === "proxy") setTimeout(() => requestCancel(core.db, jobId), 400);
  };
  try {
    const { job, projectId } = await importFile("talk-ru-cfr.mp4");
    expect(job.status).toBe("cancelled");
    expect(await fileProcessRegistry(root).live()).toEqual([]);
    expect(await core.processes.live({ runId: job.id })).toEqual([]);
    expect(ls(`workspace/projects/${projectId}/source`)).toEqual([]);
    const drafts = ls("workspace/drafts").filter((d) => d.startsWith(job.id));
    for (const d of drafts) expect(existsSync(join(root, "workspace/drafts", d, ".quarantined")), d).toBe(true);
    const ps = execFileSync("/bin/ps", ["-axww", "-o", "command="]).toString();
    expect(ps.includes(join(root, "workspace/drafts"))).toBe(false);
  } finally {
    onStage = undefined;
  }
}, T);

/** pts_time первого кадра со средней яркостью > 128 (белая вспышка), µs. */
function flashUs(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "info", "-f", "mov", "-i", file, "-an", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { encoding: "utf8" });
  let t: number | undefined;
  for (const line of r.stderr.split("\n")) {
    const pts = /pts_time:([\d.]+)/.exec(line);
    if (pts) t = Number(pts[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && Number(y[1]) > 128 && t !== undefined) return Math.round(t * 1e6);
  }
  throw new Error(`вспышка не найдена в ${file}`);
}

/** Начало первого звука (конец начальной тишины по silencedetect), µs. */
function beepUs(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "info", "-i", file, "-vn", "-af", "silencedetect=n=-30dB:d=0.1", "-f", "null", "-"], { encoding: "utf8" });
  const m = /silence_end: ([\d.]+)/.exec(r.stderr);
  if (!m) throw new Error(`щелчок не найден в ${file}`);
  return Math.round(Number(m[1]) * 1e6);
}

for (const [name, what] of [["av-vlate.mp4", "видео начинается на 0,5 с позже звука"], ["av-alate.mp4", "звук начинается на 0,5 с позже видео"]] as const) {
  it(`I1 синхронность A/V: ${what} — прокси и audio16k на шкале от начала файла, расхождение ≤ 1 кадра`, async () => {
    const { job, asset: a } = await importFile(name);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const frame = 1e6 / 30;
    expect(Math.abs(a!.probe.duration_us - 6_000_000)).toBeLessThanOrEqual(frame);
    expect(a!.probe.vfr).toBe(false); // позднее начало видео — не VFR
    const px = derivative(a!, "proxy");
    const flash = flashUs(px);
    const beep = beepUs(px);
    const beep16k = beepUs(derivative(a!, "audio16k"));
    console.log(`${name}: вспышка ${flash} µs, щелчок прокси ${beep} µs, audio16k ${beep16k} µs`);
    // в исходнике оба события — на 3,0 с файла
    expect(Math.abs(flash - 3_000_000)).toBeLessThanOrEqual(frame);
    expect(Math.abs(beep - flash)).toBeLessThanOrEqual(frame);
    expect(Math.abs(beep16k - beep)).toBeLessThanOrEqual(frame);
    const p = await probeMedia(px);
    expect(Math.abs(p.duration_us - 6_000_000)).toBeLessThanOrEqual(frame);
  }, T);
}

it("kill -9 процесса ядра на этапе proxy → рестарт → completed, публикации без дублей, ffmpeg не остался", async () => {
  const work = await mkdtemp(join(REPO, "tmp", "ms-media-k9-"));
  const MS = join(REPO, "app/motion-studio");
  const child = join(MS, "server/test/media/kill9-child.mts");
  const node = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", child, ...args], { cwd: MS, encoding: "utf8", timeout: 180_000 });
  try {
    const start = node(["start", work, FIX, "talk-ru-cfr.mp4", "proxy", "300"]);
    expect(start.signal, start.stderr).toBe("SIGKILL");
    const resume = node(["resume", work]);
    expect(resume.status, resume.stderr).toBe(0);
    const out = JSON.parse(resume.stdout.trim().split("\n").at(-1)!) as {
      job: { status: string; attempt: number; output_refs: MediaImportResult }; asset: { id: string } | null;
      pubs: { dest_rel: string; job_id: string; attempt: number }[]; derivs: string[]; source: string[]; proxy: string[];
      draftsBefore: string[]; draftsAfter: string[]; ffmpegAlive: string[];
    };
    console.log(`kill -9: до рестарта drafts ${JSON.stringify(out.draftsBefore)}; итог ${out.job.status}, попытка ${out.job.attempt}`);
    expect(out.job.status).toBe("completed");
    expect(out.job.attempt).toBeGreaterThanOrEqual(2);
    expect(out.job.output_refs).toMatchObject({ media_id: out.asset!.id, deduplicated: false });
    // ровно две публикации (proxy/ и source/), обе от одной задачи, без дублей
    expect(out.pubs).toHaveLength(2);
    expect(new Set(out.pubs.map((p) => p.dest_rel)).size).toBe(2);
    expect(out.pubs.map((p) => p.dest_rel.split("/").at(-2)).sort()).toEqual(["proxy", "source"]);
    expect(out.derivs.sort()).toEqual(["audio16k", "proxy", "thumbs", "waveform"]);
    expect(out.source).toEqual([out.asset!.id]);
    expect(out.proxy).toEqual([out.asset!.id]);
    expect(out.draftsAfter).toEqual([]);
    expect(out.ffmpegAlive).toEqual([]);
  } finally {
    await removeStore({ tmp: work, root: join(work, "store"), marker: undefined as never, guard: undefined as never });
  }
}, T);
