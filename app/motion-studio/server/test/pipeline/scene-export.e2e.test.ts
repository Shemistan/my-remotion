// Приёмка экспорта (Task 19, P1-14) по-настоящему: bootCore на реальном хранилище (внешний
// SSD), задача `scene.export` через очередь и раннер, реальный рендер, ffprobe и ffmpeg.
// Версия — MS_E2E_T19_VERSION=<ver_…> или последняя ready в studio.db. Экспорты остаются в
// `workspace/projects/<p>/exports/` (read-only, как у сервера).
// Запуск: `MS_E2E=1 vitest run server/test/pipeline/scene-export.e2e.test.ts` (или `make e2e`).
// Evidence — tmp/export-evidence/server/; в docs/evidence/phase-1/export/server/ — с
// MS_WRITE_EVIDENCE=1 (README с временем экспорта, export-manifest.json).
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
import { materialsPath, materialsRoot, assertSsdWriteAllowed } from "@ms/core";

const T = 60 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? materialsPath("store");
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-1/export/server" : "tmp/export-evidence/server");
const FILES = join(REPO, "tmp/export-evidence/files");

let core: Core;
const mine = new Set<string>();
let version: versions.VersionRow;
const rows: { name: string; versionId: string; request: ExportRequest; ms: number; job: Job; manifest?: ExportManifest }[] = [];

beforeAll(async () => {
  expect(existsSync(materialsRoot()), "внешний SSD не подключён").toBe(true);
  assertSsdWriteAllowed(DATA_DIR); // S18: на SSD — только в папке материалов
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
      "Сверка темпа: кадр версии → кадр экспорта в тот же момент: худшая клетка / клеток > 0,03 (* — стоп-кадр дорендерен). Расходится: худшая > 0,06 или ≥ 3 клеток > 0,03.",
      "",
      "| Экспорт | Версия | Запрос | Итог | Время, с | ffprobe / ошибка | Сверка темпа | export_id |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map((r) => {
        const p = r.manifest?.ffprobe;
        const probe = p ? `${p.codec}${p.audioCodec ? `+${p.audioCodec}` : ""} ${p.width}×${p.height} ${p.fps.num}/${p.fps.den} ${p.durationMs} мс` : (r.job.error?.message ?? "—");
        const tc = r.manifest?.tempo_check;
        const tempo = tc ? tempoText(tc) : (r.job.error?.message.match(/Расхождение.*$/)?.[0] ?? "—");
        return `| ${r.name} | ${r.versionId} | ${JSON.stringify(r.request)} | ${r.job.status} | ${(r.ms / 1000).toFixed(1)} | ${probe.replaceAll("|", "/")} | ${tempo} | ${r.manifest?.export_id ?? "—"} |`;
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

async function exportJob(name: string, request: ExportRequest, v: versions.VersionRow = version) {
  const projectId = scenes.get(core.db, v.scene_id)!.project_id;
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "scene.export", projectId, versionId: v.id, input: { versionId: v.id, request }, idempotencyKey: `e2e-t19-${newId("run")}` }).job.id;
  const job = await wait(id);
  const ms = Date.now() - t0;
  console.log(`${name}: ${job.status} за ${(ms / 1000).toFixed(1)} с; ${JSON.stringify(job.error ?? job.output_refs)}`);
  const row = { name, versionId: v.id, request, ms, job } as (typeof rows)[number];
  rows.push(row);
  if (job.status !== "completed") return { job };
  const ex = exportsRepo.get(core.db, (job.output_refs as { export_id: string }).export_id)!;
  const file = join(DATA_DIR, ex.path);
  const manifest = ExportManifestSchema.parse(JSON.parse(readFileSync(join(dirname(file), "export-manifest.json"), "utf8")));
  row.manifest = manifest;
  writeFileSync(join(EVIDENCE, `${name}.export-manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
  // копия экспорта read-only (chmod a-w переносится): прежнюю копию прогона убрать, новую открыть
  const keep = join(FILES, `server-${name}.${ex.path.endsWith(".mov") ? "mov" : "mp4"}`);
  rmSync(keep, { force: true });
  copyFileSync(file, keep);
  chmodSync(keep, 0o644);
  return { job, ex, file, manifest };
}

/** Сэмплы сверки: «кадр→кадр экспорта: худшая/клеток», * — стоп-кадр дорендерен. */
const tempoText = (t: NonNullable<ExportManifest["tempo_check"]>) =>
  t.samples.map((s) => `${s.frame}${s.rendered ? "*" : ""}→${s.exportFrame}: ${s.maxTile}/${s.hotTiles ?? "?"}`).join(", ");

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
  // F2: сверка темпа со стоп-кадрами версии прошла — кадры сцены идут через props и kit
  expect(manifest!.tempo_check?.mismatched).toEqual([]);
  console.log(`сверка темпа v${version.number}: ${tempoText(manifest!.tempo_check!)}`);
}, T);

// R1: дробный k — сверка только в точно совпадающие моменты, недостающие стоп-кадры дорендерены
for (const fps of [50, 25, 24] as const) {
  it(`R1: mp4 ${fps} fps правильной сцены → completed, сверка по кратным моментам без расхождений`, async () => {
    const { job, manifest } = await exportJob(`mp4-${fps}`, { format: "mp4", crf: 18, scale: 1, fps }, version);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(manifest!.ffprobe.fps).toEqual({ num: fps, den: 1 });
    const step = { 50: 3, 25: 6, 24: 5 }[fps];
    for (const s of manifest!.tempo_check!.samples) {
      expect(s.frame % step).toBe(0);
      expect(s.exportFrame).toBe((s.frame * fps) / 30);
    }
    expect(manifest!.tempo_check!.mismatched).toEqual([]);
    expect(readdirSync(dirname(join(DATA_DIR, exportsRepo.get(core.db, manifest!.export_id)!.path))).sort()).toEqual(["export-manifest.json", "scene.mp4"]);
  }, T);
}

it("R3: mp4 60 fps со scale 0.5 → сверка в размере экспорта, без расхождений", async () => {
  const { job, manifest } = await exportJob("mp4-60-half", { format: "mp4", crf: 18, scale: 0.5, fps: 60 }, version);
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  const settings = (await readVersion(join(DATA_DIR, version.path))).settings;
  expect(manifest!.ffprobe.width).toBe(settings.width / 2);
  expect(manifest!.tempo_check!.compare!.width).toBe(Math.min(480, settings.width / 2));
  expect(manifest!.tempo_check!.mismatched).toEqual([]);
}, T);

it("F6: шаг загрузки reconcile_exports на реальном хранилище — без ошибок", () => {
  console.log(`reconcile_exports: ${JSON.stringify(core.boot.exports)}`);
  expect(core.boot.exports.errors).toEqual([]);
}, T);

/** Версия по id, если она есть и ready (иначе проверка пропускается). */
function readyById(id: string): versions.VersionRow | undefined {
  const v = versions.get(core.db, id);
  return v?.status === "ready" ? v : undefined;
}

/** Ранняя сцена: кадры в коде, props вне ScenePropsBase. */
const LEGACY_LITERAL = "ver_01M5DMCGPHDYW1PHKNF5MDW7M2";
/** Сцена по договору, но с литералами в interpolate (10 и 6 кадров). */
const BASE_LITERAL = "ver_01M5HCCPW99S3B0B3H1KC8TR4H";

it("F2: ранняя сцена с кадрами в коде и props вне ScenePropsBase → 60 fps: failed fps_change_unsupported", async () => {
  const v = readyById(LEGACY_LITERAL);
  if (!v) return;
  const { job } = await exportJob("legacy-literal-60", { format: "mp4", crf: 18, scale: 1, fps: 60 }, v);
  expect(job.status).toBe("failed");
  expect(job.error).toMatchObject({ code: "pipeline", stage: "export", message: expect.stringMatching(/^fps_change_unsupported: props версии вне договора ScenePropsBase/) });
}, T);

it("R2: сцена по договору с кадрами в коде (каскад частиц сжат в 60 fps) → failed fps_tempo_mismatch, экспорта нет", async () => {
  const v = readyById(BASE_LITERAL);
  expect(v, `версия ${BASE_LITERAL} не ready на SSD`).toBeDefined();
  if (!v) return;
  const before = exportsRepo.listByVersion(core.db, v.id).length;
  const { job } = await exportJob("base-literal-60", { format: "mp4", crf: 18, scale: 1, fps: 60 }, v);
  console.log(`base-literal-60: ${job.status} ${job.error?.message}`);
  expect(job.status).toBe("failed");
  expect(job.error).toMatchObject({ code: "pipeline", stage: "export", message: expect.stringMatching(/^fps_tempo_mismatch: сцена зашила кадры в код/) });
  expect(exportsRepo.listByVersion(core.db, v.id)).toHaveLength(before);
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
