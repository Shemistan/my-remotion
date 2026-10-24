// Task 24: замки ресурсов видеопроекта (`project:<id>:<ресурс>`) в транзакции claimNext.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job, JobType } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { lockKeyFor, resourceBusy, sceneLockFor } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish, type EnqueueRequest } from "../../src/jobs/queue.js";
import { edit, idle, job as p1job, setupDb, teardownDb, type JobsEnv } from "./helpers.js";

const APP = fileURLToPath(new URL("../../../", import.meta.url));
const src = (rel: string) => JSON.stringify(pathToFileURL(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url))).href);

let env: JobsEnv;
beforeEach(async () => {
  env = await setupDb("ms-jobs-reslocks-");
  projects.create(env.db, { id: "p1", kind: "video", title: "Видео 1" });
  projects.create(env.db, { id: "p2", kind: "video", title: "Видео 2" });
});
afterEach(async () => { await teardownDb(env); });

const video = (type: JobType, projectId: string, key: string): EnqueueRequest => ({ type, projectId, input: { key }, idempotencyKey: key });
const rc = (p: string, k: string) => video("roughcut.propose", p, k);
const preview = (p: string, k: string) => video("roughcut.preview", p, k);
const asJob = (over: Partial<Job>): Job => ({ ...jobs.get(env.db, enqueue(env.db, video("media.import", "p1", "tmpl")).job.id)!, ...over });

describe("lockKeyFor", () => {
  it("типы Phase 2–3 → project:<p>:<ресурс>; превью без замка", () => {
    const k = (type: JobType) => lockKeyFor(asJob({ type, project_id: "p1" }));
    expect(k("media.import")).toBe("project:p1:media");
    expect(k("asr.transcribe")).toBe("project:p1:transcript");
    expect(k("roughcut.propose")).toBe("project:p1:edl");
    expect(k("footage.analyze")).toBe("project:p1:footage");
    expect(k("semantic.analyze")).toBe("project:p1:semantic");
    expect(k("plan.visual")).toBe("project:p1:plan");
    expect(k("plan.recheck")).toBe("project:p1:plan");
    expect(k("roughcut.preview")).toBeUndefined();
  });

  it("регрессия Phase 1: замок сцены — scene_locks, ключа ресурса нет", () => {
    const j = asJob({ type: "playground.edit", project_id: "playground", scene_id: "scn_1" });
    expect(sceneLockFor(j)).toBe("scn_1");
    expect(lockKeyFor(j)).toBeUndefined();
    expect(sceneLockFor(asJob({ type: "scene.export", project_id: "playground", scene_id: "scn_1" }))).toBeUndefined();
  });
});

describe("claimNext с замками ресурсов", () => {
  it("второй roughcut проекта ждёт project:p1:edl; превью идёт без замка", () => {
    const { db } = env;
    enqueue(db, rc("p1", "k1")); enqueue(db, rc("p1", "k2")); enqueue(db, preview("p1", "k3"));
    const busy = { running: 0, maxRunning: 5 };
    const first = claimNext(db, "srv", 0, busy)!;
    expect(first.job.idempotency_key).toBe("k1");
    expect(claimNext(db, "srv", 0, busy)!.job.type).toBe("roughcut.preview"); // без замка
    expect(claimNext(db, "srv", 0, busy)).toBeUndefined(); // k2 ждёт project:p1:edl
    expect(resourceBusy(db, "project:p1:edl")).toEqual({ jobId: first.job.id });
    expect(finish(db, first.job.id, 1, { status: "completed", outputRefs: {} })).toBe(true);
    expect(resourceBusy(db, "project:p1:edl")).toBeUndefined();
    expect(claimNext(db, "srv", 0, busy)!.job.idempotency_key).toBe("k2");
  });

  it("разные проекты и разные ресурсы одного проекта не мешают друг другу", () => {
    const { db } = env;
    enqueue(db, rc("p1", "a")); enqueue(db, rc("p2", "b")); enqueue(db, video("footage.analyze", "p1", "c"));
    const busy = { running: 0, maxRunning: 5 };
    expect([claimNext(db, "srv", 0, busy), claimNext(db, "srv", 0, busy), claimNext(db, "srv", 0, busy)].map((c) => c?.job.idempotency_key)).toEqual(["a", "b", "c"]);
  });

  it("регрессия Phase 1: правки сцены по-прежнему сериализуются scene_locks и не пишут resource_locks", () => {
    const { db } = env;
    enqueue(db, edit("scn_1", "e1")); enqueue(db, edit("scn_1", "e2")); enqueue(db, rc("p1", "v1")); enqueue(db, p1job("scene.export", "scn_1", "x1"));
    const busy = { running: 0, maxRunning: 5 };
    const got = [claimNext(db, "srv", 0, busy), claimNext(db, "srv", 0, busy), claimNext(db, "srv", 0, busy), claimNext(db, "srv", 0, busy)].map((c) => c?.job.idempotency_key);
    expect(got).toEqual(["e1", "v1", "x1", undefined]); // e2 ждёт замок сцены
    expect(db.prepare("SELECT scene_id FROM scene_locks").pluck().all()).toEqual(["scn_1"]);
    expect(db.prepare("SELECT resource FROM resource_locks").pluck().all()).toEqual(["project:p1:edl"]);
    expect(claimNext(db, "srv", 0, idle)).toBeUndefined(); // слотов idle (2) нет — всё как в Phase 1
  });

  it("blocked держит замок ресурса; failed снимает", () => {
    const { db } = env;
    const a = enqueue(db, rc("p1", "a")).job;
    const b = enqueue(db, video("asr.transcribe", "p1", "b")).job;
    const busy = { running: 0, maxRunning: 5 };
    claimNext(db, "srv", 0, busy); claimNext(db, "srv", 0, busy);
    finish(db, a.id, 1, { status: "blocked", error: { code: "stale_process", message: "живой" } });
    finish(db, b.id, 1, { status: "failed", error: { code: "pipeline", message: "x" } });
    expect(resourceBusy(db, "project:p1:edl")).toEqual({ jobId: a.id });
    expect(resourceBusy(db, "project:p1:transcript")).toBeUndefined();
  });

  it("гонка: параллельные claimNext из нескольких процессов не выдают два замка одного ресурса", async () => {
    const { db } = env;
    for (let i = 0; i < 6; i++) { enqueue(db, rc("p1", `p1-${i}`)); enqueue(db, rc("p2", `p2-${i}`)); enqueue(db, preview("p1", `pv-${i}`)); }
    const script = join(env.s.tmp, "claimer.mts");
    writeFileSync(script, `import { openDb } from ${src("db/open.ts")};
import { claimNext } from ${src("jobs/queue.ts")};
const [root, owner, startAt] = process.argv.slice(2);
const db = openDb(root);
while (Date.now() < Number(startAt)) { /* общий старт */ }
const got = [];
for (let i = 0; i < 40; i++) {
  const c = claimNext(db, owner, Date.now(), { running: 0, maxRunning: 1000 });
  if (c) got.push(c.job.idempotency_key);
}
db.close();
process.stdout.write(JSON.stringify(got));
`);
    const startAt = Date.now() + 2500;
    const run = (owner: string) => new Promise<string[]>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", script, env.s.root, owner, String(startAt)], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(out) as string[]) : reject(new Error(`claimer ${owner}: ${code} ${err}`))));
    });
    const all = (await Promise.all(["w1", "w2", "w3", "w4"].map(run))).flat();
    expect(all.filter((k) => k.startsWith("p1-"))).toHaveLength(1);
    expect(all.filter((k) => k.startsWith("p2-"))).toHaveLength(1);
    expect(all.filter((k) => k.startsWith("pv-")).sort()).toEqual([0, 1, 2, 3, 4, 5].map((i) => `pv-${i}`));
    expect(new Set(all).size).toBe(all.length); // никакая задача не захвачена дважды
    const locks = db.prepare("SELECT resource, job_id FROM resource_locks ORDER BY resource").all() as { resource: string; job_id: string }[];
    expect(locks.map((l) => l.resource)).toEqual(["project:p1:edl", "project:p2:edl"]);
    for (const l of locks) expect(jobs.get(db, l.job_id)!.status).toBe("running");
    expect(jobs.list(db, { status: "running" })).toHaveLength(8);
  }, 30_000);
});
