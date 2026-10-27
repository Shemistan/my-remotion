// Таблица doctor (Task 48): проверка, статус, подробности и подсказка; «Проверить снова» (без кэша)
// и «Полная проверка» (с платным входом Claude и скачиванием Chrome).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { diagnosticsApi } from "../../api/diagnostics-client.js";
import { dateTime } from "../../api/projects-client.js";
import { errorText, t, tk } from "../../i18n/index.js";
import { Skeleton } from "../ui/Skeleton.js";

export function DoctorTable() {
  const client = useQueryClient();
  const [full, setFull] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const q = useQuery({
    queryKey: ["doctor", full, refresh],
    queryFn: () => diagnosticsApi.doctor(!full, refresh > 0),
    staleTime: 30_000,
  });
  const again = () => {
    setRefresh((n) => n + 1);
    void client.invalidateQueries({ queryKey: ["doctor"] });
  };
  return (
    <section className="panel" aria-label={t("diagnostics.doctor.title")}>
      <div className="row wrap">
        <h2>{t("diagnostics.doctor.title")}</h2>
        {q.data ? <span className={`badge ${q.data.ok ? "status-completed" : "status-failed"}`}>{q.data.ok ? t("diagnostics.doctor.allOk") : t("diagnostics.doctor.problems")}</span> : null}
        <button type="button" disabled={q.isFetching} onClick={again}>{t("diagnostics.doctor.again")}</button>
        <label className="row">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          {t("diagnostics.doctor.full")}
        </label>
      </div>
      <p className="hint small">{full ? t("diagnostics.doctor.fullHint") : t("diagnostics.doctor.fastHint")}</p>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {q.isFetching && !q.data ? <Skeleton lines={3} compact /> : null}
      {q.data ? (
        <>
          <table className="doctor">
            <thead><tr><th>{t("diagnostics.doctor.check")}</th><th>{t("diagnostics.doctor.status")}</th><th>{t("diagnostics.doctor.detail")}</th></tr></thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.name} data-check={r.name} className={r.ok ? "" : "doctor-bad"}>
                  <td>{tk(`diagnostics.check.${r.name}`, r.name)}</td>
                  <td><span className={`badge ${!r.ok ? "status-failed" : r.status === "ok" ? "status-completed" : "severity-warning"}`}>{tk(`diagnostics.status.${r.status}`, r.status)}</span></td>
                  <td className="wrap-any">
                    {r.detail}
                    {!r.ok ? <div className="hint small">{tk(`diagnostics.fix.${r.name}`, t("diagnostics.fix.default"))}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{t("diagnostics.doctor.checkedAt", { at: dateTime(q.data.created_at) })}</p>
        </>
      ) : null}
    </section>
  );
}
