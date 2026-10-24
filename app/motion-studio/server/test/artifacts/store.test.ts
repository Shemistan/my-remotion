// Task 24: ArtifactStore — иммутабельные ревизии артефактов проекта с fencing (как SceneRepo.publish).
import { existsSync, readFileSync, statSync } from "node:fs";
import { chmod, lstat, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "@ms/contracts";
import type { ProcessRegistry } from "@ms/core";
import { SceneRepo } from "../../src/scenes/repo.js";
import { sweepAbandonedDrafts } from "../../src/scenes/store.js";
import { createJobDraft } from "../../src/artifacts/job-draft.js";
import { artifactPaths, checkArtifactDestRel } from "../../src/artifacts/paths.js";
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
  await migrate(db);
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
    expect(() => p.source("a.b")).toThrow();
  });

  // Повторное ревью Task 24, N1.1: destRel — только форма из artifactPaths.
  it("checkArtifactDestRel: принимает ровно пути artifactPaths, остальное — отказ", () => {
    const p = P(s.root, "prj_01ABC");
    for (const ok of [
      p.source("med_1"), p.proxy("med_1"), p.transcriptRev("trn_1", 1), p.edlRev("edl_1", 12), p.footage("ftg_1"),
      p.semantic("sem_1"), p.styleRev("sty_1", 3), p.planRev("pln_1", 1),
    ]) expect(() => checkArtifactDestRel(ok), ok).not.toThrow();
    for (const bad of [
      "workspace/projects/p1", "workspace/projects/p1/project.json", "workspace/projects/p1/scenes/scn_1",
      "workspace/projects/p1/transcript/trn_1", "workspace/projects/p1/transcript/trn_1/r0", "workspace/projects/p1/transcript/trn_1/r01",
      "workspace/projects/p1/transcript/trn_1/x", "workspace/projects/p1/transcript/trn_1/r1/sub", "workspace/projects/p1/source/med_1/r1",
      "workspace/projects/p1/source/a.b", "workspace/projects/p1/source/-x", "workspace/projects/p1/analysis/other/x",
      "workspace/projects/p1/analysis/footage", "workspace/projects/../source/x", "workspace/projects/p.1/source/x",
      "/workspace/projects/p1/source/x", "workspace/drafts/p1/source/x",
    ]) expect(() => checkArtifactDestRel(bad), bad).toThrow(/destRel/);
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
  });

  // Ревью Task 24, I2: rename прошёл, COMMIT нет (kill -9) — каталог-сирота без записи в реестре.
  it("сирота на месте назначения (не зарегистрирована) — в карантин с причиной, публикация проходит", async () => {
    const orphan = join(s.root, dest());
    await mkdir(join(orphan, "sub"), { recursive: true });
    await writeFile(join(orphan, "transcript.json"), "старое");
    await writeFile(join(orphan, "sub/x"), "x");
    await chmod(join(orphan, "sub/x"), 0o444);
    await chmod(join(orphan, "sub"), 0o555);
    await chmod(join(orphan, "transcript.json"), 0o444);
    await chmod(orphan, 0o555);
    const d = await draftWith(1, { "transcript.json": "новое" });
    const pub = await store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 });
    expect(readFileSync(join(pub.dir, "transcript.json"), "utf8")).toBe("новое");
    expect(published()).toEqual(pub.files);
    const qroot = join(s.root, "workspace/quarantine/artifacts");
    const moved = await readdir(qroot);
    expect(moved).toHaveLength(1);
    const q = join(qroot, moved[0]!);
    expect(readFileSync(join(q, "transcript.json"), "utf8")).toBe("старое");
    expect(readFileSync(join(q, "sub/x"), "utf8")).toBe("x");
    expect(JSON.parse(readFileSync(join(q, ".quarantined"), "utf8"))).toMatchObject({ reason: expect.stringMatching(/^orphan_artifact/), dest_rel: dest() });
    // опубликованная (зарегистрированная) ревизия — по-прежнему artifact_exists
    jobs.update(db, job.id, { attempt: 2 });
    const d2 = await draftWith(2);
    await expect(store.publish(d2.dir, dest(), reg, { jobId: job.id, attempt: 2 })).rejects.toThrow(/artifact_exists/);
    expect(await readdir(qroot)).toHaveLength(1);
  });

  // Повторное ревью Task 24, N1: в карантин уходит только сирота формы artifactPaths.
  describe("карантин только по форме пути", () => {
    const mode = async (p: string) => (await lstat(p)).mode;
    const noQuarantine = () => expect(existsSync(join(s.root, "workspace/quarantine/artifacts"))).toBe(false);

    it("родитель зарегистрированной ревизии (transcript/<id>) — отказ по форме, ревизия на месте и read-only", async () => {
      const pub = await store.publish((await draftWith(1)).dir, dest(), reg, { jobId: job.id, attempt: 1 });
      const parentRel = `${P(s.root, "p1").project}/transcript/trn_1`;
      const before = await mode(pub.dir);
      jobs.update(db, job.id, { attempt: 2 });
      const d = await draftWith(2);
      await expect(store.publish(d.dir, parentRel, reg, { jobId: job.id, attempt: 2 })).rejects.toThrow(/destRel не годится/);
      expect(readFileSync(join(pub.dir, "transcript.json"), "utf8")).toBe('{"a":1}\n');
      expect(await mode(pub.dir)).toBe(before);
      expect(statSync(join(pub.dir, "transcript.json")).mode & 0o222).toBe(0);
      expect(existsSync(join(d.dir, "transcript.json"))).toBe(true);
      noQuarantine();
    });

    it("сцена Phase 1 (scenes/scn_1) и project.json — отказ, ничего не перемещено, права не сняты", async () => {
      const proj = join(s.root, P(s.root, "p1").project);
      const scene = join(proj, "scenes/scn_1");
      await mkdir(join(scene, "versions"), { recursive: true });
      await writeFile(join(scene, "versions/v1.tsx"), "сцена");
      await chmod(join(scene, "versions/v1.tsx"), 0o444);
      await chmod(join(scene, "versions"), 0o555);
      await writeFile(join(proj, "project.json"), "{}");
      await chmod(join(proj, "project.json"), 0o444);
      const d = await draftWith(1);
      for (const rel of ["scenes/scn_1", "project.json"]) {
        await expect(store.publish(d.dir, `${P(s.root, "p1").project}/${rel}`, reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/destRel не годится/);
      }
      expect(readFileSync(join(scene, "versions/v1.tsx"), "utf8")).toBe("сцена");
      expect(statSync(join(scene, "versions")).mode & 0o777).toBe(0o555);
      expect(statSync(join(scene, "versions/v1.tsx")).mode & 0o777).toBe(0o444);
      expect(statSync(join(proj, "project.json")).mode & 0o777).toBe(0o444);
      expect(existsSync(join(d.dir, ".quarantined"))).toBe(false);
      expect(published()).toBeUndefined();
      noQuarantine();
      await chmod(join(scene, "versions"), 0o755);
    });

    it("зарегистрирован потомок или предок destRel — отказ до карантина", async () => {
      const p = P(s.root, "p1");
      const row = db.prepare("INSERT INTO artifact_publications (dest_rel, published_at) VALUES (?, 'x')");
      // потомок: source/med_1/… зарегистрирован, сам source/med_1 — нет
      row.run(`${p.source("med_1")}/sub`);
      const src = join(s.root, p.source("med_1"));
      await mkdir(join(src, "sub"), { recursive: true });
      await writeFile(join(src, "sub/f"), "f");
      await chmod(join(src, "sub"), 0o555);
      const d = await draftWith(1);
      await expect(store.publish(d.dir, p.source("med_1"), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/зарегистрирован.*med_1\/sub/s);
      expect(statSync(join(src, "sub")).mode & 0o777).toBe(0o555);
      expect(readFileSync(join(src, "sub/f"), "utf8")).toBe("f");
      // предок: edits/edl_1 зарегистрирован целиком
      row.run(`${p.project}/edits/edl_1`);
      await expect(store.publish(d.dir, p.edlRev("edl_1", 1), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/зарегистрирован.*edits\/edl_1/s);
      expect(existsSync(join(s.root, p.edlRev("edl_1", 1)))).toBe(false);
      expect(existsSync(join(d.dir, "transcript.json"))).toBe(true);
      expect(published()).toBeUndefined();
      noQuarantine();
      await chmod(join(src, "sub"), 0o755);
    });

    it("LIKE экранирован: _ в id не делает чужой путь потомком", async () => {
      const p = P(s.root, "p1");
      db.prepare("INSERT INTO artifact_publications (dest_rel, published_at) VALUES (?, 'x')").run(`${p.project}/source/medX1/sub`);
      const pub = await store.publish((await draftWith(1)).dir, p.source("med_1"), reg, { jobId: job.id, attempt: 1 });
      expect(existsSync(pub.dir)).toBe(true);
    });

    it("на месте назначения файл или симлинк — ошибка, ничего не тронуто", async () => {
      const p = P(s.root, "p1");
      const file = join(s.root, p.source("med_1"));
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, "файл");
      await chmod(file, 0o444);
      const outside = join(s.tmp, "outside-dir");
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, "x"), "x");
      await chmod(join(outside, "x"), 0o444);
      await chmod(outside, 0o555);
      await mkdir(join(s.root, p.project, "proxy"), { recursive: true });
      const link = join(s.root, p.proxy("med_1"));
      await symlink(outside, link);
      const d = await draftWith(1);
      await expect(store.publish(d.dir, p.source("med_1"), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/не каталог/);
      await expect(store.publish(d.dir, p.proxy("med_1"), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/не каталог/);
      expect(readFileSync(file, "utf8")).toBe("файл");
      expect(statSync(file).mode & 0o777).toBe(0o444);
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(statSync(outside).mode & 0o777).toBe(0o555);
      expect(statSync(join(outside, "x")).mode & 0o777).toBe(0o444);
      expect(existsSync(join(d.dir, "transcript.json"))).toBe(true);
      expect(statSync(join(d.dir, "transcript.json")).mode & 0o222).not.toBe(0);
      expect(published()).toBeUndefined();
      noQuarantine();
      await chmod(outside, 0o755);
    });
  });

  it("пустой незарегистрированный каталог на месте назначения — тоже сирота, не молчаливая замена", async () => {
    const empty = P(s.root, "p1").transcriptRev("trn_1", 2);
    await mkdir(join(s.root, empty), { recursive: true });
    const d = await draftWith(1);
    await store.publish(d.dir, empty, reg, { jobId: job.id, attempt: 1 });
    expect(await readdir(join(s.root, "workspace/quarantine/artifacts"))).toHaveLength(1);
  });

  // Ревью M1: draft — настоящий каталог внутри workspace/drafts, не симлинк наружу.
  it("draft-симлинк наружу — отказ, файлы снаружи не закрываются от записи", async () => {
    const outside = join(s.tmp, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "f.txt"), "чужое");
    await mkdir(join(s.root, "workspace/drafts"), { recursive: true });
    const link = join(s.root, "workspace/drafts", `${job.id}-a1`);
    await symlink(outside, link);
    await expect(store.publish(link, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/draft/);
    expect(statSync(join(outside, "f.txt")).mode & 0o222).not.toBe(0);
    expect(statSync(outside).mode & 0o222).not.toBe(0);
    expect(existsSync(join(outside, ".quarantined"))).toBe(false);
    // и при отказе fencing маркер карантина не пишется по ссылке наружу
    jobs.update(db, job.id, { attempt: 2 });
    await expect(store.publish(link, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/draft/);
    expect(existsSync(join(outside, ".quarantined"))).toBe(false);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect(published()).toBeUndefined();
  });

  // Ревью M2: fencing — через fenceOk (status = 'running'), не только номер попытки.
  it("задача не running (pending с тем же attempt) — fenced_out", async () => {
    const d = await draftWith(1);
    db.prepare("UPDATE jobs SET status = 'pending', lease_owner = NULL, lease_until = NULL WHERE id = ?").run(job.id);
    await expect(store.publish(d.dir, dest(), reg, { jobId: job.id, attempt: 1 })).rejects.toThrow(/fenced_out/);
    expect(existsSync(join(d.dir, ".quarantined"))).toBe(true);
    expect(existsSync(join(s.root, dest()))).toBe(false);
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

  // Ревью M4: брошенный sync-draft (сервер умер посреди правки) убирает восстановление при старте.
  it("брошенный drafts/sync-<id> — карантин abandoned на старте и удаление уборкой", async () => {
    const dir = join(s.root, "workspace/drafts", "sync-syn_01ABANDONED");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "edl.json"), "{}");
    const none = { live: async () => [] } as unknown as ProcessRegistry;
    const swept = await sweepAbandonedDrafts(s.root, none);
    expect(swept.quarantined).toContain(dir);
    const repo = new SceneRepo({ root: s.root, db, guard: s.guard, registry: none });
    expect((await repo.cleanupDrafts([])).removed).toContain(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("сбой register (409 revision_conflict у вызывающего) — временный draft удалён", async () => {
    await expect(store.writeRevision(dest(), "edl.json", {}, () => { throw new Error("revision_conflict"); })).rejects.toThrow(/revision_conflict/);
    expect(existsSync(join(s.root, dest()))).toBe(false);
    expect((await readdir(join(s.root, "workspace/drafts"))).filter((n) => n.startsWith("sync-"))).toEqual([]);
  });
});
