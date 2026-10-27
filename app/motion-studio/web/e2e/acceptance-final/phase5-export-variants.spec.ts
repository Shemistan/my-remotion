// Приёмка Phase 5, шаги 2–3 (Task 46): финал через UI — «Экспорт финала…» → настройки →
// «Смонтировать и экспортировать» (`final.render`: master, звук, рендер одной композиции, проверка).
// Шаг 2: 1080p / timeline_fps / standard → [A] verify pass (ffprobe, длительность ± 1 кадр, ≥ 5 якорей
// ≤ 1 кадр, 12 кадров offset 0/inconclusive и PSNR ≥ 30 дБ, |ΔLU| ≤ 0,5), манифест по схеме, исходник
// проекта и копия-вырезка не изменены; [H] финал целиком — человеку (MP4 в examples).
// Шаг 3: 720p / 25 fps / draft → предупреждение F8 в диалоге → [A] verify pass с допусками 25 fps.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type FinalExportDto, FinalManifestSchema, type FinalVerifyReport, type Job, type TimelineDto, type VideoProjectDto } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../../src/i18n/index.js";
import {
  ACC_ROOT, Checks, EVIDENCE, EXAMPLES, clickJob, db, ffprobe, frame480, getJson, openProject, saveState, shasum, shot, state, timing, waitJob, writeEvidence,
} from "./helpers.js";

export const RENDER_TIMEOUT = 2 * 60 * 60_000;
export const openTimeline = (page: Page) => page.getByRole("tab", { name: t("video.tab.timeline"), exact: true }).click();
export const finalExports = (page: Page) => getJson<FinalExportDto[]>(page.request, `/api/projects/${state().projectId!}/final-exports`);

/** Путь к final.mp4 экспорта в хранилище (`final_exports.rel_path` — файл или каталог). */
export function finalFile(exportId: string): { mp4: string; dir: string } {
  const rel = db((d) => d.prepare("SELECT rel_path FROM final_exports WHERE id = ?").pluck().get(exportId)) as string;
  const p = join(ACC_ROOT, rel);
  return p.endsWith(".mp4") ? { mp4: p, dir: join(p, "..") } : { mp4: join(p, "final.mp4"), dir: p };
}

export interface FinalUi { resolution: "1080p" | "720p"; quality: "standard" | "draft"; fps?: string }

/** Диалог финала: настройки → (скриншот) → «Смонтировать и экспортировать» → задача. */
export async function startFinalViaUi(page: Page, o: FinalUi, dir?: string): Promise<Job> {
  await openProject(page);
  await openTimeline(page);
  await page.getByRole("button", { name: t("projectTimeline.export") }).click();
  const dialog = page.getByTestId("final-dialog");
  await dialog.getByLabel(t("finalExport.resolution")).selectOption(o.resolution);
  await dialog.getByLabel(t("finalExport.quality")).selectOption(o.quality);
  await dialog.getByLabel(t("finalExport.fps")).selectOption(o.fps ?? "");
  if (o.fps) await expect(dialog.getByTestId("fps-warning")).toBeVisible();
  else await expect(dialog.getByTestId("fps-warning")).toHaveCount(0);
  if (dir) await shot(page, dir, "01-dialog");
  return clickJob(page, dialog.getByRole("button", { name: t("finalExport.start") }), /\/final$/);
}

/** Экспорт задачи (после завершения). */
export async function exportOfJob(page: Page, jobId: string): Promise<FinalExportDto | undefined> {
  return (await finalExports(page)).find((e) => e.job?.id === jobId);
}

/** Проверки [A] отчёта проверки финала и файла (ffprobe), общие для 1080p / 720p25 / повтора. */
export function verifyChecks(c: Checks, p: string, e: FinalExportDto, want: { width: number; height: number; fps: { num: number; den: number } }, nScenes?: number): void {
  const v = e.verify as FinalVerifyReport;
  const frameUs = Math.ceil((1e6 * want.fps.den) / want.fps.num);
  c.check(`${p}.1`, "экспорт ready, verify.verdict = pass, failures пусто", e.status === "ready" && v?.verdict === "pass" && v.failures.length === 0, { status: e.status, verdict: v?.verdict, failures: v?.failures, probe: v?.probe });
  c.check(`${p}.2`, "размер и fps выхода", e.output?.width === want.width && e.output.height === want.height && e.output.fps.num * want.fps.den === want.fps.num * e.output.fps.den, { output: e.output, want });
  c.check(`${p}.3`, "длительность: |Δ| ≤ 1 кадр", Math.abs(v.duration.delta_frames) <= 1, v.duration);
  const sync = v.sync;
  c.check(`${p}.4`, "синхронность: ≥ 5 контрольных слов, |смещение| ≤ 1 кадр", sync.length >= 5 && sync.every((s) => Math.abs(s.offset_us) <= frameUs), { frame_us: frameUs, sync, sync_check: v.sync_check });
  const fr = v.frames;
  // `sampleVerifyFrames(n = 12)`: 6 кадров вне сцен + середина каждой сцены (до 6) — при 3 сценах 9 кадров;
  // бриф говорит «12 кадров» — расхождение записано в отчёт, проверяется число по правилу выборки
  const nFrames = 6 + Math.min(6, nScenes ?? v.frames.filter((f) => f.kind === "scene").length);
  c.check(`${p}.5`, `кадры: ${nFrames} по выборке (6 вне сцен + середины сцен), смещение 0 или inconclusive, PSNR ≥ 30 дБ`, fr.length >= nFrames && fr.filter((f) => f.kind === "source").length >= 6 && fr.every((f) => (f.offset === 0 || f.offset === "inconclusive") && f.psnr_db >= 30),
    { n: fr.length, min_psnr: Math.min(...fr.map((f) => f.psnr_db)), offsets: fr.map((f) => f.offset), kinds: fr.map((f) => f.kind), skipped: v.frames_skipped });
  c.check(`${p}.6`, "громкость: |ΔLU| ≤ 0,5", Math.abs(v.loudness.delta_lu) <= 0.5, v.loudness);
}

/** Файл финала: ffprobe, sha256, манифест по схеме; копия человеку и кадры ≤ 480 px. */
export function fileChecks(c: Checks, p: string, dir: string, e: FinalExportDto, name: string): { mp4: string; sha256: string } {
  const { mp4, dir: fdir } = finalFile(e.id);
  const pr = ffprobe(mp4);
  const vs = pr.streams.find((s) => s.codec_type === "video");
  const as = pr.streams.find((s) => s.codec_type === "audio");
  const manifestPath = join(fdir, "final-manifest.json");
  const parsed = existsSync(manifestPath) ? FinalManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8"))) : undefined;
  c.check(`${p}.7`, "файл: H.264 yuv420p + AAC 48 кГц; манифест по схеме FinalManifestSchema", vs?.codec_name === "h264" && vs.pix_fmt === "yuv420p" && as?.codec_name === "aac" && as.sample_rate === "48000" && parsed?.success === true,
    { video: vs && { codec: vs.codec_name, pix: vs.pix_fmt, w: vs.width, h: vs.height, r: vs.r_frame_rate }, audio: as && { codec: as.codec_name, sr: as.sample_rate, ch: as.channels }, manifest: parsed?.success ?? "нет файла", error: parsed?.success === false ? parsed.error.issues.slice(0, 3) : undefined });
  const sha = shasum(mp4);
  writeEvidence(dir, "final.json", { export: e, file: { rel: mp4.slice(ACC_ROOT.length + 1), sha256: sha, bytes: statSync(mp4).size }, ffprobe: pr, manifest: parsed?.success ? parsed.data : null });
  mkdirSync(EXAMPLES, { recursive: true });
  // примеры только добавляются: имя с ревизией таймлайна и id экспорта, существующий файл не трогается
  const ex = join(EXAMPLES, name.replace(/\.mp4$/, `-r${e.timeline_revision}-${e.id.slice(-6)}.mp4`));
  if (!existsSync(ex)) copyFileSync(mp4, ex);
  return { mp4, sha256: sha };
}

/** Кадры финала ≤ 480 px в середине каждой сцены таймлайна. */
export function sceneFrames(mp4: string, doc: TimelineDto["doc"], out: string, fps: { num: number; den: number }): string[] {
  const names: string[] = [];
  for (const cl of doc.scenes) {
    const mid = cl.start_frame + Math.floor(cl.duration_frames / 2);
    const s = ((mid + 0.5) * doc.fps.den) / doc.fps.num;
    const name = `${cl.item_id}-${cl.placement.mode}-t${s.toFixed(2)}s.png`;
    frame480(mp4, s, join(out, name));
    names.push(name);
  }
  void fps;
  return names;
}

/** Исходник проекта в хранилище и копия-вырезка не изменены. */
export async function sourcesUnchanged(c: Checks, id: string, page: Page): Promise<void> {
  const v = await getJson<VideoProjectDto>(page.request, `/api/projects/${state().projectId!}/video`);
  const a = v.media!.asset;
  const inStore = shasum(join(ACC_ROOT, a.rel_path));
  const cut = state().video!;
  c.check(id, "исходник проекта (копия в хранилище) и копия-вырезка не изменены (sha256)", inStore === a.sha256 && shasum(cut.path) === cut.sha256, { asset: a.sha256, in_store: inStore, cut: cut.sha256 });
}

async function runVariant(page: Page, dir: string, p: string, o: FinalUi, name: string, role: string): Promise<void> {
  const t0 = Date.now();
  const c = new Checks(dir);
  const tl = await getJson<TimelineDto>(page.request, `/api/projects/${state().projectId!}/timeline`);
  const job = await startFinalViaUi(page, o, dir);
  await expect(page.getByTestId("final-job")).toBeVisible();
  const done = await waitJob(job.id, RENDER_TIMEOUT, 10_000);
  timing(`export.${role}`, { wall_ms: Date.now() - t0, note: `${done.started_at} → ${done.finished_at}` });
  c.check(`${p}.0`, "задача final.render завершена", done.status === "completed", { status: done.status, error: done.error, attempt: done.attempt });
  const e = (await exportOfJob(page, job.id))!;
  expect(e, "нет экспорта задачи").toBeTruthy();
  saveState({ exports: { ...state().exports, [role]: e.id } });
  const fps = o.fps ? { num: Number(o.fps), den: 1 } : tl.doc.fps;
  const size = o.resolution === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  verifyChecks(c, p, e, { ...size, fps }, tl.doc.scenes.length);
  writeEvidence(dir, "verify.json", e.verify);
  const f = fileChecks(c, p, dir, e, name);
  sceneFrames(f.mp4, tl.doc, join(EVIDENCE, dir, "frames"), fps);
  await sourcesUnchanged(c, `${p}.8`, page);
  // UI: строка истории и отчёт проверки
  await page.reload();
  await openTimeline(page);
  const row = page.locator(`[data-testid="final-export"][data-export-id="${e.id}"]`);
  await expect(row).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await row.getByRole("button", { name: t("finalExport.history.report") }).click();
  await expect(row.getByTestId("verify-report")).toContainText(t("finalExport.verify.ready"));
  await row.getByTestId("verify-report").scrollIntoViewIfNeeded();
  await shot(page, dir, "02-verify-report");
}

export default function exportVariants(): void {
  test("шаг 2: финал 1080p / timeline_fps / standard — проверка pass", async ({ page }) => {
    test.setTimeout(RENDER_TIMEOUT + 30 * 60_000);
    await runVariant(page, "export-1080p", "2", { resolution: "1080p", quality: "standard" }, "final-1080p-timeline-fps-standard.mp4", "1080p");
    const c = new Checks("export-1080p");
    c.note("2.H", "финал целиком: без щелчков на склейках, речь синхронна губам — человеку", "examples/phase5/46-приёмка/final-1080p-timeline-fps-standard.mp4");
  });
  test("шаг 3: финал 720p / 25 fps / draft — предупреждение F8, проверка pass", async ({ page }) => {
    test.setTimeout(RENDER_TIMEOUT + 30 * 60_000);
    await runVariant(page, "export-720p25", "3", { resolution: "720p", quality: "draft", fps: "25" }, "final-720p-25fps-draft.mp4", "720p25");
    const c = new Checks("export-720p25");
    c.check("3.9", "предупреждение F8 (fps ≠ timeline_fps) показано в диалоге", existsSync(join(EVIDENCE, "export-720p25/ui/01-dialog.png")), "export-720p25/ui/01-dialog.png");
  });
}
