import { z } from "zod";
import { FpsSchema } from "./time.js";
import { StylePresetSchema } from "./settings.js";

const Fraction = z.number().min(0).max(1);
const Frame = z.number().int().nonnegative();

/** Переопределения палитры StyleBible: фиксированные необязательные ключи. */
export const PaletteOverridesSchema = z.object({
  bg: z.string(), surface: z.string(), text: z.string(), muted: z.string(),
  accent: z.array(z.string()).min(1), positive: z.string(), negative: z.string(),
}).partial().strict();

export const ElementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["text", "number", "chart", "graph", "card", "shape", "group"]),
  role: z.string().min(1),
  /** Вид входа (motion-kit enterStyle / <Enter>): type, count, draw анимирует сам компонент. */
  entrance: z.enum(["rise", "fade", "scale", "slide", "mask", "blur", "pop", "type", "draw", "count", "none"]),
  /** Слой параллакса: 0 — дальний (как камера), 2 — ближний. */
  depth_layer: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  content: z.record(z.unknown()),
  layout: z.object({ x: Fraction, y: Fraction, w: Fraction, h: Fraction }).strict()
    .refine((l) => l.x + l.w <= 1 + 1e-9 && l.y + l.h <= 1 + 1e-9, "layout выходит за кадр (x+w<=1, y+h<=1)")
    .optional(),
}).strict();
export type Element = z.infer<typeof ElementSchema>;

/**
 * Структура сцены (S3a): форма времени, по которой планировщик (`planBeats` kit) раскладывает
 * фазы в кадры. Нет поля — `build-strike` (сборка → действие → удар → удержание).
 */
export const SceneStructureSchema = z.enum(["build-strike", "cold-open", "continuous-flow", "split-reveal", "call-response", "count-up"]);
export type SceneStructure = z.infer<typeof SceneStructureSchema>;

export const PhaseRoleSchema = z.enum(["setup", "action", "turn", "payoff", "hold"]);
export type PhaseRole = z.infer<typeof PhaseRoleSchema>;

/** Чем живёт финал (фаза `hold`): режим удержания kit (`useHold`, S3b). */
export const HoldModeSchema = z.enum(["steady-flow", "repeat-result", "data-shimmer", "now-pulse", "settle-push"]);
export type HoldMode = z.infer<typeof HoldModeSchema>;

/** Фаза сцены: смысловая роль, вес (доля времени среди фаз) и её элементы. Кадров нет. */
export const PhaseSchema = z.object({
  id: z.string().min(1),
  role: PhaseRoleSchema,
  weight: z.number().positive().max(100),
  element_ids: z.array(z.string().min(1)),
  hold_mode: HoldModeSchema.optional(),
}).strict();
export type Phase = z.infer<typeof PhaseSchema>;

/**
 * Вид бита (S3a-fix): вход, длящийся (рисование, поток, фон), счёт, акцент, удержание.
 * Director знает намерение — пайплайн не гадает по имени действия; нет поля — `beatKind`.
 */
export const BeatKindSchema = z.enum(["enter", "sustain", "count", "accent", "hold"]);
export type BeatKind = z.infer<typeof BeatKindSchema>;

const BeatFields = {
  id: z.string().min(1),
  start_frame: Frame,
  end_frame: Frame,
  action: z.string().min(1),
  description: z.string(),
  element_ids: z.array(z.string().min(1)),
  /** Фаза бита: кадры бита ставит планировщик внутри окна фазы. */
  phase: z.string().min(1).optional(),
  /** `slot` — своя доля окна фазы по порядку битов (по умолчанию); `phase` — всё окно фазы. */
  span: z.enum(["slot", "phase"]).optional(),
  kind: BeatKindSchema.optional(),
};
export const BeatSchema = z.object(BeatFields).strict();
export type Beat = z.infer<typeof BeatSchema>;

/** Бит в ответе Director: при фазах кадры не пишутся — их ставит планировщик. */
export const DirectorBeatSchema = z.object({ ...BeatFields, start_frame: Frame.optional(), end_frame: Frame.optional() }).strict();
export type DirectorBeat = z.infer<typeof DirectorBeatSchema>;

/**
 * Композиционная идея сцены (Motion Director): архетип раскладки, фокус/движение камеры,
 * как сцена переходит из состояния в состояние. Пишется в spec.json для Engineer.
 */
export const TitleModeSchema = z.enum(["none", "kicker", "statement", "integrated", "strip"]);
export type TitleMode = z.infer<typeof TitleModeSchema>;

/**
 * Фон сцены для `<Background>` kit: вариант по смыслу, `focus` — где герой (доли кадра),
 * `seed` — раскладка пятен; пайплайн ставит id сцены, чтобы две сцены не делили одну карту света.
 */
export const SceneBackgroundSchema = z.object({
  variant: z.enum(["aurora", "spotlight", "blueprint", "grid", "paper", "solid"]).optional(),
  focus: z.object({ x: Fraction, y: Fraction }).strict().optional(),
  seed: z.string().min(1).optional(),
}).strict();
export type SceneBackground = z.infer<typeof SceneBackgroundSchema>;

export const CompositionSchema = z.object({
  archetype: z.enum(["centered-hero", "split", "diagonal", "full-bleed-data", "network-centric", "stacked", "orbit", "other"]),
  idea: z.string().min(1),
  focus: z.string(),
  transitions: z.string().min(1),
  /** Режим заголовка (`SceneTitle` kit): полоса сверху — лишь один из вариантов. */
  title_mode: TitleModeSchema.optional(),
  background: SceneBackgroundSchema.optional(),
  /** Форма времени сцены; нет — `build-strike`. */
  structure: SceneStructureSchema.optional(),
  /** Почему структура не та, что выбрал Concept (без причины пайплайн берёт структуру Concept). */
  structure_reason: z.string().min(1).optional(),
}).strict();
export type Composition = z.infer<typeof CompositionSchema>;

/** Ключ камеры: наезд `scale` (1 — без масштаба, меньше 1 нельзя) и точка интереса `x, y` (px от центра кадра). */
export const CameraKeySchema = z.object({
  frame: Frame,
  /** ≥ 1: отъезд меньше кадра не поддерживается (открылись бы края фона). */
  scale: z.number().min(1),
  x: z.number(),
  y: z.number(),
}).strict();
export type CameraKey = z.infer<typeof CameraKeySchema>;

const SpecFields = {
  title: z.string().min(1),
  purpose: z.string(),
  duration_frames: z.number().int().positive(),
  fps: FpsSchema,
  style_preset: StylePresetSchema,
  palette_overrides: PaletteOverridesSchema.optional(),
  composition: CompositionSchema.optional(),
  elements: z.array(ElementSchema).min(1),
  /** Фазы сцены (S3a): из них пайплайн ставит кадры битов. Нет — биты с кадрами Director. */
  phases: z.array(PhaseSchema).min(1).optional(),
  beats: z.array(BeatSchema).min(1),
  /** Движение камеры по ключам; без поля камера стоит. */
  camera: z.array(CameraKeySchema).optional(),
};

type SpecLike = {
  duration_frames: number;
  elements: { id: string }[];
  phases?: Phase[];
  beats: { id: string; start_frame?: number; end_frame?: number; element_ids: string[]; phase?: string }[];
  camera?: { frame: number }[];
};

/** Проверки ссылок и фаз — общие для spec и ответа Director. Кадры битов — только если заданы. */
function refineSpec(spec: SpecLike, ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  spec.elements.forEach((e, i) => {
    if (ids.has(e.id)) ctx.addIssue({ code: "custom", path: ["elements", i, "id"], message: `дубль id элемента: ${e.id}` });
    ids.add(e.id);
  });
  const phaseIds = new Set<string>();
  let holds = 0;
  spec.phases?.forEach((p, i) => {
    if (phaseIds.has(p.id)) ctx.addIssue({ code: "custom", path: ["phases", i, "id"], message: `дубль id фазы: ${p.id}` });
    phaseIds.add(p.id);
    if (p.role === "hold" && ++holds > 1) ctx.addIssue({ code: "custom", path: ["phases", i, "role"], message: "фаза hold — одна на сцену" });
    if (p.hold_mode && p.role !== "hold") ctx.addIssue({ code: "custom", path: ["phases", i, "hold_mode"], message: "hold_mode — только у фазы hold" });
    p.element_ids.forEach((id, j) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["phases", i, "element_ids", j], message: `неизвестный элемент: ${id}` });
    });
  });
  const beatIds = new Set<string>();
  spec.beats.forEach((b, i) => {
    if (beatIds.has(b.id)) ctx.addIssue({ code: "custom", path: ["beats", i, "id"], message: `дубль id бита: ${b.id}` });
    beatIds.add(b.id);
    if (b.phase !== undefined && !phaseIds.has(b.phase)) ctx.addIssue({ code: "custom", path: ["beats", i, "phase"], message: `неизвестная фаза: ${b.phase}` });
    if (b.start_frame !== undefined && b.end_frame !== undefined) {
      if (b.end_frame <= b.start_frame) {
        ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: "end_frame должен быть больше start_frame" });
      }
      if (b.end_frame > spec.duration_frames) {
        ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: `бит выходит за duration_frames (${spec.duration_frames})` });
      }
    }
    b.element_ids.forEach((id, j) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["beats", i, "element_ids", j], message: `неизвестный элемент: ${id}` });
    });
  });
  spec.camera?.forEach((k, i) => {
    if (k.frame > spec.duration_frames) {
      ctx.addIssue({ code: "custom", path: ["camera", i, "frame"], message: `ключ камеры за duration_frames (${spec.duration_frames})` });
    }
  });
}

export const MotionSpecSchema = z.object(SpecFields).strict().superRefine(refineSpec);
export type MotionSpec = z.infer<typeof MotionSpecSchema>;

/**
 * Spec в ответе Director. С `phases` биты идут без кадров (у каждого — `phase` или, для
 * бита вне фаз, оба кадра); кадры ставит пайплайн (`server/src/pipeline/beat-plan.ts`).
 * Без `phases` — прежний формат: кадры у всех битов.
 */
export const DirectorSpecSchema = z.object({ ...SpecFields, beats: z.array(DirectorBeatSchema).min(1) }).strict().superRefine((spec, ctx) => {
  refineSpec(spec, ctx);
  spec.beats.forEach((b, i) => {
    const framed = b.start_frame !== undefined && b.end_frame !== undefined;
    if (!framed && (!spec.phases || b.phase === undefined)) {
      ctx.addIssue({ code: "custom", path: ["beats", i], message: spec.phases ? "бит без фазы — нужны start_frame и end_frame" : "без phases у бита нужны start_frame и end_frame" });
    }
  });
});
export type DirectorSpec = z.infer<typeof DirectorSpecSchema>;

/** Структура сцены; старая spec без поля — `build-strike`. */
export function structureOf(spec: Pick<MotionSpec, "composition">): SceneStructure {
  return spec.composition?.structure ?? "build-strike";
}

/** Слова действия бита: через `-`, `_`, пробел, в нижнем регистре. */
export function actionWords(action: string): string[] {
  return action.toLowerCase().split(/[^a-zа-яё0-9]+/).filter(Boolean);
}

const ENTER_WORDS = new Set(["in", "entrance", "enter", "appear", "reveal"]);
const SUSTAIN_WORDS = new Set(["draw", "flow", "flows", "stream", "background", "bg", "loop", "idle", "travel", "run", "ambient"]);
const PAYOFF_WORDS = new Set(["final", "climax", "peak", "payoff", "strike"]);
/** Акцент по действию — подстрокой, как всегда считал specChecks (`final-emphasis`, `accentpulse`). */
const ACCENT_RE = /emphasis|accent/i;

/**
 * Вид бита: явный `kind` или по словам действия (целыми словами, а не подстрокой —
 * `upstream-in`, `account-card-in`, `threshold-in` — входы). Последнее слово in / entrance /
 * enter / appear / reveal — вход; есть hold — удержание; emphasis/accent — акцент; count —
 * счёт («counter-entrance» — вход); draw / flow / stream / loop / idle / travel / run / фон —
 * длящийся. Иначе — не определён.
 */
export function beatKind(b: { action: string; kind?: BeatKind | undefined }): BeatKind | undefined {
  if (b.kind) return b.kind;
  const w = actionWords(b.action);
  if (ENTER_WORDS.has(w.at(-1) ?? "")) return "enter";
  if (w.includes("hold")) return "hold";
  if (ACCENT_RE.test(b.action)) return "accent";
  if (w.includes("count") || w.includes("countup")) return "count";
  if (w.some((x) => SUSTAIN_WORDS.has(x))) return "sustain";
  return undefined;
}

/** Бит акцента — один признак для планировщика и specChecks (`accent_conflict`). */
export function isAccentBeat(b: { action: string; kind?: BeatKind | undefined }): boolean {
  return b.kind ? b.kind === "accent" : ACCENT_RE.test(b.action);
}

/** Бит ведёт к итогу (счёт, рисование): кончается к удару. */
export function isProgressBeat(b: { action: string; kind?: BeatKind | undefined }): boolean {
  const k = beatKind(b);
  return k === "count" || (k === "sustain" && actionWords(b.action).includes("draw"));
}

/**
 * Фазы сцены. Старая spec без `phases` — фаза на каждый бит по его действию: `hold` →
 * hold, акцент → payoff, вход до первого действия → setup, остальное → action; вес —
 * длина бита.
 */
export function phasesOf(spec: Pick<MotionSpec, "phases" | "beats">): Phase[] {
  if (spec.phases) return spec.phases;
  const beats = [...spec.beats].sort((a, b) => a.start_frame - b.start_frame);
  let acting = false;
  return beats.map((b) => {
    let role: PhaseRole;
    const kind = beatKind(b);
    if (kind === "hold") role = "hold";
    else if (isAccentBeat(b) || actionWords(b.action).some((x) => PAYOFF_WORDS.has(x))) role = "payoff";
    else if (!acting && kind === "enter") role = "setup";
    else { role = "action"; acting = true; }
    return { id: b.id, role, weight: Math.max(1, b.end_frame - b.start_frame), element_ids: b.element_ids };
  });
}
