// Входы элементов (Element.entrance): стиль по доле входа p (0 → 1). p от пружины может
// перелететь за 1 — rise, slide, scale и pop тогда проскакивают и возвращаются.
// Чистая функция — p считает вызывающий: <Enter> (easing.enter, пружина pop), Card, свои
// блоки сцены. type / count / draw рисует сам компонент (KineticText, AnimatedNumber,
// LineChart, FlowGraph) — здесь для них пустой стиль.
import type { Element } from "@ms/contracts";
import type { CSSProperties } from "react";

export type EnterKind = Element["entrance"];
/** Сторона, с которой элемент входит. */
export type EnterDirection = "up" | "down" | "left" | "right";

export interface EnterOptions {
  /** Амплитуда стиля (интенсивность): 0.6 calm … 1.35 energetic. */
  amplitude: number;
  /** Путь сдвига при amp = 1, px. */
  distancePx: number;
  /** rise и mask — по умолчанию снизу, slide — слева. */
  direction?: EnterDirection;
}

/** Ширина мягкой кромки шторки `mask`, px. */
export const MASK_FEATHER_PX = 10;

const n = (v: number) => Number(v.toFixed(4));
const c01 = (v: number) => Math.max(0, Math.min(1, v));

function offset(dir: EnterDirection, d: number): string {
  if (dir === "left") return `translateX(${n(-d)}px)`;
  if (dir === "right") return `translateX(${n(d)}px)`;
  if (dir === "up") return `translateY(${n(-d)}px)`;
  return `translateY(${n(d)}px)`;
}

export function enterStyle(kind: EnterKind, p: number, o: EnterOptions): CSSProperties {
  const amp = o.amplitude;
  const rest = 1 - p;
  switch (kind) {
    case "fade":
      return { opacity: n(c01(p)) };
    case "rise": {
      // подъём: прозрачность набирается быстрее пути — элемент виден, пока ещё едет
      const dir = o.direction === "up" ? "up" : "down";
      return { opacity: n(c01(p * 1.6)), transform: offset(dir, rest * o.distancePx * amp) };
    }
    case "slide": {
      const dir = o.direction ?? "left";
      return { opacity: n(c01(p * 1.6)), transform: offset(dir, rest * o.distancePx * amp) };
    }
    case "scale":
      return { opacity: n(c01(p * 1.6)), transform: `scale(${n(1 - 0.08 * amp * rest)})` };
    case "mask": {
      // шторка с мягкой кромкой (MASK_FEATHER_PX): видимая часть растёт от стороны входа,
      // текст при этом чуть поднимается и проявляется — ни «обрезков» глифов на старте,
      // ни жёсткого среза строки. Когда открыта — маски нет, иначе она срезала бы всё,
      // что выходит за блок (подчёркивание, свечение)
      if (p >= 1) return {};
      const dir = o.direction ?? "down";
      const to = dir === "down" ? "top" : dir === "up" ? "bottom" : dir === "left" ? "right" : "left";
      const q = c01(p);
      const F = MASK_FEATHER_PX;
      const edge = (px: number) => `calc(${n(q * 100)}% + ${n(px)}px)`;
      const img = `linear-gradient(to ${to}, #000 ${edge(q * F - F)}, transparent ${edge(q * F)})`;
      return { opacity: n(c01(p * 2.5)), transform: offset(dir, rest * o.distancePx * 0.35 * amp), maskImage: img, WebkitMaskImage: img };
    }
    case "blur":
      return { opacity: n(c01(p * 1.25)), filter: `blur(${n(c01(rest) * 12 * amp)}px)` };
    case "pop": {
      // p — пружина pop с перелётом: масштаб проскакивает 1 и возвращается
      const sc = 1 - 0.5 * rest * Math.min(1, amp);
      return { opacity: n(c01(p * 2)), transform: `scale(${n(Math.max(0, sc))})` };
    }
    default:
      // none — без анимации; type / count / draw — анимирует компонент
      return {};
  }
}
