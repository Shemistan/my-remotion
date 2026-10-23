// Knowledge Browser: поиск по KB, фильтры паттернов и видов, переключатель «показывать
// restricted/unknown», бейджи лицензии и совместимости, карточка компонента (markdown
// показывается как текст — разметка карточки не исполняется).
import { PATTERN_SLUGS } from "@ms/contracts";
import { useId, useState } from "react";
import { useKbCard, useKbSearch } from "../api/queries.js";
import { LicenseBadge, safeHttpUrl } from "../components/ComponentsPanel.js";
import { errorText, t, tk } from "../i18n/index.js";
import { navigate } from "../router.js";

const KINDS = ["component", "template", "example", "chart-type", "diagram-type", "doc", "util", "hook"] as const;

function CompatBadge({ value }: { value: string }) {
  return <span className={`badge compat-${value}`} data-compat={value}>{tk(`kb.compat.${value}`, value)}</span>;
}

function Card({ id }: { id: string }) {
  const q = useKbCard(id);
  if (q.isError) return <p className="error">{errorText(q.error)}</p>;
  if (!q.data) return <p className="muted">{t("common.loading")}</p>;
  const c = q.data.capability as Record<string, unknown> & { id: string; name: string; kind: string; license_class: "permissive" | "restricted" | "unknown" };
  const text = (k: string) => (typeof c[k] === "string" && c[k] ? String(c[k]) : null);
  const list = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : []);
  const repoUrl = text("repository_url");
  const href = repoUrl ? safeHttpUrl(repoUrl) : null;
  const fields: [Parameters<typeof t>[0], string | null][] = [
    ["kb.field.visualizes", text("visualizes")],
    ["kb.field.use_when", text("use_when")],
    ["kb.field.adaptations", text("adaptations")],
    ["kb.field.license", text("license")],
    ["kb.field.commit", text("commit")?.slice(0, 7) ?? null],
  ];
  return (
    <article className="panel kb-card" aria-label={t("kb.card")}>
      <div className="row wrap">
        <h2>{c.name}</h2>
        <LicenseBadge cls={c.license_class} />
        {text("compatibility_status") ? <CompatBadge value={text("compatibility_status")!} /> : null}
        <span className="badge">{tk(`kb.kind.${c.kind}`, c.kind)}</span>
      </div>
      <p className="mono small">{c.id}</p>
      {href ? <p><a href={href} target="_blank" rel="noreferrer noopener">{text("repository") ?? href}</a></p> : null}
      <dl>
        {fields.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
        ))}
        {list("patterns").length > 0 ? <div><dt>{t("kb.field.patterns")}</dt><dd>{list("patterns").map((p) => tk(`pattern.${p}`, p)).join(", ")}</dd></div> : null}
      </dl>
      {q.data.card ? <pre className="card-md">{q.data.card}</pre> : <p className="muted">{t("kb.noCard")}</p>}
    </article>
  );
}

export function KnowledgeBrowser({ q: initialQ, id }: { q?: string; id?: string }) {
  const inputId = useId();
  const [text, setText] = useState(initialQ ?? "");
  const [q, setQ] = useState(initialQ ?? "");
  const [patterns, setPatterns] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [restricted, setRestricted] = useState(false);
  const hits = useKbSearch({ q, patterns, kinds, allowRestricted: restricted });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const select = (cardId: string) => navigate({ name: "kb", ...(q ? { q } : {}), id: cardId }, { replace: true });

  return (
    <div className="page kb">
      <h1>{t("kb.title")}</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
        <label htmlFor={inputId} className="sr-only">{t("kb.search")}</label>
        <input id={inputId} className="grow" type="search" value={text} placeholder={t("kb.searchPlaceholder")} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="primary">{t("kb.searchButton")}</button>
      </form>
      <div className="kb-layout">
        <aside className="panel filters">
          <h2>{t("kb.patterns")}</h2>
          {PATTERN_SLUGS.map((p) => (
            <label key={p} className="check">
              <input type="checkbox" checked={patterns.includes(p)} onChange={() => setPatterns(toggle(patterns, p))} />
              {tk(`pattern.${p}`, p)}
            </label>
          ))}
          <h2>{t("kb.kinds")}</h2>
          {KINDS.map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} />
              {tk(`kb.kind.${k}`, k)}
            </label>
          ))}
          <label className="check toggle">
            <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
            {t("kb.showRestricted")}
          </label>
          <p className="hint">{t("kb.restrictedHint")}</p>
        </aside>
        <section className="panel results">
          <h2>{t("kb.results", { n: hits.data?.length ?? 0 })}</h2>
          {hits.isError ? <p className="error">{errorText(hits.error)}</p> : null}
          {hits.data?.length === 0 ? <p className="muted">{t("kb.nothing")}</p> : null}
          <ul className="kb-hits">
            {(hits.data ?? []).map((h) => (
              <li key={h.id} className={h.id === id ? "selected" : ""}>
                <button type="button" className="hit" onClick={() => select(h.id)}>
                  <span className="strong">{h.name}</span>
                  <span className="mono small">{h.id}</span>
                </button>
                <div className="row wrap small">
                  <LicenseBadge cls={h.license_class} />
                  <span className="muted">{h.license}</span>
                  <CompatBadge value={h.compatibility} />
                  <span className="badge">{tk(`kb.kind.${h.kind}`, h.kind)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <div className="card-col">{id ? <Card id={id} /> : <p className="muted panel">{t("kb.pickCard")}</p>}</div>
      </div>
    </div>
  );
}
