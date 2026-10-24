// Просмотр одной версии как данных: Motion Spec, props и settings — JSON текстом во вкладках
// (без разметки и исполнения). Сравнение двух версий — в VersionCompare.
import type { VersionDto } from "@ms/contracts";
import { useId, useState } from "react";
import { t } from "../i18n/index.js";

const TABS = ["spec", "props", "settings"] as const;
type Tab = (typeof TABS)[number];

export function SpecView({ dto }: { dto: VersionDto }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("spec");
  const value = tab === "spec" ? dto.spec : tab === "props" ? dto.props : dto.settings;
  return (
    <section className="panel spec-view" aria-label={t("specView.title")}>
      <h2>{t("specView.title")}</h2>
      <div role="tablist" className="row tabs">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`${id}-${k}`}
            aria-selected={tab === k}
            aria-controls={`${id}-panel`}
            className={tab === k ? "tab active" : "tab"}
            onClick={() => setTab(k)}
          >
            {t(`specView.tab.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {value === null || value === undefined ? (
          <p className="muted">{t("specView.absent")}</p>
        ) : (
          <pre className="log small spec-json">{JSON.stringify(value, null, 2)}</pre>
        )}
      </div>
    </section>
  );
}
