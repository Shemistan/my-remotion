// Каскад: соседние элементы одной группы стартуют со сдвигом, конец бита общий.
import type { Beat } from "@ms/contracts";

type Window = Pick<Beat, "start_frame" | "end_frame">;

/**
 * Окно элемента `index` из `total`: старт сдвинут на index × staggerFrames. Разбег всей
 * группы не длиннее половины бита — последний элемент успевает войти. Старт целый и
 * не позже конца бита.
 */
export function staggerBeat(beat: Window, index: number, total: number, staggerFrames: number): Window {
  const len = beat.end_frame - beat.start_frame;
  if (len <= 0 || total <= 1 || index <= 0) return { start_frame: beat.start_frame, end_frame: beat.end_frame };
  const step = Math.min(Math.max(0, staggerFrames), (len * 0.5) / (total - 1));
  const start = Math.min(beat.start_frame + Math.round(Math.min(index, total - 1) * step), beat.end_frame - 1);
  return { start_frame: start, end_frame: beat.end_frame };
}
