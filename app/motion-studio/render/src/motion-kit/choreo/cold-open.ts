// Cold-open (S3-fix2): крючок, а не спойлер. Судья снимал баллы за итог «серым призраком» с
// кадра 0 до удара («следствие показано раньше причины», bench-funnel 5,0, bench-abtest 5,5):
// приглушённый итог висит всё объяснение и обесценивает кульминацию. Теперь у итога три
// состояния, и ни в одном он не приглушён:
// - крючок (`hook`, бит `<id>-open` с кадра 0) — итог в полную силу, как заголовок новости,
//   с медленным наездом (кадр живой); к концу бита он уходит из кадра целиком (`exit`:
//   уменьшение, размытие, прозрачность);
// - объяснение (`gone`) — итога на экране нет совсем;
// - возврат (`return`, с удара payoff) — итог входит снова с отскоком масштаба, удар даёт
//   `Emphasis` фазы payoff.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties } from "react";
import { EASE, frames } from "../easing.js";
import { clamp01 } from "../internal.js";

type Window = Pick<Beat, "start_frame" | "end_frame">;

export interface ColdOpenFrame {
  phase: "hook" | "exit" | "gone" | "return";
  /** Прозрачность итога: 1 в крючке и после возврата, 0 на объяснении. */
  opacity: number;
  scale: number;
  /** Размытие на уходе, px. */
  blur: number;
}

/** Длительности крючка, кадры: уход в конце бита-крючка и вход возврата. */
export function coldOpenTiming(s: StyleBible, open: Window) {
  const len = Math.max(1, open.end_frame - open.start_frame);
  return {
    // уход — до 40 % бита (крючок читается не меньше 60 % своего окна)
    exit: Math.max(1, Math.min(frames(s, 12), Math.floor(len * 0.4))),
    back: Math.max(1, frames(s, 14)),
  };
}

/**
 * Кадр cold-open (чистая функция): `open` — бит-крючок `<id>-open`, `strike` — кадр удара
 * (старт бита payoff, где итог возвращается).
 */
export function coldOpenAt(frame: number, open: Window, strike: number, s: StyleBible): ColdOpenFrame {
  const T = coldOpenTiming(s, open);
  const exitAt = open.end_frame - T.exit;
  if (frame >= strike) {
    const u = clamp01((frame - strike) / T.back);
    // отскок: 1.08 → 1 с торможением, прозрачность набирается за первую половину входа
    return { phase: "return", opacity: clamp01(u * 2), scale: 1 + 0.08 * (1 - EASE.outQuart(u)), blur: 0 };
  }
  if (frame < exitAt) {
    // крючок: медленный наезд на 3 % за окно — итог живой, а не стоп-кадр
    const u = clamp01((frame - open.start_frame) / Math.max(1, exitAt - open.start_frame));
    return { phase: "hook", opacity: 1, scale: 1 + 0.03 * u, blur: 0 };
  }
  if (frame < open.end_frame) {
    const u = EASE.outQuart(clamp01((frame - exitAt) / T.exit));
    return { phase: "exit", opacity: 1 - u, scale: 1.03 - 0.09 * u, blur: 10 * u };
  }
  return { phase: "gone", opacity: 0, scale: 0.94, blur: 0 };
}

/** Стиль обёртки итога по кадру cold-open (opacity, scale, blur). */
export function coldOpenStyle(f: ColdOpenFrame): CSSProperties {
  return {
    opacity: Number(f.opacity.toFixed(4)),
    transform: f.scale === 1 ? undefined : `scale(${f.scale.toFixed(5)})`,
    filter: f.blur > 0.05 ? `blur(${f.blur.toFixed(2)}px)` : undefined,
    visibility: f.opacity <= 0.001 ? "hidden" : undefined,
  };
}
