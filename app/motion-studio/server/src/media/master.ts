// CFR-дериватив исходника для композиции `ProjectTimeline` (Task 36, F1). `OffthreadVideo` по
// VFR-оригиналу (iPhone, Phase 2 F2) и по повёрнутому файлу неточен: master — тот же видеоряд в
// отображаемой ориентации (автоповорот ffmpeg), на сетке `fps` проекта от начала файла (как
// прокси: `fps=…:start_time=0`, поэтому кадр N master = кадр N прокси), x264 CRF 12, GOP = 1 с
// (быстрый seek извлечения кадров Remotion), без звука (звук — `edited-audio.wav`).
//
// Кэш — опубликованный каталог `master/<media>@<num>-<den>` (artifactPaths, ревью 35′: вне
// read-only `proxy/<media>`) с `master.mp4` и `master.json`. Повторный вызов берёт его без ffmpeg,
// сверив манифест с исходником и размер+mtime файла с манифестом (полный sha256 — при расхождении).
import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Fps, FpsSchema, type ProbeSummary, Sha256Schema } from "@ms/contracts";
import { type StorageStatus, type spawnTracked } from "@ms/core";
import { z } from "zod";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactExistsError, ArtifactStore, isPublished } from "../artifacts/store.js";
import type { Db } from "../db/open.js";
import * as media from "../db/repos/media.js";
import { sha256File } from "../scenes/hash.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { FfmpegError, type RunRef, runFfmpeg, runTool } from "./ffmpeg.js";
import { assertOutsideSource } from "./guards.js";
import { demuxerFor, probeMedia } from "./probe.js";

/** CRF master (F1): почти без потерь — финал кодируется второй раз. */
export const MASTER_CRF = 12;
export const MASTER_FILE = "master.mp4";
export const MASTER_META = "master.json";

export const MasterManifestSchema = z.object({
  schema_version: z.literal(1),
  media_id: z.string().min(1),
  media_sha256: Sha256Schema,
  fps: FpsSchema,
  crf: z.number().int(),
  frames: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: Sha256Schema,
  // ревью Task 36 (minor): размер и mtime master.mp4 при публикации — быстрая сверка кэша
  size_bytes: z.number().int().positive().optional(),
  mtime_ms: z.number().int().nonnegative().optional(),
  created_at: z.string().datetime(),
}).strict();
export type MasterManifest = z.infer<typeof MasterManifestSchema>;

/**
 * Цвет master (e2e Task 36): исходник без тегов цвета ffmpeg читает как BT.601, а извлечение кадров
 * Remotion (`OffthreadVideo`) — как BT.709: зелёный темнел на 20 %, PSNR кадра с исходником падал до
 * 27 дБ. Поэтому master — всегда BT.709 limited с явными тегами: `scale` переводит матрицу из
 * той, что ffmpeg видит у входа (теги, без тегов — BT.601), исходник BT.709 проходит без изменений;
 * `setparams` ставит теги кадрам (x264 берёт primaries/trc из кадра, а не из опций вывода).
 * HDR (HLG/PQ) так не тонмапится: такой исходник отвергается (`hdrReason`), тонмаппинг — бэклог ADR 0010.
 */
export const MASTER_COLOR_FILTER = "scale=out_color_matrix=bt709:out_range=tv,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv";
/**
 * Хвост видео (ревью Task 36, I1): у iPhone звук длиннее видео на 10–40 мс, а `duration_us` — до
 * конца самого длинного потока. `fps` после последнего кадра ничего не дописывает, поэтому
 * последний кадр повторяется (`tpad`, без конца), а `-frames:v` обрезает ровно `masterFrames`.
 */
export const MASTER_TAIL_FILTER = "tpad=stop_mode=clone:stop=-1";
export const MASTER_COLOR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"] as const;

/**
 * Причина, по которой исходник — HDR (ревью Task 36, I2): передача HLG (`arib-std-b67`) или PQ
 * (`smpte2084`), либо цветовой охват BT.2020. `undefined` — SDR или тегов нет (без тегов ffmpeg и
 * Remotion читают файл как SDR).
 */
export function hdrReason(probe: Pick<ProbeSummary, "video">): string | undefined {
  const { color_transfer: trc, color_primaries: prim } = probe.video;
  if (trc === "arib-std-b67") return "передача HLG (arib-std-b67)";
  if (trc === "smpte2084") return "передача PQ (smpte2084)";
  if (prim?.startsWith("bt2020")) return `цветовой охват BT.2020 (${prim})`;
  return undefined;
}

/** HDR-исходник: master BT.709 без тонмаппинга дал бы тусклый неверный цвет — явный отказ. */
export class HdrUnsupportedError extends Error {
  readonly code = "hdr_unsupported";
  constructor(reason: string) {
    super(
      `hdr_unsupported: ролик снят в HDR (${reason}), а Motion Studio пока работает только с SDR — цвета вышли бы неверными. ` +
      "Экспортируйте ролик в SDR (Rec.709) и импортируйте заново: на iPhone — «Фото» → «Экспорт» с выключенным HDR " +
      "или «Настройки» → «Камера» → «Запись видео» → выключить «Видео HDR» для новых съёмок; в монтажной программе — экспорт в Rec.709 SDR.",
    );
    this.name = "HdrUnsupportedError";
  }
}

/** Кадров в master: `round(duration · fps)` (длительность исходника по probe). */
export function masterFrames(probe: Pick<ProbeSummary, "duration_us">, fps: Fps): number {
  return Math.max(1, Math.round((probe.duration_us * fps.num) / (fps.den * 1e6)));
}

/**
 * Аргументы ffmpeg master: вход с явным демультиплексором и `file:`; CFR по pts
 * (`fps=<num>/<den>:start_time=0`, `-fps_mode cfr`); `libx264 -preset medium -crf <crf>
 * -g <round(fps)> -pix_fmt yuv420p`; без звука; ровно `masterFrames` кадров; автоповорот ffmpeg
 * не отключается — master в отображаемой ориентации.
 */
export function masterArgs(input: string, out: string, probe: ProbeSummary, fps: Fps, crf: number): string[] {
  const rate = `${fps.num}/${fps.den}`;
  const gop = Math.max(1, Math.round(fps.num / fps.den));
  return [
    "-protocol_whitelist", "file", "-f", demuxerFor(probe.container), "-i", `file:${input}`,
    "-map", "0:v:0",
    "-vf", `fps=${rate}:start_time=0,${MASTER_COLOR_FILTER},${MASTER_TAIL_FILTER},format=yuv420p`,
    "-fps_mode", "cfr", "-r", rate,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-g", String(gop), "-pix_fmt", "yuv420p",
    ...MASTER_COLOR_TAGS,
    "-an",
    "-frames:v", String(masterFrames(probe, fps)),
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    "-n", out,
  ];
}

export interface MasterDeps {
  root: string;
  db: Db;
  storage: () => Promise<StorageStatus>;
  /**
   * Попытка задачи (ADR 0007): ffmpeg в её реестре, draft `workspace/drafts/<runId>-a<attempt>`,
   * публикация с fencing (`runId` — id задачи). Draft попытки на время вызова должен быть свободен:
   * ensureMaster создаёт его сам и освобождает публикацией.
   */
  run: RunRef;
  signal: AbortSignal;
  /** По умолчанию `MASTER_CRF`. */
  crf?: number;
  timeoutMs?: number;
  /** Подмена запуска ffmpeg (тесты считают вызовы). */
  spawn?: typeof spawnTracked;
  log?: (line: string) => void;
}

export interface MasterRef {
  /** Абсолютный путь `master.mp4`. */
  path: string;
  sha256: string;
}

async function fromCache(root: string, destRel: string, mediaSha: string): Promise<MasterRef> {
  const dir = join(root, destRel);
  const m = MasterManifestSchema.parse(JSON.parse(await readFile(join(dir, MASTER_META), "utf8")));
  if (m.media_sha256 !== mediaSha) throw new Error(`master ${destRel}: сделан из другого исходника (sha256 ${m.media_sha256.slice(0, 12)}…, сейчас ${mediaSha.slice(0, 12)}…)`);
  const path = join(dir, MASTER_FILE);
  // размер и mtime совпали с публикацией — файл не перечитывается (master 4K — гигабайты);
  // расхождение или старый манифест без них — подозрение: полный sha256
  const st = await stat(path);
  // mtime в манифесте — целые мс; |Δ| < 1 мс — та же метка (utimes/APFS округляют дробную часть)
  if (m.size_bytes === st.size && m.mtime_ms !== undefined && Math.abs(st.mtimeMs - m.mtime_ms) < 1) return { path, sha256: m.sha256 };
  const sha = await sha256File(path);
  if (sha !== m.sha256) throw new Error(`master ${destRel}: sha256 файла ${sha.slice(0, 12)}… не совпадает с ${MASTER_META} (${m.sha256.slice(0, 12)}…) — файл повреждён`);
  return { path, sha256: sha };
}

async function packets(path: string, o: { run: RunRef; signal: AbortSignal }): Promise<number> {
  const r = await runTool("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-f", "mov", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", `file:${path}`], o);
  if (r.code !== 0) throw new Error(`ffprobe master: код ${r.code}: ${r.stderrTail.slice(-500)}`);
  return Number(r.stdout.trim());
}

async function dropDraft(dir: string): Promise<void> {
  if (!existsSync(dir) || existsSync(join(dir, QUARANTINE))) return;
  await setWritable(dir).catch(() => undefined);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * master исходника `mediaId` на сетке `fps`: опубликованный — из кэша (размер+mtime, при
 * расхождении — sha256; ffmpeg не запускается); HDR-исходник — `HdrUnsupportedError`, иначе ffmpeg в draft попытки → проверка (CFR, fps, `masterFrames` кадров) →
 * `master.json` → публикация с fencing в `master/<media>@<num>-<den>`. Параллельная публикация того
 * же master (`artifact_exists`) — берётся она. Бросает `FfmpegError` (`orphaned` — draft в
 * карантин, процесс жив), `FencedOutError`/`PublishCancelledError` публикации и `Error` (нет
 * исходника, хранилище недоступно, master не прошёл проверку, кэш повреждён).
 */
export async function ensureMaster(d: MasterDeps, mediaId: string, fps: Fps): Promise<MasterRef> {
  const asset = media.get(d.db, mediaId);
  if (!asset) throw new Error(`master: исходника ${mediaId} нет`);
  const destRel = artifactPaths(d.root, asset.project_id).master(mediaId, fps);
  if (isPublished(d.db, destRel)) return fromCache(d.root, destRel, asset.sha256);
  const status = await d.storage();
  if (!status.ok) throw new Error(`storage_unavailable: ${status.reason}: ${status.detail}`);
  const src = join(d.root, asset.rel_path);
  const o = { run: d.run, signal: d.signal };
  // сводка до Task 36 без тегов цвета — перечитать исходник (ffprobe, только чтение)
  const colorProbe = asset.probe.video.color_transfer !== undefined || asset.probe.video.color_primaries !== undefined ? asset.probe : await probeMedia(src, o);
  const hdr = hdrReason(colorProbe);
  if (hdr) throw new HdrUnsupportedError(hdr);
  const crf = d.crf ?? MASTER_CRF;
  const fence = { jobId: d.run.runId, attempt: d.run.attempt };
  const draft = await createJobDraft(d.root, { runId: fence.jobId, attempt: fence.attempt });
  const out = join(draft.dir, MASTER_FILE);
  assertOutsideSource(out, d.root, [src]);
  const started = Date.now();
  try {
    await runFfmpeg(masterArgs(src, out, asset.probe, fps, crf), {
      ...o, durationUs: asset.probe.duration_us, ...(d.timeoutMs ? { timeoutMs: d.timeoutMs } : {}), ...(d.spawn ? { spawn: d.spawn } : {}),
    });
    const px = await probeMedia(out, o);
    const frames = await packets(out, o);
    const want = masterFrames(asset.probe, fps);
    const sameFps = px.video.r_frame_rate.num * fps.den === fps.num * px.video.r_frame_rate.den;
    if (px.vfr || !sameFps || frames !== want) {
      throw new Error(`master не прошёл проверку: ${px.vfr ? "VFR; " : ""}fps ${px.video.r_frame_rate.num}/${px.video.r_frame_rate.den} (нужно ${fps.num}/${fps.den}), кадров ${frames} (нужно ${want})`);
    }
    const sha256 = await sha256File(out, { sync: true });
    const st = await stat(out);
    const manifest: MasterManifest = {
      schema_version: 1, media_id: mediaId, media_sha256: asset.sha256, fps: { num: fps.num, den: fps.den }, crf, frames,
      width: px.video.display_width, height: px.video.display_height, sha256, size_bytes: st.size, mtime_ms: Math.floor(st.mtimeMs),
      created_at: new Date().toISOString(),
    };
    await fsyncWrite(join(draft.dir, MASTER_META), JSON.stringify(manifest, null, 2) + "\n");
    await new ArtifactStore({ root: d.root, db: d.db, guard: d.storage }).publish(draft.dir, destRel, () => undefined, fence);
    d.log?.(`master ${mediaId}@${fps.num}-${fps.den}: ${frames} кадров за ${((Date.now() - started) / 1000).toFixed(1)} с`);
    return { path: join(d.root, destRel, MASTER_FILE), sha256 };
  } catch (e) {
    if (e instanceof ArtifactExistsError) {
      // master опубликовала параллельная задача — он и есть результат
      await dropDraft(draft.dir);
      return fromCache(d.root, destRel, asset.sha256);
    }
    if (e instanceof FfmpegError && e.kind === "orphaned") {
      // процесс жив и пишет в draft: только карантин (ADR 0007)
      if (existsSync(draft.dir)) await quarantineDir(draft.dir, `stale_process: master: ${e.message}`).catch(() => undefined);
    } else {
      await dropDraft(draft.dir);
    }
    throw e;
  }
}
