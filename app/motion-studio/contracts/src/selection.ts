import { z } from "zod";

export const StrategySchema = z.enum(["reuse", "adapt", "build"]);

export const ComponentSelectionSchema = z.object({
  items: z.array(z.object({
    kb_id: z.string().min(1),
    strategy: StrategySchema,
    why: z.string(),
    files_to_copy: z.array(z.string()),
  }).strict()),
}).strict();
export type ComponentSelection = z.infer<typeof ComponentSelectionSchema>;

export const KnowledgeRefSchema = z.object({
  kb_id: z.string().min(1),
  repository: z.string().min(1),
  repository_url: z.string().min(1),
  commit: z.string().min(1),
  license: z.string().min(1),
  license_class: z.enum(["permissive", "restricted", "unknown"]),
  strategy: StrategySchema,
  source_paths: z.array(z.string()),
}).strict();
export type KnowledgeRef = z.infer<typeof KnowledgeRefSchema>;
