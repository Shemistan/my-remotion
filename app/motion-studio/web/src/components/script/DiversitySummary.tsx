// Сводка разнообразия плана (S8, спека §5.3): приём × число принятых сцен, соседние повторы,
// доля «Тезиса словами». Считается по принятым сценам документа — так же, как `planDiversity`.
import { type ScriptPlanRevisionDoc, TECHNIQUES, type Technique } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { techniqueLabel } from "../../script/format.js";

export function DiversitySummary({ doc }: { doc: ScriptPlanRevisionDoc }) {
  const accepted = doc.items.filter((x) => x.status === "accepted");
  const counts = new Map<Technique, number>();
  for (const x of accepted) counts.set(x.technique, (counts.get(x.technique) ?? 0) + 1);
  const rows = TECHNIQUES.map((x) => [x.slug, counts.get(x.slug) ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const adjacent = accepted.filter((x, i) => i > 0 && accepted[i - 1]!.technique === x.technique).length;
  const kinetic = accepted.length > 0 ? Math.round(((counts.get("kinetic-quote") ?? 0) / accepted.length) * 100) : 0;
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
