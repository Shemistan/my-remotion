// Страница обычного проекта: различимые карточки, статусы генераций и фильтр сцен.
import { defaultSettings } from "@ms/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../src/i18n/index.js";
import { ProjectPage } from "../src/pages/Dashboard.js";
import { historyEntry } from "./fixtures.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

it("показывает ошибку сцены, excerpt дубля и фильтрует упавшие", async () => {
  const failedJob = {
    id: "job_failed", status: "failed", stage: "engineer",
    error: { code: "pipeline", stage: "engineer", message: "hit your usage limit · resets 19:00" },
  } as const;
  const ready = historyEntry("v2", 1);
  const project = { id: "p1", kind: "playground", title: "Пакет", settings: defaultSettings(), created_at: TS, updated_at: TS } as const;
  const failedListJob = { ...job({ ...failedJob, progress: 0.5, finished_at: TS }), project_title: "Пакет", scene_title: "Общий стиль" };
  const { calls } = fakeFetch([
    on("GET", "/api/projects/p1", {
      project,
      scenes: [
        {
          id: "s1", project_id: "p1", title: "Общий стиль", excerpt: "Рост выручки", current_version_id: null,
          approved_version_id: null, created_at: TS, current_version: null, latest_version: null, last_job: failedJob,
        },
        {
          id: "s2", project_id: "p1", title: "Общий стиль", excerpt: "Снижение расходов", current_version_id: "v2",
          approved_version_id: null, created_at: TS, current_version: ready, latest_version: ready, last_job: null,
        },
      ],
      exports: [],
    }),
    on("GET", "/api/jobs?status=failed&project_id=p1&limit=500", [failedListJob]),
    on("POST", "/api/jobs/retry-failed", { retried: ["job_failed"], skipped: [] }),
  ]);

  const view = renderQ(<ProjectPage id="p1" />);
  expect(await screen.findByText(t("job.status.failed"))).toBeTruthy();
  expect(screen.getByText("Рост выручки")).toBeTruthy();
  expect(screen.getByText("Закончился лимит Claude — сброс 19:00")).toBeTruthy();
  expect(view.container.querySelector('[data-scene-id="s2"] img')?.getAttribute("src")).toBe("/api/versions/v2/poster.png");

  fireEvent.click(screen.getByRole("button", { name: t("project.sceneFilter.failed") }));
  expect(view.container.querySelector('[data-scene-id="s1"]')).not.toBeNull();
  expect(view.container.querySelector('[data-scene-id="s2"]')).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: t("project.retryFailed", { n: 1 }) }));
  await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["job_failed"] }));
});
