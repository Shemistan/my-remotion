// Использованные компоненты версии: записи KB (kb_id, репозиторий, commit, лицензия, класс
// лицензии, стратегия) и примитивы motion-kit. restricted/unknown — заметный бейдж.
import type { KnowledgeRef } from "@ms/contracts";
import { t } from "../i18n/index.js";

export interface ComponentsPanelProps {
  refs: KnowledgeRef[];
  kitComponents: string[];
}

/** Ссылка наружу — только http(s); прочие схемы показываются текстом. */
export const safeHttpUrl = (u: string): string | null => (/^https?:\/\//i.test(u) ? u : null);

export function LicenseBadge({ cls }: { cls: KnowledgeRef["license_class"] }) {
  return <span className={`badge license-${cls}`} data-license={cls}>{t(`license.class.${cls}`)}</span>;
}

export function ComponentsPanel({ refs, kitComponents }: ComponentsPanelProps) {
  return (
    <section className="panel components" aria-label={t("components.title")}>
      <h2>{t("components.title")}</h2>
      <h3>{t("components.kb")}</h3>
      {refs.length === 0 ? <p className="muted">{t("components.noKb")}</p> : (
        <ul className="kb-refs">
          {refs.map((r) => {
            const href = safeHttpUrl(r.repository_url);
            return (
              <li key={r.kb_id}>
                <div className="row wrap">
                  <span className="mono strong">{r.kb_id}</span>
                  <LicenseBadge cls={r.license_class} />
                  <span className="badge">{t(`strategy.${r.strategy}`)}</span>
                </div>
                <div className="row wrap muted small">
                  {href ? <a href={href} target="_blank" rel="noreferrer noopener">{r.repository}</a> : <span>{r.repository}</span>}
                  <span className="mono" title={r.commit}>{r.commit.slice(0, 7)}</span>
                  <span>{r.license}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <h3>{t("components.kit")}</h3>
      {kitComponents.length === 0 ? <p className="muted">{t("components.noKit")}</p> : (
        <ul className="chips">
          {kitComponents.map((k) => <li key={k} className="chip mono">{k}</li>)}
        </ul>
      )}
    </section>
  );
}
