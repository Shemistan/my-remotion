// Проблемы плана сценария (S8): blocking — первыми и красным; код — по словарю
// `scriptPlan.issue.*`, подробности — сообщение проверки, где id сцен заменены на «сцена N», а
// коды приёмов, форм времени и правил формы и имя поля `structure_rule` — на русские названия.
// Неизвестный код — только сообщение.
import { type PlanIssue, STRUCTURE_RULES, SceneStructureSchema, TECHNIQUES } from "@ms/contracts";
import { hasKey, t, tk } from "../../i18n/index.js";
import { techniqueLabel } from "../../script/format.js";

/** Сообщение проверки для человека: `ss_002` → «сцена 2», `hero-number` → «Ключевое число». */
export function humanizeMessage(message: string, numbers: ReadonlyMap<string, number>): string {
  let s = message.replace(/\bss_\d{3,}\b/g, (id) => {
    const n = numbers.get(id);
    return n !== undefined ? t("scriptPlan.scene.n", { n }).toLowerCase() : t("scriptPlan.scene.rejected").toLowerCase();
  });
  for (const x of TECHNIQUES) s = s.replace(new RegExp(`(?<![\\w-])${x.slug}(?![\\w-])`, "g"), `«${techniqueLabel(x.slug)}»`);
  // ревизии плана до S11 советовали «задайте другую structure_rule» — поле и правила формы по-русски (S17a)
  s = s.replace(/\bstructure_rule\b/g, t("scriptPlan.structureRule"));
  for (const [rule, structure] of STRUCTURE_RULES) {
    s = s.replace(new RegExp(`(?<![\\w-])${rule}(?![\\w-])`, "g"), `«${tk(`scriptPlan.structure.${structure}`, rule)}»`);
  }
  for (const x of SceneStructureSchema.options) {
    s = s.replace(new RegExp(`(?<![\\w-])${x}(?![\\w-])`, "g"), `«${tk(`scriptPlan.structure.${x}`, x)}»`);
  }
  return s;
}

/** Строка проблемы: метка по коду и подробности. */
export function IssueText({ issue, numbers }: { issue: PlanIssue; numbers: ReadonlyMap<string, number> }) {
  const key = `scriptPlan.issue.${issue.code}`;
  const msg = issue.message ? humanizeMessage(issue.message, numbers) : "";
  if (!hasKey(key)) return <span>{msg || t("scriptPlan.analysis.empty")}</span>;
  return (
    <>
      <strong>{tk(key, issue.code)}</strong>
      {msg ? <span className="muted"> — {msg}</span> : null}
    </>
  );
}

export const sortIssues = (issues: readonly PlanIssue[]) =>
  [...issues].sort((a, b) => Number(b.severity === "blocking") - Number(a.severity === "blocking"));

export interface PlanIssuesProps {
  issues: readonly PlanIssue[];
  numbers: ReadonlyMap<string, number>;
  onSelect?: (itemId: string) => void;
}

export function PlanIssues({ issues, numbers, onSelect }: PlanIssuesProps) {
  return (
    <section className="panel" data-testid="plan-issues" aria-label={t("scriptPlan.issues.title")}>
      <h2>{t("scriptPlan.issues.title")}</h2>
      {issues.length === 0 ? <p className="muted small">{t("scriptPlan.issues.none")}</p> : (
        <ul className="plan-issues">
          {sortIssues(issues).map((x, i) => {
            const n = x.item_id ? numbers.get(x.item_id) : undefined;
            return (
              <li key={`${x.item_id ?? ""}-${x.code}-${i}`} className={`severity-${x.severity}`} data-code={x.code}>
                <span className={`badge severity-${x.severity}`}>{t(`scriptPlan.severity.${x.severity}`)}</span>
                {x.item_id && n !== undefined ? (
                  <button type="button" className="link-button" onClick={() => onSelect?.(x.item_id!)}>{t("scriptPlan.scene.n", { n })}</button>
                ) : null}
                <IssueText issue={x} numbers={numbers} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
