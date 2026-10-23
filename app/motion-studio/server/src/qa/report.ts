// Итоговый QAReport версии: технический gate + программные проверки + Visual QA.
// Автоматический QA — вспомогательный (ТЗ §8.5): окончательное решение за человеком.
import type { QAIssue, QAReport, Verdict, VisualQAOutput } from "@ms/contracts";

const RANK: Record<Verdict, number> = { not_checked: 0, pass: 1, warn: 2, fail: 3 };
const worst = (...v: Verdict[]): Verdict => v.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "not_checked");
const verdictOf = (issues: QAIssue[]): Verdict =>
  issues.some((i) => i.severity === "blocking") ? "fail" : issues.length > 0 ? "warn" : "pass";

export function mergeQA(parts: { technical: QAIssue[]; programmatic: QAIssue[]; agent?: VisualQAOutput }): QAReport {
  const { agent } = parts;
  return {
    gate: {
      technical: parts.technical.some((i) => i.severity === "blocking") ? "fail" : "pass",
      visual: worst(verdictOf(parts.programmatic), agent?.gate.visual ?? "not_checked"),
      semantic: agent?.gate.semantic ?? "not_checked",
      style: agent?.gate.style ?? "not_checked",
    },
    issues: [...parts.technical, ...parts.programmatic, ...(agent?.issues ?? []).map((i): QAIssue => ({ source: "agent", ...i }))],
    checked_frames: agent?.checked_frames ?? [],
    ocr: agent?.ocr ?? [],
    ...(agent?.scores ? { scores: agent.scores } : {}),
    automated: true,
  };
}

/**
 * Лучшая попытка, принятая после исчерпания исправлений (S5, R2 #10): автоматический QA —
 * вспомогательный (ТЗ §8.5), решение за человеком. Blocking становится warning с пометкой
 * «не исправлено …», вердикт visual `fail` — `warn`. semantic и style не смягчаются
 * (rulings 2026-10-23): неверные числа или смысл не публикуются как ready — такой отчёт
 * по-прежнему блокирует (`qaBlocks`). technical не меняется (его неудача до QA не доходит).
 */
export function acceptedAsWarn(report: QAReport, why: string): QAReport {
  const soft = (v: Verdict): Verdict => (v === "fail" ? "warn" : v);
  return {
    ...report,
    gate: { ...report.gate, visual: soft(report.gate.visual) },
    issues: report.issues.map((i) => (i.severity === "blocking" ? { ...i, severity: "warning" as const, description: `[не исправлено ${why}] ${i.description}` } : i)),
  };
}

/** semantic или style `fail` — смысл или стиль: такую попытку не публикуют даже с warn. */
export function meaningFails(report: QAReport): boolean {
  return report.gate.semantic === "fail" || report.gate.style === "fail";
}

/** Блокирует публикацию как ready: есть blocking-замечание или любой gate `fail`. */
export function qaBlocks(report: QAReport): boolean {
  return report.issues.some((i) => i.severity === "blocking") || Object.values(report.gate).some((v) => v === "fail");
}

/** Текст для Engineer: blocking, затем warnings — код, кадр, область, что не так и как исправить. */
export function fixHints(report: QAReport): string {
  const ordered = [...report.issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1));
  if (ordered.length === 0) return "";
  const lines = ordered.map((i) => {
    const where = [i.frame !== undefined ? `кадр ${i.frame}` : "", i.area ? `область ${i.area}` : ""].filter(Boolean).join(", ");
    return `- [${i.severity}] ${i.code}${where ? ` (${where})` : ""}: ${i.description} → ${i.fix_hint}`;
  });
  return ["Замечания QA по кадрам (сначала blocking — их исправить обязательно):", ...lines].join("\n");
}
