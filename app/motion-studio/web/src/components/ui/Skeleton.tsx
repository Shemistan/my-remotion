import { t } from "../../i18n/index.js";

export function Skeleton({ lines = 3, compact = false }: { lines?: number; compact?: boolean }) {
  return (
    <div className={`skeleton${compact ? " compact" : ""}`} role="status" aria-label={t("ux.loading.label")}>
      <span className="sr-only">{t("common.loading")}</span>
      {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${Math.max(38, 100 - i * 17)}%` }} />)}
    </div>
  );
}
