// Уборка кэша (Task 49a): LRU до лимита; не трогает активное, текущий таймлайн, packages/,
// опубликованные версии и корзину; master — вместе со строкой публикации.
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { chmod, mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cacheUseDir, cacheUsePath, markCacheUse } from "@ms/render";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { enqueue } from "../../src/jobs/queue.js";
import { gcCache, masterUseKey, maybeAutoCacheGc } from "../../src/perf/cache-gc.js";
import { cacheGc, type CacheGcDeps } from "../../src/pipeline/cache-gc.js";
import type { JobContext } from "../../src/jobs/types.js";
import { stillsCache } from "../../src/perf/stills-cache.js";
import { unlockTree } from "../db/helpers.js";
import { setupDb, teardownDb, type JobsEnv } from "../jobs/helpers.js";

const MiB = 1024 * 1024;
const NOW = Date.parse("2026-10-25T12:00:00.000Z");
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const K: Record<string, string> = { b1: hex("b1"), b2: hex("b2"), b3: hex("b3"), b4: hex("b4"), b5: `tl-${hex("b5")}` };
const name = (key: string) => Object.entries(K).find(([, v]) => v === key)?.[0] ?? key;

let env: JobsEnv;
let root: string;
let cache: string;
beforeEach(async () => {
  env = await setupDb("ms-perf-gc-");
  root = env.s.root;
  cache = join(root, "cache");
  projects.create(env.db, { id: "p1", kind: "video", title: "Ролик" });
  projects.create(env.db, { id: "p2", kind: "video", title: "Второй" });
  projects.create(env.db, { id: "p3", kind: "video", title: "Удалённый" });
});
afterEach(async () => {
  await unlockTree(root).catch(() => undefined);
  await teardownDb(env);
});

let seq = 0;
function job(projectId: string, status: "running" | "completed"): string {
  const j = enqueue(env.db, { type: "timeline.preview", projectId, input: { n: ++seq }, idempotencyKey: `k${seq}` }).job;
  jobs.update(env.db, j.id, { status });
  return j.id;
}

async function file(path: string, bytes: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, Buffer.alloc(bytes, 1));
}

/** Бандл ключа: 1 МиБ, отметка задачи, «последнее использование» — минуты назад от NOW. */
async function bundle(key: string, agoMin: number, jobId?: string): Promise<void> {
  await file(join(cache, "bundles", key, "index.html"), MiB);
  await mkdir(join(cache, "entries", key), { recursive: true });
  await writeFile(join(cache, "entries", key, "index.tsx"), "");
  await markCacheUse(cache, key, jobId);
  const t = new Date(NOW - agoMin * 60_000);
  await utimes(cacheUsePath(cache, key, jobId), t, t);
}

/** Состарить все отметки ключа. */
async function ageMarks(key: string, t: Date): Promise<void> {
  const dir = cacheUseDir(cache, key);
  for (const n of readdirSync(dir)) await utimes(join(dir, n), t, t);
}

/** Опубликованный master: каталог read-only + строка artifact_publications. */
async function master(projectId: string, mediaId: string, agoMin: number, height?: number): Promise<string> {
  const rel = `workspace/projects/${projectId}/master/${mediaId}@30-1${height === undefined ? "" : `-h${height}`}`;
  await file(join(root, rel, "master.mp4"), MiB);
  await chmod(join(root, rel, "master.mp4"), 0o444);
  await chmod(join(root, rel), 0o555);
  env.db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, NULL, NULL, ?)")
    .run(rel, new Date(NOW - agoMin * 60_000).toISOString());
  return rel;
}

it("5 бандлов по 1 МиБ, лимит 3 МиБ: удаляются b1 и b3 — b2 у активной задачи, b5 — текущий таймлайн", async () => {
  const active = job("p2", "running");
  const tl = job("p1", "completed");
  env.db.prepare("INSERT INTO video_timelines (id, project_id, current_revision, created_at) VALUES ('tl_1', 'p1', 1, ?)").run(new Date(NOW).toISOString());
  await bundle(K.b1!, 600);
  await bundle(K.b2!, 500, active);
  await bundle(K.b3!, 400);
  await bundle(K.b4!, 300);
  await bundle(K.b5!, 200, tl);
  const r = await gcCache(root, env.db, { maxBytes: 3 * MiB, now: () => NOW });
  expect(r.removed.map(name).sort()).toEqual(["b1", "b3"]);
  expect(r.protected.map((p) => [name(p.id), p.why]).sort()).toEqual([["b2", "active"], ["b5", "timeline"]]);
  expect(r.keptBytes).toBe(3 * MiB);
  expect(r.freedBytes).toBe(2 * MiB);
  for (const k of ["b1", "b3"]) {
    expect(existsSync(join(cache, "bundles", K[k]!))).toBe(false);
    expect(existsSync(join(cache, "entries", K[k]!))).toBe(false);
    expect(existsSync(join(cache, "used", K[k]!))).toBe(false);
  }
  for (const k of ["b2", "b4", "b5"]) expect(existsSync(join(cache, "bundles", K[k]!, "index.html"))).toBe(true);
  expect(existsSync(join(root, "cache/.gc"))).toBe(true);
  expect((await import("node:fs")).readdirSync(join(root, "cache/.gc"))).toEqual([]);
});

it("под лимитом ничего не удаляется; недавно тронутое защищено даже сверх лимита", async () => {
  await bundle(K.b1!, 600);
  await bundle(K.b2!, 5);
  expect((await gcCache(root, env.db, { maxBytes: 10 * MiB, now: () => NOW })).removed).toEqual([]);
  const r = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r.removed.map(name)).toEqual(["b1"]);
  expect(r.protected).toEqual([{ id: K.b2, why: "recent" }]);
});

it("стоп-кадры ключа уходят вместе с бандлом; кадр из кэша — без повторного рендера", async () => {
  const stills = stillsCache(root);
  const size = { width: 480, height: 270 };
  expect(stills.get(K.b1!, 12, size)).toBeUndefined();
  const src = join(env.s.tmp, "f12.png");
  await writeFile(src, Buffer.alloc(MiB, 2));
  const p = await stills.put(K.b1!, 12, size, src, "job_x");
  expect(stills.get(K.b1!, 12, size)).toBe(p);
  expect(p).toBe(join(cache, "stills", K.b1!, "12-480x270.png"));
  expect(stills.get(K.b1!, 12, { width: 1920, height: 1080 })).toBeUndefined();
  // get отмечает использование в фоне — дождаться, затем состарить отметку
  await new Promise((r) => setTimeout(r, 50));
  const t = new Date(NOW - 3600_000);
  await ageMarks(K.b1!, t);
  const r = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r.removed).toEqual([K.b1]);
  expect(r.freedBytes).toBe(MiB);
  expect(stills.get(K.b1!, 12, size)).toBeUndefined();
  expect(() => stills.path("../x", 0, size)).toThrow(/ключ/);
});

it("master: удаляется со строкой публикации; проект с таймлайном, с активной задачей и удалённый — не трогаются", async () => {
  const old = await master("p2", "med_a", 3000);
  const withTl = await master("p1", "med_b", 4000);
  const busy = await master("p3", "med_c", 5000);
  env.db.prepare("INSERT INTO video_timelines (id, project_id, current_revision, created_at) VALUES ('tl_1', 'p1', 2, ?)").run(new Date(NOW).toISOString());
  // p3 занят задачей, а потом удалён (каталог — в корзине у trash): в любом случае не трогаем
  job("p3", "running");
  const r1 = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r1.removed).toEqual([`master:${old}`]);
  expect(existsSync(join(root, old))).toBe(false);
  expect(env.db.prepare("SELECT 1 FROM artifact_publications WHERE dest_rel = ?").get(old)).toBeUndefined();
  expect(r1.protected).toEqual(expect.arrayContaining([{ id: `master:${withTl}`, why: "timeline" }, { id: `master:${busy}`, why: "active" }]));
  env.db.prepare("UPDATE projects SET deleted_at = ? WHERE id = 'p3'").run(new Date(NOW).toISOString());
  env.db.prepare("UPDATE jobs SET status = 'cancelled' WHERE project_id = 'p3'").run();
  const r2 = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r2.removed).toEqual([]);
  expect(existsSync(join(root, busy, "master.mp4"))).toBe(true);
  expect(existsSync(join(root, withTl, "master.mp4"))).toBe(true);
});

it("отметка master свежее публикации — порядок LRU по ней", async () => {
  const a = await master("p2", "med_a", 3000);
  const b = await master("p2", "med_b", 4000);
  await mkdir(cache, { recursive: true });
  await markCacheUse(cache, masterUseKey("p2", "med_b", { num: 30, den: 1 }), "job_y");
  const t = new Date(NOW - 60 * 60_000);
  await ageMarks(masterUseKey("p2", "med_b", { num: 30, den: 1 }), t);
  const r = await gcCache(root, env.db, { maxBytes: MiB, now: () => NOW });
  expect(r.removed).toEqual([`master:${a}`]);
  expect(existsSync(join(root, b))).toBe(true);
});

it("packages/, версии сцен, экспорты и корзина не трогаются; размер packages — в отчёт", async () => {
  await file(join(root, "workspace/projects/p1/packages/pkg_1/01.mp4"), 2 * MiB);
  await file(join(root, "workspace/projects/p1/scenes/scn_1/versions/v1/preview.mp4"), MiB);
  await file(join(root, "workspace/projects/p1/exports/exp_1/out.mp4"), MiB);
  await file(join(root, "workspace/trash/p3-1/master/med_c@30-1/master.mp4"), MiB);
  await bundle(K.b1!, 600);
  const r = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r.removed).toEqual([K.b1]);
  expect(r.packagesBytes).toBe(2 * MiB);
  expect(r.totalBytes).toBe(MiB);
  for (const p of ["workspace/projects/p1/packages/pkg_1/01.mp4", "workspace/projects/p1/scenes/scn_1/versions/v1/preview.mp4",
    "workspace/projects/p1/exports/exp_1/out.mp4", "workspace/trash/p3-1/master/med_c@30-1/master.mp4"]) {
    expect(existsSync(join(root, p))).toBe(true);
  }
});

it("недоделки убитых worker и остатки cache/.gc убираются; живой pid — нет", async () => {
  await file(join(cache, "bundles", `${K.b1!}.tmp-999999`, "x"), 10);
  await file(join(cache, "bundles", `${K.b2!}.tmp-${process.pid}`, "x"), 10);
  await file(join(cache, ".gc", "old", "x"), 10);
  const r = await gcCache(root, env.db, { maxBytes: 10 * MiB, now: () => NOW });
  expect(r.leftovers).toBe(2);
  expect(existsSync(join(cache, "bundles", `${K.b1!}.tmp-999999`))).toBe(false);
  expect(existsSync(join(cache, "bundles", `${K.b2!}.tmp-${process.pid}`))).toBe(true);
  expect(existsSync(join(cache, ".gc", "old"))).toBe(false);
});

function gcCtx(jobId: string, events: { kind: string; data?: unknown }[]): JobContext {
  return {
    db: env.db, job: jobs.get(env.db, jobId)!, attempt: 1, signal: new AbortController().signal,
    emit: (kind: string, _m: string, data?: unknown) => events.push({ kind, data }), progress: () => undefined,
  } as unknown as JobContext;
}

it("задача cache.gc: лимит из config или входа; хранилище недоступно — отказ без удаления", async () => {
  await bundle(K.b1!, 600);
  await bundle(K.b2!, 500);
  const deps = (ok: boolean) => ({
    svc: { root, config: { cache: { maxBytes: 10 * MiB } }, storageCheck: async () => (ok ? { ok: true } : { ok: false, reason: "not_found", detail: "нет" }) },
  }) as unknown as CacheGcDeps;
  const j1 = enqueue(env.db, { type: "cache.gc", projectId: "playground", input: {}, idempotencyKey: "g1" }).job;
  const ev: { kind: string; data?: unknown }[] = [];
  expect(await cacheGc(() => deps(true))(gcCtx(j1.id, ev))).toMatchObject({ status: "completed", outputRefs: { removed: 0, max_bytes: 10 * MiB } });
  const j2 = enqueue(env.db, { type: "cache.gc", projectId: "playground", input: { maxBytes: MiB }, idempotencyKey: "g2" }).job;
  expect(await cacheGc(() => deps(false))(gcCtx(j2.id, ev))).toMatchObject({ status: "failed", error: { code: "storage_unavailable" } });
  expect(existsSync(join(cache, "bundles", K.b1!))).toBe(true);
  // реальное время: отметки «600 минут назад» от NOW (2026-10-25) — давно
  expect(await cacheGc(() => deps(true))(gcCtx(j2.id, ev))).toMatchObject({ status: "completed", outputRefs: { removed: 1, freed_bytes: MiB } });
  expect(existsSync(join(cache, "bundles", K.b1!))).toBe(false);
  expect(ev.filter((e) => e.kind === "cache_gc")).toHaveLength(2);
});

it("автоуборка: только при простое и не чаще раза в сутки", () => {
  const t0 = Date.parse("2026-10-25T03:00:00.000Z");
  const busy = job("p1", "running");
  expect(maybeAutoCacheGc(env.db, "playground", t0)).toBeUndefined();
  jobs.update(env.db, busy, { status: "completed" });
  const id = maybeAutoCacheGc(env.db, "playground", t0);
  expect(jobs.get(env.db, id!)).toMatchObject({ type: "cache.gc", status: "pending", input: { auto: true } });
  jobs.update(env.db, id!, { status: "completed" });
  expect(maybeAutoCacheGc(env.db, "playground", t0 + 3600_000)).toBeUndefined();
});

it("две задачи на ключе: короткий B завершён позже, долгий A ещё идёт — ключ не удаляется", async () => {
  const a = job("p2", "running");
  const b = job("p2", "completed");
  await bundle(K.b1!, 600, a); // экспорт A отметился давно и всё ещё идёт
  await markCacheUse(cache, K.b1!, b); // рендер B отметился позже и уже завершён
  const t = new Date(NOW - 300 * 60_000);
  await utimes(cacheUsePath(cache, K.b1!, b), t, t);
  const r = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r.removed).toEqual([]);
  expect(r.protected).toEqual([{ id: K.b1, why: "active" }]);
  expect(readdirSync(cacheUseDir(cache, K.b1!)).sort()).toEqual([`${a}.json`, `${b}.json`].sort());
  jobs.update(env.db, a, { status: "completed" });
  // LRU — по самой свежей отметке (B, 300 мин назад)
  const r2 = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r2.removed).toEqual([K.b1]);
  expect(existsSync(cacheUseDir(cache, K.b1!))).toBe(false);
});

it("отметки-сироты: ключа нет в кэше, master не опубликован, прежний формат — убираются; свежие — нет", async () => {
  await mkdir(cache, { recursive: true });
  const old = new Date(NOW - 3600_000);
  await markCacheUse(cache, K.b1!, "job_a"); // ключ без каталогов кэша
  await markCacheUse(cache, masterUseKey("p2", "med_x", { num: 30, den: 1 }), "job_a"); // master не опубликован
  await markCacheUse(cache, K.b3!, "job_a"); // свежая
  await writeFile(join(cache, "used", `${K.b2!}.json`), "{}"); // прежний формат
  for (const p of [cacheUseDir(cache, K.b1!), cacheUseDir(cache, masterUseKey("p2", "med_x", { num: 30, den: 1 })), join(cache, "used", `${K.b2!}.json`)]) await utimes(p, old, old);
  const r = await gcCache(root, env.db, { maxBytes: 10 * MiB, now: () => Date.now() });
  expect(r.leftovers).toBe(3);
  expect(readdirSync(join(cache, "used"))).toEqual([K.b3]);
});

it("Task 49b: master ступени (`@30-1-h1080`) — кэш: LRU по своей отметке, удаляется со строкой публикации; сирота-отметка ступени убирается", async () => {
  const full = await master("p2", "med_a", 3000);
  const h = await master("p2", "med_a", 4000, 1080);
  await mkdir(cache, { recursive: true });
  // ступень использована недавно — удаляется полный master
  await markCacheUse(cache, masterUseKey("p2", "med_a", { num: 30, den: 1 }, 1080), "job_y");
  await ageMarks(masterUseKey("p2", "med_a", { num: 30, den: 1 }, 1080), new Date(NOW - 60 * 60_000));
  const r = await gcCache(root, env.db, { maxBytes: MiB, now: () => NOW });
  expect(r.removed).toEqual([`master:${full}`]);
  expect(existsSync(join(root, h, "master.mp4"))).toBe(true);
  const r2 = await gcCache(root, env.db, { maxBytes: 0, now: () => NOW });
  expect(r2.removed).toEqual([`master:${h}`]);
  expect(existsSync(join(root, h))).toBe(false);
  expect(env.db.prepare("SELECT 1 FROM artifact_publications WHERE dest_rel = ?").get(h)).toBeUndefined();

  // отметка ступени без публикации — сирота
  const orphan = masterUseKey("p2", "med_z", { num: 30, den: 1 }, 720);
  await markCacheUse(cache, orphan, "job_a");
  await utimes(cacheUseDir(cache, orphan), new Date(NOW - 3600_000), new Date(NOW - 3600_000));
  const kept = await master("p1", "med_k", 10, 720);
  const keptKey = masterUseKey("p1", "med_k", { num: 30, den: 1 }, 720);
  await markCacheUse(cache, keptKey, "job_b");
  await utimes(cacheUseDir(cache, keptKey), new Date(NOW - 3600_000), new Date(NOW - 3600_000));
  await gcCache(root, env.db, { maxBytes: 100 * MiB, now: () => Date.now() });
  expect(existsSync(cacheUseDir(cache, orphan))).toBe(false);
  expect(existsSync(cacheUseDir(cache, keptKey))).toBe(true);
  expect(existsSync(join(root, kept))).toBe(true);
});

it("Task 49b: ключ отметки master — суффикс ступени; без ступени — прежний", () => {
  expect(masterUseKey("p1", "med_1", { num: 30, den: 1 })).toBe("master-p1-med_1@30-1");
  expect(masterUseKey("p1", "med_1", { num: 30, den: 1 }, 1080)).toBe("master-p1-med_1@30-1-h1080");
});
