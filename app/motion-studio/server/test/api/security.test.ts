// Безопасность Control API (`03` §6, Review Focus 6): Host — защита от DNS rebinding, Origin
// на мутациях — от CSRF чужих страниц; все GET без побочных эффектов (поправки после ревью среза).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { enqueue } from "../../src/jobs/queue.js";
import { type Api, ORIGIN, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

describe("Host и Origin", () => {
  it("чужой Host → 403 forbidden_host (и на GET)", async () => {
    const r = await api.inj("POST", "/api/projects", { ...okHeaders, host: "evil.example:8790" }, { title: "x" });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: "forbidden_host" });
    expect((await api.inj("GET", "/api/projects", { host: "evil.example:8790" })).statusCode).toBe(403);
    expect((await api.inj("GET", "/api/health", { host: "127.0.0.1:9999" })).statusCode).toBe(403);
    expect((await api.inj("GET", "/api/health", { host: "localhost:8790" })).statusCode).toBe(200);
  });

  it("чужой или отсутствующий Origin на POST → 403 forbidden_origin; свой — 201", async () => {
    const evil = await api.inj("POST", "/api/projects", { ...okHeaders, origin: "https://evil.example" }, { title: "x" });
    expect(evil.statusCode).toBe(403);
    expect(evil.json()).toMatchObject({ error: "forbidden_origin" });
    expect((await api.inj("POST", "/api/projects", { ...okHeaders, origin: undefined }, { title: "x" })).statusCode).toBe(403);
    expect((await api.inj("POST", "/api/projects", { ...okHeaders, origin: "http://127.0.0.1:8791" }, { title: "x" })).statusCode).toBe(403);
    expect((await api.inj("POST", "/api/projects", okHeaders, { title: "Тест" })).statusCode).toBe(201);
    expect((await api.inj("POST", "/api/projects", { ...okHeaders, origin: "http://localhost:8790" }, { title: "Тест 2" })).statusCode).toBe(201);
    expect(projects.list(api.core.db).filter((p) => p.title === "x")).toHaveLength(0);
  });

  it("каждый мутирующий маршрут без Origin или с чужим Origin → 403, ничего не записано", async () => {
    const { projectId, scene, versionId } = await seedVersion(api);
    const job = enqueue(api.core.db, { type: "scene.export", projectId, versionId, input: { versionId, request: { format: "mp4" } }, idempotencyKey: "seed" }).job;
    const k = { "idempotency-key": "k-sec" };
    const routes: [string, string, unknown][] = [
      ["POST", "/api/projects", { title: "x" }],
      ["POST", `/api/projects/${projectId}/scenes`, { prompt: "p", settings: defaultSettings() }],
      ["POST", `/api/scenes/${scene.id}/messages`, { text: "медленнее" }],
      ["POST", `/api/scenes/${scene.id}/restore`, { versionId }],
      ["POST", `/api/scenes/${scene.id}/render`, { settings_patch: { duration_frames: 240 } }],
      ["POST", `/api/versions/${versionId}/exports`, { format: "mp4" }],
      ["POST", `/api/jobs/${job.id}/cancel`, {}],
      ["POST", `/api/jobs/${job.id}/retry`, {}],
      ["POST", `/api/jobs/${job.id}/input`, { skip: true }],
      ["PUT", "/api/settings", { limits: { maxRunning: 1 } }],
    ];
    const changes = () => api.core.db.prepare("SELECT total_changes()").pluck().get() as number;
    const before = changes();
    for (const [method, url, body] of routes) {
      for (const origin of [undefined, "https://evil.example", "null"]) {
        const r = await api.inj(method, url, { ...okHeaders, ...k, origin }, body);
        expect(r.statusCode, `${method} ${url} origin=${origin}`).toBe(403);
        expect(r.json().error).toBe("forbidden_origin");
      }
    }
    expect(changes()).toBe(before);
    expect(jobs.get(api.core.db, job.id)!.status).toBe("pending");
  });

  it("GET с чужим Origin или Sec-Fetch-Site cross-site/same-site → 403; свой Origin, same-origin, none — 200", async () => {
    const { versionId } = await seedVersion(api);
    const urls = ["/api/projects", `/api/versions/${versionId}/preview.mp4`, "/api/health"];
    for (const u of urls) {
      const evil = await api.inj("GET", u, { ...getHeaders, origin: "https://evil.example" });
      expect(evil.statusCode, u).toBe(403);
      expect(evil.json().error).toBe("forbidden_origin");
      for (const site of ["cross-site", "same-site"]) {
        const r = await api.inj("GET", u, { ...getHeaders, "sec-fetch-site": site });
        expect(r.statusCode, `${u} ${site}`).toBe(403);
        expect(r.json().error).toBe("forbidden_fetch_site");
      }
      expect((await api.inj("GET", u, { ...getHeaders, origin: ORIGIN })).statusCode, u).toBe(200);
      for (const site of ["same-origin", "none"]) expect((await api.inj("GET", u, { ...getHeaders, "sec-fetch-site": site })).statusCode, `${u} ${site}`).toBe(200);
    }
  });

  it("закодированный путь к API (/%61pi/…) не обходит Sec-Fetch-Site; битая кодировка → 400", async () => {
    const { versionId } = await seedVersion(api);
    for (const u of ["/%61pi/projects", `/%61pi/versions/${versionId}/preview.mp4`, "/%61%70%69/projects"]) {
      const r = await api.inj("GET", u, { ...getHeaders, "sec-fetch-site": "cross-site" });
      expect(r.statusCode, u).toBe(403);
      expect(r.json().error).toBe("forbidden_fetch_site");
    }
    expect((await api.inj("GET", "/api/%E0%A4%A", getHeaders)).statusCode).toBe(400);
  });
});

/** Дерево каталога: путь → размер и mtime (без содержимого). */
function tree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const st = statSync(join(root, r));
      // журнал WAL и shm SQLite меняются от чтения (checkpoint) — содержимое БД сверяется total_changes
      if (/studio\.db-(wal|shm)$/.test(r)) continue;
      out.set(r, `${e.isDirectory() ? "d" : st.size}:${st.mtimeMs}`);
      if (e.isDirectory()) walk(r);
    }
  };
  walk("");
  return out;
}

it("все GET-маршруты без побочных эффектов: total_changes и дерево MS_DATA_DIR не меняются", async () => {
  const { projectId, scene, versionId } = await seedVersion(api);
  const job = enqueue(api.core.db, { type: "scene.export", projectId, versionId, input: { versionId, request: { format: "mp4" } }, idempotencyKey: "seed" }).job;
  const urls = [
    "/api/health",
    "/api/projects",
    "/api/projects?includeBench=1",
    `/api/projects/${projectId}`,
    `/api/scenes/${scene.id}`,
    `/api/scenes/${scene.id}/messages`,
    `/api/versions/${versionId}`,
    `/api/versions/${versionId}/preview.mp4`,
    `/api/versions/${versionId}/frames/0.png`,
    `/api/versions/${versionId}/diff/${versionId}`,
    "/api/jobs",
    `/api/jobs?sceneId=${scene.id}&status=pending`,
    `/api/jobs/${job.id}`,
    "/api/kb/search?q=счётчик",
    "/api/kb/r/counter",
    "/api/settings",
  ];
  const changes = () => api.core.db.prepare("SELECT total_changes()").pluck().get() as number;
  const t0 = tree(api.s.root);
  const c0 = changes();
  for (const u of urls) {
    const r = await api.inj("GET", u, getHeaders);
    expect(r.statusCode, u).toBe(200);
    expect((await api.inj("HEAD", u, getHeaders)).statusCode, `HEAD ${u}`).toBe(200);
  }
  expect(changes()).toBe(c0);
  expect(tree(api.s.root)).toEqual(t0);
});
