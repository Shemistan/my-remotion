import { z } from "zod";

const Us = z.number().int().nonnegative();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Ratio = z.number().min(0).max(1);
const EPS = 1e-9;

/** Прямоугольник в долях кадра, начало слева сверху; целиком внутри кадра. */
export const NormRectSchema = z.object({
  x: Ratio,
  y: Ratio,
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
}).strict().refine((r) => r.x + r.w <= 1 + EPS && r.y + r.h <= 1 + EPS, { message: "прямоугольник выходит за кадр" });
export type NormRect = z.infer<typeof NormRectSchema>;

/** Зоны размещения анимации в кадре (геометрия — `ZONE_RECTS`, Task 30). */
export const ZoneSchema = z.enum([
  "left_third", "right_third", "top_band", "lower_third", "full", "split_left", "split_right", "pip_tl", "pip_tr", "pip_bl", "pip_br",
]);
export type Zone = z.infer<typeof ZoneSchema>;

export const AuthorPositionSchema = z.enum(["left", "center", "right", "absent", "mixed"]);
export const CameraMotionSchema = z.enum(["static", "handheld", "moving"]);

/** Шот исходника: лицо/руки — по детектору (минимум 3 ключевых кадра), свободные зоны — код. */
export const FootageShotSchema = z.object({
  id: z.string().min(1),
  source_start_us: Us,
  source_end_us: Us,
  keyframes: z.array(z.object({ us: Us, path: z.string().min(1) }).strict()),
  face: z.object({
    union: NormRectSchema.optional(),
    detected_ratio: Ratio,
    source: z.enum(["vision", "llm"]),
  }).strict(),
  hands: z.object({
    union: NormRectSchema.optional(),
    detected_ratio: Ratio,
  }).strict(),
  occupied: z.array(NormRectSchema),
  free_zones: z.array(z.object({ zone: ZoneSchema, rect: NormRectSchema, free_ratio: Ratio }).strict()),
  author_position: AuthorPositionSchema,
  motion: CameraMotionSchema,
  objects: z.array(z.object({ label: z.string().min(1), rect: NormRectSchema.optional(), important: z.boolean() }).strict()),
  notes: z.string(),
  uncertainty: z.array(z.string()),
}).strict().refine((s) => s.source_start_us < s.source_end_us, { message: "пустой шот", path: ["source_end_us"] });
export type FootageShot = z.infer<typeof FootageShotSchema>;

export const FootageAnalysisSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().min(1),
  media_sha256: Sha256,
  mode: z.enum(["vision+llm", "vision", "llm_only"]),
  shots: z.array(FootageShotSchema),
}).strict();
export type FootageAnalysis = z.infer<typeof FootageAnalysisSchema>;
