// Task 48: карточка ошибки (каталог: текст, подсказка, действия, технические подробности),
// ключи каталога в словаре, стоимость в JobStatus, страница «Диагностика».
import { ERROR_CATALOG, JOB_ERROR_CATALOG } from "@ms/contracts/diagnostics";
import { JobErrorCodeSchema } from "@ms/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorCard } from "../src/components/diagnostics/ErrorCard.js";
import { JobStatus } from "../src/components/JobStatus.js";
import { t } from "../src/i18n/index.js";
import { ru } from "../src/i18n/ru.js";
import { Diagnostics } from "../src/pages/Diagnostics.js";
import { TS, fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("каталог: заголовок и подсказка каждого кода задачи и ошибки API — в словаре", () => {
  for (const code of JobErrorCodeSchema.options) {
    const e = JOB_ERROR_CATALOG[code];
    expect(e.title in ru, e.title).toBe(true);
    expect(e.hint! in ru, e.hint).toBe(true);
  }
  for (const [code, e] of Object.entries(ERROR_CATALOG)) {
    expect(e.title in ru, `${code}: ${e.title}`).toBe(true);
    for (const a of e.actions) expect(`diagnostics.action.${a}` in ru, a).toBe(true);
  }
});

it("ошибка задачи: этап, текст и подсказка каталога, подробности, ссылка на журнал; повтор → onRetry", () => {
  const onRetry = vi.fn();
  renderQ(<ErrorCard error={{ code: "pipeline", stage: "render", message: "timeout: рендер не уложился" }} jobId="job_7" onRetry={onRetry} />);
  expect(screen.getByText(t("diagnostics.error.stage", { stage: t("stage.render") }))).toBeTruthy();
  expect(screen.getByText(t("job.errorCode.pipeline"))).toBeTruthy();
  expect(screen.getByText(t("diagnostics.hint.pipeline"))).toBeTruthy();
  expect(screen.getByText(t("diagnostics.error.details"))).toBeTruthy();
  expect(screen.getByText(/рендер не уложился/)).toBeTruthy();
  const link = screen.getByRole("link", { name: t("diagnostics.action.open_logs") }) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/diagnostics?job=job_7");
  fireEvent.click(screen.getByRole("button", { name: t("diagnostics.action.retry") }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it("действия-подсказки (хранилище, процессы) и настройки; свой заголовок важнее каталога", () => {
  renderQ(<ErrorCard error={{ code: "storage_unavailable", message: "нет SSD" }} title="Свой" />);
  expect(screen.getByText("Свой")).toBeTruthy();
  expect(screen.queryByText(t("job.errorCode.storage_unavailable"))).toBeNull();
  expect(screen.getByText(t("diagnostics.action.wait_storage"))).toBeTruthy();
  // без onRetry кнопки нет — только подсказка
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText(t("diagnostics.action.retryHint"))).toBeTruthy();
});

it("ошибка API и неизвестный код", () => {
  const view = renderQ(<ErrorCard error={{ error: "budget", message: "x" }} />);
  view.unmount();
  renderQ(<ErrorCard error={{ error: "storage_offline", message: "x" }} />);
  expect(screen.getByText(t("errors.storage_offline"))).toBeTruthy();
  renderQ(<ErrorCard error={{ error: "brand_new", message: "что-то" }} />);
  expect(screen.getByText(t("errors.generic", { message: "что-то" }))).toBeTruthy();
});

it("JobStatus: карточка ошибки и стоимость задачи (справочно)", async () => {
  fakeFetch([on("GET", "/api/jobs/job_1", {
    job: job({ status: "failed", cost_usd: 0.4321, error: { code: "pipeline", stage: "engineer", message: "engineer: ошибка компиляции" } }),
    events: [], processes: [],
  })]);
  renderQ(<JobStatus jobId="job_1" />);
  expect(await screen.findByText(t("diagnostics.cost", { usd: "$0.4321" }))).toBeTruthy();
  expect(screen.getByRole("alert").getAttribute("data-error-code")).toBe("pipeline");
  expect(screen.getByText(t("diagnostics.hint.pipeline"))).toBeTruthy();
  expect(screen.getAllByRole("button", { name: t("job.retry") })).toHaveLength(1);
});

it("страница «Диагностика»: doctor, трассировка по ?job=, архив", async () => {
  window.history.replaceState(null, "", "/diagnostics?job=job_t");
  const { calls } = fakeFetch([
    on("GET", "/api/diagnostics/doctor?fast=1", { ok: false, rows: [{ name: "node", ok: true, status: "ok", detail: "22.21.1" }, { name: "claude", ok: false, status: "missing", detail: "нет claude" }], created_at: TS }),
    on("GET", "/api/jobs/job_t/trace", {
      project: { id: "p1", kind: "playground", title: "Песочница" }, job: job({ id: "job_t", status: "completed" }), children: [],
      agentRuns: [{ id: "ar1", job_id: "job_t", role: "engineer", model: "sonnet", status: "completed", input_tokens: 10, output_tokens: 5, cost_usd: 0.25, started_at: TS, finished_at: TS, duration_ms: 1500 }],
      renderJobs: [{ id: "rnd1", job_id: "job_t", version_id: null, kind: "preview", codec: "h264", width: 960, height: 540, frames: 90, duration_ms: 2000 }],
      events: [], cost: { usd: 0.25, runs: 1, unknown: 0 },
    }),
    on("GET", /^\/api\/logs/, []),
    on("GET", "/api/diagnostics/bundles", []),
    on("POST", "/api/diagnostics/bundle", { name: "diag-20261025T100000.zip", status: "building", created_at: TS }, 202),
  ]);
  renderQ(<Diagnostics />);
  expect(await screen.findByText("нет claude")).toBeTruthy();
  expect(screen.getByText(t("diagnostics.fix.claude"))).toBeTruthy();
  expect(await screen.findByTestId("trace-cost")).toBeTruthy();
  expect(screen.getByTestId("trace-cost").textContent).toContain("$0.25");
  // сумма трассировки — с дочерними задачами (cost_usd в списке задач — без них)
  expect(screen.getByTestId("trace-cost").textContent).toContain("с дочерними задачами");
  expect(document.querySelector("[data-render-job=rnd1]")).toBeTruthy();
  expect(calls.some((c) => c.url.startsWith("/api/logs?") && c.url.includes("jobId=job_t"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("diagnostics.bundle.make") }));
  await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url === "/api/diagnostics/bundle")?.body).toEqual({ includePrompts: false }));
});
