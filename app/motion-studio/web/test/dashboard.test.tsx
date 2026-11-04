// Dashboard при недоступном хранилище: ошибка в каждом блоке, а не «пусто»; 503
// storage_offline не повторяется (баннер уже сказал главное), после возврата хранилища
// запросы перечитываются.
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, shouldRetry, storageStatus } from "../src/api/client.js";
import { StorageBanner } from "../src/components/StorageBanner.js";
import { t } from "../src/i18n/index.js";
import { Dashboard } from "../src/pages/Dashboard.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  storageStatus.set(false);
});

const offline = { error: "storage_offline", message: "нет SSD" };

it("503 storage_offline: проекты, активные задачи и экспорты — ошибка, а не «пусто»", async () => {
  fakeFetch([on("GET", "/api/projects", offline, 503), on("GET", "/api/jobs", offline, 503)]);
  renderQ(<Dashboard />);
  await waitFor(() => expect(screen.getAllByText(t("errors.storage_offline")).length).toBeGreaterThanOrEqual(2));
  expect(screen.queryByText(t("dashboard.noActiveJobs"))).toBeNull();
  expect(screen.queryByText(t("dashboard.noExports"))).toBeNull();
  expect(screen.queryByText(t("dashboard.noProjects"))).toBeNull();
});

it("пока данные грузятся — «Загрузка…», а не «пусто»", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  renderQ(<Dashboard />);
  expect(screen.getAllByText(t("common.loading")).length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText(t("dashboard.noActiveJobs"))).toBeNull();
});

it("retry: storage_offline и 4xx не повторяются, сеть и прочие 5xx — до двух раз", () => {
  expect(shouldRetry(0, new ApiError(503, "storage_offline", "нет"))).toBe(false);
  expect(shouldRetry(0, new ApiError(404, "not_found", "нет"))).toBe(false);
  expect(shouldRetry(0, new ApiError(500, "internal", "сбой"))).toBe(true);
  expect(shouldRetry(1, new TypeError("сеть"))).toBe(true);
  expect(shouldRetry(2, new TypeError("сеть"))).toBe(false);
});

it("хранилище вернулось — все запросы перечитываются", async () => {
  const { client } = renderQ(<StorageBanner />);
  const spy = vi.spyOn(client as QueryClient, "invalidateQueries");
  storageStatus.set(true);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(spy).not.toHaveBeenCalled();
  storageStatus.set(false);
  await waitFor(() => expect(spy).toHaveBeenCalled());
});

it("«Последние экспорты»: проект и сцена — ссылки; у финала есть проект и ссылка на файл", async () => {
  const done = (id: string, type: string, refs: object) => job({ id, type, status: "completed", output_refs: refs, finished_at: "2026-10-26T10:00:00.000Z" });
  fakeFetch([
    on("GET", "/api/projects", []),
    on("GET", "/api/jobs", [
      { ...done("job_e", "scene.export", { export_id: "exp_1", format: "mp4" }), project_title: "Отчёт", scene_title: "Рост" },
      { ...done("job_f", "final.render", { export_id: "fin_1", verdict: "pass" }), project_id: "p2", project_title: "Интервью", scene_id: null, scene_title: null },
    ]),
  ]);
  renderQ(<Dashboard />);
  const finalRow = (await screen.findByText(t("dashboard.finalExport"))).parentElement!;
  expect(screen.getByRole("link", { name: "Рост" }).getAttribute("href")).toBe("/scenes/s1");
  expect(screen.getByRole("link", { name: "Отчёт" }).getAttribute("href")).toBe("/projects/p1");
  expect(screen.getByRole("link", { name: "Интервью" }).getAttribute("href")).toBe("/projects/p2");
  expect(finalRow.querySelector('a[download]')!.getAttribute("href")).toBe("/api/final-exports/fin_1/file");
  expect(screen.getAllByText(t("export.download"))).toHaveLength(2);
});

it("«Новый проект»: полноширинное название, кнопки ниже и одна подсказка, пока поле пустое", async () => {
  fakeFetch([on("GET", "/api/projects", []), on("GET", "/api/jobs", [])]);
  renderQ(<Dashboard />);
  const input = await screen.findByLabelText(t("dashboard.projectTitle"));
  expect(input.classList.contains("new-project-title")).toBe(true);
  expect(screen.getAllByText(t("ux.disabled.enterProjectTitle"))).toHaveLength(1);
  const buttons = [t("dashboard.create"), t("dashboard.createVideo"), t("dashboard.createScript")].map((name) => screen.getByRole("button", { name }));
  expect(buttons.every((button) => button.parentElement === buttons[0]!.parentElement)).toBe(true);
  fireEvent.change(input, { target: { value: "Отчёт" } });
  expect(screen.queryByText(t("ux.disabled.enterProjectTitle"))).toBeNull();
});

it("активные задачи показывают число падений за сутки со ссылкой на фильтр", async () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  fakeFetch([
    on("GET", "/api/projects", []),
    on("GET", "/api/jobs", []),
    on("GET", "/api/jobs?status=failed&limit=500", [
      job({ id: "recent", status: "failed", created_at: recent, finished_at: recent }),
      job({ id: "old", status: "failed", created_at: old, finished_at: old }),
    ]),
  ]);
  renderQ(<Dashboard />);
  const link = await screen.findByRole("link", { name: t("dashboard.failedLastDay", { n: 1 }) });
  expect(link.getAttribute("href")).toBe("/jobs?status=failed");
});
