// Task 36 (F9): loopback-медиасервер worker таймлайна — только перечисленные файлы по токену,
// Range → 206, без листинга и редиректов, только 127.0.0.1.
import { writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MediaServer, serveMedia } from "../../src/timeline/media-server.ts";
import { makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let srv: MediaServer;
const BODY = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

beforeAll(async () => {
  tmp = await makeTmp();
  await writeFile(join(tmp, "master.mp4"), BODY);
  await writeFile(join(tmp, "secret.txt"), "secret");
  srv = await serveMedia({ master: join(tmp, "master.mp4") });
});
afterAll(async () => {
  await srv?.close();
  if (tmp) await removeTmp(tmp);
});

/** Сырой запрос (fetch нормализует `..` в пути — проверяем то, что придёт от Remotion как есть). */
function raw(path: string, headers: Record<string, string> = {}, method = "GET"): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  const u = new URL(srv.origin);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("serveMedia", () => {
  it("bytesSent — байты тела, отданные с запуска (весь файл + диапазон; HEAD и 404 — ноль)", async () => {
    const own = await serveMedia({ master: join(tmp, "master.mp4") });
    try {
      expect(own.bytesSent()).toBe(0);
      await (await fetch(own.urlFor("master"))).arrayBuffer();
      await (await fetch(own.urlFor("master"), { headers: { Range: "bytes=0-99" } })).arrayBuffer();
      await (await fetch(own.urlFor("master"), { method: "HEAD" })).arrayBuffer();
      await (await fetch(`${own.origin}/${own.token}/none`)).arrayBuffer();
      expect(own.bytesSent()).toBe(1100);
    } finally {
      await own.close();
    }
  });

  it("127.0.0.1, путь /<токен 32 hex>/<ключ>", () => {
    expect(new URL(srv.origin).hostname).toBe("127.0.0.1");
    expect(srv.token).toMatch(/^[0-9a-f]{32}$/);
    expect(srv.urlFor("master")).toBe(`${srv.origin}/${srv.token}/master`);
    expect(() => srv.urlFor("other")).toThrow();
  });

  it("весь файл и Range → 206 с Content-Range", async () => {
    const full = await fetch(srv.urlFor("master"));
    expect(full.status).toBe(200);
    expect(Buffer.from(await full.arrayBuffer()).equals(BODY)).toBe(true);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const part = await fetch(srv.urlFor("master"), { headers: { Range: "bytes=0-99" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-99/1000");
    expect(Buffer.from(await part.arrayBuffer()).equals(BODY.subarray(0, 100))).toBe(true);
    const tail = await fetch(srv.urlFor("master"), { headers: { Range: "bytes=-10" } });
    expect(tail.status).toBe(206);
    expect(Buffer.from(await tail.arrayBuffer()).equals(BODY.subarray(990))).toBe(true);
    const bad = await fetch(srv.urlFor("master"), { headers: { Range: "bytes=2000-" } });
    expect(bad.status).toBe(416);
    const head = await raw(`/${srv.token}/master`, {}, "HEAD");
    expect([head.status, head.headers["content-length"], head.body.length]).toEqual([200, "1000", 0]);
  });

  it("чужой токен, неизвестный ключ, обход пути, листинг, POST — 404/405 без редиректов", async () => {
    expect((await fetch(srv.origin + "/" + "0".repeat(32) + "/master")).status).toBe(404);
    expect((await fetch(srv.urlFor("master").replace("master", "..%2Fetc%2Fpasswd"))).status).toBe(404);
    expect((await raw(`/${srv.token}/../secret.txt`)).status).toBe(404);
    expect((await raw(`/${srv.token}/master/`)).status).toBe(404);
    expect((await raw(`/${srv.token}/`)).status).toBe(404);
    expect((await raw(`/${srv.token}`)).status).toBe(404);
    expect((await raw("/")).status).toBe(404);
    expect((await raw(`/${srv.token}/master?x=1`)).status).toBe(404);
    expect((await raw(`/${srv.token}/master`, {}, "POST")).status).toBe(405);
    for (const r of [await raw("/"), await raw(`/${srv.token}/`)]) expect(r.headers.location).toBeUndefined();
  });

  it("ключи и пути проверяются при запуске", async () => {
    await expect(serveMedia({ "a/b": join(tmp, "master.mp4") })).rejects.toThrow(/ключ/);
    await expect(serveMedia({ master: "relative.mp4" })).rejects.toThrow(/абсолютн/);
    await expect(serveMedia({ master: join(tmp, "none.mp4") })).rejects.toThrow();
    await expect(serveMedia({ master: tmp })).rejects.toThrow(/не обычный файл/);
  });
});
