// SSE `GET /events`: догон с since по порядку id, живые события, Last-Event-ID без дублей,
// комментарий-heartbeat. Настоящий сокет (inject ждёт конца ответа, а SSE не кончается).
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it } from "vitest";
import { tx } from "../../src/db/tx.js";
import { enqueue } from "../../src/jobs/queue.js";
import { until } from "../jobs/helpers.js";
import { type Api, makeApi } from "./helpers.js";

let api: Api;
let port: number;
beforeEach(async () => {
  api = await makeApi({ app: { sseHeartbeatMs: 50 } });
  await api.app.listen({ host: "127.0.0.1", port: 0 });
  port = (api.app.server.address() as AddressInfo).port;
});
afterEach(() => api.close());

interface Stream {
  text: () => string;
  events: () => { id: number; event: string; data: { id: number; message: string } }[];
  status: Promise<number>;
  headers: Promise<Record<string, unknown>>;
  close(): void;
}

function open(path: string, headers: Record<string, string> = {}): Stream {
  let buf = "";
  let res!: (n: number) => void;
  let resH!: (h: Record<string, unknown>) => void;
  const status = new Promise<number>((r) => (res = r));
  const hdrs = new Promise<Record<string, unknown>>((r) => (resH = r));
  const req = request({ host: "127.0.0.1", port, path, headers: { host: "127.0.0.1:8790", ...headers } }, (r) => {
    res(r.statusCode!);
    resH(r.headers);
    r.setEncoding("utf8");
    r.on("data", (c: string) => (buf += c));
    r.on("error", () => undefined);
  });
  req.on("error", () => undefined);
  req.end();
  return {
    text: () => buf,
    events: () =>
      buf
        .split("\n\n")
        .filter((b) => b.includes("data: "))
        .map((b) => {
          const f = Object.fromEntries(b.split("\n").filter((l) => !l.startsWith(":")).map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 2)]));
          return { id: Number(f.id), event: f.event!, data: JSON.parse(f.data!) };
        }),
    status,
    headers: hdrs,
    close: () => req.destroy(),
  };
}

function emit(jobId: string, message: string): number {
  return tx(api.core.db, () => api.core.events.emit(api.core.db, { job_id: jobId, level: "info", kind: "log", message })).id;
}

it("since=0: история по порядку id, затем живые; Last-Event-ID — продолжение без дублей; heartbeat", async () => {
  api.core.db.prepare("INSERT INTO scenes (id, project_id, title, created_at) VALUES ('scn_e', 'playground', 't', ?)").run(new Date().toISOString());
  const job = enqueue(api.core.db, { type: "playground.generate", projectId: "playground", sceneId: "scn_e", input: {}, idempotencyKey: "e" }).job;
  const e1 = emit(job.id, "один");
  const e2 = emit(job.id, "два");
  const s = open("/api/events?since=0");
  expect(await s.status).toBe(200);
  expect((await s.headers)["content-type"]).toMatch(/^text\/event-stream/);
  await until(() => s.events().length >= 2, "история", 3000);
  const e3 = emit(job.id, "три");
  await until(() => s.events().length >= 3, "живое событие", 3000);
  expect(s.events().map((e) => [e.id, e.event, e.data.message])).toEqual([[e1, "job", "один"], [e2, "job", "два"], [e3, "job", "три"]]);
  expect(s.events().every((e) => e.data.id === e.id)).toBe(true);
  await until(() => /^: /m.test(s.text()), "heartbeat", 3000);
  s.close();

  // переподключение: Last-Event-ID важнее since — только новые
  const e4 = emit(job.id, "четыре");
  const r = open("/api/events?since=0", { "last-event-id": String(e3) });
  await until(() => r.events().length >= 1, "после переподключения", 3000);
  await new Promise((x) => setTimeout(x, 100));
  expect(r.events().map((e) => e.id)).toEqual([e4]);
  r.close();

  // без since — только живые
  const live = open("/api/events");
  expect(await live.status).toBe(200);
  await new Promise((x) => setTimeout(x, 100));
  const e5 = emit(job.id, "пять");
  await until(() => live.events().length >= 1, "живое", 3000);
  expect(live.events().map((e) => e.id)).toEqual([e5]);
  live.close();
});

it("SSE тоже за проверкой Host", async () => {
  const s = open("/api/events?since=0", { host: "evil.example:8790" });
  expect(await s.status).toBe(403);
  s.close();
});
