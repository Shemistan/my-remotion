// Задача `script.package` (спека §9, контракт S7 C1–C12): готовые версии принятых сцен плана →
// два экспорта на сцену по одному (MP4 со своим фоном и ProRes 4444 с альфой `overlay`, готовые
// экспорты тех же запросов переиспользуются) → папка `packages/<id>/` в draft попытки: жёсткие
// ссылки на файлы экспортов `NN_<slug>.mp4` / `NN_<slug>_alpha.mov`, шпаргалка md/csv/txt,
// `package-manifest.json` → публикация переносом в транзакции с fencing (ADR 0007) + строка
// `script_packages` → корень a-w. Сбой экспорта одной сцены — запись в `missing`, остальные идут.
//
// Файлы пакета делят inode с файлами экспортов: откат и карантин переносят каталог, но права
// файлов не трогают (`setWritable` к ним не применяется) — иначе стал бы записываемым и экспорт;
// перед карантином медиафайлы из draft удаляются, уборка draft снимает запрет только с каталогов.
import { copyFileSync, chmodSync, existsSync, linkSync, lstatSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  type Aspect, AspectSchema, type ExportRequest, ExportRequestSchema, type ProbeResult, ProbeResultSchema, type ScriptPackageDto, type ScriptPackageFile,
  type SceneFrames, type ScriptPackageManifest, ScriptPackageManifestSchema, type ScriptSceneItem, compareWordIds, failureToJobErrorCode, wordsBetween,
} from "@ms/contracts";
import { type StorageStatus, safeMkdir, safeMkdirSync } from "@ms/core";
import { z } from "zod";
import { currentProjectStyle } from "../analysis/project-style.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ORPHANS_REL } from "../artifacts/store.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import type { Db } from "../db/open.js";
import * as exportsRepo from "../db/repos/exports.js";
import * as jobs from "../db/repos/jobs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { type ScriptPackageRow, scriptPackages, scriptScenes } from "../db/repos/script.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { canonicalJson, fenceOk } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { sha256, sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import { QUARANTINE, attachCause, fsyncDirSync, fsyncWrite, fsyncWriteSync, quarantineDir } from "../scenes/store.js";
import { type CheatRow, CHEAT_FILES, cheatNotes, cheatsheet } from "../script/cheatsheet.js";
import { twinOutdated } from "../script/batch.js";
import { itemFingerprint } from "../script/fingerprint.js";
import { OVERLAY_BLOCKERS, OVERLAY_IMPOSSIBLE, overlayProblem } from "../script/overlay-check.js";
import { displayName, fileNames, fileSlug, packageIdFor, sceneNumber } from "../script/package-names.js";
import { currentScript, currentScriptPlan } from "../script/read.js";
import { versionQaWarnings } from "../script/state.js";
import { type ExportOneInput, type SceneExportDeps, exportOne as realExportOne } from "./scene-export.js";
import { errText, isStorageError } from "./steps.js";

/** Зависимости обработчика `script.package`. */
export interface ScriptPackageDeps {
  root: string;
  storage: () => Promise<StorageStatus>;
  /** Зависимости экспорта сцены (те же, что у `scene.export`). */
  exporter: SceneExportDeps;
  /** Экспорт одной версии в попытке задачи (тесты подменяют); по умолчанию `exportOne` S6. */
  exportOne?: (ctx: JobContext, d: SceneExportDeps, input: ExportOneInput) => Promise<HandlerResult>;
  /** Перед транзакцией публикации (тесты: устаревшая попытка). */
  beforePublish?: (ctx: JobContext) => void | Promise<void>;
  log?: (line: string) => void;
}

export const ScriptPackageInputSchema = z.object({ projectId: z.string().min(1), aspect: AspectSchema }).passthrough();

/** Запросы экспорта сцены пакета (§9 п.2): MP4 crf 18 в fps версии и ProRes 4444 с альфой. */
export const PACKAGE_MP4: ExportRequest = { format: "mp4", crf: 18, scale: 1 };
export const PACKAGE_ALPHA: ExportRequest = { format: "prores4444", crf: 18, scale: 1, overlay: true };

export const MANIFEST_FILE = "package-manifest.json";
export const NO_VERSION = "нет готовой версии";
export const STALE = "сцена устарела";
const EXPORT_FAILED = "экспорт не удался";
/** F8: короткие причины для шпаргалки (полный текст — в манифесте, `missing[]`). */
const ALPHA_FAILED_NOTE = "альфа-версия не экспортирована";
const shortMissing = (reason: string): string => (reason.startsWith(EXPORT_FAILED) ? EXPORT_FAILED : reason);

type Stage = "prepare" | "storage" | "publish" | "fenced_out" | "cancelled";

const fail = (stage: Stage, message: string): HandlerResult => {
  const error = { code: failureToJobErrorCode(stage), stage, message };
  return stage === "cancelled" ? { status: "cancelled", error } : { status: "failed", error };
};

/** Отказ публикации пакета: fencing или отмена. */
class Refused extends Error {
  constructor(readonly stage: "fenced_out" | "cancelled", message: string) {
    super(message);
  }
}

/** Итог экспорта задачи `script.package` в `output_refs` (C2). */
export interface PackageRefs {
  package_id: string;
  rel_path: string;
  files: number;
  missing: { item_id: string; reason: string }[];
}

interface Exported {
  exportId: string;
  abs: string;
  sha256: string;
  ffprobe: ProbeResult;
  warnings: string[];
}

/**
 * Итог экспорта сцены: файл, причина для `missing` (`detail` — исходный текст сбоя для манифеста
 * и журнала) или итог всей задачи (отмена, хранилище…).
 */
type ExportOutcome = { ok: Exported } | { reason: string; detail?: string } | { abort: HandlerResult };

const ExportManifestLite = z.object({ request: ExportRequestSchema, ffprobe: ProbeResultSchema, warnings: z.array(z.string()).optional() }).passthrough();

/** Причина сбоя, которую нельзя показать по-русски (сторонняя ошибка рендера): подробности — в журнале. */
export const EXPORT_FAILED_GENERIC = `${EXPORT_FAILED}: ошибка рендера (подробности в журнале задачи)`;

/**
 * Сообщение сбоя экспорта → причина для человека (C3): «экспорт не удался: <причина по-русски>»
 * без английских кодов этапов (`media: `, `overlay_empty: `), id (`ver_…`), путей и имён draft
 * (`…-a1--1-mp4`). Остаток не по-русски (латиницы больше, чем кириллицы: текст Remotion,
 * Chrome, ffmpeg) — общий русский текст; исходное сообщение вызывающий пишет в журнал и манифест.
 */
export function exportFailedReason(message: string): string {
  let m = message;
  for (let prev = ""; prev !== m;) {
    prev = m;
    m = m.replace(/(^|: |\(|; )[a-z][a-z0-9_]*: /g, "$1");
  }
  m = m
    .replace(/(?:^|\s)\/\S+/g, " ") // абсолютные пути
    .replace(/\S*-a\d+--[A-Za-z0-9_-]+\S*/g, "") // имена draft попыток экспорта
    // id хранилища: `ss_001`, `<префикс>_<ULID>` (Crockford, верхний регистр)
    .replace(/\b(?:ss_\d{3,}|[a-z]{2,4}_[0-9A-HJKMNP-TV-Z]{10,})\b/g, "")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  m = m.replace(/^экспорт не удался:\s*/, "");
  const cyr = (m.match(/[а-яё]/gi) ?? []).length;
  const lat = (m.match(/[a-z]/gi) ?? []).length;
  if (cyr === 0 || lat > cyr) return EXPORT_FAILED_GENERIC;
  if (m.length > 300) m = `${m.slice(0, 299)}…`;
  return `${EXPORT_FAILED}: ${m}`;
}

/** Код предупреждения экспорта (`overlay_haze: …` → `overlay_haze`); без кода — пусто. */
const warningCode = (w: string): string => /^([a-z][a-z0-9_]*): /.exec(w)?.[1] ?? "";

/**
 * F7: кадры сцены в пакете — по файлу версии (`settings.duration_frames`), запас в начале и речь —
 * по плану, разница — в хвосте; версия короче речи — хвост 0, речь — остаток.
 */
export function versionFrames(plan: SceneFrames, total: number): SceneFrames {
  if (total === plan.total) return plan;
  const tail = Math.max(0, total - plan.lead - plan.speech);
  const speech = Math.max(1, total - plan.lead - tail);
  const lead = total - speech - tail;
  return { lead, speech, tail, total };
}

/** F7: замечание о длительности версии не по плану (`null` — по плану). */
export function durationNote(plan: SceneFrames, total: number, fps: { num: number; den: number }): string | null {
  if (total === plan.total) return null;
  const s = (f: number) => ((f * fps.den) / fps.num).toFixed(1).replace(".", ",");
  return `длительность не по плану: ${s(total)} с вместо ${s(plan.total)} с`;
}

/** Тот же запрос экспорта (с умолчаниями схемы). */
const sameRequest = (a: ExportRequest, b: ExportRequest): boolean =>
  canonicalJson(ExportRequestSchema.parse(a)) === canonicalJson(ExportRequestSchema.parse(b));

/** Манифест экспорта (без хеширования файла); не читается — undefined. */
function exportManifest(root: string, row: exportsRepo.ExportRow): z.infer<typeof ExportManifestLite> | undefined {
  try {
    return ExportManifestLite.parse(JSON.parse(readFileSync(join(dirname(join(root, row.path)), "export-manifest.json"), "utf8")));
  } catch {
    return undefined;
  }
}

/** Файл экспорта по манифесту: файл пропал или sha256 не совпал — undefined. */
async function verifiedExport(root: string, row: exportsRepo.ExportRow, m: z.infer<typeof ExportManifestLite>): Promise<Exported | undefined> {
  const abs = join(root, row.path);
  try {
    if (!existsSync(abs) || (await sha256File(abs)) !== row.sha256) return undefined;
  } catch {
    return undefined;
  }
  return { exportId: row.id, abs, sha256: row.sha256, ffprobe: m.ffprobe, warnings: m.warnings ?? [] };
}

/**
 * Готовый экспорт версии с тем же запросом (новые первыми) или новый через `exportOne`. Запрос
 * сверяется по манифесту, хешируется только файл совпавшего экспорта (ProRes — сотни МБ).
 */
async function ensureExport(
  ctx: JobContext, d: ScriptPackageDeps, versionId: string, request: ExportRequest, draftKey: string, frames: ScriptSceneItem["frames"],
): Promise<ExportOutcome> {
  const rows = exportsRepo.listByVersion(ctx.db, versionId).filter((r) => r.format === request.format).reverse();
  for (const row of rows) {
    const m = exportManifest(d.root, row);
    if (!m || !sameRequest(m.request, request)) continue;
    const got = await verifiedExport(d.root, row, m);
    if (got) return { ok: got };
  }
  const r = await (d.exportOne ?? realExportOne)(ctx, d.exporter, { versionId, request, draftKey, frames });
  if (r.status === "completed") {
    const id = (r.outputRefs as { export_id?: string }).export_id;
    const row = id ? exportsRepo.get(ctx.db, id) : undefined;
    const m = row ? exportManifest(d.root, row) : undefined;
    const got = row && m ? await verifiedExport(d.root, row, m) : undefined;
    const detail = `экспорт ${id ?? "без id"} опубликован, но его файл или манифест не прочитан либо sha256 не совпал`;
    return got ? { ok: got } : { reason: exportFailedReason("опубликованный экспорт не прочитан или повреждён (sha256 не совпал)"), detail };
  }
  if (r.status !== "failed") return { abort: r };
  const stage = r.error.stage;
  if (stage === "storage" || stage === "fenced_out" || stage === "orphaned" || stage === "cancelled" || stage === "interrupted") return { abort: r };
  if (/^overlay_opaque\b/.test(r.error.message)) return { reason: OVERLAY_IMPOSSIBLE, detail: r.error.message };
  return { reason: exportFailedReason(r.error.message), detail: r.error.message };
}

interface Packed {
  n: number;
  item: ScriptSceneItem;
  sceneId: string;
  versionId: string;
  names: { mp4: string; alpha: string };
  /** Кадры по файлу версии (F7). */
  frames: SceneFrames;
  mp4: Exported;
  alpha: Exported | null;
  /** `код: описание` — в манифест. */
  warnings: string[];
  /** Для шпаргалки (по-русски). */
  notes: string[];
}

export const scriptPackage: (depsOf: () => ScriptPackageDeps) => JobHandler = (depsOf) => async (ctx) => {
  const parsed = ScriptPackageInputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return fail("prepare", `вход script.package не годится: ${parsed.error.message}`);
  const { projectId, aspect } = parsed.data;
  const d = depsOf();
  const db = ctx.db;
  const root = d.root;
  const status = await d.storage().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: errText(e) }));
  if (!status.ok) return fail("storage", `${status.reason}: ${status.detail}`);

  const pkgId = packageIdFor(ctx.job.id);
  let rel: string;
  try {
    rel = artifactPaths(root, projectId).package(pkgId);
  } catch (e) {
    return fail("prepare", errText(e));
  }
  // восстановление: пакет уже опубликован этой задачей (сбой между COMMIT и итогом попытки)
  const done = scriptPackages.get(db, pkgId);
  if (done) {
    const m = readManifest(root, done);
    if (!m) return fail("publish", `пакет ${pkgId} опубликован, но его манифест не читается`);
    // сбой мог случиться между COMMIT и запретом записи корня — закрыть сейчас
    await sealRoot(join(root, done.rel_path), d.log);
    return { status: "completed", outputRefs: refsOf(done, m) };
  }

  const project = projects.get(db, projectId);
  if (!project) return fail("prepare", `проекта ${projectId} нет`);
  if (project.kind !== "script") return fail("prepare", `проект ${projectId} не сценарный`);
  let cur: ReturnType<typeof currentScriptPlan>;
  let script: ReturnType<typeof currentScript>;
  let style: ReturnType<typeof currentProjectStyle>;
  try {
    cur = currentScriptPlan(db, root, projectId);
    script = currentScript(db, root, projectId);
    style = currentProjectStyle(db, root, projectId);
  } catch (e) {
    return fail(isStorageError(e) ? "storage" : "prepare", `план, текст или стиль проекта не прочитаны: ${errText(e)}`);
  }
  if (!cur) return empty("у проекта нет плана сцен");
  const accepted = cur.doc.items.filter((i) => i.status === "accepted").sort((a, b) => compareWordIds(a.start_word_id, b.start_word_id));
  if (accepted.length === 0) return empty("в плане нет принятых сцен");
  const total = accepted.length;
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;
  const blockTitle = new Map((script?.blocks ?? []).map((b, i) => [b.id, b.title.trim() || `Блок ${i + 1}`]));
  /** Фраза для человека — кусок текста блока с пунктуацией (цитата плана — слова через пробел). */
  const phrase = (item: ScriptSceneItem): string => {
    const words = script ? wordsBetween(script, item.start_word_id, item.end_word_id) : [];
    const block = script?.blocks.find((b) => b.id === words[0]?.block_id);
    if (!block || words.length === 0 || words.at(-1)!.block_id !== block.id) return item.quote;
    return block.text.slice(words[0]!.start, words.at(-1)!.end).replace(/\s+/g, " ").trim() || item.quote;
  };

  const missing = new Map<string, string>();
  /** Исходный текст сбоя экспорта сцены — в манифест (`missing[].detail`) и журнал задачи. */
  const details = new Map<string, string>();
  const noteFailure = (n: number, item: ScriptSceneItem, o: { reason: string; detail?: string }) => {
    if (o.detail === undefined) return;
    details.set(item.id, o.detail);
    ctx.emit("export_failed", `сцена ${n}: ${o.detail}`, { item_id: item.id, reason: o.reason, detail: o.detail });
    d.log?.(`сцена ${n}: экспорт не удался: ${o.detail}`);
  };
  const packed: Packed[] = [];
  for (const [i, item] of accepted.entries()) {
    const n = i + 1;
    ctx.progress(0.05 + (0.85 * i) / total, "export");
    const row = scriptScenes.get(db, cur.planId, item.id, aspect);
    const sceneId = row?.scene_id;
    const versionId = sceneId ? scenes.get(db, sceneId)?.current_version_id ?? null : null;
    const v = versionId ? versions.get(db, versionId) : undefined;
    if (!row || !v || v.status !== "ready") {
      missing.set(item.id, NO_VERSION);
      continue;
    }
    // двойник 9:16 не по текущей 16:9-версии — тоже устарел (S10 fix I3)
    if (itemFingerprint(item, styleRef) !== row.item_fingerprint || (aspect === "9:16" && twinOutdated(db, cur.planId, item.id, v.id))) {
      missing.set(item.id, STALE);
      continue;
    }
    // F7: длительность — по файлу версии; не по плану — замечание
    const frames = versionFrames(item.frames, v.settings.duration_frames);
    const offPlan = durationNote(item.frames, v.settings.duration_frames, cur.doc.fps);
    d.log?.(`сцена ${n}: экспорт MP4`);
    const mp4 = await ensureExport(ctx, d, v.id, PACKAGE_MP4, `${n}-mp4`, frames);
    if ("abort" in mp4) return mp4.abort;
    if ("reason" in mp4) {
      missing.set(item.id, mp4.reason);
      noteFailure(n, item, mp4);
      continue;
    }
    const qa = versionQaWarnings(db, root, v.id);
    let alpha: Exported | null = null;
    if (overlayProblem({ issues: qa })) {
      missing.set(item.id, OVERLAY_IMPOSSIBLE);
    } else {
      d.log?.(`сцена ${n}: экспорт ProRes 4444 с альфой`);
      const a = await ensureExport(ctx, d, v.id, PACKAGE_ALPHA, `${n}-alpha`, frames);
      if ("abort" in a) return a.abort;
      if ("reason" in a) {
        missing.set(item.id, a.reason);
        noteFailure(n, item, a);
      } else alpha = a.ok;
    }
    const qaShown = qa.filter((x) => !(OVERLAY_BLOCKERS as readonly string[]).includes(x.code));
    const exportWarnings = [...mp4.ok.warnings, ...(alpha?.warnings ?? [])];
    const alphaMissing = missing.get(item.id);
    packed.push({
      n, item, sceneId: row.scene_id, versionId: v.id, names: fileNames(n, total, fileSlug(item.quote)), frames, mp4: mp4.ok, alpha,
      warnings: [...(offPlan ? [`duration_off_plan: ${offPlan}`] : []), ...qaShown.map((x) => `${x.code}: ${x.description}`), ...exportWarnings],
      // F8: в шпаргалке — короткие фразы (полные тексты — в манифесте и Playground)
      notes: cheatNotes(
        [...(alphaMissing ? [alphaMissing === OVERLAY_IMPOSSIBLE ? OVERLAY_IMPOSSIBLE : ALPHA_FAILED_NOTE] : []), ...(offPlan ? [offPlan] : [])],
        [...qaShown.map((x) => x.code), ...exportWarnings.map(warningCode)],
      ),
    });
  }
  const missingList = accepted.filter((i) => missing.has(i.id)).map((i) => ({
    item_id: i.id, quote: i.quote, reason: missing.get(i.id)!, ...(details.has(i.id) ? { detail: details.get(i.id)! } : {}),
  }));
  if (packed.length === 0) {
    return empty(missingList.map((m) => `сцена ${accepted.findIndex((i) => i.id === m.item_id) + 1}: ${m.reason}`).join("; "));
  }

  // папка в draft попытки
  ctx.progress(0.9, "publish");
  const now = new Date();
  const createdAt = now.toISOString();
  const fileOf = (e: Exported, file: string): ScriptPackageFile => ({ file, export_id: e.exportId, sha256: e.sha256, ffprobe: e.ffprobe });
  const manifest: ScriptPackageManifest = ScriptPackageManifestSchema.parse({
    schema_version: 1,
    package_id: pkgId,
    project_id: projectId,
    project_title: project.title,
    name: displayName(project.title, aspect, now),
    aspect,
    script: { id: cur.doc.inputs.script.id, revision: cur.doc.inputs.script.revision },
    plan: { id: cur.planId, revision: cur.doc.revision },
    reading: cur.doc.reading,
    scenes: packed.map((p) => ({
      n: p.n, item_id: p.item.id, scene_id: p.sceneId, version_id: p.versionId, block_id: p.item.block_id, at_s: p.item.at_s, quote: p.item.quote,
      technique: p.item.technique, frames: p.frames, mp4: fileOf(p.mp4, p.names.mp4), alpha: p.alpha ? fileOf(p.alpha, p.names.alpha) : null,
      warnings: p.warnings,
    })),
    missing: missingList,
    created_at: createdAt,
  });
  const fps = cur.doc.fps;
  const sec = (frames: number) => (frames * fps.den) / fps.num;
  const byId = new Map(packed.map((p) => [p.item.id, p]));
  const rows: CheatRow[] = accepted.map((item, i) => {
    const p = byId.get(item.id);
    const f = p?.frames ?? item.frames;
    return {
      n: i + 1, nn: sceneNumber(i + 1, total), mp4: p ? p.names.mp4 : null, alpha: p?.alpha ? p.names.alpha : null,
      block: blockTitle.get(item.block_id) ?? item.block_id, at_s: item.at_s, quote: phrase(item), technique: item.technique,
      total_s: sec(f.total), lead_s: sec(f.lead), tail_s: sec(f.tail),
      notes: p ? p.notes : cheatNotes([`нет сцены: ${shortMissing(missing.get(item.id) ?? NO_VERSION)}`], []),
    };
  });

  let draftDir: string;
  try {
    draftDir = (await createJobDraft(root, { runId: ctx.job.id, attempt: ctx.attempt })).dir;
  } catch (e) {
    return fail(isStorageError(e) ? "storage" : "publish", `draft пакета не создан: ${errText(e)}`);
  }
  // Медиафайлы draft — жёсткие ссылки на экспорты: перед карантином их убираем, чтобы уборка
  // draft или человек с `chmod -R` не сделали записываемыми сами экспорты (общий inode).
  const media = packed.flatMap((p) => [p.names.mp4, ...(p.alpha ? [p.names.alpha] : [])]);
  const quarantine = async (reason: string) => {
    for (const f of media) {
      try {
        unlinkSync(join(draftDir, f));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") d.log?.(`медиафайл draft ${f} не убран: ${errText(e)}`);
      }
    }
    await quarantineDir(draftDir, reason).catch(() => undefined);
  };
  let manifestText: string;
  try {
    for (const p of packed) {
      await place(p.mp4, join(draftDir, p.names.mp4));
      if (p.alpha) await place(p.alpha, join(draftDir, p.names.alpha));
    }
    for (const f of ["md", "csv", "txt"] as const) await writeLocked(join(draftDir, CHEAT_FILES[f]), cheatsheet(rows, f));
    manifestText = JSON.stringify(manifest, null, 2) + "\n";
    await writeLocked(join(draftDir, MANIFEST_FILE), manifestText);
    fsyncDirSync(draftDir);
    await d.beforePublish?.(ctx);
    const again = await d.storage();
    if (!again.ok) throw Object.assign(new Error(`storage_unavailable: ${again.reason}: ${again.detail}`), { storage: true });
    await safeMkdir(root, dirname(rel));
  } catch (e) {
    await quarantine(`publish: ${errText(e)}`);
    return fail(isStorageError(e) || (e as { storage?: boolean }).storage ? "storage" : "publish", `папка пакета не собрана: ${errText(e)}`);
  }

  const dest = join(root, rel);
  const row = { id: pkgId, project_id: projectId, job_id: ctx.job.id, aspect, rel_path: rel, manifest_sha256: sha256(manifestText), created_at: createdAt };
  let moved = false;
  try {
    tx(db, () => {
      if (!fenceOk(db, ctx.job.id, ctx.attempt)) {
        throw new Refused("fenced_out", `fenced_out: попытка ${ctx.attempt} задачи ${ctx.job.id} устарела (текущая: ${jobs.get(db, ctx.job.id)?.attempt ?? "задачи нет"})`);
      }
      if (jobs.get(db, ctx.job.id)?.cancel_requested) throw new Refused("cancelled", `cancelled: отмена задачи ${ctx.job.id} запрошена — пакет не публикуется`);
      if (scriptPackages.get(db, pkgId)) throw new Error(`artifact_exists: пакет ${pkgId} уже опубликован`);
      if (lstatOrUndefined(dest)) quarantineOrphan(root, dest, rel);
      renameSync(draftDir, dest);
      moved = true;
      fsyncDirSync(dirname(dest));
      fsyncDirSync(dirname(draftDir));
      db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, ?, ?, ?)").run(rel, ctx.job.id, ctx.attempt, createdAt);
      scriptPackages.insert(db, row);
    });
  } catch (e) {
    if (moved) {
      try {
        renameSync(dest, draftDir); // только каталог: права файлов (общий inode с экспортами) не трогаем
      } catch (u) {
        attachCause(e, u);
      }
    }
    await quarantine(errText(e));
    if (e instanceof Refused) return fail(e.stage, e.message);
    return fail(isStorageError(e) ? "storage" : "publish", `публикация пакета не удалась: ${errText(e)}`);
  }
  await sealRoot(dest, d.log);
  ctx.progress(1, "publish");
  return { status: "completed", outputRefs: refsOf(scriptPackages.get(db, pkgId)!, manifest) };

  function empty(why: string): HandlerResult {
    return { status: "failed", error: { code: "package_empty", message: `в папку не вошло ни одной сцены: ${why}` } };
  }
};

/** Запрет записи корня опубликованного пакета (после COMMIT; повтор безвреден). */
async function sealRoot(dest: string, log?: (line: string) => void): Promise<void> {
  try {
    await chmod(dest, lstatSync(dest).mode & 0o555);
  } catch (e) {
    log?.(`корень пакета не закрыт от записи: ${errText(e)}`);
  }
}

/** Жёсткая ссылка на файл экспорта (тот же том); не вышло — копия, сверка sha256, a-w. */
async function place(e: Exported, dst: string): Promise<void> {
  try {
    linkSync(e.abs, dst);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EXDEV" && code !== "EPERM" && code !== "ENOTSUP" && code !== "EMLINK") throw err;
  }
  copyFileSync(e.abs, dst);
  chmodSync(dst, 0o444);
  const got = await sha256File(dst, { sync: true });
  if (got !== e.sha256) throw new Error(`копия ${e.abs} не совпала по sha256 с экспортом`);
}

/** Свой файл пакета (шпаргалка, манифест): запись с fsync, затем a-w. */
async function writeLocked(path: string, text: string): Promise<void> {
  await fsyncWrite(path, text);
  chmodSync(path, 0o444);
}

function lstatOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

/**
 * Сирота прерванной публикации (каталог пакета без строки `script_packages`) →
 * `workspace/quarantine/artifacts/<qrn_…>/` с маркером. Снимается запрет записи только с
 * корня (каталог 0555 не переносится в другой родитель); файлы внутри не трогаются.
 */
function quarantineOrphan(root: string, dest: string, rel: string): void {
  const st = lstatSync(dest);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`на месте пакета ${rel} не каталог — публикация отклонена`);
  const qdir = join(safeMkdirSync(root, ORPHANS_REL), newId("qrn"));
  chmodSync(dest, 0o755);
  renameSync(dest, qdir);
  const reason = { reason: "orphan_artifact: каталог пакета без записи в БД (публикация прервана до COMMIT)", dest_rel: rel, at: new Date().toISOString() };
  fsyncWriteSync(join(qdir, QUARANTINE), JSON.stringify(reason, null, 2) + "\n");
  fsyncDirSync(dirname(qdir));
}

function readManifest(root: string, row: ScriptPackageRow): ScriptPackageManifest | undefined {
  try {
    return ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path, MANIFEST_FILE), "utf8")));
  } catch {
    return undefined;
  }
}

function refsOf(row: ScriptPackageRow, m: ScriptPackageManifest): PackageRefs {
  return { package_id: row.id, rel_path: row.rel_path, files: m.scenes.length, missing: m.missing.map(({ item_id, reason }) => ({ item_id, reason })) };
}

/** Пометка в имени пакета, манифест которого не читается. */
export const BROKEN_PACKAGE = "манифест не читается";

/**
 * DTO пакета (C7) по строке и манифесту. Манифест не читается — строка-заглушка с пометкой в
 * имени, без файлов (пакет не пропадает из списка молча; папку можно открыть в Finder).
 */
export function packageDto(root: string, row: ScriptPackageRow): ScriptPackageDto {
  const m = readManifest(root, row);
  if (!m) {
    return {
      id: row.id, aspect: row.aspect as Aspect, rel_path: row.rel_path, abs_path: join(root, row.rel_path),
      display_name: `${basename(row.rel_path)} — ${BROKEN_PACKAGE}`, files: [], missing: [], created_at: row.created_at,
    };
  }
  return {
    id: row.id,
    aspect: row.aspect as Aspect,
    rel_path: row.rel_path,
    abs_path: join(root, row.rel_path),
    display_name: m.name,
    files: m.scenes.map((s) => ({
      n: s.n, item_id: s.item_id, mp4: s.mp4.file, alpha: s.alpha?.file ?? null, sha256: { mp4: s.mp4.sha256, alpha: s.alpha?.sha256 ?? null },
    })),
    missing: m.missing.map(({ item_id, reason }) => ({ item_id, reason })),
    created_at: row.created_at,
  };
}

/** Пакеты экспорта проекта для `ScriptStateDto.packages`, новые первыми (нечитаемый манифест — заглушка). */
export const packagesForState: (db: Db, root: string, projectId: string) => ScriptPackageDto[] = (db, root, projectId) =>
  scriptPackages.listByProject(db, projectId).reverse().map((row) => packageDto(root, row));
