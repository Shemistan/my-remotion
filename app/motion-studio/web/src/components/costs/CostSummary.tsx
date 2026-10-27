// Сводка затрат на Dashboard (Task 49a): за 7 или 30 дней, по ролям и моделям. Справочно —
// расчётная стоимость по данным CLI, не счёт подписки; гейта нет (Р-V7).
import { useState } from "react";
import { useCosts, usd } from "../../api/diagnostics-client.js";
import { errorText, t, tk } from "../../i18n/index.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Skeleton } from "../ui/Skeleton.js";

const PERIODS = [7, 30] as const;

function Breakdown({ title, rows, label }: { title: string; rows: Record<string, number>; label: (k: string) => string }) {
  const list = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  if (list.length === 0) return null;
  return (
    <div>
      <h3 className="small">{title}</h3>
      <ul className="job-list">
        {list.map(([k, v]) => (
          <li key={k}>
            <span>{label(k)}</span>
            <span className="mono">{usd(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CostSummary({ projectId }: { projectId?: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const q = useCosts({ days, ...(projectId ? { projectId } : {}) });
  const s = q.data;
  return (
    <section className="panel cost-summary" data-testid="cost-summary" aria-label={t("costs.title")}>
      <div className="row wrap">
        <h2 className="grow">{t("costs.title")}</h2>
        {PERIODS.map((d) => (
          <button key={d} type="button" className={d === days ? "primary" : undefined} aria-pressed={d === days} onClick={() => setDays(d)}>
            {t("costs.days", { n: d })}
          </button>
        ))}
      </div>
      <p className="hint small">{t("costs.note")}</p>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : !s ? <Skeleton lines={3} compact /> : s.calls === 0 ? (
        <EmptyState compact title={t("costs.empty")} />
      ) : (
        <>
          <p>
            <strong>{t("costs.total", { usd: usd(s.totalUsd) })}</strong> <span className="muted small">{t("costs.calls", { n: s.calls })}</span>
          </p>
          {s.unknown > 0 ? <p className="hint small">{t("costs.unknown", { n: s.unknown })}</p> : null}
          <div className="grid-2">
            <Breakdown title={t("costs.byRole")} rows={s.byRole} label={(r) => tk(`diagnostics.role.${r}`, r)} />
            <Breakdown title={t("costs.byModel")} rows={s.byModel} label={(m) => m} />
          </div>
        </>
      )}
    </section>
  );
}
