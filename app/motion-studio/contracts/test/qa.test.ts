import { describe, expect, it } from "vitest";
import { QAIssueSchema, QAReportSchema, VerdictSchema, VisualQAOutputSchema, toJsonSchema } from "../src/index.js";

const vqa = {
  gate: { visual: "pass", semantic: "warn", style: "pass" },
  issues: [{ code: "text_overflow", severity: "warning", frame: 90, area: "top-right", description: "Текст у края", fix_hint: "Сдвинуть внутрь safe area" }],
  checked_frames: [0, 90],
  ocr: [{ frame: 90, texts: ["Рост"] }],
  elements_seen: [{ id: "title", frame: 90, seen: true }, { id: "chart", seen: false }],
};

describe("QA", () => {
  it("вердикты", () => expect(VerdictSchema.options).toEqual(["pass", "warn", "fail", "not_checked"]));
  it("VisualQAOutput: корректный ответ", () => expect(VisualQAOutputSchema.safeParse(vqa).success).toBe(true));
  it("VisualQAOutput: elements_seen обязателен", () =>
    expect(VisualQAOutputSchema.safeParse({ ...vqa, elements_seen: undefined }).success).toBe(false));
  it("VisualQAOutput: source в issues не принимается (его ставит оркестратор)", () => {
    const issues = [{ ...vqa.issues[0], source: "agent" }];
    expect(VisualQAOutputSchema.safeParse({ ...vqa, issues }).success).toBe(false);
  });
  it("QAIssue требует source", () => {
    expect(QAIssueSchema.safeParse(vqa.issues[0]).success).toBe(false);
    expect(QAIssueSchema.safeParse({ ...vqa.issues[0], source: "programmatic" }).success).toBe(true);
  });
  it("QAReport: четыре вердикта и automated: true", () => {
    const report = {
      gate: { technical: "pass", visual: "pass", semantic: "warn", style: "pass" },
      issues: [{ ...vqa.issues[0], source: "agent" }],
      checked_frames: [0, 90],
      ocr: vqa.ocr,
      automated: true,
    };
    expect(QAReportSchema.safeParse(report).success).toBe(true);
    expect(QAReportSchema.safeParse({ ...report, automated: false }).success).toBe(false);
    expect(QAReportSchema.safeParse({ ...report, gate: { ...report.gate, technical: "ok" } }).success).toBe(false);
  });
  it("JSON Schema без $ref", () => expect(JSON.stringify(toJsonSchema(VisualQAOutputSchema))).not.toContain("$ref"));
});
