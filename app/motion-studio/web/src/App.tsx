// Каркас UI: шапка с разделами, баннер хранилища, страница по маршруту; поток событий задач
// живёт всё время работы вкладки.
import { useEvents } from "./api/sse.js";
import { useHealth } from "./api/queries.js";
import { Link } from "./components/Link.js";
import { StorageBanner } from "./components/StorageBanner.js";
import { VersionCompare } from "./components/VersionCompare.js";
import { t } from "./i18n/index.js";
import { AppSettings } from "./pages/AppSettings.js";
import { Dashboard, ProjectPage } from "./pages/Dashboard.js";
import { Diagnostics } from "./pages/Diagnostics.js";
import { JobsMonitor } from "./pages/JobsMonitor.js";
import { KnowledgeBrowser } from "./pages/KnowledgeBrowser.js";
import { Playground } from "./pages/Playground.js";
import { RecoveryCenter } from "./pages/RecoveryCenter.js";
import { type Route, useRoute } from "./router.js";

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case "dashboard": return <Dashboard />;
    case "project": return <ProjectPage key={route.id} id={route.id} />;
    case "scene": return <Playground key={route.id} id={route.id} {...(route.version ? { version: route.version } : {})} />;
    case "compare":
      return (
        <div className="page compare-page">
          <nav className="crumbs"><Link to={{ name: "scene", id: route.sceneId, version: route.a }}>{t("compare.back")}</Link></nav>
          <h1>{t("compare.title")}</h1>
          <VersionCompare key={`${route.a}-${route.b}`} a={route.a} b={route.b} />
        </div>
      );
    case "kb": return <KnowledgeBrowser {...(route.q ? { q: route.q } : {})} {...(route.id ? { id: route.id } : {})} />;
    case "jobs": return <JobsMonitor {...(route.status ? { status: route.status } : {})} />;
    case "settings": return <AppSettings />;
    case "diagnostics": return <Diagnostics />;
    case "recovery": return <RecoveryCenter />;
    case "notFound": return <div className="page"><h1>{t("nav.notFound")}</h1><Link to={{ name: "dashboard" }}>{t("nav.dashboard")}</Link></div>;
  }
}

const NAV = [
  { to: { name: "dashboard" }, key: "nav.dashboard", match: ["dashboard", "project", "scene", "compare"] },
  { to: { name: "kb" }, key: "nav.kb", match: ["kb"] },
  { to: { name: "jobs" }, key: "nav.jobs", match: ["jobs"] },
  { to: { name: "diagnostics" }, key: "nav.diagnostics", match: ["diagnostics", "recovery"] },
  { to: { name: "settings" }, key: "nav.settings", match: ["settings"] },
] as const;

export function App() {
  useEvents();
  useHealth();
  const route = useRoute();
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t("app.title")}</span>
        <nav>
          {NAV.map((n) => (
            <span key={n.key} className={(n.match as readonly string[]).includes(route.name) ? "active" : ""}>
              <Link to={n.to}>{t(n.key)}</Link>
            </span>
          ))}
        </nav>
      </header>
      <StorageBanner />
      <Page route={route} />
    </div>
  );
}
