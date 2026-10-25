// ProjectList, TrashList, RecoveryBanner, RecoveryCenter (Task 47): поиск и фильтр, меню действий
// (Playground — только переименование), переименование на месте, корзина с восстановлением и
// очисткой по второму подтверждению, баннер после сбоя, центр восстановления.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectList } from "../src/components/projects/ProjectList.js";
import { RecoveryBanner } from "../src/components/projects/RecoveryBanner.js";
import { t } from "../src/i18n/index.js";
import { RecoveryCenter } from "../src/pages/RecoveryCenter.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const project = (id: string, title: string, kind = "playground") => ({ id, kind, title, settings: null, created_at: TS, updated_at: TS, archived_at: null, deleted_at: null });
const list = [project("playground", "Playground"), project("p1", "Мой ролик", "script"), project("p2", "Обзор", "video")];

it("поиск по названию; Playground — без архива и удаления; архив — POST archive", async () => {
  const { calls } = fakeFetch([on("GET", "/api/projects", list), on("POST", "/api/projects/p1/archive", { project_id: "p1", archived_at: TS, deleted_at: null, active_jobs: 0 })]);
  renderQ(<ProjectList />);
  expect(await screen.findByRole("link", { name: "Мой ролик" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t("projects.search")), { target: { value: "обз" } });
  expect(screen.queryByRole("link", { name: "Мой ролик" })).toBeNull();
  expect(screen.getByRole("link", { name: "Обзор" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t("projects.search")), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: t("projects.actions", { title: "Playground" }) }));
  const pgMenu = screen.getByRole("menu");
  expect(within(pgMenu).queryByRole("menuitem", { name: t("projects.archive") })).toBeNull();
  expect(within(pgMenu).queryByRole("menuitem", { name: t("projects.delete") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("projects.actions", { title: "Мой ролик" }) }));
  fireEvent.click(screen.getByRole("menuitem", { name: t("projects.archive") }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/projects/p1/archive")).toBe(true));
});

it("переименование на месте: PATCH с новым названием", async () => {
  const { calls } = fakeFetch([on("GET", "/api/projects", list), on("PATCH", "/api/projects/p1", project("p1", "Новое"))]);
  renderQ(<ProjectList />);
  fireEvent.click(await screen.findByRole("button", { name: t("projects.actions", { title: "Мой ролик" }) }));
  fireEvent.click(screen.getByRole("menuitem", { name: t("projects.rename") }));
  const field = screen.getByLabelText(t("projects.renameLabel"));
  fireEvent.change(field, { target: { value: "Новое" } });
  fireEvent.click(screen.getByRole("button", { name: t("common.save") }));
  await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ title: "Новое" }));
});

it("архив и корзина: фильтр; восстановление; очистка — только с флажком, задача с ключом", async () => {
  const trash = [{ id: "trs_1", project_id: "p3", title: "Старый", kind: "video", bytes: 5 * 1024 ** 2, created_at: TS }];
  const { calls } = fakeFetch([
    on("GET", "/api/projects?view=archived", [{ ...project("p4", "Архивный"), archived_at: TS }]),
    on("GET", "/api/trash", trash),
    on("POST", "/api/trash/trs_1/restore", project("p3", "Старый", "video")),
    on("POST", "/api/trash/purge-intent", { token: "ptok", count: 1, bytes: 5 * 1024 ** 2, files: 7, expires_at: TS }),
    on("POST", "/api/trash/purge", { job: job({ type: "trash.purge", status: "pending" }) }, 202),
  ]);
  renderQ(<ProjectList />);
  fireEvent.click(screen.getByRole("button", { name: t("projects.filter.archived") }));
  expect(await screen.findByRole("link", { name: "Архивный" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("projects.actions", { title: "Архивный" }) }));
  expect(screen.getByRole("menuitem", { name: t("projects.unarchive") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("projects.filter.trash") }));
  expect(await screen.findByText("Старый")).toBeTruthy();
  expect(screen.getByText(new RegExp(t("size.mb", { v: "5" })))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("trash.restore") }));
  await waitFor(() => expect(calls.some((c) => c.url === "/api/trash/trs_1/restore")).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: t("trash.purge") }));
  expect(await screen.findByText(t("purge.summary", { count: 1, files: 7, size: t("size.mb", { v: "5" }) }))).toBeTruthy();
  const go = screen.getByRole("button", { name: t("purge.confirm") }) as HTMLButtonElement;
  expect(go.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(t("purge.ack")));
  expect(go.disabled).toBe(false);
  fireEvent.click(go);
  await waitFor(() => expect(calls.find((c) => c.url === "/api/trash/purge")).toBeTruthy());
  const purge = calls.find((c) => c.url === "/api/trash/purge")!;
  expect(purge.body).toEqual({ trash_ids: ["trs_1"], token: "ptok" });
  expect(purge.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(await screen.findByText(t("purge.started"))).toBeTruthy();
});

const recovery = (over: Record<string, unknown> = {}) => ({
  boot: { id: "brp_1", created_at: TS, crashed: true, acknowledged_at: null, summary: { recovered: 2, blocked: 1, quarantined: 1, failed: 0 } },
  interrupted: [job({ id: "job_r", status: "pending" })],
  blocked: [job({ id: "job_b", status: "blocked", error: { code: "stale_process", stage: "orphaned", message: "не завершились", pids: [4242], cmds: ["chrome --headless"] } })],
  quarantined: [{ rel_path: "workspace/drafts/job_q-a1", reason: "stale_process: render", job_id: "job_q", attempt: 1, bytes: 2048, at: TS }],
  ...over,
});

it("баннер: только после сбоя и пока не просмотрен", async () => {
  fakeFetch([on("GET", "/api/recovery", recovery())]);
  const { unmount } = renderQ(<RecoveryBanner />);
  expect((await screen.findByTestId("recovery-banner")).textContent).toContain(t("recovery.banner", { recovered: 2, blocked: 1, quarantined: 1 }));
  expect(screen.getByRole("link", { name: t("recovery.open") }).getAttribute("href")).toBe("/recovery");
  unmount();
  vi.unstubAllGlobals();
  fakeFetch([on("GET", "/api/recovery", recovery({ boot: { id: "brp_2", created_at: TS, crashed: true, acknowledged_at: TS } }))]);
  renderQ(<RecoveryBanner />);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByTestId("recovery-banner")).toBeNull();
});

it("центр восстановления: итог, PID блокированной, журнал и удаление черновика через подтверждение, ack", async () => {
  const { calls } = fakeFetch([
    on("GET", "/api/recovery", recovery()),
    on("GET", "/api/jobs/job_q", { job: job({ id: "job_q" }), events: [{ id: 1, job_id: "job_q", ts: TS, level: "error", kind: "failed", message: "рендер упал" }], processes: [] }),
    on("POST", "/api/recovery/quarantine/intent", { dir: "workspace/drafts/job_q-a1", token: "qtok", bytes: 2048, expires_at: TS }),
    on("POST", "/api/recovery/quarantine/discard", { removed: "workspace/drafts/job_q-a1" }),
    on("POST", "/api/recovery/brp_1/ack", recovery({ boot: { id: "brp_1", created_at: TS, crashed: true, acknowledged_at: TS } })),
  ]);
  renderQ(<RecoveryCenter />);
  expect(await screen.findByText(t("recovery.summary", { recovered: 2, blocked: 1, failed: 0, quarantined: 1 }))).toBeTruthy();
  expect(screen.getByText(t("recovery.pid", { pid: 4242, cmd: "chrome --headless" }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("recovery.showLog") }));
  expect((await screen.findByTestId("job-log")).textContent).toContain("рендер упал");
  fireEvent.click(screen.getByRole("button", { name: t("recovery.discard") }));
  const confirm = await screen.findByRole("button", { name: t("recovery.discardConfirm") });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  expect(calls.some((c) => c.url === "/api/recovery/quarantine/discard")).toBe(false); // без подтверждения — ничего не стёрто
  fireEvent.click(confirm);
  await waitFor(() => expect(calls.find((c) => c.url === "/api/recovery/quarantine/discard")?.body).toEqual({ dir: "workspace/drafts/job_q-a1", token: "qtok" }));
  fireEvent.click(screen.getByRole("button", { name: t("recovery.ack") }));
  expect(await screen.findByText(t("recovery.acked", { at: new Date(TS).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) }))).toBeTruthy();
});
