import { z } from "zod";
import { FpsSchema } from "./time.js";

const Us = z.number().int().nonnegative();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Px = z.number().int().positive();

/** Сводка ffprobe исходника. `timeline_fps` — `snapFps(avg_frame_rate)`; `display_*` — с учётом поворота. */
export const ProbeSummarySchema = z.object({
  container: z.string().min(1),
  duration_us: Us,
  size_bytes: z.number().int().nonnegative(),
  start_time_us: z.number().int(),
  video: z.object({
    codec: z.string().min(1),
    width: Px,
    height: Px,
    display_width: Px,
    display_height: Px,
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    r_frame_rate: FpsSchema,
    avg_frame_rate: FpsSchema,
    pix_fmt: z.string().min(1),
    bit_depth: z.number().int().positive().optional(),
  }).strict(),
  audio: z.object({
    codec: z.string().min(1),
    sample_rate: z.number().int().positive(),
    channels: z.number().int().positive(),
  }).strict().optional(),
  vfr: z.boolean(),
  timeline_fps: FpsSchema,
}).strict();
export type ProbeSummary = z.infer<typeof ProbeSummarySchema>;

/** Исходник проекта (один на проект, ТЗ §1.2). `rel_path` — от корня хранилища, копия `0444`. */
export const MediaAssetSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  original_name: z.string().min(1),
  rel_path: z.string().min(1),
  sha256: Sha256,
  size_bytes: z.number().int().nonnegative(),
  probe: ProbeSummarySchema,
  status: z.enum(["ready", "failed"]),
  import: z.object({
    method: z.enum(["path", "upload"]),
    source_path: z.string().min(1).optional(),
    cloned: z.boolean(),
  }).strict(),
  created_at: z.string().datetime(),
}).strict();
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const DerivativeKindSchema = z.enum(["proxy", "waveform", "thumbs", "audio16k"]);
export type DerivativeKind = z.infer<typeof DerivativeKindSchema>;

/** Медиа-манифест (иммутабельная ревизия артефакта): исходник и производные с параметрами. */
export const MediaManifestSchema = z.object({
  schema_version: z.literal(1),
  asset: MediaAssetSchema,
  derivatives: z.array(z.object({
    kind: DerivativeKindSchema,
    path: z.string().min(1),
    sha256: Sha256,
    params: z.record(z.unknown()),
  }).strict()),
}).strict();
export type MediaManifest = z.infer<typeof MediaManifestSchema>;
