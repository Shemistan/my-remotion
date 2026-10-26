// Баннер «таймлайн устарел» (Task 45): что изменилось после сборки (монтаж, план, стиль, версии и
// утверждения сцен) и «Пересобрать» — новая ревизия из текущих входов с переносом правок.
import type { TimelineStaleReason } from "@ms/contracts";
import { t, tk } from "../../i18n/index.js";

export interface FreshnessBannerProps {
  reasons: readonly TimelineStaleReason[];
  busy: boolean;
  onRebuild: () => void;
}

export function FreshnessBanner({ reasons, busy, onRebuild }: FreshnessBannerProps) {
  const list = reasons.map((r) => tk(`projectTimeline.stale.reason.${r}`, r)).join(", ");
  return (
    <div className="hint stale-banner" role="status" data-testid="timeline-stale">
      <strong>{t("projectTimeline.stale.title")}</strong>
      <p>{t("projectTimeline.stale.text", { reasons: list })}</p>
      <button type="button" className="primary" disabled={busy} onClick={onRebuild}>{t("projectTimeline.rebuild")}</button>
    </div>
  );
}
