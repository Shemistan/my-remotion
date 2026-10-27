import type { ReactNode } from "react";
import { t } from "../../i18n/index.js";

export function EmptyState({ title = t("ux.empty.title"), description, action, compact = false }: {
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      <strong>{title}</strong>
      {description ? <p className="muted small">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
