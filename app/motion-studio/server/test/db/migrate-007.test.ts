// S20: миграция 007_process_owner — владелец записи процесса и отметка foreign_owner.
// Строки v6 сохраняются как есть, owner_* у них пусты (разбор — только проверка родителя).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobProcesses from "../../src/db/repos/job-processes.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");
const FILES = ["001_phase1.sql", "002_resource_locks.sql", "003_video.sql", "004_phase1_kind.sql", "005_script.sql", "006_video_production.sql"];

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate7-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("v6 → v7: живые и завершённые строки job_processes на месте, owner_* и foreign_owner пусты", async () => {
  db.pragma("foreign_keys = OFF");
  FILES.forEach((f, i) => {
    db.exec(sql(f));
    db.pragma(`user_version = ${i + 1}`);
  });
  db.pragma("foreign_keys = ON");
  db.prepare("INSERT INTO job_processes (job_id, attempt, pid, pgid, started_at, cmd) VALUES ('job_1', 1, 100, 100, 'x', 'sleep')").run();
  db.prepare("INSERT INTO job_processes (job_id, attempt, pid, pgid, started_at, cmd, ended_at, exit_code) VALUES ('job_1', 1, 101, 101, 'x', 'sleep', 't', 0)").run();

  expect(await migrate(db, { log: () => undefined })).toMatchObject({ from: 6, to: 7 });
  expect(jobProcesses.listLive(db)).toEqual([
    { job_id: "job_1", attempt: 1, pid: 100, pgid: 100, started_at: "x", cmd: "sleep", ended_at: null, exit_code: null, owner_pid: null, owner_started_at: null, owner_nonce: null, foreign_owner: null },
  ]);
  expect(db.prepare("SELECT count(*) FROM job_processes").pluck().get()).toBe(2);
});
