// Control API видеопроекта (Task 29): создание видеопроекта, импорт по пути (корни импорта,
// идемпотентность, один исходник на проект), карточка медиа, файлы производных только по id
// (Range, без путей клиента), запуск ASR и capability без путей.
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { asset } from "../db/video-fixtures.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { PROXY_BYTES, k, seedVideoApi } from "./video-helpers.js";

let api: Api;
let importRoot: string;
let clip: string;
beforeEach(async () => {
  api = await makeApi();
  importRoot = join(api.s.tmp, "videos");
  await mkdir(importRoot, { recursive: true });
  clip = join(importRoot, "Мой ролик.mp4");
  await writeFile(clip, "not really a video");
  api.core.config.media.importRoots = [importRoot];
});
afterEach(() => api.close());

const ok = (key?: string) => ({ ...okHeaders, ...(key ? k(key) : {}) });
const newVideo = async (title = "Видео") => (await api.inj("POST", "/api/projects", okHeaders, { title, kind: "video" })).json().id as string;

it("POST /projects { kind: video } → видеопроект; без kind — playground", async () => {
  const r = await api.inj("POST", "/api/projects", okHeaders, { title: "Ролик", kind: "video" });
  expect(r.statusCode).toBe(201);
  expect(r.json()).toMatchObject({ kind: "video", title: "Ролик" });
  expect((await api.inj("POST", "/api/projects", okHeaders, { title: "Сцены" })).json().kind).toBe("playground");
  expect((await api.inj("POST", "/api/projects", okHeaders, { title: "x", kind: "audio" })).statusCode).toBe(400);
});

it("импорт по пути: вне корней → 400 media_invalid без путей; идемпотентность; повтор после импорта → 409 media_exists", async () => {
  const p = await newVideo();
  await writeFile(join(api.s.tmp, "outside.mp4"), "x");
  const bad: [string, string][] = [
    ["/etc/hosts", "bad_extension"], [join(api.s.tmp, "outside.mp4"), "outside_roots"], ["relative.mp4", "not_absolute"], [join(api.core.root, "studio.db"), "bad_extension"], [join(importRoot, "нет.mp4"), "not_found"],
  ];
  for (const [path, reason] of bad) {
    const r = await api.inj("POST", `/api/projects/${p}/media/import`, ok(`bad-${reason}`), { path });
    expect(r.statusCode, path).toBe(400);
    expect(r.json()).toMatchObject({ error: "media_invalid", reason });
    expect(JSON.stringify(r.json())).not.toContain(api.core.root);
    expect(JSON.stringify(r.json())).not.toContain(importRoot);
  }
  expect((await api.inj("POST", `/api/projects/${p}/media/import`, okHeaders, { path: clip })).json().error).toBe("idempotency_key_required");
  const a = await api.inj("POST", `/api/projects/${p}/media/import`, ok("k2"), { path: clip });
  const b = await api.inj("POST", `/api/projects/${p}/media/import`, ok("k2"), { path: clip });
  expect([a.statusCode, b.statusCode]).toEqual([202, 200]);
  expect(b.json().job.id).toBe(a.json().job.id);
  expect(a.json().job).toMatchObject({ type: "media.import", project_id: p, input: { method: "path", projectId: p } });
  // пока импорт идёт — второй нельзя
  expect((await api.inj("POST", `/api/projects/${p}/media/import`, ok("k3"), { path: clip })).json()).toMatchObject({ error: "import_in_progress" });
  // импорт завершён: исходник в проекте
  jobs.update(api.core.db, a.json().job.id, { status: "completed" });
  media.insert(api.core.db, asset({ id: "med_x", project_id: p, rel_path: `workspace/projects/${p}/source/med_x/original.mp4` }));
  const c = await api.inj("POST", `/api/projects/${p}/media/import`, ok("k3"), { path: clip });
  expect(c.statusCode).toBe(409);
  expect(c.json().error).toBe("media_exists");
  // playground-проект не импортирует видео
  projects.create(api.core.db, { id: "pg", kind: "playground", title: "pg" });
  expect((await api.inj("POST", "/api/projects/pg/media/import", ok("k5"), { path: clip })).json().error).toBe("not_video_project");
  expect((await api.inj("POST", "/api/projects/nope/media/import", ok("k6"), { path: clip })).statusCode).toBe(404);
});

it("GET /media/:id — probe, производные и статус без абсолютных путей; файлы только по id, Range", async () => {
  await seedVideoApi(api);
  const m = await api.inj("GET", "/api/media/med_1", getHeaders);
  expect(m.statusCode).toBe(200);
  expect(m.json()).toMatchObject({ asset: { id: "med_1", probe: { timeline_fps: { num: 30, den: 1 } } }, transcript_id: "trn_1" });
  expect(m.json().derivatives.map((d: { kind: string }) => d.kind).sort()).toEqual(["audio16k", "proxy", "thumbs", "waveform"]);
  expect(JSON.stringify(m.json())).not.toContain(api.core.root);

  const r = await api.inj("GET", "/api/media/med_1/proxy.mp4", { ...getHeaders, range: "bytes=0-99" });
  expect(r.statusCode).toBe(206);
  expect(r.headers["content-range"]).toBe(`bytes 0-99/${PROXY_BYTES}`);
  expect(r.headers["content-type"]).toBe("video/mp4");
  expect((await api.inj("GET", "/api/media/med_1/proxy.mp4", { ...getHeaders, range: `bytes=${PROXY_BYTES}-` })).statusCode).toBe(416);
  const wf = await api.inj("GET", "/api/media/med_1/waveform.bin", getHeaders);
  expect(wf.statusCode).toBe(200);
  expect(wf.rawPayload.length).toBe(4);
  expect((await api.inj("GET", "/api/media/med_1/thumbs/0.jpg", getHeaders)).body).toBe("jpg1");
  expect((await api.inj("GET", "/api/media/med_1/thumbs/1.jpg", getHeaders)).body).toBe("jpg2");
  for (const bad of ["2.jpg", "01.jpg", "-1.jpg", "..%2F..%2Fstudio.db", "0.png", "%2e%2e%2fproxy.mp4"]) {
    expect((await api.inj("GET", `/api/media/med_1/thumbs/${bad}`, getHeaders)).statusCode, bad).toBe(404);
  }
  expect((await api.inj("GET", "/api/media/nope/proxy.mp4", getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/media/..%2F..%2Fstudio.db/proxy.mp4", getHeaders)).statusCode).toBe(404);
});

it("POST /media/:id/transcribe → 202 asr.transcribe с Idempotency-Key; GET /asr/capability без путей", async () => {
  await seedVideoApi(api);
  const body = { language: "ru", hotwords: ["Motion Studio"] };
  const a = await api.inj("POST", "/api/media/med_1/transcribe", ok("t1"), body);
  expect(a.statusCode).toBe(202);
  expect(a.json().job).toMatchObject({ type: "asr.transcribe", project_id: "p1", input: { projectId: "p1", mediaId: "med_1", language: "ru" } });
  expect((await api.inj("POST", "/api/media/med_1/transcribe", ok("t1"), body)).statusCode).toBe(200);
  expect((await api.inj("POST", "/api/media/med_1/transcribe", ok("t1"), { language: "en" })).statusCode).toBe(422);
  expect((await api.inj("POST", "/api/media/med_1/transcribe", ok("t2"), { language: "Русский" })).statusCode).toBe(400);
  expect((await api.inj("POST", "/api/media/nope/transcribe", ok("t3"), {})).statusCode).toBe(404);

  api.core.config.asr.python = join(api.s.tmp, "нет-python");
  const cap = await api.inj("GET", "/api/asr/capability", getHeaders);
  expect(cap.statusCode).toBe(200);
  expect(cap.json()).toMatchObject({ available: false, reason: "python_missing" });
  expect(JSON.stringify(cap.json())).not.toContain(api.s.tmp);
});

it("задачи наружу без абсолютных путей: media.import — только имя файла, сообщения ошибок — «хранилище» и «~»", async () => {
  const p = await newVideo();
  const a = await api.inj("POST", `/api/projects/${p}/media/import`, ok("leak"), { path: clip });
  expect(a.statusCode).toBe(202);
  expect(a.json().job.input).toMatchObject({ method: "path", path: "Мой ролик.mp4" });
  const id = a.json().job.id as string;
  const home = homedir();
  jobs.update(api.core.db, id, {
    status: "failed",
    finished_at: new Date().toISOString(),
    error: { code: "media_invalid", message: `не открылся ${api.core.root}/workspace/drafts/x.mp4 и ${home}/Movies/a.mov`, cmds: [`ffprobe ${clip}`] },
  });
  const bodies = [
    (await api.inj("GET", "/api/jobs", getHeaders)).json(),
    (await api.inj("GET", `/api/jobs/${id}`, getHeaders)).json().job,
    (await api.inj("GET", `/api/projects/${p}/video`, getHeaders)).json().jobs,
    (await api.inj("POST", `/api/projects/${p}/media/import`, ok("leak"), { path: clip })).json().job,
  ];
  for (const b of bodies) {
    const text = JSON.stringify(b);
    expect(text).not.toContain(api.core.root);
    expect(text).not.toContain(importRoot);
    expect(text).not.toContain(home);
    expect(text).toContain("Мой ролик.mp4");
  }
  const j = (await api.inj("GET", `/api/jobs/${id}`, getHeaders)).json().job;
  expect(j.error.message).toBe("не открылся хранилище/workspace/drafts/x.mp4 и ~/Movies/a.mov");
  // в БД вход не изменён: повтор того же запроса — та же задача
  expect((jobs.get(api.core.db, id)!.input as { path: string }).path).toBe(clip);
});
