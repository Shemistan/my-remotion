// Технический gate экспорта (P1-14): ffprobe файла против запроса и настроек версии.
import type { ExportRequest, Fps, ProbeResult, Settings } from "@ms/contracts";
import { h264Size } from "./ffprobe.js";

/**
 * pix_fmt ProRes 4444 с альфой по ffprobe: кодируем `yuva444p10le`, а декодер prores ffmpeg 7
 * сообщает внутреннюю 12-битную форму `yuva444p12le` того же файла. Оба — альфа есть.
 */
const PRORES_ALPHA = ["yuva444p10le", "yuva444p12le"];

/** fps экспорта: из запроса или версии. */
export function exportFps(settings: Settings, request: Pick<ExportRequest, "fps">): Fps {
  return request.fps ? { num: request.fps, den: 1 } : settings.fps;
}

/** Множитель времени в кадрах при смене fps: новый fps / fps версии (1 — fps тот же). */
export function fpsFactor(settings: Settings, request: Pick<ExportRequest, "fps">): number {
  const to = exportFps(settings, request);
  const from = settings.fps;
  return to.num * from.den === from.num * to.den ? 1 : (to.num / to.den) / (from.num / from.den);
}

/** Длительность экспорта в кадрах его fps — как у `scaleTiming` (то же округление). */
export function exportDurationFrames(settings: Settings, request: Pick<ExportRequest, "fps">): number {
  const k = fpsFactor(settings, request);
  return k === 1 ? settings.duration_frames : Math.max(1, Math.round(settings.duration_frames * k));
}

/**
 * Пусто — gate пройден. Сначала формат: `mp4` — `h264` и звук `aac` (дорожка обязательна:
 * монтажки ждут её и в немой сцене); `prores4444` — `prores` и альфа `yuva444p10le`. Затем
 * размеры (`mp4` — как Remotion для H.264, `h264Size`, L7; ProRes чётности не требует), fps
 * экспорта и длительность ± 1 кадр его fps.
 */
export function exportGate(probe: ProbeResult, request: ExportRequest, settings: Settings): string[] {
  const problems: string[] = [];
  if (request.format === "mp4") {
    if (probe.codec !== "h264") problems.push(`codec ${probe.codec}, ожидался h264`);
    if (probe.audioCodec !== "aac") problems.push(`audio ${probe.audioCodec ?? "нет дорожки"}, ожидалась дорожка aac`);
  } else {
    if (probe.codec !== "prores") problems.push(`codec ${probe.codec}, ожидался prores`);
    if (!PRORES_ALPHA.includes(probe.pixFmt ?? "")) problems.push(`pix_fmt ${probe.pixFmt ?? "неизвестен"}, ожидался yuva444p10le (альфа)`);
  }

  const size = (n: number) => (request.format === "mp4" ? h264Size(n, request.scale) : Math.round(n * request.scale));
  const width = size(settings.width);
  const height = size(settings.height);
  if (probe.width !== width) problems.push(`width ${probe.width}, ожидалось ${width}`);
  if (probe.height !== height) problems.push(`height ${probe.height}, ожидалось ${height}`);

  const { num, den } = exportFps(settings, request);
  if (probe.fps.num * den !== num * probe.fps.den) problems.push(`fps ${probe.fps.num}/${probe.fps.den}, ожидалось ${num}/${den}`);

  const frameMs = (1000 * den) / num;
  const expectedMs = exportDurationFrames(settings, request) * frameMs;
  // допуск 1 мкс на округление длительности в выводе ffprobe
  if (Math.abs(probe.durationMs - expectedMs) > frameMs + 0.001) {
    problems.push(`duration ${probe.durationMs} мс, ожидалось ${expectedMs.toFixed(3)} ± ${frameMs.toFixed(3)} мс`);
  }
  return problems;
}
