// Синхронизация с битами MotionSpec: доля бита и фаза элемента по номеру кадра.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame } from "remotion";
import type { EasingFn } from "./easing.js";
import { useStyle } from "./style.js";

export type BeatWindow = Pick<Beat, "start_frame" | "end_frame">;
export type BeatPhase = "before" | "enter" | "hold" | "exit" | "after";

/** Доля бита 0..1 (clamp) с необязательным easing. Бит нулевой длины — ступенька. */
export function beatProgress(frame: number, beat: BeatWindow, easing?: EasingFn): number {
  const { start_frame: s, end_frame: e } = beat;
  if (e <= s) return frame >= s ? 1 : 0;
  const t = Math.min(1, Math.max(0, (frame - s) / (e - s)));
  return easing ? easing(t) : t;
}

/**
 * Фаза: before → enter (первые `enter` кадров) → hold → exit (последние `exit` кадров
 * бита) → after. Если вход и выход длиннее бита, они делят бит пропорционально.
 */
export function beatPhase(frame: number, beat: BeatWindow, w: { enter: number; exit: number }): BeatPhase {
  const { start_frame: s, end_frame: e } = beat;
  if (frame < s) return "before";
  if (frame >= e) return "after";
  const len = e - s;
  let enter = Math.max(0, w.enter);
  let exit = Math.max(0, w.exit);
  if (enter + exit > len) {
    const k = len / (enter + exit);
    enter *= k;
    exit *= k;
  }
  const rel = frame - s;
  if (rel < enter) return "enter";
  if (exit > 0 && rel >= len - exit) return "exit";
  return "hold";
}

export interface BeatState {
  /** Доля бита 0..1. */
  progress: number;
  phase: BeatPhase;
  /** Кадров от начала бита (может быть < 0 до бита). */
  local: number;
  /** Длина бита в кадрах. */
  length: number;
}

/** Состояние бита для текущего кадра; длины входа и выхода — из разрешённого стиля. */
export function useBeat(beat: BeatWindow): BeatState {
  const frame = useCurrentFrame();
  const s = useStyle();
  return {
    progress: beatProgress(frame, beat),
    phase: beatPhase(frame, beat, { enter: s.motion.enter_frames, exit: s.motion.exit_frames }),
    local: frame - beat.start_frame,
    length: beat.end_frame - beat.start_frame,
  };
}
