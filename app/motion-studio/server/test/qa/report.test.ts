// Сведение технического gate, программных проверок и ответа Visual QA в QAReport.
import { type QAIssue, QAReportSchema, type VisualQAOutput } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { acceptedAsWarn, fixHints, mergeQA, qaBlocks, repeatsAsWarning } from "../../src/qa/report.js";

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
  scores: { overall: 6.5, hierarchy: 6, composition: 6, entrance: 7, choreography: 6, hold: 5.5, legibility: 7, meaning: 6.5 },
  score_notes: [],
};

describe("S5: оценки и публикация лучшей попытки", () => {
  it("mergeQA переносит scores агента в QAReport; без агента scores нет", () => {
    expect(mergeQA({ technical: [], programmatic: [], agent: agentPass }).scores).toEqual(agentPass.scores);
    expect(mergeQA({ technical: [], programmatic: [] })).not.toHaveProperty("scores");
  });

  it("acceptedAsWarn: blocking → warning с пометкой, visual fail → warn, technical не трогается; отчёт проходит схему и не блокирует", () => {
    const r = mergeQA({ technical: [], programmatic: [block("clipping")], agent: { ...agentPass, gate: { visual: "fail", semantic: "pass", style: "warn" } } });
    expect(qaBlocks(r)).toBe(true);
    const w = acceptedAsWarn(r, "после 2 исправлений");
    expect(qaBlocks(w)).toBe(false);
    expect(w.gate).toEqual({ technical: "pass", visual: "warn", semantic: "pass", style: "warn" });
    expect(w.issues[0]).toMatchObject({ code: "clipping", severity: "warning" });
    expect(w.issues[0]!.description).toContain("не исправлено после 2 исправлений");
    expect(w.scores).toEqual(agentPass.scores);
    expect(QAReportSchema.parse(w)).toEqual(w);
  });

  it("rulings 2026-10-23: acceptedAsWarn не смягчает semantic/style fail — отчёт по-прежнему блокирует", () => {
    const r = mergeQA({ technical: [], programmatic: [], agent: { ...agentPass, gate: { visual: "fail", semantic: "fail", style: "fail" } } });
    const w = acceptedAsWarn(r, "после 2 исправлений");
    expect(w.gate).toEqual({ technical: "pass", visual: "warn", semantic: "fail", style: "fail" });
    expect(qaBlocks(w)).toBe(true);
  });
});

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

describe("repeatsAsWarning (ревью S15a, I-1)", () => {
  const rep = (...issues: QAIssue[]) => mergeQA({ technical: [], programmatic: issues });
  const bare = (code: string, description: string): QAIssue => ({ source: "agent", code, severity: "blocking", description, fix_hint: "—" });
  const ghost = (frames: number[], area = "Swiss Table"): QAIssue => ({
    source: "programmatic", code: "ghost_text", severity: "blocking", frame: Math.min(...frames), area,
    description: `текст «${area}» виден в 2 копиях друг на друге (кадры ${frames.join(", ")}) — след из копий читается мусором`, fix_hint: "—",
  });
  const sev = (r: ReturnType<typeof repeatsAsWarning>) => r.report.issues.map((i) => i.severity);

  it("тот же ghost_text с теми же кадрами — warning, visual fail → warn", () => {
    const r = repeatsAsWarning(rep(ghost([30, 60])), [rep(ghost([30, 60]))]);
    expect(sev(r)).toEqual(["warning"]);
    expect(r.report.gate.visual).toBe("warn");
  });

  it("ghost_text с другими кадрами — остаётся blocking", () => {
    expect(sev(repeatsAsWarning(rep(ghost([30, 90])), [rep(ghost([30, 60]))]))).toEqual(["blocking"]);
  });

  it("тот же код и кадр, другая область — остаётся blocking", () => {
    expect(sev(repeatsAsWarning(rep(ghost([30, 60], "Hash Map")), [rep(ghost([30, 60]))]))).toEqual(["blocking"]);
  });

  it("замечание без кадра и области: другой текст — blocking, тот же текст — warning", () => {
    const prev = [rep(bare("missing_element", "на кадрах нет подписи оси"))];
    expect(sev(repeatsAsWarning(rep(bare("missing_element", "в финале нет героя-числа")), prev))).toEqual(["blocking"]);
    expect(sev(repeatsAsWarning(rep(bare("missing_element", "на кадрах  нет подписи оси")), prev))).toEqual(["warning"]);
  });

  it("dead_air исправляется один раз (ревью S15b, I-2): повтор с другими кадрами — warning; первый раз — blocking", () => {
    const dead = (from: number, to: number): QAIssue => ({
      source: "programmatic", code: "dead_air", severity: "blocking", frame: from, area: "b-evac-flow",
      description: `кадры ${from}–${to}: идёт бит b-evac-flow (перенос), а в кадре ${to - from} кадров ничего не меняется и не движется — мёртвый воздух посреди речи`, fix_hint: "—",
    });
    expect(sev(repeatsAsWarning(rep(dead(186, 246)), [rep(ghost([30, 60]))]))).toEqual(["blocking"]);
    const r = repeatsAsWarning(rep(dead(192, 252)), [rep(dead(186, 246))]);
    expect(sev(r)).toEqual(["warning"]);
    expect(r.report.issues[0]!.description).toMatch(/код исправляется один раз/);
  });

  it("kit_misuse, network, preview_size — никогда не понижаются, даже при том же тексте", () => {
    const kit = (d: string): QAIssue => ({ ...bare("kit_misuse", `kit сообщает о неверном использовании: ${d}`), source: "programmatic" });
    expect(sev(repeatsAsWarning(rep(kit("queue cells переполнен")), [rep(kit("DataToken раньше ребра"))]))).toEqual(["blocking"]);
    expect(sev(repeatsAsWarning(rep(kit("DataToken раньше ребра")), [rep(kit("DataToken раньше ребра"))]))).toEqual(["blocking"]);
    for (const code of ["network", "preview_size"]) {
      const i: QAIssue = { ...bare(code, "сцена обращается к сети: http://x"), source: "programmatic" };
      const r = repeatsAsWarning(rep(i), [rep(i)]);
      expect(sev(r)).toEqual(["blocking"]);
      expect(r.report.gate.visual).toBe("fail");
    }
  });
});
