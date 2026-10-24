// `--dev` (Q7, ревью Task 20 F4): Vite middleware внутри Fastify на том же порту. WebSocket HMR
// идёт мимо хука `onRequest` Fastify — апгрейд проверяется отдельно: чужой Origin или Host →
// 403 и закрытый сокет, свой Origin (с токеном Vite) — 101 Switching Protocols. Vite не
// открывает собственный порт HMR.
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Api, makeApi } from "./helpers.js";

const HOST = "127.0.0.1:8790";
const ORIGIN = "http://127.0.0.1:8790";
let api: Api;
let port: number;

beforeAll(async () => {
  api = await makeApi({ app: { dev: true } });
  await api.app.listen({ host: "127.0.0.1", port: 0 });
  port = (api.app.server.address() as AddressInfo).port;
}, 30_000);
afterAll(() => api?.close());

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host: HOST, ...headers } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Апгрейд до WebSocket HMR: 101 — подключён, иначе код ответа или `closed`. */
function upgrade(path: string, headers: Record<string, string>): Promise<number | "closed"> {
  return new Promise((resolve) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      headers: {
        host: HOST,
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-protocol": "vite-hmr",
        ...headers,
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode!);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on("error", () => resolve("closed"));
    req.on("close", () => resolve("closed"));
    req.end();
  });
}

async function wsToken(): Promise<string> {
  const client = await get("/@vite/client");
  expect(client.status).toBe(200);
  const m = /const wsToken = "([^"]+)"/.exec(client.body);
  expect(m).not.toBeNull();
  return m![1]!;
}

it("dev: / отдаёт index.html через Vite, API — Fastify, Host проверяется", async () => {
  const index = await get("/");
  expect(index.status).toBe(200);
  expect(index.body).toContain('<div id="root">');
  expect(index.body).toContain("/@vite/client");
  expect((await get("/api/health")).status).toBe(200);
  expect((await get("/", { host: "evil.example:8790" })).status).toBe(403);
});

it("WS-апгрейд HMR: чужой Origin → 403, без Origin → 403, чужой Host → 403; свой Origin с токеном → 101", async () => {
  const token = await wsToken();
  const path = `/?token=${encodeURIComponent(token)}`;
  expect(await upgrade(path, { origin: "https://evil.example" })).toBe(403);
  expect(await upgrade(path, { origin: "http://localhost:3000" })).toBe(403);
  expect(await upgrade(path, {})).toBe(403);
  expect(await upgrade(path, { origin: ORIGIN, host: "evil.example:8790" })).toBe(403);
  expect(await upgrade(path, { origin: ORIGIN })).toBe(101);
  expect(await upgrade(path, { origin: "http://localhost:8790", host: "localhost:8790" })).toBe(101);
});

it("Vite не открывает свой порт HMR: на сервере только наш обработчик upgrade", () => {
  expect(api.app.server.listeners("upgrade")).toHaveLength(1);
});
