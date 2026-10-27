import { t } from "../../i18n/index.js";

export interface ProgressStage {
  id: string;
  label: string;
  state: "done" | "current" | "waiting";
}

function etaText(seconds: number): string {
  if (seconds < 60) return t("ux.progress.lessMinute");
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t("ux.progress.minutes", { n: minutes });
  return t("ux.progress.hoursMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

export function ProgressStages({ stages, progress, etaSeconds }: { stages: readonly ProgressStage[]; progress: number; etaSeconds?: number | null }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="progress-stages" aria-label={t("ux.progress.title")}>
      <ol>
        {stages.map((stage) => <li key={stage.id} className={stage.state}><span aria-hidden="true" />{stage.label}</li>)}
      </ol>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("job.progress")}><div style={{ width: `${pct}%` }} /></div>
      {etaSeconds !== null && etaSeconds !== undefined && etaSeconds > 0 ? <p className="muted small">{t("ux.progress.eta", { time: etaText(etaSeconds) })}</p> : null}
    </div>
  );
}
