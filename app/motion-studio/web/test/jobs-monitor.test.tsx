// Список задач: карточка раскрывается строкой таблицы непосредственно под выбранной задачей.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../src/i18n/index.js";
import { JobsMonitor } from "../src/pages/JobsMonitor.js";
import { href, parseRoute } from "../src/router.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

it("маршрут задач сохраняет фильтры статуса и проекта", () => {
  expect(parseRoute("/jobs", "?status=failed&project_id=p1")).toEqual({ name: "jobs", status: "failed", projectId: "p1" });
  expect(href({ name: "jobs", status: "failed", projectId: "p1" })).toBe("/jobs?status=failed&project_id=p1");
});

it("«Подробнее» вставляет job-detail-row сразу после строки задачи", async () => {
  const listed = job({ project_title: "Карта Go", scene_title: "Рост", status: "failed", error: { code: "pipeline", stage: "render", message: "render: timeout" } });
  fakeFetch([
    on("GET", "/api/projects", []),
    on("GET", "/api/jobs?limit=50", [listed]),
    on("GET", "/api/jobs/job_1", { job: listed, events: [], processes: [] }),
  ]);
  const view = renderQ(<JobsMonitor />);
  await waitFor(() => expect(view.container.querySelector("tr[data-job-id='job_1']")).toBeTruthy());
  const row = view.container.querySelector("tr[data-job-id='job_1']") as HTMLTableRowElement;
  fireEvent.click(within(row).getByRole("button", { name: t("jobs.details") }));
  await screen.findByRole("button", { name: t("job.retry") });
  const detail = view.container.querySelector(".job-detail-row") as HTMLTableRowElement | null;
  expect(detail).toBeTruthy();
  expect(row.nextElementSibling).toBe(detail);
  expect(detail!.querySelector("td")?.colSpan).toBe(7);
  expect(detail!.querySelector(".job-detail")).toBeTruthy();
});
