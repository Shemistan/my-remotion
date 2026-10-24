// S1 «сценарий → моушн»: контракты сценарного проекта (спека §5–§7, §9).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AspectSchema,
  DEFAULT_READING,
  ExportManifestSchema,
  ExportRequestSchema,
  GenerateBodySchema,
  JobTypeSchema,
  PaletteOverridesSchema,
  PlanIssueSchema,
  PlanOpsBodySchema,
  ProjectDtoSchema,
  PutScriptBodySchema,
  QAIssueSchema,
  ReadingSettingsSchema,
  ScriptBatchItemStatusSchema,
  ScriptDirectorOutputSchema,
  ScriptItemStatusSchema,
  ScriptPackageManifestSchema,
  ScriptPlanDtoSchema,
  ScriptPlanOpSchema,
  ScriptPlanRevisionDocSchema,
  ScriptRevisionDocSchema,
  ScriptSceneContextSchema,
  ScriptSceneDtoSchema,
  ScriptSceneItemSchema,
  ScriptStateDtoSchema,
  SceneFramesSchema,
  StyleLockSchema,
  TECHNIQUES,
  TechniqueSchema,
} from "../src/index.js";

const SHA = "a".repeat(64);
const TEXT = "Раз два три.";
const w = (id: string, o: Record<string, unknown> = {}) => ({ id, text: "Раз", block_id: "b1", start: 0, end: 3, sentence: 0, ...o });
const docWith = (o: Record<string, unknown> = {}) => ({
  schema_version: 1, script_id: "scr_1", revision: 1,
  blocks: [{ id: "b1", title: "Блок", text: TEXT }],
  words: [w("w_000001"), w("w_000002", { text: "два", start: 4, end: 7 }), w("w_000003", { text: "три", start: 8, end: 11 })],
  author: "user", ...o,
});

const item = (o: Record<string, unknown> = {}) => ({
  id: "ss_001", status: "accepted", origin: "agent", start_word_id: "w_000001", end_word_id: "w_000003", quote: "Раз два три",
  block_id: "b1", words: 3, at_s: 0, frames: { lead: 15, speech: 36, tail: 39, total: 90 },
  technique: "kinetic-quote", pattern: "quantities", purpose: "п", idea: "и", key_terms: [{ text: "Раз", word_id: "w_000001" }],
  data: [], importance: 2, anchor_ids: [], ...o,
});
const emptyAnalysis = { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] };
const planWith = (o: Record<string, unknown> = {}) => ({
  schema_version: 1, plan_id: "pln_1", revision: 1,
  inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
  fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING, analysis: emptyAnalysis,
  items: [item()], skipped: [], issues: [],
  diversity: { techniques: { "kinetic-quote": 1 }, adjacent_repeats: 0, kinetic_share: 1 }, ...o,
});

const scene = {
  start_word_id: "w_000001", end_word_id: "w_000003", quote: "Раз два три", technique: "hero-number", pattern: "quantities",
  purpose: "п", idea: "и", key_terms: [], data: [], importance: 2, anchor_ids: [], decision: "plan",
};
const style = { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "по смыслу" };
const outWith = (o: Record<string, unknown> = {}) => ({ ...emptyAnalysis, scenes: [scene], style, ...o });

describe("приёмы", () => {
  it("14 приёмов в порядке таблицы спеки §5.3", () => {
    expect(TECHNIQUES.map((t) => t.slug)).toEqual([
      "hero-number", "bar-compare", "line-trend", "split-versus", "race", "process-steps", "flow-graph", "structure-build",
      "data-token", "timeline", "code-focus", "checklist", "callout-diagram", "kinetic-quote",
    ]);
    expect(TechniqueSchema.options).toEqual(TECHNIQUES.map((t) => t.slug));
    expect(TECHNIQUES.find((t) => t.slug === "race")).toMatchObject({ kit: ["LatencyRace"], structure: "split-reveal" });
    // kit — только компоненты, которые экспортирует motion-kit
    const kit = readFileSync(new URL("../../render/src/motion-kit/index.ts", import.meta.url), "utf8");
    for (const t of TECHNIQUES) {
      expect(t.kit.length, t.slug).toBeGreaterThan(0);
      for (const c of t.kit) expect(kit, `${t.slug}: ${c}`).toMatch(new RegExp(`export \\{[^}]*\\b${c}\\b`));
    }
  });
});

describe("время чтения", () => {
  it("границы wps 1–5, lead 0–3, tail 0–5", () => {
    expect(ReadingSettingsSchema.safeParse({ wps: 0.5, lead_s: 0.5, tail_s: 1 }).success).toBe(false);
    expect(ReadingSettingsSchema.safeParse({ wps: 5.5, lead_s: 0.5, tail_s: 1 }).success).toBe(false);
    expect(ReadingSettingsSchema.safeParse({ wps: 2, lead_s: 3.5, tail_s: 1 }).success).toBe(false);
    expect(ReadingSettingsSchema.safeParse({ wps: 2, lead_s: 0, tail_s: 5.5 }).success).toBe(false);
    expect(ReadingSettingsSchema.parse(DEFAULT_READING)).toEqual({ wps: 2.5, lead_s: 0.5, tail_s: 1.0 });
  });

  it("кадры сцены: total ≥ lead + speech + tail", () => {
    expect(SceneFramesSchema.safeParse({ lead: 15, speech: 36, tail: 39, total: 90 }).success).toBe(true);
    expect(SceneFramesSchema.safeParse({ lead: 15, speech: 36, tail: 30, total: 90 }).success).toBe(false); // хвост = total − lead − speech
    expect(SceneFramesSchema.safeParse({ lead: 15, speech: 36, tail: 30, total: 80 }).success).toBe(false);
  });
});

describe("ревизия текста", () => {
  it("годный документ", () => expect(ScriptRevisionDocSchema.safeParse(docWith()).success).toBe(true));
  it("id слов возрастают и уникальны", () => {
    expect(ScriptRevisionDocSchema.safeParse(docWith({ words: [w("w_000002"), w("w_000001")] })).success).toBe(false);
    expect(ScriptRevisionDocSchema.safeParse(docWith({ words: [w("w_000001"), w("w_000001")] })).success).toBe(false);
  });
  it("block_id существует, end ≤ длины текста блока, end > start", () => {
    expect(ScriptRevisionDocSchema.safeParse(docWith({ words: [{ ...w("w_000001"), block_id: "b9" }] })).success).toBe(false);
    expect(ScriptRevisionDocSchema.safeParse(docWith({ words: [w("w_000001", { start: 10, end: 13 })] })).success).toBe(false);
    expect(ScriptRevisionDocSchema.safeParse(docWith({ words: [w("w_000001", { start: 3, end: 3 })] })).success).toBe(false);
  });
  it("пустой блок и пустой список блоков отклоняются", () => {
    expect(ScriptRevisionDocSchema.safeParse(docWith({ blocks: [{ id: "b1", title: "", text: "" }], words: [] })).success).toBe(false);
    expect(ScriptRevisionDocSchema.safeParse(docWith({ blocks: [], words: [] })).success).toBe(false);
  });
});

describe("план сценария", () => {
  it("годный документ; id сцен уникальны", () => {
    expect(ScriptPlanRevisionDocSchema.safeParse(planWith()).success).toBe(true);
    expect(ScriptPlanRevisionDocSchema.safeParse(planWith({ items: [item(), item()] })).success).toBe(false);
  });
  it("id сцены ss_NNN, приём из списка", () => {
    expect(ScriptSceneItemSchema.safeParse(item({ id: "sp_001" })).success).toBe(false);
    expect(ScriptSceneItemSchema.safeParse(item({ technique: "fireworks" })).success).toBe(false);
  });
  it("операции правки", () => {
    expect(ScriptPlanOpSchema.parse({ op: "set_reading", reading: DEFAULT_READING }).op).toBe("set_reading");
    expect(ScriptPlanOpSchema.parse({ op: "set_status", item_id: "ss_001", status: "rejected" }).op).toBe("set_status");
    expect(ScriptPlanOpSchema.parse({ op: "add", start_word_id: "w_000001", end_word_id: "w_000002" }).op).toBe("add");
    expect(ScriptPlanOpSchema.parse({ op: "modify", item_id: "ss_001", patch: { technique: "race", idea: "гонка" } }).op).toBe("modify");
    expect(ScriptPlanOpSchema.safeParse({ op: "modify", item_id: "ss_001", patch: { frames: {} } }).success).toBe(false);
    expect(ScriptPlanOpSchema.safeParse({ op: "reorder" }).success).toBe(false);
    expect(PlanOpsBodySchema.safeParse({ base_revision: 1, ops: [] }).success).toBe(false);
  });
});

describe("ответ Script Director", () => {
  it("годный ответ", () => expect(ScriptDirectorOutputSchema.safeParse(outWith()).success).toBe(true));
  it("у skip нужна причина, у plan — приём", () => {
    expect(ScriptDirectorOutputSchema.safeParse(outWith({ scenes: [{ ...scene, decision: "skip" }] })).success).toBe(false);
    expect(ScriptDirectorOutputSchema.safeParse(outWith({ scenes: [{ ...scene, decision: "skip", skip_reason: "вступление" }] })).success).toBe(true);
    expect(ScriptDirectorOutputSchema.safeParse(outWith({ scenes: [{ ...scene, technique: undefined }] })).success).toBe(false);
  });
  it("смысловая разметка проверяется checkSemantic", () => {
    expect(ScriptDirectorOutputSchema.safeParse(outWith({ causal: [{ cause_anchor_id: "a1", effect_anchor_id: "a2" }] })).success).toBe(false);
  });
});

describe("вход генерации и пакет", () => {
  it("контекст сцены сценария у playground.generate", () => {
    expect(AspectSchema.options).toEqual(["16:9", "9:16"]);
    const ctx = {
      project_id: "prj_1", plan_id: "pln_1", plan_revision: 1, item_id: "ss_001", aspect: "9:16",
      style: { preset: "dark-premium", intensity: "balanced", depth: 1 }, lead_frames: 15, tail_frames: 30, reference_version_id: "ver_1",
    };
    expect(ScriptSceneContextSchema.safeParse(ctx).success).toBe(true);
    expect(ScriptSceneContextSchema.safeParse({ ...ctx, aspect: "1:1" }).success).toBe(false);
    expect(GenerateBodySchema.safeParse({ revision: 1, aspect: "9:16", item_ids: ["ss_001"] }).success).toBe(true);
  });

  it("манифест пакета", () => {
    const file = {
      file: "01_raz-dva-tri.mp4", export_id: "exp_1", sha256: SHA,
      ffprobe: { durationMs: 3000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264" },
    };
    const m = {
      schema_version: 1, package_id: "pkg_1", project_id: "prj_1", project_title: "Go map", name: "Go-map_16x9_2026-10-24",
      aspect: "16:9", script: { id: "scr_1", revision: 1 }, plan: { id: "pln_1", revision: 2 }, reading: DEFAULT_READING,
      scenes: [{
        n: 1, item_id: "ss_001", scene_id: "scn_1", version_id: "ver_1", block_id: "b1", at_s: 0, quote: "Раз два три",
        technique: "kinetic-quote", frames: { lead: 15, speech: 36, tail: 39, total: 90 },
        mp4: file, alpha: { ...file, file: "01_raz-dva-tri_alpha.mov", export_id: "exp_2" }, warnings: [],
      }],
      missing: [{ item_id: "ss_002", reason: "нет готовой версии" }],
      created_at: "2026-10-24T10:00:00.000Z",
    };
    expect(ScriptPackageManifestSchema.safeParse(m).success).toBe(true);
    expect(ScriptPackageManifestSchema.safeParse({ ...m, aspect: "1:1" }).success).toBe(false);
  });
});

describe("изменения общих контрактов", () => {
  it("ExportRequest.overlay, типы задач, kind проекта, тело PUT текста", () => {
    expect(ExportRequestSchema.parse({ format: "prores4444", overlay: true }).overlay).toBe(true);
    expect(ExportRequestSchema.parse({ format: "mp4" }).overlay).toBeUndefined();
    expect(JobTypeSchema.options).toContain("script.plan");
    expect(JobTypeSchema.options).toContain("script.package");
    expect(ProjectDtoSchema.shape.kind.options).toContain("script");
    expect(PutScriptBodySchema.safeParse({ blocks: [{ title: "", text: "a" }] }).success).toBe(true);
    expect(PutScriptBodySchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});

describe("ревью S1: формы контрактов", () => {
  it("ExportManifest.overlay — покрытие, дымка, кадры проверки", () => {
    const shape = ExportManifestSchema.shape.overlay.unwrap();
    expect(shape.parse({ coverage: 0.3, haze: 0, frames: [120, 200] })).toEqual({ coverage: 0.3, haze: 0, frames: [120, 200] });
    expect(shape.safeParse({ coverage: 0.3, frame: 120 }).success).toBe(false);
    expect(shape.safeParse({ coverage: 0.3, haze: 1.2, frames: [] }).success).toBe(false);
    expect(shape.safeParse({ coverage: 0.3, haze: 0, frames: [-1] }).success).toBe(false);
  });

  it("статус сцены сценария: none — задачи ещё не было; старое имя — алиас", () => {
    expect(ScriptItemStatusSchema.options).toContain("none");
    expect(ScriptBatchItemStatusSchema).toBe(ScriptItemStatusSchema);
  });

  it("ScriptStateDto.plan — ScriptPlanDto или null", () => {
    expect(ScriptStateDtoSchema.shape.plan.unwrap()).toBe(ScriptPlanDtoSchema);
    expect(ScriptStateDtoSchema.shape.plan.safeParse(null).success).toBe(true);
  });

  it("ответ Script Director: достаточно chapters и numbers (Р24)", () => {
    const o = ScriptDirectorOutputSchema.parse({ chapters: [], numbers: [], scenes: [scene], style });
    expect([o.anchors, o.entities, o.causal, o.disputed]).toEqual([[], [], [], []]);
  });

  it("предупреждения сцены — PlanIssue и QAIssue", () => {
    const s = ScriptSceneDtoSchema.shape;
    expect(s.warnings.element).toBe(PlanIssueSchema);
    expect(s.qa_warnings.element).toBe(QAIssueSchema);
  });

  it("style_lock: шрифт только из kit, палитра — форма PaletteOverrides", () => {
    expect(StyleLockSchema.safeParse({ font: "Manrope" }).success).toBe(true);
    expect(StyleLockSchema.safeParse({ font: "Comic Sans" }).success).toBe(false);
    const lock = StyleLockSchema.shape.palette_overrides.unwrap();
    expect(Object.keys(lock.shape)).toEqual(Object.keys(PaletteOverridesSchema.shape));
    const sample = { bg: "#000", accent: ["#f00"] };
    expect(lock.parse(sample)).toEqual(PaletteOverridesSchema.parse(sample));
    for (const bad of [{ accent: [] }, { extra: "x" }, { bg: 1 }]) {
      expect(lock.safeParse(bad).success).toBe(PaletteOverridesSchema.safeParse(bad).success);
    }
  });
});
