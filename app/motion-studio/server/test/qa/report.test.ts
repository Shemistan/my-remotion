// Сведение технического gate, программных проверок и ответа Visual QA в QAReport.
import { type QAIssue, QAReportSchema, type VisualQAOutput } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { fixHints, mergeQA, qaBlocks } from "../../src/qa/report.js";

const issue = (code: string, severity: QAIssue["severity"], source: QAIssue["source"] = "programmatic"): QAIssue => ({
  source, code, severity, frame: 30, area: "right", description: `${code}: описание`, fix_hint: `${code}: как исправить`,
});
const warn = (code: string) => issue(code, "warning");
const block = (code: string) => issue(code, "blocking");

const agentPass: VisualQAOutput = {
  gate: { visual: "pass", semantic: "pass", style: "pass" },
  issues: [],
  checked_frames: [15, 72],
  ocr: [{ frame: 72, texts: ["Рост пользователей"] }],
  elements_seen: [{ id: "title", frame: 15, seen: true }],
};

describe("mergeQA", () => {
  it("warning программной проверки + агент pass → visual warn, остальное pass", () => {
    const r = mergeQA({ technical: [], programmatic: [warn("safe_area")], agent: agentPass });
    expect(r.gate).toEqual({ technical: "pass", visual: "warn", semantic: "pass", style: "pass" });
    expect(r.automated).toBe(true);
    expect(r.checked_frames).toEqual([15, 72]);
    expect(r.ocr).toEqual(agentPass.ocr);
    expect(QAReportSchema.parse(r)).toEqual(r);
  });

  it("без агента: semantic/style not_checked; blocking программной проверки → visual fail", () => {
    const r = mergeQA({ technical: [], programmatic: [block("clipping")] });
    expect(r.gate).toEqual({ technical: "pass", visual: "fail", semantic: "not_checked", style: "not_checked" });
    expect(r.checked_frames).toEqual([]);
  });

  it("technical: fail только при blocking technical; visual — худшее из программы и агента", () => {
    const tech = mergeQA({ technical: [issue("console", "warning", "technical")], programmatic: [], agent: agentPass });
    expect(tech.gate.technical).toBe("pass");
    expect(mergeQA({ technical: [issue("probe", "blocking", "technical")], programmatic: [] }).gate.technical).toBe("fail");
    const worse = mergeQA({ technical: [], programmatic: [warn("safe_area")], agent: { ...agentPass, gate: { visual: "fail", semantic: "warn", style: "pass" } } });
    expect(worse.gate).toMatchObject({ visual: "fail", semantic: "warn", style: "pass" });
    expect(mergeQA({ technical: [], programmatic: [] }).gate.visual).toBe("pass");
  });

  it("замечания агента получают source = agent и идут после остальных", () => {
    const agent = { ...agentPass, issues: [{ code: "hierarchy", severity: "warning" as const, frame: 72, description: "d", fix_hint: "h" }] };
    const r = mergeQA({ technical: [issue("t", "warning", "technical")], programmatic: [warn("safe_area")], agent });
    expect(r.issues.map((i) => [i.source, i.code])).toEqual([["technical", "t"], ["programmatic", "safe_area"], ["agent", "hierarchy"]]);
  });
});

describe("qaBlocks", () => {
  it("blocking-замечание или gate fail", () => {
    expect(qaBlocks(mergeQA({ technical: [], programmatic: [block("clipping")] }))).toBe(true);
    expect(qaBlocks(mergeQA({ technical: [], programmatic: [warn("safe_area")], agent: agentPass }))).toBe(false);
    expect(qaBlocks(mergeQA({ technical: [], programmatic: [], agent: { ...agentPass, gate: { visual: "pass", semantic: "fail", style: "pass" } } }))).toBe(true);
  });
});

describe("fixHints", () => {
  it("код, кадр, область и fix_hint; сначала blocking", () => {
    const t = fixHints(mergeQA({ technical: [], programmatic: [warn("safe_area"), block("clipping")] }));
    const lines = t.split("\n").filter((l) => l.startsWith("- "));
    expect(lines[0]).toContain("[blocking] clipping");
    expect(lines[0]).toContain("кадр 30");
    expect(lines[0]).toContain("область right");
    expect(lines[0]).toContain("clipping: как исправить");
    expect(lines[1]).toContain("[warning] safe_area");
  });

  it("без замечаний — пустая строка", () => {
    expect(fixHints(mergeQA({ technical: [], programmatic: [], agent: agentPass }))).toBe("");
  });
});
