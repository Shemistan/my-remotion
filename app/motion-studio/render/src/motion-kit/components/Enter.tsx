// Вход элемента по виду из spec (Element.entrance): каскад по index/total, кривая
// easing.enter стиля, у pop — пружина spring.pop с перелётом. С `exit` элемент уходит
// обратным движением по easing.exit за exit_frames до конца бита.
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { beatPhase } from "../beat.js";
import { type EnterDirection, type EnterKind, enterStyle } from "../choreo/enter.js";
import { staggerBeat } from "../choreo/stagger.js";
import { easingOf, springAt } from "../easing.js";
import { ramp } from "../internal.js";
import { useStyle } from "../style.js";

export interface EnterProps {
  kind: EnterKind;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Номер элемента в группе и размер группы: старт сдвигается на stagger_frames. */
  index?: number;
  total?: number;
  /** Сторона входа: rise и mask — снизу, slide — слева по умолчанию. */
  direction?: EnterDirection;
  /** Путь сдвига при amp = 1, px; по умолчанию 4.5 % высоты кадра. */
  distance?: number;
  /** Уйти в конце бита (последние exit_frames). */
  exit?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Виды, у которых свой вход в компоненте: при выходе они просто гаснут. */
const SELF_ANIMATED = new Set<EnterKind>(["type", "count", "draw", "none"]);

export function Enter({ kind, beat, index = 0, total = 1, direction, distance, exit = false, style, children }: EnterProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const w = staggerBeat(beat, index, total, s.motion.stagger_frames);
  const o = { amplitude: s.amplitude, distancePx: distance ?? Math.round(height * 0.045), direction };

  const p = kind === "pop"
    ? springAt(frame, fps, s, w.start_frame, "pop")
    : ramp(frame, w.start_frame, w.start_frame + s.motion.enter_frames, easingOf(s, "enter"));
  let anim = enterStyle(kind, p, o);

  if (exit) {
    const phase = beatPhase(frame, w, { enter: s.motion.enter_frames, exit: s.motion.exit_frames });
    if (phase === "exit" || phase === "after") {
      const len = Math.min(s.motion.exit_frames, (w.end_frame - w.start_frame) / 2);
      const q = ramp(frame, w.end_frame - len, w.end_frame, easingOf(s, "exit"));
      // выход — тот же вид в обратную сторону (pop уходит масштабом, без второго перелёта)
      anim = SELF_ANIMATED.has(kind) ? { opacity: 1 - q } : enterStyle(kind === "pop" ? "scale" : kind, 1 - q, o);
      if (q >= 1) anim = { ...anim, opacity: 0 };
    }
  }

  return <div style={{ ...style, ...anim }}>{children}</div>;
}
