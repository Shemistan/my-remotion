// Потоковая загрузка видео (Task 29, ревью Task 25 M4): тело пишется сразу в
// `workspace/uploads/<id>/` под серверным именем; имя из query — только для отображения;
// место проверяется до приёма (507); обрыв соединения — каталог удалён, задача не создана.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import { displayName, sweepUploads } from "../../src/media/uploads.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";
import { k } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

const uploads = () => {
  const dir = `${api.core.root}/workspace/uploads`;
  return existsSync(dir) ? readdirSync(dir) : [];
};
const newVideo = async () => (await api.inj("POST", "/api/projects", okHeaders, { title: "Видео", kind: "video" })).json().id as string;
const put = (p: string, name: string, body: Buffer | Readable, headers: Record<string, string> = {}) =>
  api.app.inject({
    method: "PUT",
    url: `/api/projects/${p}/media/upload?name=${encodeURIComponent(name)}`,
    headers: { ...okHeaders, "content-type": "application/octet-stream", ...headers },
    payload: body,
  });

it("тело → workspace/uploads/<id>/ под серверным именем; задача media.import с относительным путём; повтор ключа — та же задача", async () => {
  const p = await newVideo();
  const data = Buffer.alloc(100_000, 1);
  const r = await put(p, "../../etc/Съёмка 1.MOV", data, { ...k("u1"), "content-length": String(data.length) });
  expect(r.statusCode, r.body).toBe(202);
  const job = r.json().job;
  expect(job.type).toBe("media.import");
  expect(job.input).toMatchObject({ projectId: p, method: "upload", originalName: "Съёмка 1.MOV" });
  expect(job.input.uploadPath).toMatch(/^workspace\/uploads\/upl_[0-9A-Z]+\/upload\.mov$/);
  expect(JSON.stringify(job)).not.toContain(api.core.root);
  expect(readFileSync(`${api.core.root}/${job.input.uploadPath}`)).toEqual(data);
  expect(uploads()).toHaveLength(1);
  const again = await put(p, "Съёмка 1.MOV", data, { ...k("u1"), "content-length": String(data.length) });
  expect(again.statusCode).toBe(200);
  expect(again.json().job.id).toBe(job.id);
  expect(uploads()).toHaveLength(1);
});

it("место проверяется до приёма: Content-Length больше свободного → 507 low_space, ничего не записано", async () => {
  const p = await newVideo();
  const r = await put(p, "a.mp4", Readable.from([Buffer.alloc(10)]), { ...k("u2"), "content-length": String(10 ** 15) });
  expect(r.statusCode).toBe(507);
  expect(r.json().error).toBe("low_space");
  expect(JSON.stringify(r.json())).not.toContain(api.core.root);
  expect(uploads()).toEqual([]);
  expect(jobs.list(api.core.db)).toEqual([]);
});

it("без Content-Length → 411; не видео по имени → 400 media_invalid; не видеопроект → 409; без ключа → 400", async () => {
  const p = await newVideo();
  expect((await put(p, "a.mp4", Readable.from([Buffer.alloc(10)]), { ...k("u3"), "transfer-encoding": "chunked" })).statusCode).toBe(411);
  expect((await put(p, "notes.txt", Buffer.alloc(10), { ...k("u4"), "content-length": "10" })).json().error).toBe("media_invalid");
  expect((await put(p, "a.mp4", Buffer.alloc(10), { "content-length": "10" })).json().error).toBe("idempotency_key_required");
  const pg = (await api.inj("POST", "/api/projects", okHeaders, { title: "pg" })).json().id as string;
  expect((await put(pg, "a.mp4", Buffer.alloc(10), { ...k("u5"), "content-length": "10" })).json().error).toBe("not_video_project");
  expect(uploads()).toEqual([]);
  expect(jobs.list(api.core.db)).toEqual([]);
});

it("тело короче Content-Length (обрыв соединения) → каталог загрузки удалён, задача не создана", async () => {
  const p = await newVideo();
  await api.app.listen({ port: 0, host: "127.0.0.1" });
  const port = (api.app.server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => {
    const req = request({
      host: "127.0.0.1", port, method: "PUT", path: `/api/projects/${p}/media/upload?name=a.mp4`,
      headers: { ...okHeaders, ...k("u6"), "content-type": "application/octet-stream", "content-length": String(1_000_000) },
    });
    req.on("error", () => resolve());
    req.on("response", (res) => { res.resume(); res.on("end", () => resolve()); });
    req.write(Buffer.alloc(50_000, 2));
    setTimeout(() => req.destroy(), 300);
  });
  const until = Date.now() + 5000;
  while (uploads().length > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  expect(uploads()).toEqual([]);
  expect(jobs.list(api.core.db)).toEqual([]);
});

it("имя для отображения: без каталогов и управляющих символов, только видео", () => {
  expect(displayName("../../etc/Съёмка 1.MOV")).toBe("Съёмка 1.MOV");
  expect(displayName("C:\\Users\\a\\b.mp4")).toBe("b.mp4");
  expect(displayName("a\u0000b\u200b.mkv")).toBe("ab.mkv");
  expect(displayName("notes.txt")).toBeUndefined();
  expect(displayName("..")).toBeUndefined();
});

it("уборка при старте: остаются загрузки задач, которые можно выполнить или повторить", async () => {
  const p = await newVideo();
  const root = api.core.root;
  for (const id of ["upl_A", "upl_B", "upl_C", "upl_D"]) mkdirSync(`${root}/workspace/uploads/${id}`, { recursive: true });
  const ins = (id: string, status: "pending" | "failed" | "completed", upl: string) =>
    jobs.insert(api.core.db, { id, type: "media.import", project_id: p, input: { projectId: p, method: "upload", uploadPath: `workspace/uploads/${upl}/upload.mp4`, originalName: "a.mp4" }, status });
  ins("job_a", "pending", "upl_A");
  ins("job_b", "failed", "upl_B");
  ins("job_c", "completed", "upl_C");
  expect((await sweepUploads(api.core.db, root)).sort()).toEqual(["upl_C", "upl_D"]);
  expect(uploads().sort()).toEqual(["upl_A", "upl_B"]);
});
