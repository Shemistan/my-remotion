// Приёмка экспорта (Task 19, P1-14) по-настоящему: bootCore на реальном хранилище (внешний
// SSD), задача `scene.export` через очередь и раннер, реальный рендер, ffprobe и ffmpeg.
// Версия — MS_E2E_T19_VERSION=<ver_…> или последняя ready в studio.db. Экспорты остаются в
// `workspace/projects/<p>/exports/` (read-only, как у сервера).
// Запуск: `MS_E2E=1 vitest run server/test/pipeline/scene-export.e2e.test.ts` (или `make e2e`).
// Evidence — tmp/export-evidence/server/; в docs/evidence/phase-1/export/server/ — с
// MS_WRITE_EVIDENCE=1 (README с временем экспорта, export-manifest.json).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type ExportManifest, ExportManifestSchema, type ExportRequest, type Job } from "@ms/contracts";
import { ensureRenderBrowser, exportGate, ffprobe } from "@ms/render";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import { newId } from "../../src/scenes/ids.js";
import { readVersion } from "../../src/scenes/store.js";

const T = 60 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-1/export/server" : "tmp/export-evidence/server");
const FILES = join(REPO, "tmp/export-evidence/files");

let core: Core;
const mine = new Set<string>();
let version: versions.VersionRow;
const rows: { name: string; request: ExportRequest; ms: number; job: Job; manifest?: ExportManifest }[] = [];

beforeAll(async () => {
  expect(existsSync("/Volumes/External SSD"), "внешний SSD не подключён").toBe(true);
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: DATA_DIR },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  const id = process.env.MS_E2E_T19_VERSION
    ?? (core.db.prepare("SELECT id FROM scene_versions WHERE status = 'ready' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as { id: string } | undefined)?.id;
  expect(id, "в studio.db нет ready-версии").toBeTruthy();
  version = versions.get(core.db, id!)!;
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(FILES, { recursive: true });
}, T);

afterAll(async () => {
  if (rows.length > 0) {
    const lines = [
      "# Экспорт сцены через задачу scene.export (Task 19) — реальное хранилище",
      "",
      `Прогон ${new Date().toISOString()}, версия ${version?.id} (v${version?.number}), ${version?.prompt?.slice(0, 120) ?? ""}`,
      "Время — стена задачи от постановки в очередь до итога (рендер под семафором, gate, публикация).",
      "",
      "| Экспорт | Запрос | Итог | Время, с | ffprobe | export_id |",
      "|---|---|---|---|---|---|",
      ...rows.map((r) => {
        const p = r.manifest?.ffprobe;
        const probe = p ? `${p.codec}${p.audioCodec ? `+${p.audioCodec}` : ""} ${p.width}×${p.height} ${p.fps.num}/${p.fps.den} ${p.durationMs} мс` : (r.job.error?.message ?? "—");
        return `| ${r.name} | ${JSON.stringify(r.request)} | ${r.job.status} | ${(r.ms / 1000).toFixed(1)} | ${probe} | ${r.manifest?.export_id ?? "—"} |`;
      }),
      "",
    ];
    writeFileSync(join(EVIDENCE, "README.md"), lines.join("\n"));
    console.log(lines.join("\n"));
  }
  await core?.close();
});

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function exportJob(name: string, request: ExportRequest) {
  const projectId = scenes.get(core.db, version.scene_id)!.project_id;
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "scene.export", projectId, versionId: version.id, input: { versionId: version.id, request }, idempotencyKey: `e2e-t19-${newId("run")}` }).job.id;
  const job = await wait(id);
  const ms = Date.now() - t0;
  console.log(`${name}: ${job.status} за ${(ms / 1000).toFixed(1)} с; ${JSON.stringify(job.error ?? job.output_refs)}`);
  const row = { name, request, ms, job } as (typeof rows)[number];
  rows.push(row);
  if (job.status !== "completed") return { job };
  const ex = exportsRepo.get(core.db, (job.output_refs as { export_id: string }).export_id)!;
  const file = join(DATA_DIR, ex.path);
  const manifest = ExportManifestSchema.parse(JSON.parse(readFileSync(join(dirname(file), "export-manifest.json"), "utf8")));
  row.manifest = manifest;
  writeFileSync(join(EVIDENCE, `${name}.export-manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
  copyFileSync(file, join(FILES, `server-${name}.${ex.path.endsWith(".mov") ? "mov" : "mp4"}`));
  return { job, ex, file, manifest };
}

let first: ExportManifest;

it("mp4 версии: каталог exports/<id>/ read-only, export-manifest, ffprobe файла = манифест, gate пуст", async () => {
  const { job, ex, file, manifest } = await exportJob("mp4-30", { format: "mp4", crf: 18, scale: 1 });
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(readdirSync(dirname(file!)).sort()).toEqual(["export-manifest.json", "scene.mp4"]);
  for (const p of [dirname(file!), file!]) expect(statSync(p).mode & 0o222).toBe(0);
  const probe = await ffprobe(file!);
  expect(probe).toEqual(manifest!.ffprobe);
  const settings = (await readVersion(join(DATA_DIR, version.path))).settings;
  expect(exportGate(probe, manifest!.request, settings)).toEqual([]);
  expect(probe).toMatchObject({ codec: "h264", audioCodec: "aac", width: settings.width, height: settings.height });
  expect(ex!.job_id).toBe(job.id);
  expect(manifest!.version_manifest_sha256).toBe(version.manifest_sha256);
  // draft попытки убран переносом
  expect(existsSync(join(DATA_DIR, "workspace/drafts", `${job.id}-a${job.attempt}`))).toBe(false);
  first = manifest!;
}, T);

it("09 §1 п.5: повторный экспорт той же версии → та же длительность и размеры", async () => {
  const { job, manifest } = await exportJob("mp4-30-repeat", { format: "mp4", crf: 18, scale: 1 });
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect({ d: manifest!.ffprobe.durationMs, w: manifest!.ffprobe.width, h: manifest!.ffprobe.height })
    .toEqual({ d: first.ffprobe.durationMs, w: first.ffprobe.width, h: first.ffprobe.height });
}, T);

it("mp4 60 fps: fps 60/1, длительность прежняя ± 1 кадр, settings манифеста — 60 fps", async () => {
  const { job, manifest } = await exportJob("mp4-60", { format: "mp4", crf: 18, scale: 1, fps: 60 });
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  expect(manifest!.ffprobe.fps).toEqual({ num: 60, den: 1 });
  expect(manifest!.settings.fps).toEqual({ num: 60, den: 1 });
  expect(Math.abs(manifest!.ffprobe.durationMs - first.ffprobe.durationMs)).toBeLessThanOrEqual(1000 / 60 + 0.001);
}, T);

it("prores4444 у версии с непрозрачным фоном → failed transparent_unsupported, файла нет", async () => {
  const settings = (await readVersion(join(DATA_DIR, version.path))).settings;
  if (settings.transparent_export) return; // прозрачная версия — проверка неприменима
  const before = exportsRepo.listByVersion(core.db, version.id).length;
  const { job } = await exportJob("prores-opaque", { format: "prores4444", crf: 18, scale: 1 });
  expect(job.status).toBe("failed");
  expect(job.error).toMatchObject({ code: "pipeline", stage: "export", message: expect.stringMatching(/^transparent_unsupported/) });
  expect(exportsRepo.listByVersion(core.db, version.id)).toHaveLength(before);
}, T);
