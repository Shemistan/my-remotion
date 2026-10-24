// S1 «сценарий → моушн»: проект kind=script открывается в ScriptWorkspace; рабочее место один раз
// читает состояние (`useScriptState`) и отдаёт его вкладкам `{ state }`; на Dashboard — кнопка
// «Сценарий», создающая проект kind=script.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { Dashboard, ProjectPage } from "../../src/pages/Dashboard.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";

const seen = vi.hoisted(() => ({ props: [] as { tab: string; props: Record<string, unknown> }[] }));
vi.mock("../../src/pages/script/TextTab.js", () => ({
  TextTab: (p: { onPlan: () => void }) => {
    seen.props.push({ tab: "text", props: p });
    return <button type="button" onClick={p.onPlan}>to-plan</button>;
  },
}));
vi.mock("../../src/pages/script/PlanTab.js", () => ({
  PlanTab: (p: { onGenerated: () => void }) => {
    seen.props.push({ tab: "plan", props: p });
    return <button type="button" onClick={p.onGenerated}>to-scenes</button>;
  },
}));
vi.mock("../../src/pages/script/ScenesTab.js", () => ({
  ScenesTab: (p: Record<string, unknown>) => {
    seen.props.push({ tab: "scenes", props: p });
    return <div data-tab="scenes" />;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  seen.props = [];
});

const project = { id: "p1", kind: "script", title: "Go map", settings: null, created_at: TS, updated_at: TS };
const state = {
  project, script: null, plan: null, plan_outdated: false, style: null, approval: { state: "missing" },
  scenes: [], batches: [], packages: [],
};

it("проект kind=script → вкладки «Текст», «План», «Сцены», «Экспорт»; вкладкам — { state }", async () => {
  const { calls } = fakeFetch([on("GET", "/api/projects/p1", { project, scenes: [], exports: [] }), on("GET", "/api/projects/p1/script", state)]);
  renderQ(<ProjectPage id="p1" />);
  const tabs = await screen.findAllByRole("tab");
  expect(tabs.map((x) => x.textContent)).toEqual([t("scriptPlan.tab.text"), t("scriptPlan.tab.plan"), t("scriptPlan.tab.scenes"), t("scriptPlan.tab.export")]);
  expect(tabs.map((x) => x.textContent)).toEqual(["Текст", "План", "Сцены", "Экспорт"]);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Go map");
  expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  // колбэки вкладок переключают вкладки
  fireEvent.click(await screen.findByText("to-plan"));
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(await screen.findByText("to-scenes"));
  expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
  // состояние читается одним запросом и уходит во вкладки целиком
  expect(new Set(seen.props.map((x) => x.tab))).toEqual(new Set(["text", "plan", "scenes"]));
  for (const x of seen.props) expect(x.props.state).toEqual(state);
  expect(calls.filter((c) => c.url === "/api/projects/p1/script")).toHaveLength(1);
});

it("ошибка чтения состояния — текст ошибки, панели вкладки нет", async () => {
  fakeFetch([
    on("GET", "/api/projects/p1", { project, scenes: [], exports: [] }),
    on("GET", "/api/projects/p1/script", { error: "not_script_project", message: "проект не сценарный" }, 409),
  ]);
  renderQ(<ProjectPage id="p1" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByText(t("common.loading"))).toBeTruthy();
  await waitFor(() => expect(document.querySelector(".error")).not.toBeNull());
  expect(screen.queryAllByRole("tabpanel")).toHaveLength(0);
  expect(seen.props).toEqual([]);
});

it("Dashboard: «Сценарий» создаёт проект kind=script", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects", project, 201), on("GET", "/api/projects", [])]);
  renderQ(<Dashboard />);
  fireEvent.change(screen.getByLabelText(t("dashboard.projectTitle")), { target: { value: "Go map" } });
  fireEvent.click(screen.getByRole("button", { name: t("dashboard.createScript") }));
  await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ title: "Go map", kind: "script" }));
});
