// Вкладка «Экспорт» видеопроекта (Task 5L: папка клипов со шпаргалкой; Task 45: экспорт финала).
// «Собрать папку клипов» (задача video.package, ход — JobStatus; по умолчанию только утверждённые
// сцены, флажок добавляет неутверждённые с пометкой), собранные папки: путь, «Показать в Finder»,
// сцены, которые не вошли, с причинами, шпаргалка (таблица из .md; .csv и .txt — скачать).
import type { VideoPackageDto } from "@ms/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { newKey } from "../../api/client.js";
import { isActive, useJob } from "../../api/queries.js";
import { useBuildVideoPackage, useRevealVideoPackage, useVideoPackages, videoPackageUrls, videoPackagesKey } from "../../api/video-package-client.js";
import { JobStatus } from "../../components/JobStatus.js";
import "../../components/script/script.css";
import { errorText, t } from "../../i18n/index.js";
import { parseCheatsheet } from "../../script/output.js";
import type { VideoTabProps } from "./tab-props.js";

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: "text/markdown, text/plain" }, credentials: "same-origin" });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.text();
}

function Cheatsheet({ packageId, defaultOpen }: { packageId: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const md = useQuery({ queryKey: ["videoCheatsheet", packageId], queryFn: () => fetchText(videoPackageUrls.cheatsheet(packageId, "md")), staleTime: Infinity, enabled: open });
  const parts = md.data ? parseCheatsheet(md.data) : [];
  return (
    <section className="cheatsheet" aria-label={t("videoExport.cheatsheet.title")}>
      <div className="row wrap">
        <h4>{t("videoExport.cheatsheet.title")}</h4>
        <span className="spacer" />
        <a className="button" href={videoPackageUrls.cheatsheet(packageId, "md")} target="_blank" rel="noreferrer">{t("videoExport.cheatsheet.md")}</a>
        <a className="button" href={videoPackageUrls.cheatsheet(packageId, "csv")} download>{t("videoExport.cheatsheet.csv")}</a>
        <a className="button" href={videoPackageUrls.cheatsheet(packageId, "txt")} download>{t("videoExport.cheatsheet.txt")}</a>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>{t(open ? "videoExport.cheatsheet.hide" : "videoExport.cheatsheet.show")}</summary>
        {md.isError ? <p className="muted small">{t("videoExport.cheatsheet.unavailable")}</p> : null}
        {open && !md.data && !md.isError ? <p className="muted small">{t("common.loading")}</p> : null}
        <div className="cheatsheet-body">
          {parts.map((p, i) => {
            if (p.kind === "heading") return p.level === 1 ? null : <h5 key={i} className="cheatsheet-block">{p.text}</h5>;
            if (p.kind === "text") return <p key={i} className="small muted">{p.text}</p>;
            return (
              <div key={i} className="table-scroll">
                <table className="cheatsheet-table">
                  <thead><tr>{p.head.map((h, k) => <th key={k} scope="col">{h}</th>)}</tr></thead>
                  <tbody>{p.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}

function PackageCard({ pkg, latest }: { pkg: VideoPackageDto; latest: boolean }) {
  const reveal = useRevealVideoPackage();
  const m = pkg.manifest;
  const number = new Map(m.missing.map((x) => [x.item_id, x.n]));
  return (
    <article className="panel package-card" data-testid="video-package-card" data-package={pkg.id}>
      <div className="row wrap">
        <h3>{pkg.display_name}</h3>
        <span className="muted small">{t("videoExport.package.created", { at: when(pkg.created_at) })}</span>
        <span className="spacer" />
        <button type="button" disabled={reveal.isPending} onClick={() => reveal.mutate(pkg.id)}>{t("videoExport.package.reveal")}</button>
      </div>
      <p className="mono small muted wrap-any package-path">{pkg.abs_path}</p>
      {reveal.isError ? <p className="error">{errorText(reveal.error)}</p> : null}
      <p className="small">{t("videoExport.package.clips", { n: m.scenes.length })}</p>
      {m.missing.length > 0 ? (
        <div className="package-missing" data-testid="video-package-missing">
          <h4>{t("videoExport.package.missingTitle", { n: m.missing.length })}</h4>
          <ul>
            {m.missing.map((x, i) => (
              <li key={`${x.item_id}-${i}`}>
                <strong>{number.get(x.item_id) ? t("videoExport.package.scene", { n: number.get(x.item_id)! }) : x.item_id}</strong>
                {x.quote ? <span className="muted"> «{x.quote}»</span> : null}
                <span> — {x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Cheatsheet packageId={pkg.id} defaultOpen={latest} />
    </article>
  );
}

export const ExportTab: (props: VideoTabProps) => ReactElement = ({ data }) => {
  const projectId = data.project.id;
  const client = useQueryClient();
  const packages = useVideoPackages(projectId);
  const build = useBuildVideoPackage(projectId);
  const [withUnapproved, setWithUnapproved] = useState(false);
  const [jobId, setJobId] = useState<string | undefined>();
  const status = useJob(jobId).data?.job.status;
  // задача сборки завершилась — список папок перечитывается
  useEffect(() => {
    if (status && !isActive(status)) void client.invalidateQueries({ queryKey: videoPackagesKey(projectId) });
  }, [status, client, projectId]);
  const list = packages.data ?? [];
  return (
    <div className="script-export" data-tab="export">
      <section className="panel" aria-labelledby="video-clips-title">
        <h2 id="video-clips-title">{t("videoExport.clips.title")}</h2>
        <p className="hint">{t("videoExport.clips.hint")}</p>
        <p className="hint">{t("videoExport.clips.onlyApproved")}</p>
        <label className="inline">
          <input type="checkbox" checked={withUnapproved} onChange={(e) => setWithUnapproved(e.currentTarget.checked)} />
          {t("videoExport.clips.includeUnapproved")}
        </label>
        <div className="row wrap">
          <button
            type="button"
            className="primary"
            disabled={build.isPending || (status !== undefined && isActive(status))}
            onClick={() => build.mutate({ onlyApproved: !withUnapproved, key: newKey() }, { onSuccess: (r) => setJobId(r.job.id) })}
          >
            {t("videoExport.clips.build")}
          </button>
        </div>
        {build.isError ? <p className="error" role="alert">{errorText(build.error)}</p> : null}
        {jobId ? <JobStatus jobId={jobId} compact /> : null}
      </section>

      <section className="script-packages" aria-labelledby="video-packages-title">
        <h2 id="video-packages-title">{t("videoExport.packages.title")}</h2>
        {packages.isError ? <p className="error">{errorText(packages.error)}</p> : null}
        {packages.isSuccess && list.length === 0 ? <p className="muted">{t("videoExport.packages.none")}</p> : null}
        {list.map((p, i) => <PackageCard key={p.id} pkg={p} latest={i === 0} />)}
      </section>
    </div>
  );
};
