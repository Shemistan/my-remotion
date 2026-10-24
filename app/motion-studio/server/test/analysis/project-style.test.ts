// Task 32: StyleBible проекта — `resolveStyle` пресета Phase 1 + правки; контраст по правилам
// Phase 1 (text ≥ 4.5, muted ≥ 3 к фону — blocking), ниже AAA (7 / 4.5) — warning; ревизии
// `style/<id>/r<N>`; новая ревизия при валидном B → B stale(style_changed) (`cascadeStale`).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectStyleDocSchema, StyleBibleSchema } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { approvalState, approve } from "../../src/approvals/engine.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { projectStyleFrom, saveProjectStyle } from "../../src/analysis/project-style.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as projects from "../../src/db/repos/projects.js";
import * as styles from "../../src/db/repos/styles.js";
import { EditError } from "../../src/edit/errors.js";
import { ResourceBusyError } from "../../src/artifacts/store.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const base = { preset: "dark-premium" as const, intensity: "balanced" as const, depth: 1 };

describe("projectStyleFrom", () => {
  it("пресет без правок: resolved — StyleBible, проблем нет", () => {
    const r = projectStyleFrom(base);
    expect(StyleBibleSchema.safeParse(r.resolved).success).toBe(true);
    expect(r.resolved.motion.intensity).toBe("balanced");
    expect(r.issues).toEqual([]);
  });
  it("тёмный текст на тёмном фоне — blocking style_contrast", () => {
    const r = projectStyleFrom({ ...base, palette_overrides: { text: "#333333" } });
    expect(r.issues[0]).toMatchObject({ code: "style_contrast", severity: "blocking" });
  });
  it("muted ниже 3 — blocking; между AA и AAA — warning style_contrast_low", () => {
    expect(projectStyleFrom({ ...base, palette_overrides: { muted: "#30343c" } }).issues).toContainEqual(expect.objectContaining({ code: "style_contrast", severity: "blocking" }));
    const low = projectStyleFrom({ ...base, palette_overrides: { text: "#8a8a8a" } }).issues; // ≈ 5.9 к #07080d
    expect(low).toEqual([expect.objectContaining({ code: "style_contrast_low", severity: "warning" })]);
  });
  it("шрифт не из kit или не hex-цвет — blocking style_invalid, resolved — пресет", () => {
    expect(projectStyleFrom({ ...base, font: "Comic Sans" }).issues[0]).toMatchObject({ code: "style_invalid", severity: "blocking" });
    expect(projectStyleFrom({ ...base, palette_overrides: { text: "white" } }).issues[0]).toMatchObject({ code: "style_invalid" });
  });
});

let s: TestStore;
let db: Db;
let store: ArtifactStore;
beforeAll(async () => {
  s = await makeStore("ms-style-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

describe("saveProjectStyle", () => {
  const deps = () => ({ db, store, root: s.root });
  it("первая ревизия r1 в style/<id>/r1; повтор того же — no_change; правка — r2 с author", async () => {
    const d1 = await saveProjectStyle(deps(), "p1", base, "agent", { rationale: "деловая тема" });
    expect(d1).toMatchObject({ revision: 1, author: "agent", rationale: "деловая тема", base });
    const row = styles.byProject(db, "p1")!;
    expect(row.current_revision).toBe(1);
    const rev = styles.revision(db, row.id, 1)!;
    expect(rev.rel_path).toBe(`workspace/projects/p1/style/${row.id}/r1/style.json`);
    expect(ProjectStyleDocSchema.parse(JSON.parse(readFileSync(join(s.root, rev.rel_path), "utf8")))).toEqual(d1);
    expect(rev.hash).toBe(canonicalHash(d1));
    await expect(saveProjectStyle(deps(), "p1", base, "agent")).rejects.toThrow(EditError);
    const d2 = await saveProjectStyle(deps(), "p1", { ...base, intensity: "calm" }, "user", { base_revision: 1 });
    expect(d2).toMatchObject({ revision: 2, author: "user", style_id: row.id });
    await expect(saveProjectStyle(deps(), "p1", { ...base, depth: 2 }, "user", { base_revision: 1 })).rejects.toThrow(/revision_conflict/);
  });

  it("валидный B → новая ревизия стиля делает его stale(style_changed)", async () => {
    const b = approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_x@r1", subjectHash: canonicalHash({ x: 1 }) });
    expect(b.status).toBe("valid");
    await saveProjectStyle(deps(), "p1", { ...base, depth: 3 }, "user");
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_x@r1", hash: canonicalHash({ x: 1 }) })).toMatchObject({ state: "stale", reason: "style_changed" });
  });

  it("задача держит замок плана — resource_busy", async () => {
    const j = enqueue(db, { type: "plan.visual", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "pv" }).job;
    expect(claimNext(db, "srv", 0, { running: 0, maxRunning: 2 })!.job.id).toBe(j.id);
    try {
      await expect(saveProjectStyle(deps(), "p1", { ...base, depth: 0 }, "user")).rejects.toThrow(ResourceBusyError);
    } finally {
      releaseLocks(db, j);
      expect(jobs.get(db, j.id)).toBeTruthy();
    }
  });
});
