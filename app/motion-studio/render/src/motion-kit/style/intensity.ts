// Интенсивность движения (ТЗ §8.2, 06 §4): одна ручка меняет темп и размах всей сцены.
// `time` — множитель длительностей в кадрах, `amplitude` — множитель смещений и перелётов.
import type { StyleBible } from "@ms/contracts";

export type Intensity = StyleBible["motion"]["intensity"];

export const INTENSITY: Readonly<Record<Intensity, { time: number; amplitude: number }>> = {
  calm: { time: 1.25, amplitude: 0.6 },
  balanced: { time: 1, amplitude: 1 },
  energetic: { time: 0.75, amplitude: 1.35 },
};

/** calm медленнее и мягче, energetic быстрее и резче. */
export function intensityScale(i: Intensity): { time: number; amplitude: number } {
  return INTENSITY[i] ?? INTENSITY.balanced;
}

/** Амплитуда стиля: у разрешённого стиля — своя, у сырого StyleBible — по интенсивности. */
export function amplitudeOf(s: StyleBible): number {
  const a = (s as { amplitude?: unknown }).amplitude;
  return typeof a === "number" && Number.isFinite(a) ? a : intensityScale(s.motion.intensity).amplitude;
}
