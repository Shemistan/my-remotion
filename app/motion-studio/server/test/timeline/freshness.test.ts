// Task 42: свежесть ревизии таймлайна — лениво, по `inputs` текущей ревизии против текущих EDL,
// плана, стиля и Approval C (хуков в edl-ops/plan-ops нет).
import { afterEach, describe, expect, it } from "vitest";
import { savePlanRevision } from "../../src/analysis/plan-ops.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import { loadConfig } from "../../src/config.js";
import { saveEdlRevision } from "../../src/edit/edl-ops.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { timelineFreshness } from "../../src/timeline/freshness.js";
import { publishTimelineRevision } from "../../src/timeline/ops.js";
import { STYLE_BASE } from "../analysis/plan-db-helpers.js";
import { removeStore } from "../db/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, approveC, id, seedScene, seedTimelineProject } from "./helpers.js";

let env: TimelineEnv;
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});
const deps = () => ({ db: env.db, store: env.store, root: env.s.root });

async function published(o: { secondC?: boolean } = {}) {
  env = await seedTimelineProject("ms-v42-fresh-");
  const a = seedScene(env, ITEMS[0]!);
  const b = seedScene(env, ITEMS[1]!, { withC: o.secondC ?? true });
  await publishTimelineRevision(deps(), "p1", buildTimelineDoc(env.db, env.s.root, "p1"));
  return { a, b };
}

describe("timelineFreshness", () => {
  it("сразу после сборки — свежая; таймлайна нет — не свежая без причин", async () => {
    await published();
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: true, reasons: [] });
    expect(timelineFreshness(env.db, env.s.root, "p_none")).toEqual({ fresh: false, reasons: [] });
  });

  it("новая ревизия EDL → edl_changed", async () => {
    await published();
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "add_cut", start_word_id: id(6), end_word_id: id(8) }] });
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: false, reasons: ["edl_changed"] });
  });

  it("новая C у сцены → version_changed; C появилась у неутверждённой → version_changed; C отозвана → approval_stale", async () => {
    const { a } = await published({ secondC: false });
    const v2 = addVersion(env.db, a.sceneId, 87);
    expect(timelineFreshness(env.db, env.s.root, "p1").fresh).toBe(true);
    approveC(env.db, v2.id);
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: false, reasons: ["version_changed"] });
    approvalsRepo.revokeActive(env.db, "p1", "C", `scene:${a.sceneId}`);
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: false, reasons: ["approval_stale"] });
    approveC(env.db, a.version.id);
    expect(timelineFreshness(env.db, env.s.root, "p1").fresh).toBe(true);
    approveC(env.db, addVersion(env.db, "scn_002", 132).id);
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: false, reasons: ["version_changed"] });
  });

  it("новая ревизия плана → plan_changed; новый стиль → style_changed", async () => {
    await published();
    await savePlanRevision({ db: env.db, store: env.store, root: env.s.root, planning: loadConfig({ MS_DATA_DIR: env.s.root }).planning }, "pln_1", {
      base_revision: 1, ops: [{ op: "modify", item_id: "sp_002", patch: { purpose: "другая цель" } }],
    });
    await saveProjectStyle(deps(), "p1", { ...STYLE_BASE, intensity: "calm" }, "user", { base_revision: 1, recheck: false });
    expect(timelineFreshness(env.db, env.s.root, "p1")).toEqual({ fresh: false, reasons: ["plan_changed", "style_changed"] });
  });
});
