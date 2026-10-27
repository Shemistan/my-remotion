// Трассировка задачи (Task 48, ТЗ §12): дерево проект → сцена → версия → задача (и дочерние) →
// запуски агентов → рендеры, со стоимостью (справочно, по данным CLI) и временем.
import type { JobTraceDto } from "@ms/contracts/diagnostics";
import { useState } from "react";
import { usd, useTrace } from "../../api/diagnostics-client.js";
import { errorText, t, tk } from "../../i18n/index.js";
import { stageText } from "../JobStatus.js";
import { ErrorCard } from "./ErrorCard.js";

const sec = (ms: number | null) => (ms === null ? "—" : t("diagnostics.trace.seconds", { s: (ms / 1000).toFixed(1) }));

function Tree({ tr }: { tr: JobTraceDto }) {
  const jobsAll = [tr.job, ...tr.children];
  return (
    <ul className="trace-tree">
      <li>
        <span className="muted">{t("diagnostics.trace.project")}</span> {tr.project.title} <span className="mono small">{tr.project.id}</span>
        <ul>
          {tr.scene ? (
            <li>
              <span className="muted">{t("diagnostics.trace.scene")}</span> {tr.scene.title} <span className="mono small">{tr.scene.id}</span>
              {tr.version ? <> · {t("diagnostics.trace.version", { n: tr.version.number })} <span className="mono small">{tr.version.id}</span></> : null}
            </li>
          ) : null}
          {jobsAll.map((j) => (
            <li key={j.id} data-trace-job={j.id}>
              <div className="row wrap">
                <strong>{tk(`job.type.${j.type}`, j.type)}</strong>
                <span className={`badge status-${j.status}`}>{t(`job.status.${j.status}`)}</span>
                <span className="muted">{t("diagnostics.trace.attempt", { n: j.attempt })}</span>
                {j.stage ? <span className="muted">{stageText(j.stage)}</span> : null}
                <span className="mono small">{j.id}</span>
              </div>
              {j.error ? <ErrorCard error={j.error} jobId={j.id} /> : null}
              <ul>
                {tr.agentRuns.filter((r) => r.job_id === j.id).map((r) => (
                  <li key={r.id} data-agent-run={r.id}>
                    {t("diagnostics.trace.agent", { role: tk(`diagnostics.role.${r.role}`, r.role), model: r.model })}
                    {" · "}<span className={`badge status-${r.status === "completed" ? "completed" : "failed"}`}>{r.status}</span>
                    {" · "}{r.cost_usd === null ? t("diagnostics.trace.noCost") : usd(r.cost_usd)}
                    {" · "}{sec(r.duration_ms)}
                    {r.input_tokens !== null ? ` · ${t("diagnostics.trace.tokens", { i: r.input_tokens, o: r.output_tokens ?? 0 })}` : null}
                  </li>
                ))}
                {tr.renderJobs.filter((r) => r.job_id === j.id).map((r) => (
                  <li key={r.id} data-render-job={r.id}>
                    {t("diagnostics.trace.render", { kind: r.kind })}
                    {r.width && r.height ? ` · ${r.width}×${r.height}` : null}
                    {r.frames ? ` · ${t("diagnostics.trace.frames", { n: r.frames })}` : null}
                    {" · "}{sec(r.duration_ms)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  );
}

export function TraceView({ jobId: initial }: { jobId?: string }) {
  const [input, setInput] = useState(initial ?? "");
  const [jobId, setJobId] = useState(initial);
  const q = useTrace(jobId);
  return (
    <section className="panel" aria-label={t("diagnostics.trace.title")}>
      <h2>{t("diagnostics.trace.title")}</h2>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); setJobId(input.trim() || undefined); }}>
        <label htmlFor="trace-job">{t("diagnostics.trace.job")}</label>
        <input id="trace-job" className="mono" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">{t("diagnostics.trace.show")}</button>
      </form>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {q.data ? (
        <>
          <p data-testid="trace-cost">
            {t("diagnostics.trace.cost", { usd: usd(q.data.cost.usd), runs: q.data.cost.runs })}
            {q.data.cost.unknown > 0 ? ` ${t("diagnostics.trace.costUnknown", { n: q.data.cost.unknown })}` : ""}
          </p>
          <p className="hint small">{t("diagnostics.trace.costNote")}</p>
          <Tree tr={q.data} />
          {q.data.events.length > 0 ? (
            <details>
              <summary>{t("job.log", { n: q.data.events.length })}</summary>
              <pre className="log small" tabIndex={0} aria-label={t("job.log", { n: q.data.events.length })}>{q.data.events.map((e) => `${e.ts.slice(11, 19)} ${e.level.padEnd(5)} ${e.kind}: ${e.message}`).join("\n")}</pre>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
