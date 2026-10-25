// Видеосцена (Phase 4–6, ADR 0009): сцена плана видеопроекта генерируется тем же
// `playground.generate` со входом `video` (Р-V1). Размещение — на весь кадр, `fullscreen`
// непрозрачный, остальные прозрачные, графика в `layout.rect` (Р-V5). Длительность — только из
// плана (Р-V6). Время — кадры `timeline_fps` через `usToFrame`/`usToFrameCeil`.
import { z } from "zod";
import { type NormRect, NormRectSchema, ZONE_RECTS, type Zone, ZoneSchema } from "./footage.js";
import { PlannedCompositionModeSchema, type ScenePlanItem } from "./plan.js";
import { ProjectStyleBaseSchema } from "./project-style.js";
import { ScriptPackageFileSchema } from "./script.js";
import { type Fps, FpsSchema, usToFrame } from "./time.js";
import { usToFrameCeil } from "./timecode.js";

const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Int0 = z.number().int().nonnegative();
const Us = z.number().int().nonnegative();

export type PlannedCompositionMode = z.infer<typeof PlannedCompositionModeSchema>;

/** Размещение сцены в кадре ролика: режим и зона плана, прямоугольник графики, прозрачность холста. */
export const PlacementSchema = z.object({
  mode: PlannedCompositionModeSchema,
  zone: ZoneSchema,
  rect: NormRectSchema,
  transparent: z.boolean(),
}).strict();
export type Placement = z.infer<typeof PlacementSchema>;

/** Р-V5: холст на весь кадр; `fullscreen` — непрозрачный, остальные — прозрачные; rect — зоны, если не задан. */
export function placementFor(mode: PlannedCompositionMode, zone: Zone, rect?: NormRect): Placement {
  return { mode, zone, rect: rect ?? ZONE_RECTS[zone], transparent: mode !== "fullscreen" };
}

/**
 * Путь в хранилище из входа задачи (fix I4): относительный, POSIX, без `..`, без абсолютного
 * пути и диска Windows, без `\\` — дальше его резолвят от корня хранилища.
 */
export function isStoreRel(p: string): boolean {
  return p !== "" && !p.startsWith("/") && !/^[A-Za-z]:/.test(p) && !p.includes("\\") && !p.includes("\0") && p.split("/").every((s) => s !== ".." && s !== "");
}
const StoreRel = z.string().min(1).refine(isStoreRel, "путь в хранилище: относительный, без `..` и абсолютного");

/** Ключевой момент сцены: кадр от начала сцены, когда звучит слово (раскрытие не раньше слова). */
const KeyMomentSchema = z.object({ text: z.string().min(1), value: z.number().optional(), frame: Int0 }).strict();

/** Вход `video` у `playground.generate` (по образцу `ScriptSceneContextSchema`). */
export const VideoSceneContextSchema = z.object({
  project_id: Id,
  plan_id: Id,
  plan_revision: Revision,
  item_id: Id,
  style: ProjectStyleBaseSchema,
  /** Кадры до начала речи сцены и после её конца (`videoSceneWindow`). */
  lead_frames: Int0,
  tail_frames: Int0,
  placement: PlacementSchema,
  /** Рамка лица автора в окне сцены (доли кадра) — графика её не закрывает. */
  face: NormRectSchema.optional(),
  key_moments: z.array(KeyMomentSchema).optional(),
  /** Кадр исходника под сценой (путь в хранилище) — контекст для Director и Visual QA. */
  context_frame_rel: StoreRel.optional(),
  /**
   * Ключевые кадры анализа видеоряда в окне исходника сцены (fix I2): `frame` — кадр сцены от её
   * начала, ближайший ко времени ключевого кадра; композит берёт ближайший к своему кадру.
   */
  context_frames: z.array(z.object({ frame: Int0, rel: StoreRel }).strict()).optional(),
}).strict();
export type VideoSceneContext = z.infer<typeof VideoSceneContextSchema>;

/** Длительность видеосцены — только план (Р-V6): `frames.end − frames.start`. */
export function videoSceneFrames(item: Pick<ScenePlanItem, "frames">): number {
  return item.frames.end - item.frames.start;
}

/** Ключевые слова сцены в кадрах от её начала; слова вне `[0, длительность)` отбрасываются. */
export function videoKeyMoments(item: Pick<ScenePlanItem, "frames" | "key_terms">, fps: Fps): { text: string; frame: number }[] {
  const duration = videoSceneFrames(item);
  return item.key_terms
    .map((k) => ({ text: k.text, frame: usToFrame(k.edited_at_us, fps) - item.frames.start }))
    .filter((k) => k.frame >= 0 && k.frame < duration);
}

/**
 * Запас сцены вокруг речи: `lead` — от начала сцены до кадра начала первой цитаты `evidence`,
 * `tail` — от кадра конца последней цитаты (вверх) до конца сцены; оба не меньше 0.
 */
export function videoSceneWindow(item: Pick<ScenePlanItem, "frames" | "evidence">, fps: Fps): { lead: number; tail: number } {
  const start = Math.min(...item.evidence.map((e) => e.edited.start_us));
  const end = Math.max(...item.evidence.map((e) => e.edited.end_us));
  return {
    lead: Math.max(0, usToFrame(start, fps) - item.frames.start),
    tail: Math.max(0, item.frames.end - usToFrameCeil(end, fps)),
  };
}

const UsRange = z.object({ start_us: Us, end_us: Us }).strict();

/** `package-manifest.json` папки клипов видеопроекта (Phase 5-lite, Р-V9; как `ScriptPackageManifestSchema`). */
export const VideoPackageManifestSchema = z.object({
  schema_version: z.literal(1),
  package_id: Id,
  project_id: Id,
  project_title: z.string(),
  /** Имя папки для человека; каталог на диске — `package_id`. */
  name: z.string().min(1),
  fps: FpsSchema,
  edl: z.object({ id: Id, revision: Revision }).strict(),
  plan: z.object({ id: Id, revision: Revision }).strict(),
  scenes: z.array(z.object({
    n: z.number().int().positive(),
    item_id: Id,
    scene_id: Id,
    version_id: Id,
    version_number: z.number().int().positive(),
    /** Версия с валидным Approval C; иначе — текущая (папка собирается и без C, помечено). */
    approved: z.boolean(),
    /** Таймкоды: исходник и смонтированный ролик (µs), кадры сцены на таймлайне. */
    source: UsRange,
    edited: UsRange,
    frames: z.object({ start: Int0, end: Int0 }).strict(),
    quote: z.string(),
    mode: PlannedCompositionModeSchema,
    zone: ZoneSchema,
    mp4: ScriptPackageFileSchema,
    /** Альфы нет (fullscreen или экспорт не удался) — null, причина в `missing`. */
    alpha: ScriptPackageFileSchema.nullable(),
    warnings: z.array(z.string()),
    // Task 5L: длительность файла версии в кадрах `fps` (≠ плану — замечание в шпаргалке).
    duration_frames: z.number().int().positive().optional(),
    // Task 5L fix: куски исходника под окном клипа по `timeline_clips` ревизии `edl` (значимые, по порядку).
    source_pieces: z.array(UsRange).optional(),
  }).strict()),
  missing: z.array(z.object({
    item_id: Id, quote: z.string().optional(), reason: z.string().min(1), detail: z.string().optional(),
    // Task 5L: номер сцены и таймкоды — строка «не вошли» в шпаргалке на своём месте ролика.
    n: z.number().int().positive().optional(),
    source: UsRange.optional(),
    frames: z.object({ start: Int0, end: Int0 }).strict().optional(),
    source_pieces: z.array(UsRange).optional(),
  }).strict()),
  created_at: z.string().datetime(),
}).strict();
export type VideoPackageManifest = z.infer<typeof VideoPackageManifestSchema>;
