// Карточка сцены плана сценария (S8, спека §8): номер, дословная цитата, приём (select),
// паттерн и форма времени, идея и назначение (правка), числа, ключевые термины, длительность
// «речь + запас = итого», предупреждения сцены; «Убрать»/«Вернуть», «Границы по выделению».
// Каждая правка — операция плана (`onOp`), новая ревизия делается на сервере.
import { type Fps, type PlanIssue, type ScriptPlanOp, type ScriptSceneItem, TECHNIQUES, type Technique } from "@ms/contracts";
import { useEffect, useId, useState } from "react";
import { t, tk } from "../../i18n/index.js";
import { formatDuration, formatSeconds, structureLabel, techniqueHint, techniqueLabel } from "../../script/format.js";
import type { WordRange } from "../../script/selection.js";
import { IssueText, sortIssues } from "./PlanIssues.js";

export interface SceneCardProps {
  item: ScriptSceneItem;
  /** Номер среди принятых сцен; у убранной — нет. */
  n: number | undefined;
  numbers: ReadonlyMap<string, number>;
  blockTitle: string;
  fps: Fps;
  issues: readonly PlanIssue[];
  /** Текущее выделение в тексте (слова) — для «Границы по выделению». */
  selection: WordRange | null;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onOp: (op: ScriptPlanOp) => void;
}

export function TechniqueOptions() {
  return (
    <>
      {TECHNIQUES.map((x) => (
        <option key={x.slug} value={x.slug}>{`${techniqueLabel(x.slug)} — ${techniqueHint(x.slug)}`}</option>
      ))}
    </>
  );
}

export function SceneCard({ item, n, numbers, blockTitle, fps, issues, selection, selected, busy, onSelect, onOp }: SceneCardProps) {
  const id = useId();
  const accepted = item.status === "accepted";
  const [idea, setIdea] = useState(item.idea);
  const [purpose, setPurpose] = useState(item.purpose);
  useEffect(() => { setIdea(item.idea); setPurpose(item.purpose); }, [item.idea, item.purpose]);
  const textChanged = idea !== item.idea || purpose !== item.purpose;
  const at = formatSeconds(Math.round((item.at_s * fps.num) / fps.den), fps);
  const sameRange = selection && selection.start_word_id === item.start_word_id && selection.end_word_id === item.end_word_id;
  const structure = structureLabel(item);

  return (
    <li className={`script-card${selected ? " selected" : ""}${accepted ? "" : " rejected"}`} data-testid="scene-card" data-item={item.id}>
      <div className="row wrap">
        <button type="button" className="link-button strong" onClick={onSelect} title={t("scriptPlan.scene.select")}>
          {n !== undefined ? t("scriptPlan.scene.n", { n }) : t("scriptPlan.scene.rejected")}
        </button>
        {item.origin === "user" ? <span className="badge">{t("scriptPlan.scene.byUser")}</span> : null}
        <span className="muted small duration" title={t("scriptPlan.scene.duration")}>{formatDuration(item.frames, fps)}</span>
        <span className="spacer" />
        {accepted ? (
          <button type="button" disabled={busy} onClick={() => onOp({ op: "set_status", item_id: item.id, status: "rejected" })}>{t("scriptPlan.scene.remove")}</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onOp({ op: "set_status", item_id: item.id, status: "accepted" })}>{t("scriptPlan.scene.restore")}</button>
        )}
      </div>
      <blockquote className="card-quote">«{item.quote}»</blockquote>
      <p className="small muted">{t("scriptPlan.scene.at", { s: at, block: blockTitle })}</p>

      {accepted ? (
        <>
          <dl className="kv">
            <div>
              <dt><label htmlFor={`${id}-tech`}>{t("scriptPlan.scene.technique")}</label></dt>
              <dd>
                <select id={`${id}-tech`} value={item.technique} disabled={busy} onChange={(e) => onOp({ op: "modify", item_id: item.id, patch: { technique: e.target.value as Technique } })}>
                  <TechniqueOptions />
                </select>
              </dd>
            </div>
            <div><dt>{t("scriptPlan.scene.pattern")}</dt><dd>{tk(`pattern.${item.pattern}`, item.pattern)}</dd></div>
            {structure ? <div><dt>{t("scriptPlan.scene.structure")}</dt><dd>{structure}</dd></div> : null}
            {item.data.length > 0 ? (
              <div>
                <dt>{t("scriptPlan.scene.data")}</dt>
                <dd>
                  {item.data.map((d, i) => (
                    <div key={i}>{d.label}: <strong>{String(d.value)}{d.unit ? ` ${d.unit}` : ""}</strong> <span className="muted">«{d.quote}»</span></div>
                  ))}
                </dd>
              </div>
            ) : null}
            {item.key_terms.length > 0 ? (
              <div>
                <dt>{t("scriptPlan.scene.terms")}</dt>
                <dd className="chips">{item.key_terms.map((k) => <span key={`${k.word_id}-${k.text}`} className="chip">{k.text}</span>)}</dd>
              </div>
            ) : null}
          </dl>
          <label className="small muted" htmlFor={`${id}-idea`}>{t("scriptPlan.scene.idea")}</label>
          <textarea id={`${id}-idea`} value={idea} disabled={busy} onChange={(e) => setIdea(e.target.value)} />
          <label className="small muted" htmlFor={`${id}-purpose`}>{t("scriptPlan.scene.purpose")}</label>
          <textarea id={`${id}-purpose`} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} />
          <div className="row wrap">
            {textChanged ? (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => onOp({ op: "modify", item_id: item.id, patch: { ...(idea !== item.idea ? { idea } : {}), ...(purpose !== item.purpose ? { purpose } : {}) } })}
                >
                  {t("scriptPlan.scene.saveText")}
                </button>
                <button type="button" onClick={() => { setIdea(item.idea); setPurpose(item.purpose); }}>{t("scriptPlan.scene.resetText")}</button>
              </>
            ) : null}
            {selection && !sameRange ? (
              <button type="button" data-keep-selection disabled={busy} onClick={() => onOp({ op: "modify", item_id: item.id, patch: { start_word_id: selection.start_word_id, end_word_id: selection.end_word_id } })}>
                {t("scriptPlan.scene.useSelection")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {issues.length > 0 ? (
        <ul className="card-issues small">
          {sortIssues(issues).map((x, i) => (
            <li key={`${x.code}-${i}`} className={`severity-${x.severity}`}>
              <span className={`badge severity-${x.severity}`}>{t(`scriptPlan.severity.${x.severity}`)}</span>{" "}
              <IssueText issue={x} numbers={numbers} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
