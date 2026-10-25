// Вкладка «Экспорт» сценария (S9, спека §8): формат 16:9 / 9:16, «Собрать папку» (задача
// script.package, ход — JobStatus), «Переделать под 9:16» (все готовые или выбранные), собранные
// папки: файлы, «не вошли» с причинами, шпаргалка, «Показать в Finder».
// Состояние — от ScriptWorkspace (`useScriptState`); вкладка его не запрашивает.
import type { Aspect, ScriptPackageDto, ScriptSceneItem, ScriptStateDto } from "@ms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { isActive, useJob } from "../../api/queries.js";
import { scriptStateKey, useBuildPackage, useReframe, useScriptPackage } from "../../api/script-client.js";
import { JobStatus } from "../../components/JobStatus.js";
import { AspectSwitch } from "../../components/script/AspectSwitch.js";
import { PackageCard } from "../../components/script/PackageCard.js";
import { SkippedNote } from "../../components/script/SkippedNote.js";
import "../../components/script/script.css";
import { t, tn } from "../../i18n/index.js";
import { scriptErrorText } from "../../script/format.js";
import { itemNumbers, packable, packageKey, reframeKey, sceneRows } from "../../script/output.js";

/** Id пакета из результата задачи script.package (S7: `output_refs.package_id`). */
const packageIdOf = (refs: unknown): string | undefined => {
  const id = (refs as { package_id?: unknown } | null)?.package_id;
  return typeof id === "string" && id ? id : undefined;
};

function Reframe({ state }: { state: ScriptStateDto }) {
  const reframe = useReframe(state.project.id);
  const ready = useMemo(() => sceneRows(state, "16:9").filter((r) => packable(r.scene)), [state]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const chosen = ready.filter((r) => picked.has(r.item.id)).map((r) => r.item.id);
  const toggle = (id: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return (
    <section className="panel reframe" data-testid="reframe" aria-labelledby="reframe-title">
      <h2 id="reframe-title">{t("scriptOutput.reframe.title")}</h2>
      <p className="hint">{t("scriptOutput.reframe.hint")}</p>
      {ready.length === 0 ? <p className="muted">{t("scriptOutput.reframe.none")}</p> : (
        <>
          <ul className="reframe-list">
            {ready.map((r) => (
              <li key={r.item.id}>
                <label className="inline">
                  <input type="checkbox" checked={picked.has(r.item.id)} onChange={() => toggle(r.item.id)} />
                  <strong>{t("scriptOutput.scene.n", { n: r.n })}</strong>
                  <span className="muted reframe-quote">«{r.item.quote}»</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button type="button" disabled={reframe.isPending} onClick={() => reframe.mutate({ body: { aspect: "9:16" }, key: reframeKey(state, []) })}>
              {t("scriptOutput.reframe.all", { n: ready.length })}
            </button>
            <button type="button" disabled={reframe.isPending || chosen.length === 0} onClick={() => reframe.mutate({ body: { aspect: "9:16", item_ids: chosen }, key: reframeKey(state, chosen) })}>
              {t("scriptOutput.reframe.selected", { n: chosen.length })}
            </button>
          </div>
        </>
      )}
      {reframe.isSuccess ? <p className="hint" role="status">{t("scriptOutput.reframe.started")}</p> : null}
      <SkippedNote batch={reframe.data} numbers={itemNumbers(state)} />
      {reframe.isError ? <p className="error" role="alert">{scriptErrorText(reframe.error)}</p> : null}
    </section>
  );
}

export const ExportTab: (props: { state: ScriptStateDto }) => ReactElement = ({ state }) => {
  const projectId = state.project.id;
  const client = useQueryClient();
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const build = useBuildPackage(projectId);
  const [jobId, setJobId] = useState<string | undefined>();
  const job = useJob(jobId);
  const status = job.data?.job.status;
  // сборка упала — следующая «Собрать папку» ставит новую задачу, а не возвращает упавшую
  const failedJobId = status === "failed" || status === "cancelled" ? jobId : undefined;
  const builtId = status === "completed" ? packageIdOf(job.data?.job.output_refs) : undefined;
  const inState = builtId !== undefined && state.packages.some((p) => p.id === builtId);
  const built = useScriptPackage(builtId && !inState ? builtId : undefined);

  // папки и версии могли смениться, пока вкладка была закрыта — перечитать при открытии
  useEffect(() => {
    void client.invalidateQueries({ queryKey: scriptStateKey(projectId) });
  }, [client, projectId]);
  // задача сборки завершилась — состояние сценария перечитывается (страховка к SSE)
  useEffect(() => {
    if (status && !isActive(status)) void client.invalidateQueries({ queryKey: scriptStateKey(projectId) });
  }, [status, client, projectId]);

  const rows = useMemo(() => sceneRows(state, aspect), [state, aspect]);
  const ready = rows.filter((r) => packable(r.scene)).length;
  const items = useMemo(() => {
    const m = new Map<string, { n: number; item: ScriptSceneItem }>();
    for (const r of sceneRows(state, "16:9")) m.set(r.item.id, { n: r.n, item: r.item });
    return m;
  }, [state]);
  const packages: ScriptPackageDto[] = [...state.packages, ...(built.data && !inState ? [built.data] : [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="script-export">
      <section className="panel" aria-labelledby="export-title">
        <h2 id="export-title">{t("scriptOutput.export.title")}</h2>
        <p className="hint">{t("scriptOutput.export.hint")}</p>
        <div className="row wrap">
          <AspectSwitch value={aspect} onChange={setAspect} name="export-aspect" />
          <span className="muted" data-testid="export-ready">{tn("scriptOutput.export.ready", rows.length, { ready })}</span>
        </div>
        <div className="row wrap">
          <button
            type="button"
            className="primary"
            disabled={ready === 0 || build.isPending}
            onClick={() => build.mutate({ aspect, key: packageKey(state, aspect, failedJobId) }, { onSuccess: (r) => setJobId(r.job.id) })}
          >
            {t("scriptOutput.export.build", { aspect })}
          </button>
        </div>
        {ready === 0 ? <p className="hint">{t("scriptOutput.export.noneReady")}</p> : ready < rows.length ? <p className="hint">{t("scriptOutput.export.notAll")}</p> : null}
        {build.isError ? <p className="error" role="alert">{scriptErrorText(build.error)}</p> : null}
        {jobId ? <JobStatus jobId={jobId} compact /> : null}
      </section>

      <Reframe state={state} />

      <section className="script-packages" aria-labelledby="packages-title">
        <h2 id="packages-title">{t("scriptOutput.packages.title")}</h2>
        {packages.length === 0 ? <p className="muted">{t("scriptOutput.packages.none")}</p> : null}
        {packages.map((p, i) => <PackageCard key={p.id} pkg={p} items={items} latest={i === 0} />)}
      </section>
    </div>
  );
};
