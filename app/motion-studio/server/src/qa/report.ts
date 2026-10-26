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

/**
 * Коды, которые исправляются не больше одного раза (S15a; S15b — смысл по фрагменту и мёртвый
 * воздух: после правки кадры сдвигаются, и правило «те же кадры» не срабатывает — ревью S15b, I-2):
 * повтор — warning при любых кадрах.
 */
export const FIX_ONCE: ReadonlySet<string> = new Set(["accent_conflict", "fragment_mismatch", "dead_air", "word_gap"]);
/** Пометка замечания, пониженного до warning как повтор после исправления. */
export const REPEAT_MARK = "[повтор после исправления";
const REPEAT_PREFIX = /^\[повтор после исправления[^\]]*\]\s*/;

/**
 * Коды безопасности и контракта (ревью S15a, I-1): не понижаются как повтор никогда — сеть,
 * неверное использование kit (сообщение kit меняется, а замечание без кадра и области),
 * пустое превью, биты-ссылки spec без бита.
 */
export const NEVER_SOFTEN: ReadonlySet<string> = new Set(["network", "kit_misuse", "preview_size", "beat_reference", "speech_window"]);

/**
 * Ключ замечания: код, область и кадры (поле `frame` и список «кадры …» в описании). Без кадра
 * или без области — ещё и нормализованное описание: иначе любой другой дефект того же кода
 * совпал бы по ключу с прошлым (ревью S15a, I-1).
 */
function repeatKey(i: QAIssue): string {
  const d = i.description.replace(REPEAT_PREFIX, "");
  const listed = /кадр(?:ы|ах)? ([\d, ]+)/.exec(d)?.[1]?.replace(/\s+/g, "").replace(/,$/, "") ?? "";
  const located = i.frame !== undefined && !!i.area;
  const text = located ? "" : `|${d.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return `${i.code}|${i.area ?? ""}|${i.frame ?? ""}|${listed}${text}`;
}

/**
 * Повторы после исправления (S15a, ревью S14: 9 замечаний «не исправлено после 2 исправлений»
 * съедали раунды Engineer). Blocking с тем же кодом, областью и кадрами, что был blocking в
 * прошлой попытке того же дубля, — warning: раунд его не исправил, следующий не исправит тоже.
 * Коды `FIX_ONCE` (accent_conflict, fragment_mismatch, dead_air) — warning при любом повторе кода; `NEVER_SOFTEN` — никогда. Visual `fail` без
 * оставшихся blocking — `warn`; semantic и style не смягчаются (rulings 2026-10-23).
 */
export function repeatsAsWarning(report: QAReport, previous: readonly QAReport[]): { report: QAReport; repeated: string[] } {
  // semantic / style fail не смягчается (rulings 2026-10-23): такой отчёт — как есть
  if (meaningFails(report)) return { report, repeated: [] };
  const was = previous.flatMap((r) => r.issues).filter((i) => i.severity === "blocking" || i.description.startsWith(REPEAT_MARK));
  if (was.length === 0) return { report, repeated: [] };
  const keys = new Set(was.map(repeatKey));
  const codes = new Set(was.map((i) => i.code));
  const repeated: string[] = [];
  const issues = report.issues.map((i): QAIssue => {
    if (i.severity !== "blocking" || i.source === "technical" || NEVER_SOFTEN.has(i.code)) return i;
    const once = FIX_ONCE.has(i.code) && codes.has(i.code);
    if (!once && !keys.has(repeatKey(i))) return i;
    repeated.push(i.code);
    return { ...i, severity: "warning", description: `${REPEAT_MARK}: ${once ? "код исправляется один раз" : "тот же код, область и кадры"}] ${i.description}` };
  });
  if (repeated.length === 0) return { report, repeated };
  const gate = !issues.some((i) => i.severity === "blocking") && report.gate.visual === "fail" ? { ...report.gate, visual: "warn" as const } : report.gate;
  return { report: { ...report, gate, issues }, repeated };
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
