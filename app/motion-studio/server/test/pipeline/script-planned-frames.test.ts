// Ревью S16a M3: длительность сцены сценария при правке — по текущей ревизии плана, а не по ревизии,
// с которой сцену генерировали (после «скорости чтения» правка не должна закреплять старые кадры).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ScriptPlanRevisionDoc, type ScriptSceneContext } from "@ms/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import { scriptPlans } from "../../src/db/repos/script.js";
import { scriptPlannedFrames } from "../../src/pipeline/playground-edit.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { PLAN } from "../script/plan-ops-fixtures.js";

let s: TestStore;
let db: Db;
beforeAll(async () => {
  s = await makeStore("ms-planned-frames-");
  db = openDb(s.root);
  await migrate(db);
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

function publish(doc: ScriptPlanRevisionDoc): void {
  const rel = `${artifactPaths(s.root, "playground").planRev(doc.plan_id, doc.revision)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(s.root, rel)), { recursive: true });
  writeFileSync(join(s.root, rel), JSON.stringify(doc));
  scriptPlans.insertRevision(db, { doc, rel_path: rel, sha256: "a".repeat(64) });
}

const withTotal = (rev: number, total: number, items = PLAN.items): ScriptPlanRevisionDoc => ({
  ...PLAN, plan_id: "pln_m3", revision: rev, ...(rev > 1 ? { parent_revision: rev - 1 } : {}),
  items: items.map((x) => (x.id === "ss_001" ? { ...x, frames: { lead: 15, speech: total - 45, tail: 30, total } } : x)),
});

describe("scriptPlannedFrames", () => {
  it("план с тем же plan_id ушёл вперёд — кадры из текущей ревизии; сцены там нет — из ревизии генерации", () => {
    scriptPlans.create(db, { id: "pln_m3", project_id: "playground" });
    publish(withTotal(1, 180));
    const ctx: ScriptSceneContext = { project_id: "playground", plan_id: "pln_m3", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style: { preset: "dark-premium", intensity: "balanced", depth: 2 }, lead_frames: 15, tail_frames: 30 };
    expect(scriptPlannedFrames(db, s.root, ctx)).toBe(180);
    publish(withTotal(2, 210));
    expect(scriptPlannedFrames(db, s.root, ctx)).toBe(210);
    publish(withTotal(3, 240, PLAN.items.filter((x) => x.id !== "ss_001")));
    expect(scriptPlannedFrames(db, s.root, ctx)).toBe(180);
  });
});
