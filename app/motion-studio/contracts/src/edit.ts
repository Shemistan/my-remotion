import { z } from "zod";
import { ScenePropsStyleSchema } from "./scene-props.js";

export const EditPathSchema = z.enum(["param", "spec", "code"]);
export type EditPath = z.infer<typeof EditPathSchema>;

/**
 * План правки Edit Planner. `param` — только props (тайминги, стиль, контент) без агентов
 * кода; `spec` — новая спецификация; `code` — правка кода Engineer.
 */
export const EditPlanSchema = z.object({
  base_version_id: z.string().min(1),
  path: EditPathSchema,
  changes: z.array(z.object({
    target: z.string().min(1),
    kind: EditPathSchema,
    description: z.string(),
  }).strict()),
  borrow: z.array(z.object({
    from_version_id: z.string().min(1),
    what: z.enum(["palette", "typography", "timing", "layout", "depth"]),
  }).strict()),
  preserve: z.array(z.enum(["composition", "palette", "timing", "text"])),
  timing_scale: z.number().gt(0.25).lte(4).optional(),
  param_patch: z.object({
    style: ScenePropsStyleSchema.partial().optional(),
    content: z.record(z.unknown()).optional(),
  }).strict().optional(),
  reply: z.string(),
}).strict().superRefine((p, ctx) => {
  if (p.path !== "param") return;
  p.changes.forEach((c, i) => {
    if (c.kind !== "param") ctx.addIssue({ code: "custom", path: ["changes", i, "kind"], message: "при path=param все изменения должны быть kind=param" });
  });
});
export type EditPlan = z.infer<typeof EditPlanSchema>;
