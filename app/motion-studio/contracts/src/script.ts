// Сценарный проект «сценарий → моушн-сцены» (спека 2026-10-24-script-to-motion §5–§6, §9):
// приёмы, время чтения, ревизии текста и плана, ответ Script Director, вход генерации сцены,
// манифест пакета. Время — только по формулам §5.2 (код), LLM выдаёт id слов и цитаты.
import { z } from "zod";
import { StructureRuleSchema } from "./concept.js";
import { ProbeResultSchema } from "./export.js";
import { Sha256Schema } from "./manifest.js";
import { type SceneStructure } from "./motion-spec.js";
import { PatternSlugSchema } from "./patterns.js";
import { PlanIssueSchema } from "./plan.js";
import { ProjectStyleBaseSchema } from "./project-style.js";
import { checkSemantic, semanticFields } from "./semantic.js";
import { IntensitySchema, StylePresetSchema } from "./settings.js";
import { FpsSchema } from "./time.js";
import { WordIdSchema } from "./transcript.js";

const Id = z.string().min(1);
const Revision = z.number().int().positive();
const Int0 = z.number().int().nonnegative();

/**
 * Приёмы визуализации (таблица спеки §5.3): компоненты motion-kit и типичная структура сцены.
 * Порядок — как в таблице (UI и `pickTechnique` на него опираются).
 */
export const TECHNIQUES = [
  { slug: "hero-number", kit: ["AnimatedNumber", "DataToken"], structure: "count-up", ru: "одно ключевое число, счёт" },
  { slug: "bar-compare", kit: ["BarChart"], structure: "split-reveal", ru: "сравнение величин" },
  { slug: "line-trend", kit: ["LineChart", "AreaChart"], structure: "build-strike", ru: "рост/падение во времени" },
  { slug: "split-versus", kit: ["ComparisonSplit"], structure: "split-reveal", ru: "было/стало, старое/новое" },
  { slug: "race", kit: ["LatencyRace"], structure: "split-reveal", ru: "скорость, задержки, «кто быстрее»" },
  { slug: "process-steps", kit: ["ProcessSteps"], structure: "build-strike", ru: "шаги алгоритма, этапы" },
  { slug: "flow-graph", kit: ["FlowGraph", "PulseAlongPath"], structure: "continuous-flow", ru: "система, потоки, причина → следствие" },
  { slug: "structure-build", kit: ["Card", "Highlight"], structure: "build-strike", ru: "устройство: иерархия, раскладка памяти" },
  { slug: "data-token", kit: ["DataToken", "FlowGraph"], structure: "call-response", ru: "путь значения через структуру (ключ → хэш → слот)" },
  { slug: "timeline", kit: ["Timeline"], structure: "build-strike", ru: "даты, версии, история" },
  { slug: "code-focus", kit: ["CodeBlock", "Highlight"], structure: "call-response", ru: "фрагмент кода, подсветка строки" },
  { slug: "checklist", kit: ["StatusChip", "Card"], structure: "build-strike", ru: "перечень выводов, «что менять»" },
  { slug: "callout-diagram", kit: ["Callout", "Highlight"], structure: "cold-open", ru: "пояснение к схеме, выделение части" },
  { slug: "kinetic-quote", kit: ["KineticText", "Emphasis"], structure: "cold-open", ru: "тезис словами, акцент на 1–3 словах" },
] as const satisfies readonly { slug: string; kit: readonly string[]; structure: SceneStructure; ru: string }[];

export type Technique = (typeof TECHNIQUES)[number]["slug"];
export const TechniqueSchema = z.enum(TECHNIQUES.map((t) => t.slug) as [Technique, ...Technique[]]);

/** Скорость чтения и запас сцены (§5.2): слов в секунду, секунды до и после речи. */
export const ReadingSettingsSchema = z.object({
  wps: z.number().min(1).max(5),
  lead_s: z.number().min(0).max(3),
  tail_s: z.number().min(0).max(5),
}).strict();
export type ReadingSettings = z.infer<typeof ReadingSettingsSchema>;
export const DEFAULT_READING: ReadingSettings = { wps: 2.5, lead_s: 0.5, tail_s: 1.0 };

/** Формат кадра сценарного проекта: основной 16:9 и вертикальные двойники 9:16 (§10). */
export const AspectSchema = z.enum(["16:9", "9:16"]);
export type Aspect = z.infer<typeof AspectSchema>;

const BlockIdSchema = z.string().regex(/^b\d+$/);

/** Слово текста: `start`/`end` — смещения символов в `text` блока; `sentence` — номер предложения в блоке. */
export const ScriptWordSchema = z.object({
  id: WordIdSchema,
  text: z.string().min(1),
  block_id: BlockIdSchema,
  start: Int0,
  end: z.number().int().positive(),
  sentence: Int0,
}).strict().refine((w) => w.end > w.start, { message: "end должен быть больше start", path: ["end"] });
export type ScriptWord = z.infer<typeof ScriptWordSchema>;

export const ScriptBlockSchema = z.object({ id: BlockIdSchema, title: z.string(), text: z.string().min(1) }).strict();
export type ScriptBlock = z.infer<typeof ScriptBlockSchema>;

/** Сравнение id слов по числовым частям (`w_000002` < `w_000010`, `w_000001.2` < `w_000001.10`). */
export function compareWordIds(a: string, b: string): number {
  const pa = a.slice(2).split(".").map(Number);
  const pb = b.slice(2).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** Ревизия текста сценария `script/<id>/r<N>/script.json` (§5.1), иммутабельна. */
export const ScriptRevisionDocSchema = z.object({
  schema_version: z.literal(1),
  script_id: Id,
  revision: Revision,
  parent_revision: Revision.optional(),
  blocks: z.array(ScriptBlockSchema).min(1),
  words: z.array(ScriptWordSchema),
  author: z.literal("user"),
}).strict().superRefine((d, ctx) => {
  const blocks = new Map<string, number>();
  d.blocks.forEach((b, i) => {
    if (blocks.has(b.id)) ctx.addIssue({ code: "custom", path: ["blocks", i, "id"], message: `повтор id блока ${b.id}` });
    blocks.set(b.id, b.text.length);
  });
  d.words.forEach((w, i) => {
    const prev = d.words[i - 1];
    if (prev && compareWordIds(prev.id, w.id) >= 0) ctx.addIssue({ code: "custom", path: ["words", i, "id"], message: `id слов не возрастают: ${prev.id} → ${w.id}` });
    const len = blocks.get(w.block_id);
    if (len === undefined) ctx.addIssue({ code: "custom", path: ["words", i, "block_id"], message: `нет блока ${w.block_id}` });
    else if (w.end > len) ctx.addIssue({ code: "custom", path: ["words", i, "end"], message: `слово за концом блока ${w.block_id}` });
  });
});
export type ScriptRevisionDoc = z.infer<typeof ScriptRevisionDocSchema>;

/** Кадры сцены по §5.2 (`readingFrames`): запас до речи, речь, запас после; добор до 3 с — в хвост. */
export const SceneFramesSchema = z.object({
  lead: Int0,
  speech: z.number().int().positive(),
  tail: Int0,
  total: z.number().int().positive(),
}).strict().refine((f) => f.total === f.lead + f.speech + f.tail, { message: "total ≠ lead + speech + tail", path: ["total"] });
export type SceneFrames = z.infer<typeof SceneFramesSchema>;

const KeyTermSchema = z.object({ text: z.string().min(1), word_id: WordIdSchema }).strict();
const DataPointSchema = z.object({ label: z.string().min(1), value: z.number(), unit: z.string().optional(), quote: z.string().min(1) }).strict();
const ImportanceSchema = z.number().int().min(1).max(3);

/** Сцена плана сценария (§5.3): цитату, слова, кадры и `at_s` считает код. */
export const ScriptSceneItemSchema = z.object({
  id: z.string().regex(/^ss_\d{3,}$/),
  status: z.enum(["accepted", "rejected"]),
  origin: z.enum(["agent", "user"]),
  start_word_id: WordIdSchema,
  end_word_id: WordIdSchema,
  quote: z.string().min(1),
  block_id: BlockIdSchema,
  words: z.number().int().positive(),
  at_s: z.number().nonnegative(),
  frames: SceneFramesSchema,
  technique: TechniqueSchema,
  pattern: PatternSlugSchema,
  structure_rule: StructureRuleSchema.optional(),
  purpose: z.string(),
  idea: z.string(),
  key_terms: z.array(KeyTermSchema),
  data: z.array(DataPointSchema),
  importance: ImportanceSchema,
  anchor_ids: z.array(z.string().min(1)),
}).strict();
export type ScriptSceneItem = z.infer<typeof ScriptSceneItemSchema>;

/** Правка плана сценария (спека §7); порядок сцен — по тексту, `reorder` нет. */
export const ScriptPlanOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_status"), item_id: Id, status: z.enum(["accepted", "rejected"]) }).strict(),
  z.object({
    op: z.literal("modify"),
    item_id: Id,
    patch: z.object({
      technique: TechniqueSchema,
      pattern: PatternSlugSchema,
      purpose: z.string(),
      idea: z.string(),
      start_word_id: WordIdSchema,
      end_word_id: WordIdSchema,
      key_terms: z.array(KeyTermSchema),
    }).partial().strict(),
  }).strict(),
  z.object({ op: z.literal("add"), start_word_id: WordIdSchema, end_word_id: WordIdSchema, technique: TechniqueSchema.optional(), purpose: z.string().optional() }).strict(),
  z.object({ op: z.literal("set_reading"), reading: ReadingSettingsSchema }).strict(),
]);
export type ScriptPlanOp = z.infer<typeof ScriptPlanOpSchema>;

const InputRef = z.object({ id: Id, revision: Revision, hash: Sha256Schema }).strict();

/** Ревизия плана сценария `plan/<planId>/r<N>/script-plan.json` (§5.3), индекс — таблицы visual_plans. */
export const ScriptPlanRevisionDocSchema = z.object({
  schema_version: z.literal(1),
  plan_id: Id,
  revision: Revision,
  parent_revision: Revision.optional(),
  inputs: z.object({ script: InputRef, style: InputRef }).strict(),
  fps: FpsSchema,
  aspect: z.literal("16:9"),
  reading: ReadingSettingsSchema,
  analysis: z.object(semanticFields).strict(),
  items: z.array(ScriptSceneItemSchema),
  skipped: z.array(z.object({ start_word_id: WordIdSchema, end_word_id: WordIdSchema, quote: z.string(), reason: z.string().min(1) }).strict()),
  issues: z.array(PlanIssueSchema),
  diversity: z.object({
    techniques: z.record(TechniqueSchema, Int0),
    adjacent_repeats: Int0,
    kinetic_share: z.number().min(0).max(1),
  }).strict(),
  ops: z.array(ScriptPlanOpSchema).optional(),
  agent: z.literal("skipped").optional(),
}).strict().superRefine((d, ctx) => {
  const ids = new Set<string>();
  d.items.forEach((x, i) => {
    if (ids.has(x.id)) ctx.addIssue({ code: "custom", path: ["items", i, "id"], message: `повтор id ${x.id}` });
    ids.add(x.id);
  });
  checkSemantic(d.analysis, ctx);
});
export type ScriptPlanRevisionDoc = z.infer<typeof ScriptPlanRevisionDocSchema>;

/** Сцена в ответе Script Director (§6.1): у `plan` обязателен приём, у `skip` — причина. */
export const ScriptDirectorSceneSchema = z.object({
  start_word_id: WordIdSchema,
  end_word_id: WordIdSchema,
  quote: z.string().min(1),
  technique: TechniqueSchema.optional(),
  pattern: PatternSlugSchema.optional(),
  structure_rule: StructureRuleSchema.optional(),
  purpose: z.string(),
  idea: z.string(),
  key_terms: z.array(KeyTermSchema),
  data: z.array(DataPointSchema),
  importance: ImportanceSchema,
  anchor_ids: z.array(z.string().min(1)),
  decision: z.enum(["plan", "skip"]),
  skip_reason: z.string().min(1).optional(),
}).strict();
export type ScriptDirectorScene = z.infer<typeof ScriptDirectorSceneSchema>;

/**
 * Ответ Script Director: смысловая разметка, сцены и стиль (как у Visual Planner). Р24: из
 * разметки обязательны `chapters` и `numbers`; `anchors`, `entities`, `causal`, `disputed` —
 * пустые по умолчанию.
 */
export const ScriptDirectorOutputSchema = z.object({
  ...semanticFields,
  anchors: semanticFields.anchors.default([]),
  entities: semanticFields.entities.default([]),
  causal: semanticFields.causal.default([]),
  disputed: semanticFields.disputed.default([]),
  scenes: z.array(ScriptDirectorSceneSchema),
  style: z.object({
    preset: StylePresetSchema,
    palette_overrides: z.record(z.string()).optional(),
    font: z.string().min(1).optional(),
    intensity: IntensitySchema,
    depth: z.number().int().min(0).max(3),
    rationale: z.string().min(1),
  }).strict(),
}).strict().superRefine((o, ctx) => {
  o.scenes.forEach((s, i) => {
    if (s.decision === "plan") {
      if (s.technique === undefined) ctx.addIssue({ code: "custom", path: ["scenes", i, "technique"], message: "у сцены plan нужен приём" });
      if (s.pattern === undefined) ctx.addIssue({ code: "custom", path: ["scenes", i, "pattern"], message: "у сцены plan нужен паттерн" });
    } else if (s.skip_reason === undefined) {
      ctx.addIssue({ code: "custom", path: ["scenes", i, "skip_reason"], message: "у пропуска нужна причина" });
    }
  });
  checkSemantic(o, ctx);
});
export type ScriptDirectorOutput = z.infer<typeof ScriptDirectorOutputSchema>;

/** Вход `script` у `playground.generate` (§6.2): сцена плана сценария, стиль проекта, запас. */
export const ScriptSceneContextSchema = z.object({
  project_id: Id,
  plan_id: Id,
  plan_revision: Revision,
  item_id: Id,
  aspect: AspectSchema,
  style: ProjectStyleBaseSchema,
  lead_frames: Int0,
  tail_frames: Int0,
  /** 9:16: эталонная 16:9-версия той же сцены плана. */
  reference_version_id: Id.optional(),
}).strict();
export type ScriptSceneContext = z.infer<typeof ScriptSceneContextSchema>;

/** Файл сцены в пакете: имя в папке, экспорт-источник, sha256, ffprobe. */
export const ScriptPackageFileSchema = z.object({ file: z.string().min(1), export_id: Id, sha256: Sha256Schema, ffprobe: ProbeResultSchema }).strict();
export type ScriptPackageFile = z.infer<typeof ScriptPackageFileSchema>;

/** `package-manifest.json` папки пакета (§9 п.5). */
export const ScriptPackageManifestSchema = z.object({
  schema_version: z.literal(1),
  package_id: Id,
  project_id: Id,
  project_title: z.string(),
  /** Имя папки для человека (`<проект>_16x9_<дата>`); каталог на диске — `package_id`. */
  name: z.string().min(1),
  aspect: AspectSchema,
  script: z.object({ id: Id, revision: Revision }).strict(),
  plan: z.object({ id: Id, revision: Revision }).strict(),
  reading: ReadingSettingsSchema,
  scenes: z.array(z.object({
    n: z.number().int().positive(),
    item_id: Id,
    scene_id: Id,
    version_id: Id,
    block_id: BlockIdSchema,
    at_s: z.number().nonnegative(),
    quote: z.string(),
    technique: TechniqueSchema,
    frames: SceneFramesSchema,
    mp4: ScriptPackageFileSchema,
    alpha: ScriptPackageFileSchema,
    warnings: z.array(z.string()),
  }).strict()),
  missing: z.array(z.object({ item_id: Id, quote: z.string().optional(), reason: z.string().min(1) }).strict()),
  created_at: z.string().datetime(),
}).strict();
export type ScriptPackageManifest = z.infer<typeof ScriptPackageManifestSchema>;
