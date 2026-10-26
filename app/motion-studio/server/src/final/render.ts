// Запрос рендера финала (Task 43, ADR 0010): та же композиция `ProjectTimeline`, что у превью, — весь
// ролик в размере выхода, master целиком (вырезка для финала не делается: Remotion качает его один
// раз), `edited-audio.wav` целиком, x264 `medium`, CRF по качеству, AAC 192 кбит/с, BT.709 с тегами
// (как master — иначе кадры исходника в финале и проверка по матрице разошлись бы).
// fps запроса ≠ `timeline_fps` (F8): последовательности — заново из µs клипов EDL в fps выхода, окна
// сцен — через µs начала и конца (`outFrame(start + dur) − outFrame(start)`), Σ последовательностей
// обязана равняться кадрам выхода; props сцен — `exportProps` (только props по договору
// `ScenePropsBase`); иначе отказ `fps_change_unsupported`.
import {
  type EditedTimeline, type FinalExportRequest, type Fps, ScenePropsBaseSchema, type VideoTimelineDoc, clipsToSequences, crfFor, frameToUs, outputSize, usToFrame,
} from "@ms/contracts";
import { type RunRef, type SceneCheck, type TimelineRenderRequest, type TimelineSceneSpec, exportProps } from "@ms/render";
import { sampleVerifyFrames } from "./frames.js";
import { finalFrames } from "./verify.js";

/** Кодирование финала (F10): AAC 192 кбит/с, x264 `medium`, BT.709. */
export const FINAL_AUDIO_KBPS = 192;
export const FINAL_X264_PRESET = "medium" as const;
export const FINAL_COLOR_SPACE = "bt709" as const;

export class FinalPropsError extends Error {
  readonly code = "fps_change_unsupported";
  constructor(message: string) {
    super(`fps_change_unsupported: ${message}`);
    this.name = "FinalPropsError";
  }
}

export interface FinalRenderPaths {
  /** CFR master исходника на `doc.fps`. */
  master: string;
  /** `edited-audio.wav` (нет звука у исходника — без поля). */
  audio?: string;
  /** Файл финала (в draft попытки). */
  out: string;
  /** Стоп-кадры сцен для проверки (`verifyFinal.stillsFor`). */
  stillsDir: string;
  cacheDir: string;
  /** Версии сцен ревизии: каталог и props. */
  versions: Record<string, { dir: string; props: Record<string, unknown> }>;
  /** Таймлайн EDL ревизии (µs клипов — для fps ≠ `timeline_fps`). */
  tl: EditedTimeline;
}

export interface FinalRunEnv {
  check: SceneCheck;
  timeoutMs: number;
  run: RunRef;
}

const sameFps = (a: Fps, b: Fps): boolean => a.num * b.den === b.num * a.den;
const fpsText = (f: Fps): string => (f.den === 1 ? `${f.num}` : `${f.num}/${f.den}`);

/** Выход финала: размер по настройкам от размера показа исходника, fps запроса или таймлайна, кадров. */
export function finalOutput(doc: Pick<VideoTimelineDoc, "fps" | "duration_frames">, request: FinalExportRequest, display: { width: number; height: number }): { width: number; height: number; fps: Fps; frames: number } {
  const fps = request.fps ?? doc.fps;
  return { ...outputSize(display, request.resolution), fps: { num: fps.num, den: fps.den }, frames: finalFrames(doc, fps) };
}

/** Кадр выхода (fps `fps`), показываемый в момент начала кадра таймлайна `frame` (как в `verifyFinal`). */
export function outFrame(frame: number, docFps: Fps, fps: Fps): number {
  return sameFps(docFps, fps) ? frame : usToFrame(frameToUs(frame, docFps), fps);
}

/** Кадры сцен, которые сверит `verifyFinal` (`frames` — кадры таймлайна), и они же в кадрах выхода (`stills`). */
export function finalStillFrames(doc: Pick<VideoTimelineDoc, "fps" | "duration_frames" | "scenes">, fps: Fps): { frames: number[]; stills: number[] } {
  const frames = sampleVerifyFrames(doc).filter((p) => p.kind === "scene").map((p) => p.frame);
  return { frames, stills: frames.map((f) => outFrame(f, doc.fps, fps)) };
}

/** `TimelineRenderRequest` финала: весь ролик, масштаб 1, стоп-кадры сцен для проверки. */
export function finalProps(doc: VideoTimelineDoc, request: FinalExportRequest, paths: FinalRenderPaths, display: { width: number; height: number }, env: FinalRunEnv): TimelineRenderRequest {
  const out = finalOutput(doc, request, display);
  const same = sameFps(doc.fps, out.fps);
  const k = same ? 1 : (out.fps.num * doc.fps.den) / (out.fps.den * doc.fps.num);
  const scenes: TimelineSceneSpec[] = [];
  const versionDirs: Record<string, string> = {};
  for (const c of doc.scenes) {
    const v = paths.versions[c.version_id];
    if (!v) throw new Error(`нет версии ${c.version_id} сцены ${c.item_id}`);
    if (!same && !ScenePropsBaseSchema.safeParse(v.props).success) {
      throw new FinalPropsError(`props версии ${c.version_id} сцены ${c.item_id} вне договора ScenePropsBase — кадры сцены под ${fpsText(out.fps)} fps не пересчитать; экспортируйте в fps таймлайна (${fpsText(doc.fps)})`);
    }
    versionDirs[c.version_id] = v.dir;
    const start = outFrame(c.start_frame, doc.fps, out.fps);
    // окно сцены — те же моменты начала и конца, что в таймлайне (через µs), а не `round(кадры · k)`:
    // иначе соседние окна расходятся на кадр
    const duration = same ? c.duration_frames : Math.max(1, Math.min(outFrame(c.start_frame + c.duration_frames, doc.fps, out.fps), out.frames) - start);
    scenes.push({ clip_id: c.clip_id, key: c.version_id, props: exportProps(v.props, k), start_frame: start, duration_frames: duration, transparent: c.placement.transparent, z: c.z });
  }
  const sequences = same ? doc.video : clipsToSequences({ ...paths.tl, fps: out.fps });
  // видео обязано покрыть ровно `out.frames` кадров: иначе хвост ролика без видео или обрезанный звук
  const covered = sequences.reduce((n, q) => n + q.durationInFrames, 0);
  if (!same && covered !== out.frames) {
    throw new FinalPropsError(`последовательности исходника в ${fpsText(out.fps)} fps дают ${covered} кадров, а ролик — ${out.frames}; экспортируйте в fps таймлайна (${fpsText(doc.fps)})`);
  }
  return {
    props: {
      width: out.width, height: out.height, fps: out.fps, duration_frames: out.frames,
      video: { path: paths.master, sequences }, ...(paths.audio ? { audio: { path: paths.audio } } : {}), scenes,
    },
    versionDirs, cacheDir: paths.cacheDir, check: env.check,
    stills: finalStillFrames(doc, out.fps).stills, stillsDir: paths.stillsDir,
    output: { path: paths.out, codec: "h264", crf: crfFor(request.quality), scale: 1, audioBitrateKbps: FINAL_AUDIO_KBPS, x264Preset: FINAL_X264_PRESET, colorSpace: FINAL_COLOR_SPACE },
    timeoutMs: env.timeoutMs, run: env.run,
  };
}
