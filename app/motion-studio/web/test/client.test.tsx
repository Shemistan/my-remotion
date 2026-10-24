// Клиент API: Idempotency-Key на создающих POST, 503 → баннер «Хранилище недоступно»,
// ошибки API — с машинным кодом; SSE инвалидирует запросы по событиям задач.
import { act, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, api, storageStatus } from "../src/api/client.js";
import { invalidateForEvent } from "../src/api/sse.js";
import { StorageBanner } from "../src/components/StorageBanner.js";
import { t } from "../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  storageStatus.set(false);
});

it("создающие POST шлют уникальный Idempotency-Key, GET — без него", async () => {
  const { calls } = fakeFetch([on("POST", /\/api\/scenes\/s1\/(restore|render)$/, { job: job() }, 202), on("GET", "/api/projects", [])]);
  await api.restore("s1", "v1");
  await api.render("s1", { duration_frames: 240 }, "v1");
  await api.projects();
  const [a, b, c] = calls;
  expect(a!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(b!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(a!.headers["idempotency-key"]).not.toBe(b!.headers["idempotency-key"]);
  expect(b!.body).toEqual({ settings_patch: { duration_frames: 240 }, base_version_id: "v1" });
  expect(c!.headers["idempotency-key"]).toBeUndefined();
  expect(a!.headers["content-type"]).toBe("application/json");
});

it("повтор того же действия с явным ключом шлёт тот же ключ", async () => {
  const { calls } = fakeFetch([on("POST", "/api/versions/v1/exports", { job: job() }, 202)]);
  await api.exportVersion("v1", { format: "mp4", crf: 18, scale: 1 }, "key-1");
  await api.exportVersion("v1", { format: "mp4", crf: 18, scale: 1 }, "key-1");
  expect(calls.map((c) => c.headers["idempotency-key"])).toEqual(["key-1", "key-1"]);
});

it("ошибка API — ApiError с кодом и сообщением сервера", async () => {
  fakeFetch([on("POST", "/api/projects", { error: "validation", message: "title: пусто" }, 400)]);
  const e = await api.createProject("").catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect((e as ApiError).status).toBe(400);
  expect((e as ApiError).code).toBe("validation");
});

it("503 storage_offline включает баннер, успешный ответ — выключает", async () => {
  fakeFetch([on("GET", "/api/projects", { error: "storage_offline", message: "x" }, 503), on("GET", "/api/health", { storage: "online" })]);
  renderQ(<StorageBanner />);
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => {
    await api.projects().catch(() => undefined);
  });
  expect(screen.getByRole("alert").textContent).toContain(t("storage.offline"));
  await act(async () => {
    await api.health();
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("health с storage_offline тоже включает баннер", async () => {
  fakeFetch([on("GET", "/api/health", { storage: "storage_offline" })]);
  renderQ(<StorageBanner />);
  await act(async () => {
    await api.health();
  });
  expect(screen.getByRole("alert")).toBeTruthy();
});

it("событие задачи инвалидирует задачу, список задач и сцены; gap — всё", () => {
  const calls: unknown[] = [];
  const client = { invalidateQueries: (f: unknown) => calls.push(f) };
  invalidateForEvent(client, { kind: "job", jobId: "job_1", eventKind: "completed" });
  expect(calls).toEqual([{ queryKey: ["job", "job_1"] }, { queryKey: ["jobs"] }, { queryKey: ["scene"] }, { queryKey: ["messages"] }, { queryKey: ["project"] },
    { queryKey: ["video"] }, { queryKey: ["transcript"] }, { queryKey: ["transcriptRevisions"] }, { queryKey: ["edl"] }, { queryKey: ["plan"] }, { queryKey: ["style"] }, { queryKey: ["script"] }]);
  calls.length = 0;
  // прогресс — только задача и список задач (событий много)
  invalidateForEvent(client, { kind: "job", jobId: "job_1", eventKind: "progress" });
  expect(calls).toEqual([{ queryKey: ["job", "job_1"] }, { queryKey: ["jobs"] }]);
  calls.length = 0;
  invalidateForEvent(client, { kind: "gap" });
  expect(calls).toEqual([undefined]);
});
