// Task 40: очередь задачи сцены — «В очереди за: <тип задачи, что держит замок> · впереди задач: N».
import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueueBadge } from "../../src/components/video-scenes/QueueBadge.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

it("ahead = 1, замок держит правка — «В очереди за: Правка сцены · впереди задач: 1»", async () => {
  fakeFetch([on("GET", "/api/jobs/job_edit", { job: job({ id: "job_edit", type: "playground.edit", status: "running" }), events: [], processes: [] })]);
  renderQ(<QueueBadge queue={{ ahead: 1, blocking_job_id: "job_edit" }} />);
  await waitFor(() =>
    expect(screen.getByTestId("queue-badge").textContent).toBe(`${t("videoScenes.queue", { what: t("job.type.playground.edit") })} · ${t("videoScenes.queue.ahead", { n: 1 })}`));
});

it("задача, держащая замок, неизвестна — «другой задачей»; ahead = 0 или нет очереди — ничего", () => {
  fakeFetch();
  const { unmount } = renderQ(<QueueBadge queue={{ ahead: 2 }} />);
  expect(screen.getByTestId("queue-badge").textContent).toContain(t("videoScenes.queue", { what: t("videoScenes.queue.unknown") }));
  unmount();
  renderQ(<><QueueBadge queue={{ ahead: 0 }} /><QueueBadge queue={null} /></>);
  expect(screen.queryByTestId("queue-badge")).toBeNull();
});
