// Карточка собранной папки (S9, спека §8–9): имя для человека, формат, путь папки, «Показать в
// Finder», файлы сцен (NN_slug.mp4 + NN_slug_alpha.mov), сцены, которые не вошли, с причинами,
// шпаргалка.
import type { ScriptPackageDto, ScriptSceneItem } from "@ms/contracts";
import { useReveal } from "../../api/script-client.js";
import { errorText, t } from "../../i18n/index.js";
import { missingReason } from "../../script/output.js";
import { CheatsheetView } from "./CheatsheetView.js";

export interface PackageCardProps {
  pkg: ScriptPackageDto;
  /** Принятые сцены текущего плана: id → номер и цитата. */
  items: ReadonlyMap<string, { n: number; item: ScriptSceneItem }>;
  /** Шпаргалка развёрнута (у последней папки). */
  latest?: boolean;
}

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function PackageCard({ pkg, items, latest = true }: PackageCardProps) {
  const reveal = useReveal();
  const sceneLabel = (id: string) => {
    const x = items.get(id);
    return x ? t("scriptOutput.scene.n", { n: x.n }) : t("scriptOutput.scene.removed");
  };
  return (
    <article className="panel package-card" data-testid="package-card" data-package={pkg.id}>
      <div className="row wrap">
        <h3 data-testid="package-title">{pkg.display_name}</h3>
        <span className="badge">{pkg.aspect}</span>
        <span className="muted small">{t("scriptOutput.package.created", { at: when(pkg.created_at) })}</span>
        <span className="spacer" />
        <button type="button" disabled={reveal.isPending} onClick={() => reveal.mutate(pkg.id)}>{t("scriptOutput.package.reveal")}</button>
      </div>
      <p className="mono small muted wrap-any package-path">{pkg.abs_path}</p>
      {reveal.isError ? <p className="error">{errorText(reveal.error)}</p> : null}

      {pkg.files.length > 0 ? (
        <div className="table-scroll" data-testid="package-files">
          <table className="package-files">
            <caption className="small muted">{t("scriptOutput.package.files", { n: pkg.files.length })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("scriptOutput.package.col.n")}</th>
                <th scope="col">{t("scriptOutput.package.col.phrase")}</th>
                <th scope="col">{t("scriptOutput.package.col.mp4")}</th>
                <th scope="col">{t("scriptOutput.package.col.alpha")}</th>
              </tr>
            </thead>
            <tbody>
              {pkg.files.map((f) => {
                const quote = items.get(f.item_id)?.item.quote;
                return (
                  <tr key={f.n}>
                    <td className="mono">{String(f.n).padStart(pkg.files.length > 99 ? 3 : 2, "0")}</td>
                    <td className="package-quote">{quote ? `«${quote}»` : sceneLabel(f.item_id)}</td>
                    <td className="mono wrap-any">{f.mp4}</td>
                    <td className="mono wrap-any">{f.alpha}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="notice warn" data-testid="package-files">{t("scriptOutput.package.noFiles")}</p>
      )}

      {pkg.missing.length > 0 ? (
        <div className="package-missing" data-testid="package-missing">
          <h4>{t("scriptOutput.package.missingTitle", { n: pkg.missing.length })}</h4>
          <ul>
            {pkg.missing.map((m, i) => {
              const quote = items.get(m.item_id)?.item.quote;
              return (
                <li key={`${m.item_id}-${i}`}>
                  <strong>{sceneLabel(m.item_id)}</strong>
                  {quote ? <span className="muted"> «{quote}»</span> : null}
                  <span> — {missingReason(m.reason)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <CheatsheetView packageId={pkg.id} defaultOpen={latest} />
    </article>
  );
}
