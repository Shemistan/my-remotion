// Баннер устаревшего плана (Task 33): план построен по прежнему монтажу или стилю — предупреждение
// и «Перепроверить план» (`plan.recheck`, без LLM); после перепроверки — «Монтаж изменился: N сцен
// пересчитаны, M требуют решения» со списком требующих решения. Всё свежо и перемен нет — пусто.
import type { PlanDto } from "@ms/contracts";
import { t, tn } from "../../i18n/index.js";

export interface StaleBannerProps {
  fresh: PlanDto["inputs_fresh"];
  recheck: PlanDto["recheck"];
  /** Перепроверка идёт (задача или запрос). */
  busy: boolean;
  onRecheck: () => void;
}

export function StaleBanner({ fresh, recheck, busy, onRecheck }: StaleBannerProps) {
  const cutStale = !fresh.edl || !fresh.transcript;
  const changed = recheck?.changed ?? [];
  const needs = changed.filter((c) => c.change !== "remapped");
  const remapped = changed.length - needs.length;
  if (!cutStale && fresh.style && changed.length === 0) return null;
  return (
    <section className="panel stale-banner" data-testid="stale-banner" role="status">
      {cutStale ? <p className="msg-warning">{t("plan.stale.edl")}</p> : null}
      {!fresh.style ? <p className="msg-warning">{t("plan.stale.style")}</p> : null}
      {changed.length > 0 ? (
        <>
          <p className="strong">{t("plan.stale.summary", { remapped: tn("plan.stale.remapped", remapped), needs: tn("plan.stale.needs", needs.length) })}</p>
          {needs.length > 0 ? (
            <ul className="stale-list">
              {needs.map((c) => <li key={c.item_id}>{t(c.change === "anchor_cut" ? "plan.stale.change.anchor_cut" : "plan.stale.change.timing_changed", { id: c.item_id })}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="row wrap">
        <button type="button" disabled={busy} onClick={onRecheck}>{t("plan.recheck")}</button>
        {busy ? <span className="muted small">{t("plan.stale.running")}</span> : null}
      </div>
    </section>
  );
}
