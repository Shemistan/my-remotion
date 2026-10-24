// S1 «сценарий → моушн»: проект kind=script открывается в ScriptWorkspace (вкладки без содержимого);
// на Dashboard — кнопка «Сценарий», создающая проект kind=script.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { Dashboard, ProjectPage } from "../../src/pages/Dashboard.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

const project = { id: "p1", kind: "script", title: "Go map", settings: null, created_at: TS, updated_at: TS };

it("проект kind=script → вкладки «Текст», «План», «Сцены», «Экспорт»", async () => {
  fakeFetch([on("GET", "/api/projects/p1", { project, scenes: [], exports: [] })]);
  renderQ(<ProjectPage id="p1" />);
  const tabs = await screen.findAllByRole("tab");
  expect(tabs.map((x) => x.textContent)).toEqual([t("scriptPlan.tab.text"), t("scriptPlan.tab.plan"), t("scriptPlan.tab.scenes"), t("scriptPlan.tab.export")]);
  expect(tabs.map((x) => x.textContent)).toEqual(["Текст", "План", "Сцены", "Экспорт"]);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Go map");
  expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(tabs[2]!);
  expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
});

it("Dashboard: «Сценарий» создаёт проект kind=script", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects", project, 201), on("GET", "/api/projects", [])]);
  renderQ(<Dashboard />);
  fireEvent.change(screen.getByLabelText(t("dashboard.projectTitle")), { target: { value: "Go map" } });
  fireEvent.click(screen.getByRole("button", { name: t("dashboard.createScript") }));
  await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ title: "Go map", kind: "script" }));
});
