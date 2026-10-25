// Кадры проверки финала (Task 44): извлечение кадра, PSNR (ffmpeg), сдвиг кадра финала
// относительно master и выбор кадров для сверки. Кадры — номера `doc.fps` (таймлайн).
import { stat } from "node:fs/promises";
import { type Fps, type VideoTimelineDoc, frameToUs } from "@ms/contracts";
import { FfmpegError, type RunRef, runTool } from "../media/ffmpeg.js";
import { frameDelta, loadPng } from "../qa/image.js";

/** Контекст вызова ffmpeg: попытка задачи (spawnTracked) и отмена. */
export interface MediaCtx {
  run?: RunRef;
  signal?: AbortSignal;
}

/** Вход ffmpeg только локальным файлом (как `media/*`): сеть и плейлисты не открываются. */
export const fileInput = (path: string): string[] => ["-protocol_whitelist", "file", "-i", `file:${path}`];

const toolOpts = (o: MediaCtx) => ({ ...(o.run ? { run: o.run } : {}), ...(o.signal ? { signal: o.signal } : {}), timeoutMs: 10 * 60_000 });

/** ffmpeg с полным stderr (сводки фильтров `psnr`, `ebur128`, `astats` печатаются в конце). */
export async function ffmpegStderr(args: string[], o: MediaCtx = {}): Promise<string> {
  let err = "";
  const r = await runTool("ffmpeg", ["-hide_banner", "-nostdin", ...args], { ...toolOpts(o), onStderr: (d) => { err += d; } });
  if (r.code !== 0) throw new FfmpegError("failed", `ffmpeg: код ${r.code}: ${r.stderrTail.trim().slice(-2000)}`);
  return err;
}

/**
 * Кадр `frame` (номер при `fps`) в PNG `out`, при `size` — масштабированный. Точный поиск `-ss`
 * перед `-i` на полкадра раньше начала кадра: первый декодированный кадр с pts ≥ t — искомый (тот
 * же, что `select=eq(n\,frame)`, тест на `counter-30`), но без декодирования ролика с начала.
 */
export async function extractFrame(video: string, frame: number, fps: Fps, out: string, size?: { width: number; height: number }, o: MediaCtx = {}): Promise<string> {
  const at = Math.max(0, frameToUs(frame, fps) - Math.floor(frameToUs(1, fps) / 2));
  await ffmpegStderr([
    "-v", "error", "-ss", (at / 1e6).toFixed(6), ...fileInput(video), "-map", "0:v:0", "-frames:v", "1",
    ...(size ? ["-vf", `scale=${size.width}:${size.height}:flags=bicubic`] : []), "-update", "1", "-y", `file:${out}`,
  ], o);
  const s = await stat(out).catch(() => undefined);
  if (!s || s.size === 0) throw new FfmpegError("failed", `кадр ${frame} за концом ${video}`);
  return out;
}

/** PSNR без бесконечности: одинаковые кадры. */
export const PSNR_INF = 99;

/** Средний PSNR из сводки фильтра `psnr` (`average:inf` → `PSNR_INF`). */
export function parsePsnr(stderr: string): number {
  const m = /PSNR [^\n]*average:(inf|[\d.]+)/.exec(stderr);
  if (!m) throw new Error("psnr: нет сводки в выводе ffmpeg");
  return m[1] === "inf" ? PSNR_INF : Math.min(PSNR_INF, Number(m[1]));
}

/** PSNR двух кадров одного размера (RGB 8 бит), дБ. */
export async function psnr(a: string, b: string, o: MediaCtx = {}): Promise<number> {
  const err = await ffmpegStderr([
    ...fileInput(a), ...fileInput(b), "-lavfi", "[0:v]format=rgb24[x];[1:v]format=rgb24[y];[x][y]psnr", "-f", "null", "-",
  ], o);
  return parsePsnr(err);
}

/** Соседние кадры отличаются меньше — выравнивание по кадру не определено (статика). */
export const ALIGN_STATIC_DELTA = 0.002;

/**
 * Сдвиг кадра финала: кандидат master с лучшим PSNR (при равенстве — ближе к 0). Если лучший
 * почти не отличается от соседнего кандидата (`frameDelta < ALIGN_STATIC_DELTA`) — `inconclusive`.
 */
export async function alignmentOffset(finalFrame: string, candidates: { offset: number; path: string }[], o: MediaCtx = {}): Promise<{ offset: number | "inconclusive"; psnr: number }> {
  if (candidates.length === 0) throw new Error("alignmentOffset: нет кандидатов");
  let best: { offset: number; path: string; psnr: number } | undefined;
  for (const c of candidates) {
    const p = await psnr(finalFrame, c.path, o);
    if (!best || p > best.psnr || (p === best.psnr && Math.abs(c.offset) < Math.abs(best.offset))) best = { ...c, psnr: p };
  }
  const b = best!;
  const img = await loadPng(b.path);
  for (const n of candidates.filter((c) => Math.abs(c.offset - b.offset) === 1)) {
    if (frameDelta(img, await loadPng(n.path)) < ALIGN_STATIC_DELTA) return { offset: "inconclusive", psnr: b.psnr };
  }
  return { offset: b.offset, psnr: b.psnr };
}

export interface VerifyFrame {
  frame: number;
  kind: "source" | "scene";
  clip_id?: string;
}

/**
 * Кадры сверки (номера `doc.fps`): `n − ⌊n/2⌋` (6) кадров вне окон сцен равномерно и середина
 * каждой сцены (до ⌊n/2⌋, при большем числе — равномерно по сценам); по возрастанию кадра.
 */
export function sampleVerifyFrames(doc: Pick<VideoTimelineDoc, "duration_frames" | "scenes">, n = 12): VerifyFrame[] {
  const total = doc.duration_frames;
  const maxScenes = Math.floor(n / 2);
  const nSource = n - maxScenes;
  const scenes = [...doc.scenes].sort((a, b) => a.start_frame - b.start_frame).filter((c) => c.start_frame < total);
  const pickedScenes = scenes.length <= maxScenes ? scenes : Array.from({ length: maxScenes }, (_, k) => scenes[Math.floor(((k + 0.5) * scenes.length) / maxScenes)]!);
  const out: VerifyFrame[] = pickedScenes.map((c) => ({
    frame: Math.min(total - 1, c.start_frame + Math.floor(c.duration_frames / 2)), kind: "scene", clip_id: c.clip_id,
  }));
  // кадры вне окон сцен — отрезками [a, b)
  const free: [number, number][] = [];
  let at = 0;
  for (const c of scenes) {
    if (c.start_frame > at) free.push([at, c.start_frame]);
    at = Math.max(at, c.start_frame + c.duration_frames);
  }
  if (at < total) free.push([at, total]);
  const m = free.reduce((s, [a, b]) => s + (b - a), 0);
  const k = Math.min(nSource, m);
  for (let i = 0; i < k; i++) {
    let idx = Math.floor(((i + 0.5) * m) / k);
    for (const [a, b] of free) {
      if (idx < b - a) {
        out.push({ frame: a + idx, kind: "source" });
        break;
      }
      idx -= b - a;
    }
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/** Кадр master (исходник CFR на `doc.fps`), который стоит на кадре таймлайна; вне последовательностей — `undefined`. */
export function sourceFrameAt(doc: Pick<VideoTimelineDoc, "video">, frame: number): number | undefined {
  const s = doc.video.find((v) => v.from <= frame && frame < v.from + v.durationInFrames);
  return s ? s.startFrom + (frame - s.from) : undefined;
}
