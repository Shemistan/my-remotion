// Сводка разнообразия плана (S8, спека §5.3): приём × число принятых сцен, соседние повторы,
// доля «Тезиса словами». Показывает `doc.diversity` — его считает сервер (`planDiversity`, S3)
// при каждой ревизии плана; поле обязательно в схеме, своего расчёта в UI нет.
import { type ScriptPlanRevisionDoc, TECHNIQUES } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { techniqueLabel } from "../../script/format.js";

export function DiversitySummary({ doc }: { doc: ScriptPlanRevisionDoc }) {
  const d = doc.diversity;
  const rows = TECHNIQUES.map((x) => [x.slug, d.techniques[x.slug] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const adjacent = d.adjacent_repeats;
  const kinetic = Math.round(d.kinetic_share * 100);
  return (
    <section className="panel" data-testid="diversity" aria-label={t("scriptPlan.diversity.title")}>
      <h2>{t("scriptPlan.diversity.title")}</h2>
      {rows.length === 0 ? <p className="muted small">{t("scriptPlan.diversity.empty")}</p> : (
        <>
          <ul className="diversity-list">
            {rows.map(([slug, n]) => <li key={slug} className="chip">{techniqueLabel(slug)} × {n}</li>)}
          </ul>
          <p className="small muted">
            {t("scriptPlan.diversity.adjacent", { n: adjacent })} · {t("scriptPlan.diversity.kinetic", { p: kinetic })}
          </p>
        </>
      )}
    </section>
  );
}
