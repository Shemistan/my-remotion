// Рабочее место сценарного проекта (спека §8): вкладки «Текст», «План», «Сцены», «Экспорт».
// Содержимое вкладок — в своих файлах (S8: Text/Plan, S9: Scenes/Export); этот файл их только
// переключает.
import type { ProjectDto } from "@ms/contracts";
import { useState } from "react";
import { Link } from "../../components/Link.js";
import { t } from "../../i18n/index.js";
import { ExportTab } from "./ExportTab.js";
import { PlanTab } from "./PlanTab.js";
import { ScenesTab } from "./ScenesTab.js";
import { TextTab } from "./TextTab.js";

const TABS = ["text", "plan", "scenes", "export"] as const;
type Tab = (typeof TABS)[number];
const TITLE = { text: "scriptPlan.tab.text", plan: "scriptPlan.tab.plan", scenes: "scriptPlan.tab.scenes", export: "scriptPlan.tab.export" } as const;

export function ScriptWorkspace({ project }: { project: ProjectDto }) {
  const [tab, setTab] = useState<Tab>("text");
  const id = project.id;
  return (
    <div className="page script-workspace">
      <nav className="crumbs"><Link to={{ name: "dashboard" }}>{t("nav.dashboard")}</Link></nav>
      <h1>{project.title}</h1>
      <div role="tablist" aria-label={t("scriptPlan.tabs")} className="row">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`script-tab-${k}`} aria-selected={tab === k} aria-controls={`script-panel-${k}`} onClick={() => setTab(k)}>
            {t(TITLE[k])}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`script-panel-${tab}`} aria-labelledby={`script-tab-${tab}`}>
        {tab === "text" ? <TextTab project={project} onPlan={() => setTab("plan")} /> : null}
        {tab === "plan" ? <PlanTab project={project} onGenerated={() => setTab("scenes")} /> : null}
        {tab === "scenes" ? <ScenesTab projectId={id} /> : null}
        {tab === "export" ? <ExportTab projectId={id} /> : null}
      </section>
    </div>
  );
}
