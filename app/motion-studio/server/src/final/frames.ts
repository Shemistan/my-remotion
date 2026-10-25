// Кадры проверки финала (Task 44): извлечение кадра, PSNR (ffmpeg), сдвиг кадра финала
// относительно master и выбор кадров для сверки. Кадры — номера `doc.fps` (таймлайн).
import { rm, stat } from "node:fs/promises";
import { type ColorMatrix, type Fps, type VideoTimelineDoc, frameToUs } from "@ms/contracts";
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

/** `color_space` ffprobe → матрица YUV; нет тега или иная — `undefined` (вызывающий решает). */
export function matrixFromColorSpace(cs: string | undefined): ColorMatrix | undefined {
  if (cs === "bt709") return "bt709";
  if (cs === "smpte170m" || cs === "bt470bg" || cs === "fcc") return "bt601";
  return undefined;
}

/** Матрица видеопотока по тегу `color_space` (ffprobe); нет тега — `undefined`. */
export async function probeColorMatrix(video: string, o: MediaCtx = {}): Promise<ColorMatrix | undefined> {
  const r = await runTool("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-select_streams", "v:0", "-show_entries", "stream=color_space", "-of", "json", `file:${video}`], toolOpts(o));
  if (r.code !== 0) throw new Error(`ffprobe ${video}: ${r.stderrTail.trim()}`);
  return matrixFromColorSpace((JSON.parse(r.stdout) as { streams?: { color_space?: string }[] }).streams?.[0]?.color_space);
}

/** Матрица без тега: так переводит в YUV swscale (ffmpeg) по умолчанию. */
export const DEFAULT_MATRIX: ColorMatrix = "bt601";

/**
 * Кадр `frame` (номер при `fps`) в PNG `out` (RGB), при `size` — масштабированный. YUV → RGB явно по
 * `matrix` (по умолчанию — по тегам файла, без тегов — bt601) и TV-диапазону. Точный поиск `-ss`
 * перед `-i` на полкадра раньше начала кадра: первый декодированный кадр с pts ≥ t — искомый (тот
 * же, что `select=eq(n\,frame)`, тест на `counter-30`), но без декодирования ролика с начала.
 * Прежний `out` удаляется: кадр за концом не подменяется старым файлом.
 */
export async function extractFrame(video: string, frame: number, fps: Fps, out: string, size?: { width: number; height: number }, o: MediaCtx & { matrix?: ColorMatrix } = {}): Promise<string> {
  await rm(out, { force: true });
  const at = Math.max(0, frameToUs(frame, fps) - Math.floor(frameToUs(1, fps) / 2));
  const scale = `scale=${size ? `${size.width}:${size.height}:` : ""}flags=bicubic:in_color_matrix=${o.matrix ?? "auto"}:in_range=auto,format=rgb24`;
  await ffmpegStderr([
    "-v", "error", "-ss", (at / 1e6).toFixed(6), ...fileInput(video), "-map", "0:v:0", "-frames:v", "1",
    "-vf", scale, "-update", "1", "-y", `file:${out}`,
  ], o);
  const s = await stat(out).catch(() => undefined);
  if (!s || s.size === 0) throw new FfmpegError("failed", `кадр ${frame} за концом ${video}`);
  return out;
}

/** PSNR без бесконечности: одинаковые кадры. */
export const PSNR_INF = 99;

export interface Psnr {
  y: number;
  u: number;
  v: number;
}

/** PSNR Y/U/V из сводки фильтра `psnr` по yuv420p (`inf` → `PSNR_INF`). */
export function parsePsnr(stderr: string): Psnr {
  const m = /PSNR y:(inf|[\d.]+) u:(inf|[\d.]+) v:(inf|[\d.]+)/.exec(stderr);
  if (!m) throw new Error("psnr: нет сводки y/u/v в выводе ffmpeg");
  const n = (x: string) => (x === "inf" ? PSNR_INF : Math.min(PSNR_INF, Number(x)));
  return { y: n(m[1]!), u: n(m[2]!), v: n(m[3]!) };
}

/**
 * PSNR двух RGB-кадров одного размера (PNG `extractFrame`, still рендера): обе стороны одним путём
 * переводятся в yuv420p TV-диапазона по `matrix` финала, сравнение — по Y (вердикт), U, V (справочно).
 * Так RGB-still и финал x264 yuv420p сравниваются без ложной потери на цветности и матрице.
 */
export async function psnr(a: string, b: string, o: MediaCtx & { matrix?: ColorMatrix } = {}): Promise<Psnr> {
  const to = `scale=out_color_matrix=${o.matrix ?? DEFAULT_MATRIX}:out_range=tv:flags=bicubic,format=yuv420p`;
  const err = await ffmpegStderr([
    ...fileInput(a), ...fileInput(b), "-lavfi", `[0:v]${to}[x];[1:v]${to}[y];[x][y]psnr`, "-f", "null", "-",
  ], o);
  return parsePsnr(err);
}

/** Соседние кадры отличаются меньше — выравнивание по кадру не определено (статика). */
export const ALIGN_STATIC_DELTA = 0.002;

/**
 * Сдвиг кадра финала: кандидат master с лучшим PSNR по Y (при равенстве — ближе к 0). Если лучший
 * почти не отличается от соседнего кандидата (`frameDelta < ALIGN_STATIC_DELTA`) — `inconclusive`.
 */
export async function alignmentOffset(finalFrame: string, candidates: { offset: number; path: string }[], o: MediaCtx & { matrix?: ColorMatrix } = {}): Promise<{ offset: number | "inconclusive"; psnr: number; psnr_u: number; psnr_v: number }> {
  if (candidates.length === 0) throw new Error("alignmentOffset: нет кандидатов");
  let best: { offset: number; path: string; p: Psnr } | undefined;
  for (const c of candidates) {
    const p = await psnr(finalFrame, c.path, o);
    if (!best || p.y > best.p.y || (p.y === best.p.y && Math.abs(c.offset) < Math.abs(best.offset))) best = { ...c, p };
  }
  const b = best!;
  const res = { psnr: b.p.y, psnr_u: b.p.u, psnr_v: b.p.v };
  const img = await loadPng(b.path);
  for (const n of candidates.filter((c) => Math.abs(c.offset - b.offset) === 1)) {
    if (frameDelta(img, await loadPng(n.path)) < ALIGN_STATIC_DELTA) return { offset: "inconclusive", ...res };
  }
  return { offset: b.offset, ...res };
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
