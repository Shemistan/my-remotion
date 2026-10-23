// Прокси для монтажа и превью (Task 25): H.264 veryfast CRF 23, короткая сторона 720 (без
// увеличения), CFR на `timeline_fps` проекта, GOP 2·fps, AAC 128k 48 кГц с выравниванием звука
// к нулю, faststart, длительность не больше исходника (`-t`). Поворот применяет автоповорот
// ffmpeg — прокси в отображаемой ориентации.
import type { ProbeSummary } from "@ms/contracts";

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export function proxyArgs(input: string, out: string, probe: ProbeSummary, shortSide: number): string[] {
  const { display_width: w, display_height: h } = probe.video;
  const side = even(Math.min(shortSide, Math.min(w, h)));
  const scale = w >= h ? `scale=-2:${side}` : `scale=${side}:-2`;
  const fps = probe.timeline_fps;
  const gop = Math.max(1, Math.round((2 * fps.num) / fps.den));
  return [
    "-protocol_whitelist", "file", "-i", `file:${input}`,
    "-map", "0:v:0",
    ...(probe.audio ? ["-map", "0:a:0"] : []),
    "-vf", `${scale},format=yuv420p`,
    "-fps_mode", "cfr", "-r", `${fps.num}/${fps.den}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", String(gop),
    ...(probe.audio ? ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-af", "aresample=async=1:first_pts=0"] : []),
    // CFR-конверсия VFR добивает кадры за концом последнего кадра: длительность — как у исходника
    "-t", (probe.duration_us / 1e6).toFixed(6),
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    "-n", out,
  ];
}
