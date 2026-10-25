// Смонтированная дорожка звука финала (Task 36, F2): `<Audio>` композиции `ProjectTimeline` —
// один WAV 48 кГц, склеенный тем же графом, что звук превью rough cut (`buildAudioFilter`:
// `atrim` по сэмплам, короткие `afade` на склейках). Видео композиции — `OffthreadVideo muted`,
// поэтому склейки звука сэмпл-точные и не зависят от кадров.
//
// Два прохода ffmpeg: (1) звук источника → WAV 48 кГц pcm_s24le на шкале «от начала файла»
// (`aresample=async=1:first_pts=0`, как у прокси и audio16k: звук, начавшийся позже файла,
// добивается тишиной) — `atrim` по сэмплам точен только на известной частоте; (2) граф
// `buildAudioFilter` + добивка/обрезка до ровно `round(duration_us · 48 000 / 1e6)` сэмплов.
// Каналы — как в источнике, без нормализации громкости (Global Constraints).
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { open, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { EditedTimeline } from "@ms/contracts";
import type { ProcessRegistry } from "@ms/core";
import { buildAudioFilter } from "../edit/preview-filter.js";
import { sha256File } from "../scenes/hash.js";
import { FfmpegError, type RunRef, runFfmpeg } from "./ffmpeg.js";
import { assertOutsideSource } from "./guards.js";
import type { Demuxer } from "./probe.js";

/** Частота дорожки (F2, F10: финал AAC 48 кГц). */
export const EDITED_AUDIO_RATE = 48_000;

export interface EditedAudioRequest {
  /** Файл со звуком (исходник проекта или его копия в хранилище); только читается. */
  input: string;
  /** `-f` входа (`demuxerFor(probe.container)`); без него ffmpeg определяет формат сам. */
  demuxer?: Demuxer;
  tl: EditedTimeline;
  /** Длина фейда на склейке, µs (`roughcut.fadeUs`, как у превью). */
  fadeUs: number;
  /** Выходной `.wav`; существующий — ошибка, каталог должен существовать. */
  out: string;
  /** Контекст попытки: ffmpeg в реестре процессов, выход проверяется `assertOutsideSource`. */
  run?: RunRef;
  signal: AbortSignal;
  /** Реестр процессов, если `run` без него. */
  registry?: ProcessRegistry;
  timeoutMs?: number;
}

export interface EditedAudio {
  path: string;
  sha256: string;
  /** Сэмплов на канал. */
  samples: number;
}

export interface WavInfo {
  channels: number;
  sampleRate: number;
  blockAlign: number;
  dataOffset: number;
  /** Сэмплов на канал по размеру чанка `data` (не больше, чем есть в буфере/файле). */
  samples: number;
}

/**
 * Заголовок PCM WAV: `fmt ` и начало `data`. `size` — размер файла (по умолчанию длина буфера:
 * весь файл в памяти); чанк `data` длиннее файла (запись не закрыта) — до конца файла.
 */
export function wavInfo(buf: Buffer, size = buf.length): WavInfo {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("не wav");
  let off = 12;
  let fmt: Omit<WavInfo, "dataOffset" | "samples"> | undefined;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === "fmt " && off + 24 <= buf.length) {
      fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), blockAlign: buf.readUInt16LE(off + 20) };
    }
    if (id === "data") {
      if (!fmt || fmt.blockAlign <= 0) throw new Error("wav без fmt до data");
      const dataOffset = off + 8;
      return { ...fmt, dataOffset, samples: Math.floor(Math.min(len, size - dataOffset) / fmt.blockAlign) };
    }
    off += 8 + len + (len % 2);
  }
  throw new Error("в заголовке wav нет чанка data");
}

async function readWavInfo(path: string): Promise<WavInfo> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(Math.min(size, 64 * 1024));
    await fh.read(head, 0, head.length, 0);
    return wavInfo(head, size);
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`, { cause: e });
  } finally {
    await fh.close();
  }
}

/** Проход 1: звук источника → WAV 48 кГц s24 от начала файла, каналы как есть. */
export function normalizeAudioArgs(input: string, out: string, demuxer?: Demuxer): string[] {
  return [
    "-protocol_whitelist", "file", ...(demuxer ? ["-f", demuxer] : []), "-i", `file:${input}`,
    "-vn", "-map", "0:a:0",
    "-af", "aresample=async=1:first_pts=0",
    "-ar", String(EDITED_AUDIO_RATE), "-c:a", "pcm_s24le",
    "-map_metadata", "-1", "-n", out,
  ];
}

/** Граф прохода 2: склейка `buildAudioFilter` и ровно `samples` сэмплов на выходе `[out]`. */
export function editedAudioFilter(tl: EditedTimeline, fadeUs: number, samples: number, audioEndUs?: number): string {
  const graph = buildAudioFilter(tl.clips, EDITED_AUDIO_RATE, fadeUs, audioEndUs !== undefined ? { audioEndUs } : {});
  return `${graph};\n[a]apad=whole_len=${samples},atrim=end_sample=${samples}[out]`;
}

/**
 * `edited-audio.wav` таймлайна `tl` из звука `input`: 48 кГц, каналы источника, `pcm_s24le`,
 * ровно `round(duration_us · 48 000 / 1e6)` сэмплов (клип за концом звука источника добивается
 * тишиной). Временные файлы — рядом с `out` (`.edited-audio-*`), удаляются в конце. Бросает
 * `FfmpegError` (отмена, таймаут, `orphaned`, сбой) и `Error`, если длина не сошлась.
 */
export async function buildEditedAudio(req: EditedAudioRequest): Promise<EditedAudio> {
  if (req.signal.aborted) throw new FfmpegError("aborted", "edited-audio: отменено до запуска");
  if (existsSync(req.out)) throw new Error(`edited-audio: выход уже существует: ${req.out}`);
  const run = req.run ? { ...req.run, ...(req.registry && !req.run.registry ? { registry: req.registry } : {}) } : undefined;
  if (run) assertOutsideSource(req.out, run.root, [req.input]);
  const samples = Math.round((req.tl.duration_us * EDITED_AUDIO_RATE) / 1e6);
  if (samples <= 0) throw new Error("edited-audio: таймлайн нулевой длины");
  const tag = `.edited-audio-${basename(req.out)}-${process.pid}-${randomBytes(4).toString("hex")}`;
  const wav = join(dirname(req.out), `${tag}.wav`);
  const script = join(dirname(req.out), `${tag}.filter`);
  const o = { ...(run ? { run } : {}), signal: req.signal, ...(req.timeoutMs ? { timeoutMs: req.timeoutMs } : {}) };
  let orphaned = false;
  try {
    await runFfmpeg(normalizeAudioArgs(req.input, wav, req.demuxer), o);
    const src = await readWavInfo(wav);
    const audioEndUs = Math.round((src.samples * 1e6) / EDITED_AUDIO_RATE);
    await writeFile(script, editedAudioFilter(req.tl, req.fadeUs, samples, audioEndUs));
    await runFfmpeg([
      "-protocol_whitelist", "file", "-f", "wav", "-i", `file:${wav}`,
      "-filter_complex_script", script, "-map", "[out]",
      "-c:a", "pcm_s24le", "-ar", String(EDITED_AUDIO_RATE), "-map_metadata", "-1", "-n", req.out,
    ], o);
    const got = await readWavInfo(req.out);
    if (got.samples !== samples || got.sampleRate !== EDITED_AUDIO_RATE || got.channels !== src.channels) {
      throw new Error(`edited-audio: ${got.samples} сэмплов ${got.sampleRate} Гц ×${got.channels}, ожидалось ${samples} сэмплов ${EDITED_AUDIO_RATE} Гц ×${src.channels}`);
    }
    return { path: req.out, sha256: await sha256File(req.out), samples };
  } catch (e) {
    orphaned = e instanceof FfmpegError && e.kind === "orphaned";
    throw e;
  } finally {
    // живой ffmpeg (orphaned) пишет во временные файлы — их не трогаем, уберёт карантин вызывающего
    if (!orphaned) await rm(wav, { force: true }).catch(() => undefined);
    if (!orphaned) await rm(script, { force: true }).catch(() => undefined);
  }
}
