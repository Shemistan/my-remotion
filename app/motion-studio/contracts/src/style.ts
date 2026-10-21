import { z } from "zod";
import { IntensitySchema } from "./settings.js";

export const FontRefSchema = z.object({
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900).optional(),
  file: z.string().min(1).optional(),
}).strict();

const Bezier = z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]);
const Spring = z.object({
  damping: z.number().positive(),
  stiffness: z.number().positive(),
  mass: z.number().positive(),
}).strict();
const Frames = z.number().int().nonnegative();

/** Стилевая библия (06-motion-engine §4). ShadowToken — CSS box-shadow строкой. */
export const StyleBibleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  palette: z.object({
    bg: z.string(), surface: z.string(), text: z.string(), muted: z.string(),
    accent: z.array(z.string()).min(1), positive: z.string(), negative: z.string(),
  }).strict(),
  typography: z.object({
    display: FontRefSchema, body: FontRefSchema, mono: FontRefSchema,
    scale: z.array(z.number().positive()).min(1),
    tracking: z.record(z.number()),
  }).strict(),
  grid: z.object({
    columns: z.number().int().positive(),
    gutter: z.number().nonnegative(),
    safe_area: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  }).strict(),
  surfaces: z.object({
    radius: z.array(z.number().nonnegative()),
    elevation: z.array(z.string()),
  }).strict(),
  motion: z.object({
    intensity: IntensitySchema,
    easing: z.object({ enter: Bezier, exit: Bezier, emphasis: Bezier }).strict(),
    spring: z.record(Spring),
    stagger_frames: Frames,
    enter_frames: Frames,
    exit_frames: Frames,
  }).strict(),
  camera: z.object({
    allow_zoom: z.boolean(),
    max_scale: z.number().min(1),
    parallax: z.boolean(),
  }).strict(),
}).strict();
export type StyleBible = z.infer<typeof StyleBibleSchema>;
