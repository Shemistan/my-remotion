// Проверка финала (Task 44): ffprobe-гейт, длительность в кадрах, синхронность речи, кадры
// исходника и сцен, громкость → `verify.json` (`FinalVerifyReportSchema`). Всё — по готовому MP4,
// без рендера: still-кадры сцен даёт вызывающий (`stillsFor`; в Task 43 — `renderTimelineRange`).
import { join } from "node:path";
import {
  type EditedTimeline, type FinalExportRequest, type FinalVerifyReport, FinalVerifyReportSchema, type Fps, type ProbeResult,
  type VideoTimelineDoc, frameToUs, outputSize, usToFrame,
} from "@ms/contracts";
import { ffprobe } from "@ms/render";
import { judgeSync } from "../edit/sync-probe.js";
import { runTool } from "../media/ffmpeg.js";
import { type MediaCtx, alignmentOffset, extractFrame, psnr, sampleVerifyFrames, sourceFrameAt } from "./frames.js";
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

/** Пороги проверки (редакция 2026-10-21). */
export const VERIFY_MIN_PSNR_DB = 30;
export const VERIFY_MAX_DELTA_LU = 0.5;
export const VERIFY_PEAK_MARGIN_DB = 0.1;
export const FINAL_SAMPLE_RATE = 48_000;

const sameFps = (a: Fps, b: Fps): boolean => a.num * b.den === b.num * a.den;

/**
 * Гейт MP4 финала: `h264`, звук `aac` 48 кГц, `yuv420p`, размеры, fps, каналы = исходнику;
 * длительность видеопотока `|durationUs − frameToUs(frames)| ≤ frameToUs(1) + 1`. Пусто — пройден;
 * строки начинаются с имени параметра (`duration …`, `pix_fmt …`).
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
  const expectedUs = frameToUs(expect.frames, expect.fps);
  if (Math.abs(durationUs - expectedUs) > frameToUs(1, expect.fps) + 1) out.push(`duration ${durationUs} мкс, ожидалось ${expectedUs} ± 1 кадр (${expect.frames} кадров)`);
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

type ReportParts = Omit<FinalVerifyReport, "verdict" | "failures">;

/**
 * Провалы проверки по частям отчёта: `probe` не пуст; `|delta_frames| > 1`; синхронность не
 * подтверждена (`judgeSync`, смещение надёжного замера > кадра + 1 мкс); кадр исходника со сдвигом
 * (кроме `inconclusive`) или PSNR < 30 дБ, кадр сцены с PSNR < 30 дБ против still; `|delta_lu| > 0,5`
 * или пик финала выше пика звука больше чем на 0,1 дБ.
 */
export function verifyFailures(r: ReportParts, syncOk: boolean): string[] {
  const out: string[] = [];
  if (r.probe.length > 0) out.push("probe");
  if (Math.abs(r.duration.delta_frames) > 1) out.push("duration");
  if (!syncOk) out.push("sync");
  if (r.frames.some((f) => f.psnr_db < VERIFY_MIN_PSNR_DB || (f.kind === "source" && f.offset !== "inconclusive" && f.offset !== 0))) out.push("frames");
  if (Math.abs(r.loudness.delta_lu) > VERIFY_MAX_DELTA_LU || r.loudness.final_peak_db > r.loudness.source_peak_db + VERIFY_PEAK_MARGIN_DB) out.push("loudness");
  return out;
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
  /** PNG кадров сцен (номера `doc.fps`) в размере выхода, в том же порядке. */
  stillsFor(frames: number[]): Promise<string[]>;
  /** Task 44: каталог для кадров и WAV проверки (черновик попытки; на системный диск — нельзя). */
  workDir: string;
}

/** Кандидаты сдвига кадра исходника: ±2 кадра master. */
const ALIGN_RANGE = 2;

/** Полная проверка MP4 финала → `verify.json`. */
export async function verifyFinal(i: VerifyFinalInput): Promise<FinalVerifyReport> {
  const ctx: MediaCtx = { ...(i.run ? { run: i.run } : {}), ...(i.signal ? { signal: i.signal } : {}) };
  const fps = i.request.fps ?? i.doc.fps;
  const masterProbe = await ffprobe(i.master);
  const size = outputSize({ width: masterProbe.width, height: masterProbe.height }, i.request.resolution);
  const frames = finalFrames(i.doc, fps);
  const sourceAudio = await probeAudio(i.editedAudio, ctx);

  // ffprobe и длительность
  const probe = await probeFinal(i.finalPath, ctx);
  const gate = finalProbeGate(probe, { ...size, fps, frames, ...(sourceAudio.audioChannels ? { audioChannels: sourceAudio.audioChannels } : {}) });
  const actualUs = Math.round(probe.durationMs * 1000);
  const frameUs = frameToUs(1, fps);
  const duration = { expected_frames: frames, actual_us: actualUs, delta_frames: Math.round((actualUs - frameToUs(frames, fps)) / frameUs) };

  // синхронность речи
  const anchors = syncAnchors(i.doc, i.words, i.tl);
  const samples = await measureSync({ finalPath: i.finalPath, source16k: i.source16k, tl: i.tl, words: i.words, anchors, workDir: i.workDir, ...ctx });
  const syncOk = judgeSync(samples, frameUs + 1).ok;

  // кадры исходника и сцен
  const picks = sampleVerifyFrames(i.doc);
  const sceneFrames = picks.filter((p) => p.kind === "scene").map((p) => p.frame);
  const stills = sceneFrames.length > 0 ? await i.stillsFor(sceneFrames) : [];
  if (stills.length !== sceneFrames.length) throw new Error(`stillsFor: ${stills.length} кадров вместо ${sceneFrames.length}`);
  const masterFrames = usToFrame(Math.round(masterProbe.durationMs * 1000), i.doc.fps);
  const checked: FinalVerifyReport["frames"] = [];
  for (const p of picks) {
    const ff = join(i.workDir, `final-${p.frame}.png`);
    await extractFrame(i.finalPath, outFrame(p.frame, i.doc, fps), fps, ff, undefined, ctx);
    if (p.kind === "scene") {
      const still = stills[sceneFrames.indexOf(p.frame)]!;
      checked.push({ frame: p.frame, kind: "scene", ...(p.clip_id ? { clip_id: p.clip_id } : {}), psnr_db: round2(await psnr(ff, still, ctx)), offset: 0 });
      continue;
    }
    const m = sourceFrameAt(i.doc, p.frame);
    const cands: { offset: number; path: string }[] = [];
    if (m !== undefined) {
      for (let off = -ALIGN_RANGE; off <= ALIGN_RANGE; off++) {
        const f = m + off;
        if (f < 0 || f >= masterFrames) continue;
        cands.push({ offset: off, path: await extractFrame(i.master, f, i.doc.fps, join(i.workDir, `master-${p.frame}-${off}.png`), size, ctx) });
      }
    }
    const a = cands.length > 0 ? await alignmentOffset(ff, cands, ctx) : { offset: "inconclusive" as const, psnr: 0 };
    checked.push({ frame: p.frame, kind: "source", psnr_db: round2(a.psnr), offset: a.offset });
  }

  const loudness = await loudnessDelta(i.finalPath, i.editedAudio, ctx);
  const parts: ReportParts = { probe: gate.filter((g) => !g.startsWith("duration")), duration, sync: samples.map((s) => ({ word_id: s.word_id, offset_us: s.offset_us })), frames: checked, loudness };
  const failures = verifyFailures(parts, syncOk);
  return FinalVerifyReportSchema.parse({ ...parts, verdict: failures.length === 0 ? "pass" : "fail", failures });
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
