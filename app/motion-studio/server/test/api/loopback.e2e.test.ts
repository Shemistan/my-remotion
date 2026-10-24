// Рендер не достаёт до настоящего Control API (поправки после ревью среза, ruling 17): сервер
// Task 20 (`buildApp` на ядре в tmp-хранилище) слушает 127.0.0.1:8790, реальный рендер Remotion
// рукописной версии «в обход static check» пытается достучаться до `/api/health`:
//   прямой fetch из Chrome (127.0.0.1, localhost, [::1]) → blocked;
//   `/proxy?src=http://127.0.0.1:8790/api/health` у сервера бандла → 500 от asset-guard;
//   <Img src="/proxy?src=…"> → рендер отказывает (ASSET_BLOCKED);
//   <Audio src="http://127.0.0.1:8790/…"> → превью отказывает (ASSET_BLOCKED);
// и в журнале сервера (логгер Fastify, «incoming request») за всё время рендеров — ноль запросов.
// Запуск: `MS_E2E=1 vitest run server/test/api/loopback.e2e.test.ts` (или `make e2e`); порт 8790
// должен быть свободен (сервер Motion Studio не запущен).
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { afterAll, beforeAll, expect, it } from "vitest";
import { reapAttempt } from "@ms/core";
import { SettingsSchema } from "@ms/contracts";
import { type RenderRequest, ensureRenderBrowser, renderVersion } from "@ms/render";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { PORT, buildApp } from "../../src/api/app.js";
import type { ZApp } from "../../src/api/context.js";
import { type Core, bootCore } from "../../src/boot.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { makeKb } from "./helpers.js";

const T = 300_000;
const FIXTURE = fileURLToPath(new URL("../fixtures/api-loopback/", import.meta.url));

let s: TestStore;
let core: Core;
let app: ZApp;
const lines: string[] = [];
const incoming = () => lines.filter((l) => l.includes('"msg":"incoming request"'));

beforeAll(async () => {
  await ensureRenderBrowser();
  s = await makeStore("ms-api-loopback-");
  core = await bootCore({
    env: { MS_DATA_DIR: s.root },
    kind: "server",
    probe,
    kb: await makeKb(s.tmp),
    agents: {} as AgentRuntimeAdapter,
    reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }),
    reapStrays: async () => [],
    handlers: {},
  });
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(...String(chunk).split("\n").filter(Boolean));
      cb();
    },
  });
  app = await buildApp(core, { port: PORT, logger: { level: "info", stream } });
  await app.listen({ host: "127.0.0.1", port: PORT });
}, T);

afterAll(async () => {
  await app?.close();
  await core?.close();
  if (s) await removeStore(s);
});

function get(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: PORT, path, headers: { host: `127.0.0.1:${PORT}` } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode!));
    });
    req.on("error", reject);
    req.end();
  });
}

async function render(mode: "fetch" | "proxy" | "img" | "audio") {
  const dir = join(s.tmp, `v-${mode}`);
  await cp(FIXTURE, dir, { recursive: true });
  await writeFile(join(dir, "props.json"), JSON.stringify({ port: PORT, mode }));
  const cacheDir = join(s.tmp, "cache");
  await mkdir(cacheDir, { recursive: true });
  const req: RenderRequest = {
    versionDir: dir,
    settings: SettingsSchema.parse(JSON.parse(await readFile(join(FIXTURE, "settings.json"), "utf8"))),
    cacheDir,
    stills: [0],
    preview: mode === "audio" ? { scale: 1, crf: 23 } : null,
    timeoutMs: 120_000,
    run: { root: s.root, runId: `loopback-${mode}`, attempt: 1 },
  };
  return renderVersion(req);
}

it("сервер на 127.0.0.1:8790 отвечает и пишет запросы в журнал (проверка самой проверки)", async () => {
  expect(await get("/api/health")).toBe(200);
  expect(incoming()).toHaveLength(1);
  expect(incoming()[0]).toContain("/api/health");
  lines.length = 0;
}, T);

it("прямой fetch из Chrome на /api/health — blocked по 127.0.0.1, localhost и [::1]; бандл грузится", async () => {
  const r = await render("fetch");
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  const logs = r.browserLogs.filter((l) => l.includes("api-loopback:"));
  expect(logs.length).toBeGreaterThan(0);
  for (const l of logs) expect(l).toMatch(/127\.0\.0\.1 blocked, localhost blocked, ::1 blocked/);
  expect(incoming()).toEqual([]);
}, T);

it("/proxy?src=http://127.0.0.1:8790/api/health — 500 от asset-guard, Node сервера бандла не ходит в API", async () => {
  const r = await render("proxy");
  expect(r.ok).toBe(true);
  const logs = r.browserLogs.filter((l) => l.includes("api-loopback: proxy"));
  expect(logs.length).toBeGreaterThan(0);
  for (const l of logs) expect(l).toMatch(/status 500 guarded/);
  expect(incoming()).toEqual([]);
}, T);

it("<Img src='/proxy?src=…/api/health'> — рендер отказывает ASSET_BLOCKED, запросов нет", async () => {
  const r = await render("img");
  expect(r.ok).toBe(false);
  expect(r.browserLogs.join("\n")).toMatch(/ассет заблокирован.*127\.0\.0\.1:8790\/api\/health/);
  expect(incoming()).toEqual([]);
}, T);

it("<Audio src='http://127.0.0.1:8790/api/health'> — превью отказывает ASSET_BLOCKED, запросов нет", async () => {
  const r = await render("audio");
  expect(r.ok).toBe(false);
  expect(r.error).toMatchObject({ stage: "media" });
  expect(r.error!.message).toMatch(/ассет заблокирован/);
  expect(incoming()).toEqual([]);
}, T);
