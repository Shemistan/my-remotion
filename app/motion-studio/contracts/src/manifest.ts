import { z } from "zod";
import { SettingsSchema } from "./settings.js";
import { KnowledgeRefSchema } from "./selection.js";
import { FailureStageSchema } from "./failure.js";
import { VerdictSchema } from "./qa.js";
import { EditPlanSchema } from "./edit.js";

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "ожидается sha256 (64 hex)");
const Sha = Sha256Schema;
const FileEntry = z.object({ path: z.string().min(1), sha256: Sha }).strict();

/** Окружение рендера версии: по нему UI предупреждает «рендер в другом окружении». */
export const RenderEnvSchema = z.object({
  remotion: z.string(),
  render_lock_sha256: Sha,
  motion_kit: z.string(),
  chrome_headless_shell: z.string(),
  node: z.string(),
}).strict();
export type RenderEnv = z.infer<typeof RenderEnvSchema>;

/** Восстановление старой версии (`05` §5): новая версия-копия от `base_version_id`. */
export const RestorePlanSchema = z.object({ kind: z.literal("restore"), base_version_id: z.string().min(1) }).strict();
/** `edit_plan` версий среза — допустим ради импорта (`doctor --import-slice`). */
export const SliceEditPlanSchema = z.object({
  base_version_id: z.string().min(1),
  borrow: z.array(z.object({ from: z.string().min(1), what: z.string().min(1) }).strict()),
}).strict();

/** Manifest версии (05-data-model §4) плюс статус и кадры QA. */
export const VersionManifestSchema = z.object({
  schema_version: z.literal(1),
  version_id: z.string().min(1),
  scene_id: z.string().min(1),
  parent_version_id: z.string().min(1).nullable(),
  number: z.number().int().min(1),
  created_at: z.string().datetime(),
  prompt: z.string(),
  edit_plan: z.union([RestorePlanSchema, EditPlanSchema, SliceEditPlanSchema]).nullable(),
  settings: SettingsSchema,
  files: z.array(FileEntry),
  changed_files: z.array(z.string()),
  render_env: RenderEnvSchema,
  knowledge_refs: z.array(KnowledgeRefSchema.pick({ kb_id: true, commit: true, license: true, strategy: true })),
  agent_runs: z.array(z.string()),
  // null/отсутствует допустимы только для failed (сбой до QA).
  qa: z.object({ technical: VerdictSchema, visual: VerdictSchema, semantic: VerdictSchema, style: VerdictSchema }).strict().nullable().optional(),
  preview: FileEntry.nullable(),
  status: z.enum(["ready", "failed"]),
  failure: z.object({ stage: FailureStageSchema, message: z.string() }).strict().optional(),
  qa_frames: z.array(z.number().int().nonnegative()),
  qa_frames_sha256: z.array(Sha),
  /** Задача и попытка, опубликовавшие версию (Phase 1); у версий среза нет. */
  job: z.object({ id: z.string().min(1), attempt: z.number().int().min(1) }).strict().optional(),
}).strict().superRefine((m, ctx) => {
  if (m.status === "failed" && !m.failure) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "для failed нужен failure" });
  }
  if (m.status === "ready") {
    if (!m.qa) ctx.addIssue({ code: "custom", path: ["qa"], message: "для ready нужен qa" });
    if (m.failure) ctx.addIssue({ code: "custom", path: ["failure"], message: "для ready failure недопустим" });
    if (!m.preview) ctx.addIssue({ code: "custom", path: ["preview"], message: "для ready нужен preview" });
  }
  if (m.qa_frames.length !== m.qa_frames_sha256.length) {
    ctx.addIssue({ code: "custom", path: ["qa_frames_sha256"], message: "qa_frames и qa_frames_sha256 разной длины" });
  }
});
export type VersionManifest = z.infer<typeof VersionManifestSchema>;
