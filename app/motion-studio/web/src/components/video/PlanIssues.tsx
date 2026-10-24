// Проблемы плана (Task 33): блокирующие сверху; код — по словарю (`plan.issue.*`), подробности —
// сообщение проверки сервера (неизвестный код — только сообщение); сцена проблемы — кнопкой выбора.
import type { PlanIssue } from "@ms/contracts";
import { hasKey, t, tk } from "../../i18n/index.js";

export interface PlanIssuesProps {
  issues: readonly PlanIssue[];
  onSelect?: (itemId: string) => void;
}

export function PlanIssues({ issues, onSelect }: PlanIssuesProps) {
  if (issues.length === 0) return <p className="muted small">{t("plan.noIssues")}</p>;
  const sorted = [...issues].sort((a, b) => Number(b.severity === "blocking") - Number(a.severity === "blocking"));
  return (
    <ul className="plan-issues">
      {sorted.map((x, i) => (
        <li key={`${x.item_id ?? ""}-${x.code}-${i}`} className={`severity-${x.severity}`} data-code={x.code}>
          <span className={`badge severity-${x.severity}`}>{t(`plan.severity.${x.severity}`)}</span>
          {" "}
          {x.item_id && onSelect ? (
            <button type="button" className="link-button" onClick={() => onSelect(x.item_id!)}>{x.item_id}</button>
          ) : x.item_id ? <span className="mono">{x.item_id}</span> : null}
          {x.item_id ? " " : null}
          {hasKey(`plan.issue.${x.code}`) ? <><strong>{tk(`plan.issue.${x.code}`, x.code)}</strong><span className="muted"> — {x.message}</span></> : <span>{x.message}</span>}
        </li>
      ))}
    </ul>
  );
}
