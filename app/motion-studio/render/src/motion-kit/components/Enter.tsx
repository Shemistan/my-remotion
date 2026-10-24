// Вход элемента по виду из spec (Element.entrance): каскад по index/total, кривая
// easing.enter стиля, у pop — пружина spring.pop с перелётом. С `exit` элемент уходит
// обратным движением по easing.exit за exit_frames до конца бита.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { Freeze, useCurrentFrame, useVideoConfig } from "remotion";
import { beatPhase } from "../beat.js";
import { type EnterDirection, type EnterKind, type EnterPre, enterStyle, posterAlpha, posterStyle, splitBoxStyle, textPosterOk, underlayFade } from "../choreo/enter.js";
import { staggerBeat } from "../choreo/stagger.js";
import { EASE, easingOf, fpsFrames, frames, springAt } from "../easing.js";
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
  /** Длительность входа, кадры при 30 fps (× fps и интенсивность); по умолчанию enter_frames, у mask — 14…18 кадров. */
  duration?: number;
  /** Уйти в конце бита (последние exit_frames). */
  exit?: boolean;
  /**
   * До входа (0.4.0): `hidden` (по умолчанию) — пусто; `silhouette` — каркас итогового вида
   * блока (Freeze на конце бита): формы резкие и обесцвеченные на 30 %, текст не рисуется;
   * `ghost` — итоговый вид с текстом на 18 %. С начала бита блок входит своим видом (тот же
   * элемент — раскладка не прыгает), а постер лежит под ним и гаснет за первую треть входа:
   * бит с кадра 0 тоже даёт кадр-постер. Работает и для детей со своим входом
   * (AnimatedNumber, графики, ComparisonSplit): `kind="none"`.
   */
  pre?: EnterPre;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Виды, у которых свой вход в компоненте: при выходе они просто гаснут. */
const SELF_ANIMATED = new Set<EnterKind>(["type", "count", "draw", "none"]);

/**
 * Длительность входа, кадры: `duration` (при 30 fps), у `mask` — 16 кадров × интенсивность
 * в пределах 14…18 (при 30 fps): короткая шторка с мягкой кромкой читается целиком, а не
 * режет строку полсекунды; остальные — `enter_frames` стиля.
 */
export function enterDuration(kind: EnterKind, s: StyleBible, duration?: number): number {
  if (duration !== undefined) return frames(s, duration);
  if (kind === "mask") return Math.min(fpsFrames(s, 18), Math.max(fpsFrames(s, 14), frames(s, 16)));
  return s.motion.enter_frames;
}

export function Enter({ kind, beat, index = 0, total = 1, direction, distance, duration, exit = false, pre: preIn = "hidden", style, children }: EnterProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const w = staggerBeat(beat, index, total, s.motion.stagger_frames);
  // текст-«призрак» — только у опоры открытия; поздний текст (вывод) — каркас без текста
  const pre: EnterPre = preIn === "ghost" && !textPosterOk(w.start_frame, fps) ? "silhouette" : preIn;
  const o = { amplitude: s.amplitude, distancePx: distance ?? Math.round(height * 0.045), direction };

  // шторка (mask): быстрое открытие с долгим торможением — частично открытая строка видна
  // считанные кадры, мягкая кромка и подъём скрывают срез
  const len = enterDuration(kind, s, duration);
  const p = kind === "pop"
    ? springAt(frame, fps, s, w.start_frame, "pop")
    : ramp(frame, w.start_frame, w.start_frame + len, kind === "mask" ? EASE.outCubic : easingOf(s, "enter"));
  let anim = enterStyle(kind, p, o);

  if (exit) {
    const phase = beatPhase(frame, w, { enter: s.motion.enter_frames, exit: s.motion.exit_frames });
    if (phase === "exit" || phase === "after") {
      const out = Math.min(s.motion.exit_frames, (w.end_frame - w.start_frame) / 2);
      const q = ramp(frame, w.end_frame - out, w.end_frame, easingOf(s, "exit"));
      // выход — тот же вид в обратную сторону (pop уходит масштабом, без второго перелёта)
      anim = SELF_ANIMATED.has(kind) ? { opacity: 1 - q } : enterStyle(kind === "pop" ? "scale" : kind, 1 - q, o);
      if (q >= 1) anim = { ...anim, opacity: 0 };
    }
  }

  if (pre === "hidden") return <div style={{ ...style, ...anim }}>{children}</div>;
  // постер: тот же блок в итоговом виде (Freeze на конце бита) в одной ячейке сетки с живым —
  // до старта он один, на входе лежит под живым и гаснет за треть входа (под сдвигающим — за 1/6) (бит с кадра 0
  // тоже даёт кадр-постер, на смене нет провала). Сетка — на всех кадрах: раскладка не прыгает
  const under = posterAlpha(pre, frame, w.start_frame, underlayFade(kind, len));
  const { outer, inner } = splitBoxStyle(style);
  return (
    <div style={{ ...outer, display: "grid" }}>
      {under > 0 ? (
        <div aria-hidden style={{ ...inner, gridArea: "1 / 1", ...posterStyle(pre, 0), opacity: under }}>
          <Freeze frame={Math.max(w.end_frame, w.start_frame + len)}>{children}</Freeze>
        </div>
      ) : null}
      {frame >= w.start_frame ? <div style={{ ...inner, gridArea: "1 / 1", ...anim }}>{children}</div> : null}
    </div>
  );
}
