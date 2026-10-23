// Итог QA версии: четыре gate, оценки Visual QA, замечания с кадром (клик → кадр в плеере),
// миниатюры проверенных кадров. Это автоматическая оценка — решение за пользователем.
// visual = warn — версия опубликована с замечаниями (лучшая попытка, S5).
import { QA_SCORE_AXES, type QAReport, type QaGate } from "@ms/contracts";
import { urls } from "../api/client.js";
import { t, tk } from "../i18n/index.js";
import { formatNumber } from "../lib/player-math.js";

export interface QAPanelProps {
  versionId: string;
  gate: QaGate | null;
  report: QAReport | null;
  qaFrames: number[];
  onSeek: (frame: number) => void;
}

const GATES = ["technical", "visual", "semantic", "style"] as const;

export function QAPanel({ versionId, gate, report, qaFrames, onSeek }: QAPanelProps) {
  const g = report?.gate ?? gate;
  const issues = [...(report?.issues ?? [])].sort((a, b) => (a.severity === b.severity ? (a.frame ?? 0) - (b.frame ?? 0) : a.severity === "blocking" ? -1 : 1));
  const scores = report?.scores;
  return (
    <section className="panel qa" aria-label={t("qa.title")}>
      <h2>{t("qa.title")}</h2>
      <p className="hint">{t("qa.automated")}</p>
      {g ? (
        <ul className="gates">
          {GATES.map((k) => (
            <li key={k} data-verdict={g[k]}>
              <span>{t(`qa.gate.${k}`)}</span>
              <span className={`badge verdict-${g[k]}`}>{t(`qa.verdict.${g[k]}`)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {g?.visual === "warn" ? <p className="notice warn">{t("qa.publishedWithWarnings")}</p> : null}
      {scores ? (
        <div className="scores">
          <div data-testid="qa-overall" className="score-overall">{t("qa.overall", { score: formatNumber(scores.overall, 1) })}</div>
          <ul className="score-axes">
            {QA_SCORE_AXES.map((a) => (
              <li key={a}>
                <span>{t(`qa.axis.${a}`)}</span>
                <meter min={1} max={10} value={scores[a]} />
                <span className="mono">{formatNumber(scores[a], 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report ? (
        issues.length > 0 ? (
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n} className={`issue issue-${i.severity}`}>
                <span className={`badge severity-${i.severity}`}>{t(`qa.severity.${i.severity}`)}</span>
                {i.frame !== undefined ? (
                  <button type="button" className="link mono" onClick={() => onSeek(i.frame!)}>{t("qa.frame", { frame: i.frame })}</button>
                ) : null}
                <span className="issue-code mono">{tk(`qa.code.${i.code}`, i.code)}</span>
                <p>{i.description}</p>
                {i.fix_hint && i.fix_hint !== "-" ? <p className="hint">{t("qa.fixHint", { hint: i.fix_hint })}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("qa.noIssues")}</p>
        )
      ) : (
        <p className="muted">{t("qa.noReport")}</p>
      )}
      {qaFrames.length > 0 ? (
        <div className="thumbs">
          {qaFrames.map((f) => (
            <figure key={f}>
              <img src={urls.frame(versionId, f)} alt={t("qa.frame", { frame: f })} loading="lazy" onClick={() => onSeek(f)} />
              <figcaption className="mono">{f}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
