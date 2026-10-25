// Финал видеопроекта (Phase 5, Task 35′; поля проверки — Task 44 редакции 2026-10-21): настройки
// экспорта (F10), размер и CRF, `final-manifest.json` и `verify.json`. Финал — MP4 H.264/AAC
// `yuv420p`, 48 кГц, 192 кбит/с, одна композиция Remotion (ADR 0010).
import { z } from "zod";
import { ProbeResultSchema } from "./export.js";
import { RenderEnvSchema, Sha256Schema } from "./manifest.js";
import { FpsSchema } from "./time.js";

const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Int0 = z.number().int().nonnegative();

export const FinalResolutionSchema = z.enum(["source", "2160p", "1080p", "720p"]);
export type FinalResolution = z.infer<typeof FinalResolutionSchema>;
export const FinalQualitySchema = z.enum(["high", "standard", "draft"]);
export type FinalQuality = z.infer<typeof FinalQualitySchema>;

/** Настройки экспорта финала; `fps` не задан — `timeline_fps` (F8). Хеш — субъект final (Р-V4). */
export const FinalExportRequestSchema = z.object({
  fps: FpsSchema.optional(),
  resolution: FinalResolutionSchema,
  quality: FinalQualitySchema,
  audio_bitrate_kbps: z.literal(192),
}).strict();
export type FinalExportRequest = z.infer<typeof FinalExportRequestSchema>;

const CRF: Record<FinalQuality, number> = { high: 16, standard: 20, draft: 24 };

/** CRF x264 по качеству: 16 / 20 / 24. */
export function crfFor(q: FinalQuality): number {
  return CRF[q];
}

const SHORT_SIDE: Record<Exclude<FinalResolution, "source">, number> = { "2160p": 2160, "1080p": 1080, "720p": 720 };
const even = (v: number): number => Math.max(2, 2 * Math.round(v / 2));

/**
 * Размер выхода: `source` — размер отображения исходника как есть; иначе короткая сторона = 2160 /
 * 1080 / 720, длинная — пропорционально, обе чётные (`yuv420p`).
 */
export function outputSize(display: { width: number; height: number }, res: FinalResolution): { width: number; height: number } {
  if (res === "source") return { width: display.width, height: display.height };
  const short = Math.min(display.width, display.height);
  const k = SHORT_SIDE[res] / short;
  return { width: even(display.width * k), height: even(display.height * k) };
}

const InputRef = z.object({ id: Id, revision: Revision, hash: Sha256Schema }).strict();

/** `final-manifest.json`: входы с хешами, настройки, выход, окружение рендера и итог проверки. */
export const FinalManifestSchema = z.object({
  schema_version: z.literal(1),
  export_id: Id,
  project_id: Id,
  timeline: InputRef,
  inputs: z.object({
    edl: InputRef,
    plan: InputRef,
    style: InputRef,
    media_sha256: Sha256Schema,
    master_sha256: Sha256Schema,
    audio_sha256: Sha256Schema,
    scenes: z.array(z.object({ clip_id: Id, version_id: Id, manifest_sha256: Sha256Schema }).strict()),
  }).strict(),
  request: FinalExportRequestSchema,
  output: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), fps: FpsSchema, frames: z.number().int().positive() }).strict(),
  render_env: RenderEnvSchema,
  /** `canonicalHash(inputs + request + render_env.render_lock_sha256)`. */
  inputs_hash: Sha256Schema,
  ffprobe: ProbeResultSchema,
  verify: z.object({ verdict: z.enum(["pass", "fail"]), report: z.literal("verify.json") }).strict(),
  created_at: z.string().datetime(),
}).strict();
export type FinalManifest = z.infer<typeof FinalManifestSchema>;

/**
 * `verify.json` (Task 44): ffprobe-гейт, длительность в кадрах, рассинхрон речи по словам, кадры
 * исходника и сцен (PSNR, смещение выравнивания), громкость. `fail`, если любая проверка не прошла;
 * `failures` — имена проверок (`probe`, `duration`, `sync`, `frames`, `loudness`).
 */
export const FinalVerifyReportSchema = z.object({
  probe: z.array(z.string()),
  duration: z.object({ expected_frames: Int0, actual_us: Int0, delta_frames: z.number().int() }).strict(),
  sync: z.array(z.object({ word_id: Id, offset_us: z.number().int() }).strict()),
  frames: z.array(z.object({
    frame: Int0,
    kind: z.enum(["source", "scene"]),
    clip_id: Id.optional(),
    psnr_db: z.number(),
    offset: z.union([z.number().int(), z.literal("inconclusive")]),
  }).strict()),
  loudness: z.object({
    source_lufs: z.number(),
    final_lufs: z.number(),
    delta_lu: z.number(),
    final_peak_db: z.number(),
    source_peak_db: z.number(),
  }).strict(),
  verdict: z.enum(["pass", "fail"]),
  failures: z.array(z.string()),
}).strict();
export type FinalVerifyReport = z.infer<typeof FinalVerifyReportSchema>;
