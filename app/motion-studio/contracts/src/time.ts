import { z } from "zod";

export const FpsSchema = z.object({
  num: z.number().int().positive(),
  den: z.number().int().positive(),
}).strict();
export type Fps = z.infer<typeof FpsSchema>;

const US_PER_S = 1_000_000;

function checkFps(fps: Fps): void {
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw new RangeError(`fps должен быть дробью положительных целых: ${fps.num}/${fps.den}`);
  }
}

/** Микросекунды -> номер кадра (округление вниз). */
export function usToFrame(us: number, fps: Fps): number {
  checkFps(fps);
  if (!Number.isFinite(us) || us < 0) throw new RangeError(`us должно быть >= 0: ${us}`);
  return Math.floor((us * fps.num) / (fps.den * US_PER_S));
}

/** Номер кадра -> микросекунды начала кадра (округление к ближайшему). */
export function frameToUs(frame: number, fps: Fps): number {
  checkFps(fps);
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`frame должен быть целым >= 0: ${frame}`);
  return Math.round((frame * fps.den * US_PER_S) / fps.num);
}
