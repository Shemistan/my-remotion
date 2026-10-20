import type { z } from "zod";
import type { MotionSpecSchema } from "../src/index.js";

export type SpecInput = z.input<typeof MotionSpecSchema>;

export function baseSpec(): SpecInput {
  return {
    title: "Рост выручки",
    purpose: "Показать рост",
    duration_frames: 180,
    fps: { num: 30, den: 1 },
    style_preset: "dark-premium",
    elements: [
      { id: "title", kind: "text", role: "heading", entrance: "rise", content: { text: "Рост" } },
      { id: "chart", kind: "chart", role: "main", entrance: "draw", content: {}, layout: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 } },
    ],
    beats: [
      { id: "b1", start_frame: 0, end_frame: 60, action: "enter", description: "Заголовок", element_ids: ["title"] },
      { id: "b2", start_frame: 60, end_frame: 180, action: "draw", description: "График", element_ids: ["chart"] },
    ],
  };
}

type BeatInput = SpecInput["beats"][number];

export function specWith(over: Omit<Partial<SpecInput>, "beats"> & { beats?: Array<Partial<BeatInput>> }): unknown {
  const s = baseSpec();
  const { beats, ...rest } = over;
  const out: Record<string, unknown> = { ...s, ...rest };
  if (beats) out.beats = beats.map((b, i) => ({ ...s.beats[0]!, id: `x${i}`, ...b }));
  return out;
}
