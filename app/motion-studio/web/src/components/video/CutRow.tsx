// Строка вырезки чернового монтажа: причина, интервал, длительность, уверенность, объяснение,
// заметка агента; «Принять / Отклонить» для предложенной, «Восстановить» для принятой,
// «Принять» для отклонённой; «Прослушать фрагмент» (−1 с … +1 с).
import type { EditDecision, EdlOp } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { formatNumber } from "../../lib/player-math.js";
import { formatSecondsUs, formatTimecode } from "../../video/use-timeline.js";

export interface CutRowProps {
  decision: EditDecision;
  busy: boolean;
  onOps: (ops: EdlOp[]) => void;
  onListen: (d: EditDecision) => void;
}

export function CutRow({ decision: d, busy, onOps, onListen }: CutRowProps) {
  const set = (status: "accepted" | "rejected") => onOps([{ op: "set_status", decision_id: d.id, status }]);
  return (
    <li className={`cut-row status-${d.status}`} data-testid={`cut-${d.id}`} data-status={d.status}>
      <div className="row wrap">
        <span className={`badge reason-${d.reason}`}>{t(`cut.reason.${d.reason}`)}</span>
        <span className={`badge status-${d.status === "accepted" ? "completed" : d.status === "rejected" ? "cancelled" : "pending"}`}>{t(`cut.status.${d.status}`)}</span>
        <span className="mono small">{t("cut.range", { from: formatTimecode(d.source_start_us), to: formatTimecode(d.source_end_us) })}</span>
        <span className="mono small">{t("cut.duration", { s: formatSecondsUs(d.source_end_us - d.source_start_us) })}</span>
        <span className="muted small">{t("cut.confidence", { c: formatNumber(d.confidence, 2) })}</span>
        <span className="muted small">{t(`cut.origin.${d.origin}`)}</span>
      </div>
      <p className="small">{d.explanation}</p>
      {d.agent_note ? <p className="small muted">{t("cut.agentNote", { note: d.agent_note })}</p> : null}
      <div className="row wrap">
        {d.status !== "accepted" ? (
          <button type="button" data-action="accept" disabled={busy} onClick={() => set("accepted")}>{t("cut.accept")}</button>
        ) : (
          <button type="button" data-action="restore" disabled={busy} onClick={() => set("rejected")}>{t("cut.restore")}</button>
        )}
        {d.status === "proposed" ? (
          <button type="button" data-action="reject" disabled={busy} onClick={() => set("rejected")}>{t("cut.reject")}</button>
        ) : null}
        <button type="button" data-action="listen" onClick={() => onListen(d)}>{t("cut.listen")}</button>
      </div>
    </li>
  );
}
