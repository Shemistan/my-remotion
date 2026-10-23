// Статика UI (`web/dist`) и SPA-fallback (ревью Task 20, F1): один not-found-обработчик —
// `/api/*` → JSON 404, остальное (GET) → index.html; проверки Host/Origin действуют и для статики.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Api, getHeaders, makeApi } from "./helpers.js";
import { REPO_TMP } from "../db/helpers.js";

const INDEX = "<!doctype html><title>Motion Studio</title>";
let api: Api;
let dist: string;
beforeEach(async () => {
  dist = join(REPO_TMP, `ms-web-dist-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), INDEX);
  writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");
  api = await makeApi({ app: { webDist: dist } });
});
afterEach(async () => {
  await api.close();
  rmSync(dist, { recursive: true, force: true });
});

it("buildApp со собранным web/dist стартует; / и маршрут клиента → index.html", async () => {
  for (const u of ["/", "/projects/abc", "/jobs?status=pending"]) {
    const r = await api.inj("GET", u, getHeaders);
    expect(r.statusCode, u).toBe(200);
    expect(r.body, u).toBe(INDEX);
    expect(r.headers["content-type"], u).toMatch(/^text\/html/);
  }
  const js = await api.inj("GET", "/assets/app.js", getHeaders);
  expect(js.statusCode).toBe(200);
  expect(js.body).toBe("console.log(1)");
});

it("неизвестный /api → JSON 404, не index.html", async () => {
  for (const u of ["/api/nope", "/api", "/api/projects/x/nope"]) {
    const r = await api.inj("GET", u, getHeaders);
    expect(r.statusCode, u).toBe(404);
    expect(r.json(), u).toMatchObject({ error: "not_found" });
  }
});

it("не-GET на неизвестный путь → JSON 404", async () => {
  const r = await api.inj("POST", "/some/route", { ...getHeaders, origin: "http://127.0.0.1:8790" }, {});
  expect(r.statusCode).toBe(404);
  expect(r.json()).toMatchObject({ error: "not_found" });
});

it("Host и Origin проверяются и для статики; обход пути не выходит из dist", async () => {
  expect((await api.inj("GET", "/", { host: "evil.example:8790" })).statusCode).toBe(403);
  expect((await api.inj("GET", "/assets/app.js", { host: "evil.example" })).statusCode).toBe(403);
  expect((await api.inj("GET", "/", { ...getHeaders, origin: "https://evil.example" })).statusCode).toBe(403);
  const t = await api.inj("GET", "/../../etc/hosts", getHeaders);
  expect(t.body).not.toContain("localhost");
  const t2 = await api.inj("GET", "/assets/..%2F..%2F..%2Fpackage.json", getHeaders);
  expect(t2.body).not.toContain("\"name\"");
});
