// «Построить план» / «Перестроить план» (S8): задача `script.plan` (Script Director) по
// сохранённому тексту. Перестроение заменяет план с правками — сначала подтверждение. Статус
// задачи — `JobStatus`; задача завершилась — состояние сценария перечитывается и `onDone`.
// Задача, запущенная раньше (вкладку открыли заново), находится в списке идущих задач.
import type { ReadingSettings, ScriptStateDto } from "@ms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { newKey } from "../../api/client.js";
import { useJob, useJobs } from "../../api/queries.js";
import { scriptStateKey, useBuildPlan } from "../../api/script-client.js";
import { t } from "../../i18n/index.js";
import { scriptErrorText } from "../../script/format.js";
import { JobStatus } from "../JobStatus.js";

export interface BuildPlanProps {
  state: ScriptStateDto;
  reading: ReadingSettings;
  /** Почему построить нельзя (несохранённый текст); null — можно. */
  blockedReason: string | null;
  onDone: () => void;
}

export function BuildPlan({ state, reading, blockedReason, onDone }: BuildPlanProps) {
  const projectId = state.project.id;
  const client = useQueryClient();
  const build = useBuildPlan(projectId);
  const [key, setKey] = useState(newKey);
  const [useAgent, setUseAgent] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [started, setStarted] = useState<string | null>(null);
  const running = useJobs({ status: "running" });
  const earlier = running.data?.find((j) => j.type === "script.plan" && j.project_id === projectId)?.id ?? null;
  // идущая задача, найденная списком, запоминается: после завершения её в списке уже нет
  useEffect(() => {
    if (earlier && !started) setStarted(earlier);
  }, [earlier, started]);
  const jobId = started ?? earlier;
  const job = useJob(jobId ?? undefined);
  const status = job.data?.job.status;
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId || status !== "completed" || handled.current === jobId) return;
    handled.current = jobId;
    void client.invalidateQueries({ queryKey: scriptStateKey(projectId) });
    onDone();
  }, [jobId, status, client, projectId, onDone]);

  const active = status === "pending" || status === "running" || status === "awaiting_input";
  const hasPlan = state.plan !== null;
  const start = () => {
    setConfirm(false);
    build.mutate(
      { body: { useAgent, reading }, key },
      { onSuccess: (r) => setStarted(r.job.id), onSettled: () => setKey(newKey()) },
    );
  };

  return (
    <div className="stack" data-testid="build-plan">
      <div className="row wrap">
        <button
          type="button"
          className={hasPlan ? "" : "primary"}
          disabled={blockedReason !== null || build.isPending || active || confirm}
          onClick={() => (hasPlan ? setConfirm(true) : start())}
        >
          {t(hasPlan ? "scriptPlan.rebuild" : "scriptPlan.build")}
        </button>
        <label className="row small">
          <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
          {t("scriptPlan.useAgent")}
        </label>
      </div>
      {blockedReason ? <p className="hint">{blockedReason}</p> : !jobId ? <p className="hint">{t("scriptPlan.build.hint")}</p> : null}
      {confirm ? (
        <div className="msg-warning" role="alertdialog" aria-label={t("scriptPlan.rebuild")}>
          <p>{t("scriptPlan.rebuild.warning")}</p>
          <div className="row wrap">
            <button type="button" className="primary" onClick={start}>{t("scriptPlan.rebuild.confirm")}</button>
            <button type="button" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
          </div>
        </div>
      ) : null}
      {build.isError ? <p className="error" role="alert">{scriptErrorText(build.error)}</p> : null}
      {jobId && status !== "completed" ? <JobStatus jobId={jobId} compact /> : null}
    </div>
  );
}
