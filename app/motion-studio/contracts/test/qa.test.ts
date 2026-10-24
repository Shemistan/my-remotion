import { describe, expect, it } from "vitest";
import { HistoryEntrySchema, QAIssueSchema, QAReportSchema, QaGateSchema, QA_SCORE_AXES, QaScoresSchema, VerdictSchema, VersionManifestSchema, VisualQAOutputSchema, toJsonSchema } from "../src/index.js";

const vqa = {
  gate: { visual: "pass", semantic: "warn", style: "pass" },
  issues: [{ code: "text_overflow", severity: "warning", frame: 90, area: "top-right", description: "Текст у края", fix_hint: "Сдвинуть внутрь safe area" }],
  checked_frames: [0, 90],
  ocr: [{ frame: 90, texts: ["Рост"] }],
  elements_seen: [{ id: "title", frame: 90, seen: true }, { id: "chart", seen: false }],
  scores: { overall: 6, hierarchy: 6.5, composition: 5.5, entrance: 6, choreography: 6, hold: 5, legibility: 7, meaning: 6.5 },
  score_notes: [{ axis: "hold", frame: 90, note: "финал стоит" }],
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
  it("S5: scores — overall и семь осей рубрики 1–10; без scores ответ не принимается", () => {
    expect(QA_SCORE_AXES).toEqual(["hierarchy", "composition", "entrance", "choreography", "hold", "legibility", "meaning"]);
    expect(VisualQAOutputSchema.safeParse({ ...vqa, scores: undefined }).success).toBe(false);
    expect(QaScoresSchema.safeParse({ ...vqa.scores, overall: 11 }).success).toBe(false);
    expect(QaScoresSchema.safeParse({ ...vqa.scores, overall: 0.5 }).success).toBe(false);
    expect(QaScoresSchema.safeParse({ ...vqa.scores, distinctiveness: 6 }).success).toBe(false);
    expect(VisualQAOutputSchema.safeParse({ ...vqa, score_notes: [{ axis: "overall", frame: 1, note: "x" }] }).success).toBe(false);
  });
  it("S5: QAReport несёт scores (необязательно — у отчётов до S5 их нет)", () => {
    const report = { gate: { technical: "pass", visual: "pass", semantic: "pass", style: "pass" }, issues: [], checked_frames: [], ocr: [], automated: true };
    expect(QAReportSchema.safeParse(report).success).toBe(true);
    expect(QAReportSchema.safeParse({ ...report, scores: vqa.scores }).success).toBe(true);
  });
  it("JSON Schema без $ref", () => expect(JSON.stringify(toJsonSchema(VisualQAOutputSchema))).not.toContain("$ref"));
  it("гейт из четырёх вердиктов — один объект для QAReport, manifest и HistoryEntry", () => {
    expect(QAReportSchema.shape.gate).toBe(QaGateSchema);
    expect(HistoryEntrySchema.shape.qa.unwrap()).toBe(QaGateSchema);
    expect(VersionManifestSchema.innerType().shape.qa.unwrap().unwrap()).toBe(QaGateSchema);
  });
});
