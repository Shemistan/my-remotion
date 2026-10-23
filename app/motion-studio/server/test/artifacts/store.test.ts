// Task 24: ArtifactStore — иммутабельные ревизии артефактов проекта с fencing (как SceneRepo.publish).
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "@ms/contracts";
import { createJobDraft } from "../../src/artifacts/job-draft.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore, ResourceBusyError } from "../../src/artifacts/store.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { claimNext, enqueue, requestCancel } from "../../src/jobs/queue.js";
import { makeStore, removeStore, unlockTree, type TestStore } from "../db/helpers.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
let job: Job;
const P = artifactPaths;

const published = (): { path: string; sha256: string }[] | undefined => {
  const v = db.prepare("SELECT value FROM meta WHERE key = 'pub'").pluck().get() as string | undefined;
  return v === undefined ? undefined : JSON.parse(v);
};
const reg = (d: Db, files: { path: string; sha256: string }[]) => {
  d.prepare("INSERT INTO meta (key, value) VALUES ('pub', ?)").run(JSON.stringify(files));
};

async function draftWith(attempt: number, files: Record<string, string> = { "transcript.json": '{"a":1}\n' }) {
  const d = await createJobDraft(s.root, { runId: job.id, attempt });
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(d.dir, name, ".."), { recursive: true });
    await writeFile(join(d.dir, name), text);
  }
  return d;
}

beforeEach(async () => {
  s = await makeStore("ms-artifacts-");
  db = openDb(s.root);
  migrate(db);
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  enqueue(db, { type: "asr.transcribe", projectId: "p1", input: {}, idempotencyKey: "t1" });
  job = claimNext(db, "srv", 0, { running: 0, maxRunning: 2 })!.job;
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("paths и draft задачи", () => {
  it("artifactPaths — каталоги проекта", () => {
    const p = P(s.root, "p1");
    expect(p.source("med_1")).toBe("workspace/projects/p1/source/med_1");
    expect(p.proxy("med_1")).toBe("workspace/projects/p1/proxy/med_1");
    expect(p.transcriptRev("trn_1", 2)).toBe("workspace/projects/p1/transcript/trn_1/r2");
    expect(p.edlRev("edl_1", 1)).toBe("workspace/projects/p1/edits/edl_1/r1");
    expect(p.footage("ftg_1")).toBe("workspace/projects/p1/analysis/footage/ftg_1");
    expect(p.semantic("sem_1")).toBe("workspace/projects/p1/analysis/semantic/sem_1");
    expect(p.styleRev("sty_1", 3)).toBe("workspace/projects/p1/style/sty_1/r3");
    expect(p.planRev("pln_1", 1)).toBe("workspace/projects/p1/plan/pln_1/r1");
    expect(p.abs(p.planRev("pln_1", 1))).toBe(join(s.root, "workspace/projects/p1/plan/pln_1/r1"));
    expect(() => P(s.root, "../x")).toThrow();
    expect(() => p.transcriptRev("trn_1", 0)).toThrow();
  });

  it("createJobDraft: workspace/drafts/<runId>-a<attempt>/, повтор — ошибка", async () => {
    const d = await createJobDraft(s.root, { runId: job.id, attempt: 1 });
    expect(d).toEqual({ dir: join(s.root, "workspace/drafts", `${job.id}-a1`), runId: job.id, attempt: 1 });
    expect(statSync(d.dir).isDirectory()).toBe(true);
    await expect(createJobDraft(s.root, { runId: job.id, attempt: 1 })).rejects.toThrow(/exists/);
    await expect(createJobDraft(s.root, { runId: "../x", attempt: 1 })).rejects.toThrow();
  });
});

describe("publish", () => {
  const dest = () => P(s.root, "p1").transcriptRev("trn_1", 1);

  it("fencing: устаревшая попытка — fenced_out и карантин; текущая публикует read-only", async () => {
    const d1 = await draftWith(1);
    const d2 = await draftWith(2);
    jobs.update(db, job.id, { attempt: 2 });
    await expect(store.publish(d1.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/fenced_out/);
    expect(existsSync(join(d1.dir, ".quarantined"))).toBe(true);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(published()).toBeUndefined();

    const pub = await store.publish(d2.dir, dest(), reg, { jobId: job.id, attempt: 2 });
    expect(pub.dir).toBe(join(s.root, dest()));
    expect(pub.files).toEqual([{ path: "transcript.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(published()).toEqual(pub.files);
    expect(existsSync(d2.dir)).toBe(false);
    await expect(writeFile(join(pub.dir, "transcript.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
    await expect(writeFile(join(pub.dir, "new.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
  });

  it("вложенные каталоги закрываются от записи целиком (chmod -R a-w)", async () => {
    const d = await draftWith(1, { "a.json": "1", "frames/f1.png": "x" });
    const pub = await store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 });
    expect(pub.files.map((f) => f.path)).toEqual(["a.json", "frames/f1.png"]);
    for (const p of [pub.dir, join(pub.dir, "frames"), join(pub.dir, "frames/f1.png"), join(pub.dir, "a.json")]) {
      expect(statSync(p).mode & 0o222, p).toBe(0);
    }
  });

  it("отмена запрошена — cancelled, карантин, ничего не опубликовано", async () => {
    const d = await draftWith(1);
    requestCancel(db, job.id);
    await expect(store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/cancelled/);
    expect(existsSync(join(d.dir, ".quarantined"))).toBe(true);
    expect(existsSync(join(s.root, dest()))).toBe(false);
  });

  it("сбой register — файлы возвращаются в draft (записываемый), БД откатывается", async () => {
    const d = await draftWith(1, { "transcript.json": "{}", "sub/x.txt": "x" });
    const bad = (dd: Db, files: { path: string; sha256: string }[]) => {
      reg(dd, files);
      throw new Error("register упал");
    };
    await expect(store.publish(d.dir, dest(), bad, { jobId: job.id, attempt: 1 })).rejects.toThrow(/register упал/);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(published()).toBeUndefined();
    expect(readFileSync(join(d.dir, "transcript.json"), "utf8")).toBe("{}");
    await writeFile(join(d.dir, "sub/x.txt"), "снова можно писать");
    expect(existsSync(join(d.dir, ".quarantined"))).toBe(false);
    // тот же draft публикуется после исправления
    const pub = await store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 });
    expect(pub.files.map((f) => f.path)).toEqual(["sub/x.txt", "transcript.json"]);
  });

  it("guard: хранилище недоступно — отказ до любых изменений, register не вызывается", async () => {
    const d = await draftWith(1);
    let called = 0;
    const offline = new ArtifactStore({ root: s.root, db, guard: async () => ({ ok: false, reason: "offline", detail: "том отключён" }) as never });
    await expect(offline.publish(d.dir, dest(), () => { called++; }, { jobId: job.id, attempt: 1 })).rejects.toThrow(/storage_unavailable/);
    expect(called).toBe(0);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(readFileSync(join(d.dir, "transcript.json"), "utf8")).toBe('{"a":1}\n');
    expect(existsSync(join(d.dir, ".quarantined"))).toBe(false);
  });

  it("guard падает между хешированием и коммитом — отказ, draft на месте", async () => {
    const d = await draftWith(1);
    let n = 0;
    const flaky = new ArtifactStore({ root: s.root, db, guard: async () => (++n === 1 ? s.guard() : ({ ok: false, reason: "offline", detail: "x" }) as never) });
    await expect(flaky.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/storage_unavailable/);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(existsSync(join(d.dir, "transcript.json"))).toBe(true);
  });

  it("повторная публикация в существующий destRel — artifact_exists, прежняя ревизия не тронута", async () => {
    const d1 = await draftWith(1);
    const pub = await store.publish(d1.dir, dest(), reg, { jobId: job.id, attempt: 1 });
    const before = readFileSync(join(pub.dir, "transcript.json"), "utf8");
    db.prepare("DELETE FROM meta WHERE key = 'pub'").run();
    jobs.update(db, job.id, { attempt: 2 });
    const d2 = await draftWith(2, { "transcript.json": "другое" });
    await expect(store.publish(d2.dir, dest(), reg, { jobId: job.id, attempt: 2 })).rejects.toThrow(/artifact_exists/);
    expect(readFileSync(join(pub.dir, "transcript.json"), "utf8")).toBe(before);
    expect(readFileSync(join(d2.dir, "transcript.json"), "utf8")).toBe("другое");
    expect(published()).toBeUndefined();
    // пустой каталог на месте назначения rename заменил бы молча — тоже отказ
    const empty = P(s.root, "p1").transcriptRev("trn_1", 2);
    await mkdir(join(s.root, empty), { recursive: true });
    await expect(store.publish(d2.dir, empty, reg, { jobId: job.id, attempt: 2 })).rejects.toThrow(/artifact_exists/);
  });

  it("draft чужой попытки, карантин, путь вне проекта — отказ", async () => {
    const d = await draftWith(1);
    await expect(store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 2 })).rejects.toThrow(/не принадлежит/);
    await expect(store.publish(d.dir, "workspace/drafts/x", reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/destRel/);
    await expect(store.publish(d.dir, "workspace/projects/p1/../../x", reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/destRel/);
    await writeFile(join(d.dir, ".quarantined"), "{}");
    await expect(store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/quarantined/);
  });

  it("симлинк в draft — отказ, draft не тронут", async () => {
    const d = await draftWith(1);
    const { symlink } = await import("node:fs/promises");
    await symlink("/etc/hosts", join(d.dir, "link"));
    await expect(store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/симлинк/);
    expect(existsSync(join(s.root, dest()))).toBe(false);
  });

  it("опубликованное удаляется после снятия read-only (уборка тестов, карантин человеком)", async () => {
    const d = await draftWith(1, { "a/b.json": "1" });
    const pub = await store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 });
    await unlockTree(pub.dir);
    await rm(pub.dir, { recursive: true });
    expect(existsSync(pub.dir)).toBe(false);
  });
});

describe("writeRevision (синхронные правки пользователя)", () => {
  const dest = () => P(s.root, "p1").edlRev("edl_1", 2);

  it("документ ревизии публикуется read-only через временный draft, draft убран", async () => {
    const out = await store.writeRevision(dest(), "edl.json", { b: 1, a: [2] }, reg);
    expect(JSON.parse(readFileSync(join(out.dir, "edl.json"), "utf8"))).toEqual({ b: 1, a: [2] });
    expect(out.files).toEqual([{ path: "edl.json", sha256: expect.any(String) }]);
    expect(statSync(join(out.dir, "edl.json")).mode & 0o222).toBe(0);
    expect((await readdir(join(s.root, "workspace/drafts"))).filter((n) => n.startsWith("sync-"))).toEqual([]);
  });

  it("ресурс занят задачей — resource_busy, ничего не записано", async () => {
    enqueue(db, { type: "roughcut.propose", projectId: "p1", input: {}, idempotencyKey: "rc" });
    claimNext(db, "srv", 0, { running: 0, maxRunning: 2 });
    const e = await store.writeRevision(dest(), "edl.json", {}, reg, { lockKey: "project:p1:edl" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ResourceBusyError);
    expect(e).toMatchObject({ code: "resource_busy", jobId: expect.any(String) });
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(published()).toBeUndefined();
    expect((await readdir(join(s.root, "workspace/drafts"))).filter((n) => n.startsWith("sync-"))).toEqual([]);
  });

  it("сбой register (409 revision_conflict у вызывающего) — временный draft удалён", async () => {
    await expect(store.writeRevision(dest(), "edl.json", {}, () => { throw new Error("revision_conflict"); })).rejects.toThrow(/revision_conflict/);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect((await readdir(join(s.root, "workspace/drafts"))).filter((n) => n.startsWith("sync-"))).toEqual([]);
  });
});
