// Task 25 e2e: `media.import` через настоящий bootCore, очередь и раннер; реальные ffmpeg/ffprobe
// на фикстурах `scripts/make-media-fixtures.mjs` (tmp/media-fixtures/). Хранилище — во временном
// каталоге tmp/ репозитория (MS_ALLOW_SYSTEM_DISK=1), реальный SSD не трогается.
// Запуск: `MS_E2E=1 npx vitest run server/test/media/import.e2e.test.ts`.
// Время импорта и размер прокси — в консоль и tmp/media-import-evidence/README.md.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Job, MediaAsset } from "@ms/contracts";
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

async function importFile(name: string, projectId = projects.create(core.db, { title: name }).id) {
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
