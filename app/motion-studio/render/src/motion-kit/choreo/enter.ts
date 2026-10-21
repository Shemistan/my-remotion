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

/** Ширина мягкой кромки шторки `mask` — доля высоты (ширины) блока. */
export const MASK_FEATHER = 0.4;

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
      // шторка с мягкой кромкой (MASK_FEATHER блока): видимая часть растёт от стороны входа,
      // текст при этом чуть поднимается и проявляется — ни «обрезков» глифов на старте,
      // ни жёсткого среза строки. Когда открыта — маски нет, иначе она срезала бы всё,
      // что выходит за блок (подчёркивание, свечение)
      if (p >= 1) return {};
      const dir = o.direction ?? "down";
      const to = dir === "down" ? "top" : dir === "up" ? "bottom" : dir === "left" ? "right" : "left";
      const q = c01(p);
      const F = MASK_FEATHER * 100;
      const img = `linear-gradient(to ${to}, #000 ${n(q * (100 + F) - F)}%, transparent ${n(q * (100 + F))}%)`;
      return { opacity: n(c01(p * 1.6)), transform: offset(dir, rest * o.distancePx * 0.35 * amp), maskImage: img, WebkitMaskImage: img };
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

/** Вид элемента до входа: `hidden` — пусто; `ghost` — резкий и приглушённый; `silhouette` — размытая форма. */
export type EnterPre = "hidden" | "ghost" | "silhouette";

/** Прозрачность силуэта / призрака до входа (15–25 %). */
export const PRE_ALPHA: Readonly<Record<EnterPre, number>> = { hidden: 0, ghost: 0.18, silhouette: 0.22 };
/** Размытие силуэта до входа, px: форма читается, глифы — нет. */
export const PRE_BLUR = 8;

/**
 * Стиль входа с видом до входа (`pre`): прозрачность не опускается ниже силуэта (вход
 * поднимает её от PRE_ALPHA до 1 без провала), у silhouette размытие и обесцвечивание уходят
 * по ходу входа; у mask нераскрытая часть остаётся силуэтом. `hidden` — enterStyle как есть.
 */
export function preStyle(kind: EnterKind, p: number, pre: EnterPre, o: EnterOptions): CSSProperties {
  const base = enterStyle(kind, p, o);
  if (pre === "hidden") return { ...base, opacity: base.opacity ?? (p > 0 || SELF_DRAWN.has(kind) ? 1 : 0) };
  const floor = PRE_ALPHA[pre];
  const op = typeof base.opacity === "number" ? base.opacity : 1;
  const out: CSSProperties = { ...base, opacity: n(floor + (1 - floor) * c01(op)) };
  if (typeof base.maskImage === "string") {
    const img = base.maskImage.replace("transparent", `rgba(0, 0, 0, ${floor})`);
    out.maskImage = img;
    out.WebkitMaskImage = img;
  }
  if (pre === "silhouette") {
    const q = c01(1 - p);
    const own = typeof base.filter === "string" ? `${base.filter} ` : "";
    if (q > 0.001) out.filter = `${own}blur(${n(PRE_BLUR * q)}px) grayscale(${n(q)})`;
  }
  return out;
}

/** Виды, которые рисует сам компонент (type, count, draw, none): enterStyle для них пуст. */
const SELF_DRAWN = new Set<EnterKind>(["type", "count", "draw", "none"]);
