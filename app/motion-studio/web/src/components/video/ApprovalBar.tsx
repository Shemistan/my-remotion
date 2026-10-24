// Бейджи утверждений видеопроекта (`05` §7): A — черновой монтаж, B — визуальный план;
// «нет», «утверждено», «устарело — причина». Отзыв — действием человека.
import type { ProjectApprovalsDto } from "@ms/contracts";
import { t, tk } from "../../i18n/index.js";

type State = ProjectApprovalsDto["A"];

const label = (s: State) =>
  s.state === "stale" ? tk(`approval.stale.${s.reason ?? "subject_changed"}`, t("approval.state.stale")) : t(`approval.state.${s.state}`);

export function ApprovalBar({ approvals, onRevoke }: { approvals: ProjectApprovalsDto; onRevoke?: (id: string) => void }) {
  return (
    <div className="row wrap approval-bar">
      {(["A", "B"] as const).map((k) => {
        const s = approvals[k];
        return (
          <span key={k} className="row" data-testid={`approval-${k}`} data-state={s.state}>
            <span className="muted">{t(`approval.${k}`)}</span>
            <span className={`badge approval-${s.state}`}>{label(s)}</span>
            {onRevoke && s.approval && s.state !== "missing" ? (
              <button type="button" className="link-button small" onClick={() => onRevoke(s.approval!.id)}>{t("approval.revoke")}</button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
