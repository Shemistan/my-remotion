// JobStatus: этап, прогресс, журнал, отмена/повтор; blocked — PID и команда, повтор отключён,
// пока процесс жив; ошибки экспорта — понятные русские сообщения.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JobStatus } from "../src/components/JobStatus.js";
import { t } from "../src/i18n/index.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const detail = (j: Record<string, unknown>, processes: unknown[] = [], events: unknown[] = []) => ({ job: job(j), events, processes });

it("running: этап по-русски, прогресс, журнал; «Отменить» → POST cancel", async () => {
  const { calls } = fakeFetch([
    on("GET", "/api/jobs/job_1", detail({}, [], [{ id: 1, job_id: "job_1", ts: TS, level: "info", kind: "started", message: "попытка 1" }])),
    on("POST", "/api/jobs/job_1/cancel", job({ cancel_requested: true })),
  ]);
  renderQ(<JobStatus jobId="job_1" />);
  expect(await screen.findByText(t("stage.render"))).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
  expect(screen.getByText(/попытка 1/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("job.cancel") }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/jobs/job_1/cancel")).toBe(true));
  expect(screen.queryByRole("button", { name: t("job.retry") })).toBeNull();
});

it("blocked: PID и команда, «Повторить» отключена при живом процессе с подсказкой", async () => {
  fakeFetch([on("GET", "/api/jobs/job_1", detail(
    { status: "blocked", error: { code: "stale_process", stage: "orphaned", message: "процессы живы", pids: [4242], cmds: ["chrome-headless-shell --x"] } },
    [{ pid: 4242, pgid: 4242, attempt: 1, cmd: "chrome-headless-shell --x", started_at: TS, alive: true }],
  ))]);
  renderQ(<JobStatus jobId="job_1" />);
  expect(await screen.findByText("4242")).toBeTruthy();
  expect(screen.getByText("chrome-headless-shell --x")).toBeTruthy();
  expect((screen.getByRole("button", { name: t("job.retry") }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(t("job.blockedHint"))).toBeTruthy();
});

it("blocked без живых процессов — «Повторить» доступна → POST retry", async () => {
  const { calls } = fakeFetch([
    on("GET", "/api/jobs/job_1", detail({ status: "blocked", error: { code: "stale_process", message: "x", pids: [4242] } }, [{ pid: 4242, pgid: 4242, attempt: 1, cmd: "c", started_at: TS, alive: false }])),
    on("POST", "/api/jobs/job_1/retry", job({ status: "pending" })),
  ]);
  renderQ(<JobStatus jobId="job_1" />);
  const retry = await screen.findByRole("button", { name: t("job.retry") });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(retry);
  await waitFor(() => expect(calls.some((c) => c.url === "/api/jobs/job_1/retry")).toBe(true));
});

it("отказы экспорта — понятные русские сообщения по коду", async () => {
  for (const code of ["transparent_unsupported", "fps_change_unsupported", "fps_tempo_mismatch"] as const) {
    fakeFetch([on("GET", "/api/jobs/job_x", detail({ id: "job_x", type: "scene.export", status: "failed", error: { code: "pipeline", stage: "export", message: `${code}: подробности сервера` } }))]);
    const view = renderQ(<JobStatus jobId="job_x" />);
    expect(await screen.findByText(t(`exportErrors.${code}`))).toBeTruthy();
    // технические подробности — рядом, как текст
    expect(screen.getByText(/подробности сервера/)).toBeTruthy();
    view.unmount();
    vi.unstubAllGlobals();
  }
});

it("failed: этап ошибки и «Повторить»; completed — без кнопок", async () => {
  fakeFetch([on("GET", "/api/jobs/job_1", detail({ status: "failed", error: { code: "pipeline", stage: "render", message: "timeout: рендер не уложился" } }))]);
  const view = renderQ(<JobStatus jobId="job_1" />);
  expect(await screen.findByText(t("job.failedAt", { stage: t("stage.render") }))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("job.retry") })).toBeTruthy();
  view.unmount();
  vi.unstubAllGlobals();
  fakeFetch([on("GET", "/api/jobs/job_1", detail({ status: "completed", progress: 1, finished_at: TS }))]);
  renderQ(<JobStatus jobId="job_1" />);
  expect(await screen.findByText(t("job.status.completed"))).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("ревью Task 33 M2: отказы plan.visual — русский текст по коду, подробности рядом", async () => {
  for (const code of ["plan_exists", "semantic_skipped"] as const) {
    fakeFetch([on("GET", "/api/jobs/job_x", detail({ id: "job_x", type: "plan.visual", status: "failed", error: { code, message: "plan.visual: подробности сервера" } }))]);
    const view = renderQ(<JobStatus jobId="job_x" />);
    expect(await screen.findByText(t(`job.errorCode.${code}`))).toBeTruthy();
    expect(screen.getByText(/подробности сервера/)).toBeTruthy();
    view.unmount();
    vi.unstubAllGlobals();
  }
});
