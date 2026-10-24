// Хранилище пропало (StorageSupervisor → storage_offline): 503 `storage_offline` на весь API,
// кроме `GET /api/health`, который показывает режим; после возврата — снова 200.
import type { VolumeProbe } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { probe } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";

let api: Api;
let volume = "VOL-A";
const flaky: VolumeProbe = { ...probe, volumeUuid: async () => volume };

beforeEach(async () => {
  volume = "VOL-A";
  api = await makeApi({ boot: { probe: flaky, storageIntervalMs: 30 } });
});
afterEach(() => api.close());

it("storage_offline → 503 на всё, кроме GET /api/health; возврат → 200", async () => {
  expect((await api.inj("GET", "/api/projects", getHeaders)).statusCode).toBe(200);
  const h0 = (await api.inj("GET", "/api/health", getHeaders)).json();
  expect(h0).toMatchObject({ storage: "online", owner: { pid: process.pid, kind: "server" } });
  for (const k of ["claude", "chrome", "ffmpeg"]) expect(h0[k]).toMatchObject({ status: expect.stringMatching(/^(ok|unavailable)$/) });

  volume = "VOL-OTHER"; // маркер хранилища не совпал с томом — как подмена диска
  await until(() => api.core.storage.mode() === "storage_offline", "storage_offline", 5000);
  const r = await api.inj("GET", "/api/projects", getHeaders);
  expect(r.statusCode).toBe(503);
  expect(r.json()).toMatchObject({ error: "storage_offline", message: expect.any(String) });
  expect((await api.inj("POST", "/api/projects", okHeaders, { title: "x" })).statusCode).toBe(503);
  expect((await api.inj("GET", "/api/settings", getHeaders)).statusCode).toBe(503);
  const h = await api.inj("GET", "/api/health", getHeaders);
  expect(h.statusCode).toBe(200);
  expect(h.json().storage).toBe("storage_offline");
  // безопасность — раньше режима хранилища
  expect((await api.inj("GET", "/api/projects", { host: "evil.example:8790" })).statusCode).toBe(403);

  volume = "VOL-A";
  await until(() => api.core.storage.mode() === "online", "online", 5000);
  expect((await api.inj("GET", "/api/projects", getHeaders)).statusCode).toBe(200);
});
