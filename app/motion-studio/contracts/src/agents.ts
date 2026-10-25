import { z } from "zod";
import { CompositionSchema, DirectorSpecSchema } from "./motion-spec.js";
import { ComponentSelectionSchema } from "./selection.js";

export const DirectorOutputSchema = z.object({
  spec: DirectorSpecSchema,
  /** Обязательна в ответе Director; оркестратор переносит её в spec.json. */
  composition: CompositionSchema,
  selection: ComponentSelectionSchema,
  rationale: z.string(),
}).strict();
export type DirectorOutput = z.infer<typeof DirectorOutputSchema>;

export const EngineerReportSchema = z.object({
  files_written: z.array(z.string()),
  kit_components_used: z.array(z.string()),
  kb_ids_used: z.array(z.string()),
  notes: z.string(),
}).strict();
export type EngineerReport = z.infer<typeof EngineerReportSchema>;
