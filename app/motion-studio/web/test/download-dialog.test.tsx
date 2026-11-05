// «Скачать ролики»: выбор сцен и форматов, папка из системного окна, постановка задачи, итог.
import { defaultSettings } from "@ms/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadDialog } from "../src/components/projects/DownloadDialog.js";
import { t } from "../src/i18n/index.js";
import { historyEntry } from "./fixtures.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const scene = (id: string, excerpt: string, versionId: string | null) => {
  const v = versionId ? historyEntry(versionId, 1) : null;
  return { id, project_id: "p1", title: "Общий стиль", excerpt, current_version_id: versionId, approved_version_id: null, created_at: TS, current_version: v, latest_version: v, last_job: null };
};
const projectRoute = on("GET", "/api/projects/p1", {
  project: { id: "p1", kind: "playground", title: "Map Go", settings: defaultSettings(), created_at: TS, updated_at: TS },
  scenes: [scene("s1", "Первая сцена", "v1"), scene("s2", "Без версии", null), scene("s3", "Третья сцена", "v3")],
  exports: [],
});
const dest = "/Volumes/External SSD/ролики";
const done = job({
  id: "j1", type: "project.download", status: "completed", finished_at: TS,
  output_refs: {
    dest,
    files: [{ scene_id: "s3", format: "mp4", name: "03_tretya.mp4" }],
    missing: [{ scene_id: "s3", format: "alpha", name: "03_tretya_alpha.mov", reason: "экспорт не удался: кадр пуст" }],
  },
});

it("выбор сцены и папки → задача с выбранным; итог: файлы, причины, Finder", async () => {
  const { calls } = fakeFetch([
    projectRoute,
    on("POST", "/api/system/pick-folder", { path: dest }),
    on("POST", "/api/projects/p1/downloads", { job: done }, 202),
    on("GET", "/api/jobs/j1", { job: done, events: [], processes: [] }),
    on("POST", "/api/project-downloads/j1/reveal", null, 204),
  ]);
  const view = renderQ(<DownloadDialog projectId="p1" onClose={() => undefined} />);
  await screen.findByText("Третья сцена");
  // сцена без готовой версии в списке не показана; номер — позиция в проекте
  expect(screen.queryByText("Без версии")).toBeNull();
  expect(view.container.querySelector('[data-scene-id="s3"]')?.textContent).toContain("03");
  const startButton = () => screen.getByRole("button", { name: t("download.start", { n: 1 }) }) as HTMLButtonElement;

  fireEvent.click(view.container.querySelector('[data-scene-id="s3"] input')!);
  expect(startButton().disabled).toBe(true); // папка ещё не выбрана

  fireEvent.click(screen.getByRole("button", { name: t("download.choose") }));
  await waitFor(() => expect((screen.getByLabelText(t("download.folder")) as HTMLInputElement).value).toBe(dest));
  fireEvent.click(screen.getByLabelText(t("download.format.alpha")));
  fireEvent.click(startButton());

  await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/downloads"))?.body).toEqual({ scene_ids: ["s3"], formats: ["mp4", "alpha"], dest }));
  expect(await screen.findByText(t("download.done", { n: 1 }))).toBeTruthy();
  expect(screen.getByTestId("download-missing").textContent).toContain("кадр пуст");
  expect(localStorage.getItem("ms.download.folder")).toBe(dest);

  fireEvent.click(screen.getByRole("button", { name: t("download.reveal") }));
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/project-downloads/j1/reveal"))).toBe(true));
});

it("«Выбрать все» и «Снять выбор»; отмена системного окна не стирает папку; последняя папка помнится", async () => {
  localStorage.setItem("ms.download.folder", "/Volumes/SSD/старое");
  fakeFetch([projectRoute, on("POST", "/api/system/pick-folder", { path: null })]);
  renderQ(<DownloadDialog projectId="p1" onClose={() => undefined} />);
  await screen.findByText("Первая сцена");
  const folder = screen.getByLabelText(t("download.folder")) as HTMLInputElement;
  expect(folder.value).toBe("/Volumes/SSD/старое");

  fireEvent.click(screen.getByRole("button", { name: t("download.selectAll") }));
  expect(screen.getByTestId("download-count").textContent).toBe(t("download.selected", { n: 2, total: 2 }));
  fireEvent.click(screen.getByRole("button", { name: t("download.selectNone") }));
  expect(screen.getByTestId("download-count").textContent).toBe(t("download.selected", { n: 0, total: 2 }));

  const choose = screen.getByRole("button", { name: t("download.choose") }) as HTMLButtonElement;
  fireEvent.click(choose);
  await waitFor(() => expect(choose.disabled).toBe(false));
  expect(folder.value).toBe("/Volumes/SSD/старое");
});

it("отказ сервера по папке показан, форма остаётся доступной", async () => {
  fakeFetch([projectRoute, on("POST", "/api/projects/p1/downloads", { error: "dest_missing", message: "папка не найдена" }, 400)]);
  const view = renderQ(<DownloadDialog projectId="p1" onClose={() => undefined} />);
  await screen.findByText("Первая сцена");
  fireEvent.click(view.container.querySelector('[data-scene-id="s1"] input')!);
  fireEvent.change(screen.getByLabelText(t("download.folder")), { target: { value: "/нет" } });
  const start = screen.getByRole("button", { name: t("download.start", { n: 1 }) }) as HTMLButtonElement;
  fireEvent.click(start);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(start.disabled).toBe(false);
});
