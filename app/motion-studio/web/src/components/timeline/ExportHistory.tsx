// История экспортов финала (Task 45): экспорт — дата, ревизия таймлайна, настройки, размер,
// вердикт проверки, скачивание (непройденная проверка — с подтверждением), отчёт проверки и
// «Повторить экспорт» из сохранённого проекта (`final.reproduce`): итог `compareExports` — у
// экспорта-повтора («совпал» / «отличается», минимальный PSNR кадров).
import type { FinalExportDto, Job } from "@ms/contracts";
import { useState } from "react";
import { newKey } from "../../api/client.js";
import { useFinalExports, useReproduceFinal } from "../../api/timeline-client.js";
import { errorText, t } from "../../i18n/index.js";
import { JobStatus } from "../JobStatus.js";
import { FinalDownload, VerifyReport } from "./VerifyReport.js";

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
const fpsOf = (e: FinalExportDto) => {
  const f = e.output?.fps ?? e.request.fps;
  return f ? (f.den === 1 ? `${f.num}` : (f.num / f.den).toFixed(2)) : "—";
};

function Compare({ c }: { c: NonNullable<FinalExportDto["compare"]> }) {
  const min = c.frames.length > 0 ? Math.min(...c.frames.map((f) => f.psnr_db)).toFixed(1) : "—";
  return c.verdict === "reproduced" ? (
    <p className="small" data-testid="compare" data-verdict="reproduced">{t("finalExport.history.compare.reproduced", { id: c.reproduced_from, min })}</p>
  ) : (
    <p className="small error" data-testid="compare" data-verdict="differs">
      {t("finalExport.history.compare.differs", {
        id: c.reproduced_from, min,
        inputs: c.inputs_equal ? t("finalExport.history.compare.same") : t("finalExport.history.compare.other"),
        probe: c.probe_equal ? t("finalExport.history.compare.same") : t("finalExport.history.compare.other"),
      })}
    </p>
  );
}

function ExportRow({ e, words, onReproduce, busy }: { e: FinalExportDto; words?: ReadonlyMap<string, string> | undefined; onReproduce: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="final-export" data-status={e.status} data-export-id={e.id}>
      <div className="row wrap">
        <span>
          {t("finalExport.history.item", {
            at: when(e.created_at), n: e.timeline_revision, fps: fpsOf(e), quality: t(`finalExport.quality.${e.request.quality}`),
            res: e.request.resolution === "source" ? t("finalExport.history.resolution.source") : e.request.resolution,
          })}
        </span>
        {e.bytes !== undefined ? <span className="muted small">{t("finalExport.history.size", { mb: (e.bytes / 1e6).toFixed(1) })}</span> : null}
        <span className={`badge ${e.status === "ready" ? "status-completed" : "status-failed"}`}>{t(`finalExport.history.verdict.${e.status}`)}</span>
        <span className="spacer" />
        <FinalDownload exp={e} />
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{t("finalExport.history.report")}</button>
        <button type="button" disabled={busy} title={t("finalExport.history.reproduceHint")} onClick={onReproduce}>{t("finalExport.history.reproduce")}</button>
      </div>
      {e.compare ? <Compare c={e.compare} /> : null}
      {open ? <VerifyReport exp={e} {...(words ? { words } : {})} /> : null}
    </li>
  );
}

export interface ExportHistoryProps {
  projectId: string;
  /** Идёт задача финала — список опрашивается. */
  active: boolean;
  words?: ReadonlyMap<string, string> | undefined;
}

export function ExportHistory({ projectId, active, words }: ExportHistoryProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [key, setKey] = useState(newKey);
  const q = useFinalExports(projectId, active || job !== null);
  const reproduce = useReproduceFinal(projectId);
  const list = q.data ?? [];
  return (
    <section className="panel export-history" aria-label={t("finalExport.history.title")} data-testid="export-history">
      <h3>{t("finalExport.history.title")}</h3>
      {job ? <JobStatus jobId={job.id} /> : null}
      {reproduce.isError ? <p className="error">{errorText(reproduce.error)}</p> : null}
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      {q.data && list.length === 0 ? <p className="muted">{t("finalExport.history.empty")}</p> : null}
      <ul className="plain">
        {list.map((e) => (
          <ExportRow
            key={e.id}
            e={e}
            words={words}
            busy={reproduce.isPending}
            onReproduce={() => reproduce.mutate({ exportId: e.id, key: `${key}:${e.id}` }, { onSuccess: (r) => setJob(r.job), onSettled: () => setKey(newKey()) })}
          />
        ))}
      </ul>
    </section>
  );
}
