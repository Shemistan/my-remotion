// Журнал сервера (Task 48): фильтры (уровень, задача, проект, число строк), автообновление по
// SSE `/api/events` — новое событие задачи перечитывает журнал (не чаще раза в секунду).
import type { LogLevel } from "@ms/contracts/diagnostics";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { type LogFilter, useLogs } from "../../api/diagnostics-client.js";
import { errorText, t } from "../../i18n/index.js";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export function LogViewer({ jobId: initialJob }: { jobId?: string }) {
  const uid = useId();
  const client = useQueryClient();
  const [level, setLevel] = useState<LogLevel>("info");
  const [jobId, setJobId] = useState(initialJob ?? "");
  const [projectId, setProjectId] = useState("");
  const [limit, setLimit] = useState(200);
  const [auto, setAuto] = useState(true);
  useEffect(() => setJobId(initialJob ?? ""), [initialJob]);
  const filter: LogFilter = { level, limit, ...(jobId.trim() ? { jobId: jobId.trim() } : {}), ...(projectId.trim() ? { projectId: projectId.trim() } : {}) };
  const q = useLogs(filter);

  useEffect(() => {
    if (!auto || typeof EventSource === "undefined") return undefined;
    const es = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ queryKey: ["logs"] });
      }, 1000);
    };
    es.addEventListener("job", bump);
    es.addEventListener("gap", bump);
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [auto, client]);

  return (
    <section className="panel" aria-label={t("diagnostics.logs.title")}>
      <h2>{t("diagnostics.logs.title")}</h2>
      <div className="row wrap">
        <label htmlFor={`${uid}-level`}>{t("diagnostics.logs.level")}</label>
        <select id={`${uid}-level`} value={level} onChange={(e) => setLevel(e.target.value as LogLevel)}>
          {LEVELS.map((l) => <option key={l} value={l}>{t(`diagnostics.level.${l}`)}</option>)}
        </select>
        <label htmlFor={`${uid}-job`}>{t("diagnostics.logs.job")}</label>
        <input id={`${uid}-job`} className="mono" value={jobId} onChange={(e) => setJobId(e.target.value)} />
        <label htmlFor={`${uid}-project`}>{t("diagnostics.logs.project")}</label>
        <input id={`${uid}-project`} className="mono" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <label htmlFor={`${uid}-limit`}>{t("diagnostics.logs.limit")}</label>
        <select id={`${uid}-limit`} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {[100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="row">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          {t("diagnostics.logs.auto")}
        </label>
        <button type="button" onClick={() => void q.refetch()}>{t("diagnostics.logs.refresh")}</button>
      </div>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {q.data && q.data.length === 0 ? <p className="muted">{t("diagnostics.logs.empty")}</p> : null}
      {q.data && q.data.length > 0 ? (
        <pre className="log small" data-testid="server-log">
          {q.data.map((e) => `${e.ts.slice(0, 19).replace("T", " ")} ${e.level.padEnd(5)} ${e.job_id ? `[${e.job_id}${e.attempt !== undefined ? ` a${e.attempt}` : ""}] ` : ""}${e.kind ? `${e.kind}: ` : ""}${e.msg}`).join("\n")}
        </pre>
      ) : null}
    </section>
  );
}
