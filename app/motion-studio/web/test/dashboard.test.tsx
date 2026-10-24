// Dashboard при недоступном хранилище: ошибка в каждом блоке, а не «пусто»; 503
// storage_offline не повторяется (баннер уже сказал главное), после возврата хранилища
// запросы перечитываются.
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, shouldRetry, storageStatus } from "../src/api/client.js";
import { StorageBanner } from "../src/components/StorageBanner.js";
import { t } from "../src/i18n/index.js";
import { Dashboard } from "../src/pages/Dashboard.js";
import { fakeFetch, on, renderQ } from "./helpers.js";

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
