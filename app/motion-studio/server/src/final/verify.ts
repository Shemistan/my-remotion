// Проверка финала (Task 44): ffprobe-гейт, длительность, синхронность речи, кадры исходника и
// сцен, громкость → `verify.json` (`FinalVerifyReportSchema`). Всё — по готовому MP4, без рендера:
// still-кадры сцен даёт вызывающий (`stillsFor`; в Task 43 — `renderTimelineRange`).
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type ColorMatrix, type EditedTimeline, type FinalExportRequest, type FinalVerifyReport, FinalVerifyReportSchema, type Fps,
  type ProbeResult, type VideoTimelineDoc, frameToUs, outputSize, usToFrame,
} from "@ms/contracts";
import { ffprobe } from "@ms/render";
import { type SyncSample, judgeSync } from "../edit/sync-probe.js";
import { runTool } from "../media/ffmpeg.js";
import { DEFAULT_MATRIX, type MediaCtx, alignmentOffset, extractFrame, probeColorMatrix, psnr, sampleVerifyFrames, sourceFrameAt } from "./frames.js";
import { loudnessDelta } from "./loudness.js";
import { type SyncWord, measureSync, syncAnchors } from "./sync.js";

/** ProbeResult + параметры звука (в `ProbeResultSchema` их нет: контракт экспорта не трогаем). */
export type FinalProbe = ProbeResult & { audioSampleRate?: number; audioChannels?: number };

export interface FinalProbeExpect {
  width: number;
  height: number;
  fps: Fps;
  frames: number;
  /** Каналы звука исходника (`undefined` — не сверяются). */
  audioChannels?: number;
}

/** Пороги проверки (редакция 2026-10-21; fix 1 — PSNR по Y, мягкий порог U/V, true peak). */
export const VERIFY_MIN_PSNR_DB = 30;
/** U/V: только грубые цветовые ошибки (не та матрица, перепутанные каналы). */
export const VERIFY_MIN_CHROMA_PSNR_DB = 25;
export const VERIFY_MAX_DELTA_LU = 0.5;
/**
 * Потолок true peak, dBTP. Провал — финал выше потолка, а смонтированный звук ниже: кодек довёл
 * звук до клиппинга. Перебор межсэмпловых пиков AAC ниже потолка — не ошибка (громкость меняет
 * только `delta_lu`, его ловит ±0,5 LU), поэтому запаса «пик + 0,1 дБ» больше нет.
 */
export const VERIFY_TRUE_PEAK_CEILING_DB = -0.1;
export const FINAL_SAMPLE_RATE = 48_000;

const sameFps = (a: Fps, b: Fps): boolean => a.num * b.den === b.num * a.den;

/** Длительность в допуске: `|actualUs − frameToUs(frames)| ≤ frameToUs(1) + 1` (тот же, что у гейта). */
export function durationOk(actualUs: number, frames: number, fps: Fps): boolean {
  return Math.abs(actualUs - frameToUs(frames, fps)) <= frameToUs(1, fps) + 1;
}

/**
 * Гейт MP4 финала: `h264`, звук `aac` 48 кГц, `yuv420p`, размеры, fps, каналы = исходнику;
 * длительность видеопотока (`durationOk`). Пусто — пройден; строки начинаются с имени параметра
 * (`duration …`, `pix_fmt …`).
 */
export function finalProbeGate(probe: FinalProbe, expect: FinalProbeExpect): string[] {
  const out: string[] = [];
  if (probe.codec !== "h264") out.push(`codec ${probe.codec}, ожидался h264`);
  if (probe.audioCodec !== "aac") out.push(`audio_codec ${probe.audioCodec ?? "нет дорожки"}, ожидался aac`);
  if (probe.pixFmt !== "yuv420p") out.push(`pix_fmt ${probe.pixFmt ?? "?"}, ожидался yuv420p`);
  if (probe.width !== expect.width || probe.height !== expect.height) out.push(`size ${probe.width}×${probe.height}, ожидалось ${expect.width}×${expect.height}`);
  if (!sameFps(probe.fps, expect.fps)) out.push(`fps ${probe.fps.num}/${probe.fps.den}, ожидалось ${expect.fps.num}/${expect.fps.den}`);
  if (probe.audioCodec !== undefined && probe.audioSampleRate !== FINAL_SAMPLE_RATE) out.push(`audio_sample_rate ${probe.audioSampleRate ?? "?"}, ожидалось ${FINAL_SAMPLE_RATE}`);
  if (expect.audioChannels !== undefined && probe.audioCodec !== undefined && probe.audioChannels !== expect.audioChannels) {
    out.push(`audio_channels ${probe.audioChannels ?? "?"}, ожидалось ${expect.audioChannels} (как у исходника)`);
  }
  const durationUs = Math.round(probe.durationMs * 1000);
  if (!durationOk(durationUs, expect.frames, expect.fps)) out.push(`duration ${durationUs} мкс, ожидалось ${frameToUs(expect.frames, expect.fps)} ± 1 кадр (${expect.frames} кадров)`);
  return out;
}

/** Частота и каналы первой звуковой дорожки (ffprobe). Нет дорожки — `{}`. */
export async function probeAudio(path: string, o: MediaCtx = {}): Promise<{ audioSampleRate?: number; audioChannels?: number }> {
  const r = await runTool("ffprobe", [
    "-v", "error", "-protocol_whitelist", "file", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "json", `file:${path}`,
  ], { ...(o.run ? { run: o.run } : {}), ...(o.signal ? { signal: o.signal } : {}), timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`ffprobe ${path}: ${r.stderrTail.trim()}`);
  const s = (JSON.parse(r.stdout) as { streams?: { sample_rate?: string; channels?: number }[] }).streams?.[0];
  if (!s) return {};
  return { ...(s.sample_rate ? { audioSampleRate: Number(s.sample_rate) } : {}), ...(s.channels ? { audioChannels: s.channels } : {}) };
}

/** ffprobe финала с параметрами звука. */
export async function probeFinal(path: string, o: MediaCtx = {}): Promise<FinalProbe> {
  return { ...(await ffprobe(path)), ...(await probeAudio(path, o)) };
}

/** Кадров финала при fps экспорта: тот же fps — как таймлайн, иначе `round(frames · k)` (как `exportDurationFrames`). */
export function finalFrames(doc: Pick<VideoTimelineDoc, "fps" | "duration_frames">, fps: Fps): number {
  if (sameFps(doc.fps, fps)) return doc.duration_frames;
  return Math.max(1, Math.round((doc.duration_frames * fps.num * doc.fps.den) / (fps.den * doc.fps.num)));
}

/** Кадр финала (fps экспорта), показываемый в момент начала кадра таймлайна. */
const outFrame = (frame: number, doc: Pick<VideoTimelineDoc, "fps">, fps: Fps): number => (sameFps(doc.fps, fps) ? frame : usToFrame(frameToUs(frame, doc.fps), fps));

type ReportParts = Pick<FinalVerifyReport, "probe" | "duration" | "frames" | "loudness">;
export type SyncStatus = "ok" | "failed" | "unchecked";

/**
 * Провалы проверки: `probe` не пуст; длительность вне `durationOk` (по мкс, `delta_frames` —
 * справочно); синхронность `failed`; кадр исходника со сдвигом (кроме `inconclusive`), любой кадр с
 * PSNR Y < 30 дБ или U/V < 25 дБ; `|delta_lu| > 0,5` или true peak финала выше потолка при звуке ниже.
 * `unchecked` синхронности — не провал (в отчёте — `sync_check`).
 */
export function verifyFailures(r: ReportParts, o: { sync: SyncStatus; fps: Fps }): string[] {
  const out: string[] = [];
  if (r.probe.length > 0) out.push("probe");
  if (!durationOk(r.duration.actual_us, r.duration.expected_frames, o.fps)) out.push("duration");
  if (o.sync === "failed") out.push("sync");
  const badFrame = (f: FinalVerifyReport["frames"][number]) =>
    f.psnr_db < VERIFY_MIN_PSNR_DB || (f.psnr_u_db ?? Infinity) < VERIFY_MIN_CHROMA_PSNR_DB || (f.psnr_v_db ?? Infinity) < VERIFY_MIN_CHROMA_PSNR_DB ||
    (f.kind === "source" && f.offset !== "inconclusive" && f.offset !== 0);
  if (r.frames.some(badFrame)) out.push("frames");
  const l = r.loudness;
  if (Math.abs(l.delta_lu) > VERIFY_MAX_DELTA_LU || (l.final_peak_db > VERIFY_TRUE_PEAK_CEILING_DB && l.source_peak_db <= VERIFY_TRUE_PEAK_CEILING_DB)) out.push("loudness");
  return out;
}

/** Итог синхронности: нет замеров или все окна без звука — `unchecked`, иначе `judgeSync`. */
export function syncStatus(samples: SyncSample[], frameUs: number): { status: SyncStatus; message?: string } {
  if (samples.length === 0) return { status: "unchecked", message: "нет опорных слов: синхронность не проверена" };
  if (!samples.some((s) => s.energy)) return { status: "unchecked", message: `все ${samples.length} окон исходника без звука: синхронность не проверена` };
  const j = judgeSync(samples, frameUs);
  return j.ok ? { status: "ok", message: `надёжных замеров ${j.reliable} из ${j.voiced} со звуком` } : { status: "failed", message: j.message };
}

export interface VerifyFinalInput extends MediaCtx {
  finalPath: string;
  doc: VideoTimelineDoc;
  request: FinalExportRequest;
  /** CFR master исходника на `doc.fps` (`master@<num>-<den>`): кадры исходника и размер показа. */
  master: string;
  /** Смонтированный звук 48 кГц (`edited-audio.wav`): громкость и каналы. */
  editedAudio: string;
  /** Звук исходника 16 кГц моно (Phase 2): опора синхронности. */
  source16k: string;
  words: SyncWord[];
  tl: EditedTimeline;
  /** PNG кадров сцен (RGB, номера `doc.fps`) в размере выхода, в том же порядке. */
  stillsFor(frames: number[]): Promise<string[]>;
  /** Task 44: каталог для кадров и WAV проверки (черновик попытки; на системный диск — нельзя). */
  workDir: string;
  /**
   * Матрица YUV финала из аргументов кодирования (Task 43). Нет — тег `color_space` финала, без
   * тега — bt601 (так переводит swscale по умолчанию).
   */
  colorMatrix?: ColorMatrix;
  /** Не удалять кадры и WAV проверки (отладка). */
  keepArtifacts?: boolean;
}

/** Кандидаты сдвига кадра исходника: ±2 кадра master. */
const ALIGN_RANGE = 2;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Полная проверка MP4 финала → `verify.json`. Кадры и WAV — во временном подкаталоге `workDir`. */
export async function verifyFinal(i: VerifyFinalInput): Promise<FinalVerifyReport> {
  const ctx: MediaCtx = { ...(i.run ? { run: i.run } : {}), ...(i.signal ? { signal: i.signal } : {}) };
  const work = await mkdtemp(join(i.workDir, "verify-"));
  try {
    return await verifyIn(i, ctx, work);
  } finally {
    if (!i.keepArtifacts) await rm(work, { recursive: true, force: true });
  }
}

async function verifyIn(i: VerifyFinalInput, ctx: MediaCtx, work: string): Promise<FinalVerifyReport> {
  const fps = i.request.fps ?? i.doc.fps;
  const masterProbe = await ffprobe(i.master);
  const size = outputSize({ width: masterProbe.width, height: masterProbe.height }, i.request.resolution);
  const frames = finalFrames(i.doc, fps);
  const sourceAudio = await probeAudio(i.editedAudio, ctx);
  const matrix = i.colorMatrix ?? (await probeColorMatrix(i.finalPath, ctx)) ?? DEFAULT_MATRIX;
  const masterMatrix = (await probeColorMatrix(i.master, ctx)) ?? DEFAULT_MATRIX;

  // ffprobe и длительность
  const probe = await probeFinal(i.finalPath, ctx);
  const gate = finalProbeGate(probe, { ...size, fps, frames, ...(sourceAudio.audioChannels ? { audioChannels: sourceAudio.audioChannels } : {}) });
  const actualUs = Math.round(probe.durationMs * 1000);
  const frameUs = frameToUs(1, fps);
  const duration = { expected_frames: frames, actual_us: actualUs, delta_frames: Math.round((actualUs - frameToUs(frames, fps)) / frameUs) };

  // синхронность речи
  const anchors = syncAnchors(i.doc, i.words, i.tl);
  const samples = await measureSync({ finalPath: i.finalPath, source16k: i.source16k, tl: i.tl, words: i.words, anchors, workDir: work, ...ctx });
  const sync = syncStatus(samples, frameUs + 1);

  // кадры исходника и сцен: всё в RGB, PSNR — после одного и того же перевода в yuv420p по матрице финала
  const picks = sampleVerifyFrames(i.doc);
  const sceneFrames = picks.filter((p) => p.kind === "scene").map((p) => p.frame);
  const stills = sceneFrames.length > 0 ? await i.stillsFor(sceneFrames) : [];
  if (stills.length !== sceneFrames.length) throw new Error(`stillsFor: ${stills.length} кадров вместо ${sceneFrames.length}`);
  const masterFrames = usToFrame(Math.round(masterProbe.durationMs * 1000), i.doc.fps);
  const checked: FinalVerifyReport["frames"] = [];
  const skipped: NonNullable<FinalVerifyReport["frames_skipped"]> = [];
  const finalCtx = { ...ctx, matrix };
  for (const p of picks) {
    const ff = join(work, `final-${p.frame}.png`);
    await extractFrame(i.finalPath, outFrame(p.frame, i.doc, fps), fps, ff, undefined, finalCtx);
    if (p.kind === "scene") {
      const q = await psnr(ff, stills[sceneFrames.indexOf(p.frame)]!, finalCtx);
      checked.push({ frame: p.frame, kind: "scene", ...(p.clip_id ? { clip_id: p.clip_id } : {}), psnr_db: round2(q.y), offset: 0, psnr_u_db: round2(q.u), psnr_v_db: round2(q.v) });
      continue;
    }
    const m = sourceFrameAt(i.doc, p.frame);
    if (m === undefined) {
      skipped.push({ frame: p.frame, kind: "source", reason: "кадр вне последовательностей исходника таймлайна (doc.video)" });
      continue;
    }
    const cands: { offset: number; path: string }[] = [];
    for (let off = -ALIGN_RANGE; off <= ALIGN_RANGE; off++) {
      const f = m + off;
      if (f < 0 || f >= masterFrames) continue;
      cands.push({ offset: off, path: await extractFrame(i.master, f, i.doc.fps, join(work, `master-${p.frame}-${off}.png`), size, { ...ctx, matrix: masterMatrix }) });
    }
    if (cands.length === 0) {
      skipped.push({ frame: p.frame, kind: "source", reason: `нет кадров master около ${m} (в master ${masterFrames} кадров)` });
      continue;
    }
    const a = await alignmentOffset(ff, cands, finalCtx);
    checked.push({ frame: p.frame, kind: "source", psnr_db: round2(a.psnr), offset: a.offset, psnr_u_db: round2(a.psnr_u), psnr_v_db: round2(a.psnr_v) });
  }

  const loudness = await loudnessDelta(i.finalPath, i.editedAudio, ctx);
  const parts: ReportParts = { probe: gate.filter((g) => !g.startsWith("duration")), duration, frames: checked, loudness };
  const failures = verifyFailures(parts, { sync: sync.status, fps });
  return FinalVerifyReportSchema.parse({
    ...parts,
    sync: samples.map((s) => ({ word_id: s.word_id, offset_us: s.offset_us, corr: s.corr, energy: s.energy })),
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
    sync_check: sync,
    ...(skipped.length > 0 ? { frames_skipped: skipped } : {}),
    color_matrix: matrix,
  });
}
