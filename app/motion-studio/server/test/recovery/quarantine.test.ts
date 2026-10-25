// Карантин черновиков (Task 47): список из `workspace/drafts` и `workspace/quarantine/artifacts`
// с причиной, попыткой, размером и временем; удаление — только явно, с токеном подтверждения и
// без живых процессов попытки.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProcessRegistry } from "@ms/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { discardIntent, discardQuarantined, listQuarantined } from "../../src/recovery/quarantine.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-quarantine-");
  db = openDb(s.root);
  await migrate(db);
});
afterEach(async () => {
  vi.useRealTimers();
  db.close();
  await removeStore(s);
});

function draft(rel: string, reason: string | null, extra: Record<string, unknown> = {}): string {
  const dir = join(s.root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "props.json"), "x".repeat(50));
  if (reason !== null) writeFileSync(join(dir, ".quarantined"), JSON.stringify({ reason, at: "2026-10-25T10:00:00.000Z", ...extra }));
  return dir;
}

const noProcs: ProcessRegistry = { live: async () => [], end: async () => undefined } as unknown as ProcessRegistry;

it("список: черновики попыток и сироты артефактов; без маркера — не в списке", () => {
  db.prepare("INSERT INTO scenes (id, project_id, title, created_at) VALUES ('scn_1', 'playground', 'x', '2026-10-25T10:00:00.000Z')").run();
  jobs.insert(db, { id: "job_b", type: "playground.generate", project_id: "playground", scene_id: "scn_1", input: {}, status: "failed" });
  draft("workspace/drafts/job_a-a1", "export: сбой экспорта");
  draft("workspace/drafts/job_b-a3--k1", "stale_process: render");
  draft("workspace/drafts/job_c-a1", null);
  draft("workspace/quarantine/artifacts/qrn_1", "orphan_artifact: каталог без записи", { dest_rel: "workspace/projects/p/source/m" });
  const list = listQuarantined(s.root, db);
  expect(list.map((e) => e.dir)).toEqual(["workspace/drafts/job_a-a1", "workspace/drafts/job_b-a3--k1", "workspace/quarantine/artifacts/qrn_1"]);
  expect(list[1]).toMatchObject({ job_id: "job_b", attempt: 3, reason: "stale_process: render", at: "2026-10-25T10:00:00.000Z" });
  expect(list[2]).toMatchObject({ job_id: null, attempt: null });
  expect(list[0]).toMatchObject({ job_id: null, attempt: 1 }); // задачи нет в базе — журнал не открыть
  expect(list[0]!.bytes).toBe(50 + Buffer.byteLength(JSON.stringify({ reason: "export: сбой экспорта", at: "2026-10-25T10:00:00.000Z" })));
});

it("удаление: нужен токен этого каталога; read-only содержимое удаляется; повтор — quarantine_not_found", async () => {
  const dir = draft("workspace/drafts/job_a-a1", "export: сбой");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.tsx"), "x");
  chmodSync(join(dir, "src/a.tsx"), 0o444);
  chmodSync(join(dir, "src"), 0o555);
  draft("workspace/drafts/job_b-a1", "export: другое");
  const core = { root: s.root, db, processes: noProcs };
  const other = discardIntent(s.root, db, "workspace/drafts/job_b-a1");
  await expect(discardQuarantined(core, "workspace/drafts/job_a-a1", other.token)).rejects.toThrow(/intent_expired/);
  const tok = discardIntent(s.root, db, "workspace/drafts/job_a-a1");
  expect(tok.bytes).toBeGreaterThan(0);
  await discardQuarantined(core, "workspace/drafts/job_a-a1", tok.token);
  expect(existsSync(dir)).toBe(false);
  expect(existsSync(join(s.root, "workspace/drafts/job_b-a1"))).toBe(true);
  await expect(discardQuarantined(core, "workspace/drafts/job_a-a1", tok.token)).rejects.toThrow(/quarantine_not_found/);
  // путь не из списка (выход за корень, произвольный каталог) — не трогается
  expect(() => discardIntent(s.root, db, "../outside")).toThrow(/quarantine_not_found/);
  expect(() => discardIntent(s.root, db, "workspace/projects")).toThrow(/quarantine_not_found/);
});

it("живые процессы попытки — process_alive, каталог на месте", async () => {
  const dir = draft("workspace/drafts/job_live-a1", "stale_process: render");
  const registry = noProcs;
  const tok = discardIntent(s.root, db, "workspace/drafts/job_live-a1");
  await expect(discardQuarantined({ root: s.root, db, processes: registry }, "workspace/drafts/job_live-a1", tok.token, { alive: async () => true })).rejects.toThrow(/process_alive/);
  expect(existsSync(dir)).toBe(true);
});

it("токен устаревает через 10 минут и при смене содержимого", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const dir = draft("workspace/drafts/job_a-a1", "export: сбой");
  const core = { root: s.root, db, processes: noProcs };
  const t1 = discardIntent(s.root, db, "workspace/drafts/job_a-a1");
  writeFileSync(join(dir, "more.txt"), "новое");
  await expect(discardQuarantined(core, "workspace/drafts/job_a-a1", t1.token)).rejects.toThrow(/intent_expired/);
  const t2 = discardIntent(s.root, db, "workspace/drafts/job_a-a1");
  vi.setSystemTime(Date.now() + 11 * 60_000);
  await expect(discardQuarantined(core, "workspace/drafts/job_a-a1", t2.token)).rejects.toThrow(/intent_expired/);
  expect(existsSync(dir)).toBe(true);
});
