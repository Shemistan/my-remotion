// DeleteDialog (Task 47): сводка «что будет удалено», удаление — только после ввода точного
// названия и без незавершённых задач; запрос несёт токен сводки и введённое название; устаревшее
// подтверждение — сводка запрашивается заново.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeleteDialog } from "../src/components/projects/DeleteDialog.js";
import { t } from "../src/i18n/index.js";
import { fakeFetch, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const intent = (over: Record<string, unknown> = {}) => ({
  project_id: "p1", token: "tok-1", bytes: 2048, files: 3, active_jobs: 0, expires_at: "2026-10-25T10:10:00.000Z",
  title: "Мой ролик", scenes: 2, versions: 5, exports: 1, packages: 1, active_job_ids: [], ...over,
});

const confirmBtn = () => screen.getByRole("button", { name: t("delete.confirm") }) as HTMLButtonElement;
const input = () => screen.getByLabelText(t("delete.confirmLabel", { title: "Мой ролик" }));

it("сводка: сцены, версии, экспорты, пакеты, файлы и размер; кнопка — только после точного названия", async () => {
  fakeFetch([on("POST", "/api/projects/p1/delete-intent", intent())]);
  renderQ(<DeleteDialog id="p1" title="Мой ролик" onClose={() => undefined} />);
  const summary = await screen.findByTestId("delete-summary");
  expect(summary.textContent).toContain(t("delete.scenes", { n: 2 }));
  expect(summary.textContent).toContain(t("delete.versions", { n: 5 }));
  expect(summary.textContent).toContain(t("delete.exports", { n: 1 }));
  expect(summary.textContent).toContain(t("delete.packages", { n: 1 }));
  expect(summary.textContent).toContain(t("delete.files", { n: 3, size: t("size.kb", { v: "2" }) }));
  expect(screen.getByText(t("delete.trashNote"))).toBeTruthy();
  expect(confirmBtn().disabled).toBe(true);
  fireEvent.change(input(), { target: { value: "Мой" } });
  expect(confirmBtn().disabled).toBe(true);
  fireEvent.change(input(), { target: { value: "Мой ролик" } });
  expect(confirmBtn().disabled).toBe(false);
});

it("удаление: DELETE с токеном и названием, затем onDeleted и onClose", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/delete-intent", intent()), on("DELETE", "/api/projects/p1", { trash_id: "trs_1" })]);
  const deleted = vi.fn();
  const closed = vi.fn();
  renderQ(<DeleteDialog id="p1" title="Мой ролик" onClose={closed} onDeleted={deleted} />);
  await screen.findByTestId("delete-summary");
  fireEvent.change(input(), { target: { value: "Мой ролик" } });
  fireEvent.click(confirmBtn());
  await waitFor(() => expect(deleted).toHaveBeenCalledWith("trs_1"));
  expect(closed).toHaveBeenCalled();
  const del = calls.find((c) => c.method === "DELETE")!;
  expect(del.body).toEqual({ token: "tok-1", confirm_title: "Мой ролик" });
});

it("незавершённые задачи — предупреждение, кнопка недоступна даже с названием", async () => {
  fakeFetch([on("POST", "/api/projects/p1/delete-intent", intent({ active_jobs: 2, active_job_ids: ["job_1", "job_2"] }))]);
  renderQ(<DeleteDialog id="p1" title="Мой ролик" onClose={() => undefined} />);
  expect(await screen.findByText(t("delete.busy", { n: 2 }))).toBeTruthy();
  fireEvent.change(input(), { target: { value: "Мой ролик" } });
  expect(confirmBtn().disabled).toBe(true);
});

it("ответ 409 project_busy — текст ошибки; intent_expired — сводка запрашивается заново", async () => {
  let n = 0;
  const { calls } = fakeFetch([
    (c) => (c.method === "POST" && c.url === "/api/projects/p1/delete-intent" ? { body: intent({ token: `tok-${++n}` }) } : undefined),
    on("DELETE", "/api/projects/p1", { error: "intent_expired", message: "устарело" }, 409),
  ]);
  renderQ(<DeleteDialog id="p1" title="Мой ролик" onClose={() => undefined} />);
  await screen.findByTestId("delete-summary");
  fireEvent.change(input(), { target: { value: "Мой ролик" } });
  fireEvent.click(confirmBtn());
  expect(await screen.findByText(t("errors.intent_expired"))).toBeTruthy();
  await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/delete-intent"))).toHaveLength(2));
});
