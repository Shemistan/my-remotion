import { z } from "zod";

/** Вердикт гейта; `not_checked` — гейт не проверялся (например, в срезе без Visual QA). */
export const VerdictSchema = z.enum(["pass", "warn", "fail", "not_checked"]);
export type Verdict = z.infer<typeof VerdictSchema>;

/** Гейт версии из четырёх вердиктов: `QAReport.gate`, `manifest.qa`, `HistoryEntry.qa`. */
export const QaGateSchema = z.object({
  technical: VerdictSchema,
  visual: VerdictSchema,
  semantic: VerdictSchema,
  style: VerdictSchema,
}).strict();
export type QaGate = z.infer<typeof QaGateSchema>;

const Frame = z.number().int().nonnegative();

export const QAIssueSchema = z.object({
  source: z.enum(["technical", "programmatic", "agent"]),
  code: z.string().min(1),
  severity: z.enum(["blocking", "warning"]),
  frame: Frame.optional(),
  area: z.string().optional(),
  description: z.string(),
  fix_hint: z.string(),
}).strict();
export type QAIssue = z.infer<typeof QAIssueSchema>;

const OcrSchema = z.array(z.object({ frame: Frame, texts: z.array(z.string()) }).strict());

/** Ответ агента Visual QA; `source` у замечаний ставит оркестратор (`agent`). */
export const VisualQAOutputSchema = z.object({
  gate: z.object({ visual: VerdictSchema, semantic: VerdictSchema, style: VerdictSchema }).strict(),
  issues: z.array(QAIssueSchema.omit({ source: true })),
  checked_frames: z.array(Frame),
  ocr: OcrSchema,
  elements_seen: z.array(z.object({ id: z.string().min(1), frame: Frame.optional(), seen: z.boolean() }).strict()),
}).strict();
export type VisualQAOutput = z.infer<typeof VisualQAOutputSchema>;

/** Итоговый отчёт QA версии (`qa.json`): технический gate + Visual QA. */
export const QAReportSchema = z.object({
  gate: QaGateSchema,
  issues: z.array(QAIssueSchema),
  checked_frames: z.array(Frame),
  ocr: OcrSchema,
  automated: z.literal(true),
}).strict();
export type QAReport = z.infer<typeof QAReportSchema>;
