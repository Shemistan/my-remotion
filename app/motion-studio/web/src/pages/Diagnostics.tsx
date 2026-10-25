// Диагностика (Task 48): doctor в UI, трассировка задачи (`?job=<id>` — из карточки ошибки),
// журнал сервера с автообновлением, архив диагностики («Собрать архив»).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { diagnosticsApi, useBundles } from "../api/diagnostics-client.js";
import { dateTime } from "../api/projects-client.js";
import { DoctorTable } from "../components/diagnostics/DoctorTable.js";
import { LogViewer } from "../components/diagnostics/LogViewer.js";
import { TraceView } from "../components/diagnostics/TraceView.js";
import { errorText, t } from "../i18n/index.js";
import { useRoute } from "../router.js";

function Bundles() {
  const client = useQueryClient();
  const [prompts, setPrompts] = useState(false);
  const list = useBundles();
  const make = useMutation({
    mutationFn: () => diagnosticsApi.makeBundle(prompts),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["bundles"] }),
  });
  return (
    <section className="panel" aria-label={t("diagnostics.bundle.title")}>
      <h2>{t("diagnostics.bundle.title")}</h2>
      <p className="hint small">{t("diagnostics.bundle.hint")}</p>
      <div className="row wrap">
        <label className="row">
          <input type="checkbox" checked={prompts} onChange={(e) => setPrompts(e.target.checked)} />
          {t("diagnostics.bundle.prompts")}
        </label>
        <button type="button" disabled={make.isPending} onClick={() => make.mutate()}>{t("diagnostics.bundle.make")}</button>
      </div>
      {make.isError ? <p className="error">{errorText(make.error)}</p> : null}
      {list.data && list.data.length > 0 ? (
        <ul data-testid="bundles">
          {list.data.map((b) => (
            <li key={b.name} className="row wrap">
              <span className="mono small">{b.name}</span>
              <span className="muted small">{dateTime(b.created_at)}</span>
              {b.status === "ready" ? (
                <a href={diagnosticsApi.bundleUrl(b.name)} download={b.name}>{t("diagnostics.bundle.download", { mb: ((b.bytes ?? 0) / 1024 ** 2).toFixed(2) })}</a>
              ) : b.status === "building" ? (
                <span className="muted">{t("diagnostics.bundle.building")}</span>
              ) : (
                <span className="error">{t("diagnostics.bundle.failed", { message: b.error ?? "" })}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function Diagnostics() {
  useRoute(); // перерисовка при смене `?job=`
  const jobId = new URLSearchParams(window.location.search).get("job") ?? undefined;
  return (
    <div className="page diagnostics">
      <h1>{t("diagnostics.title")}</h1>
      <DoctorTable />
      <TraceView key={jobId ?? ""} {...(jobId ? { jobId } : {})} />
      <LogViewer {...(jobId ? { jobId } : {})} />
      <Bundles />
    </div>
  );
}
