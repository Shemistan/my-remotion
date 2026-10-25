// Task 42: сборка ревизии таймлайна из EDL, текущего плана и утверждённых версий (`buildTimelineDoc`)
// и задача `timeline.build` (без LLM): публикация `timeline/<id>/r<N>/timeline.json` с fencing,
// перенос сдвигов пользователя на новую ревизию, `no_change` без изменений входов.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VideoTimelineDocSchema } from "@ms/contracts";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { currentPlan } from "../../src/analysis/plan-ops.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import * as approvalsRepo from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { videoTimelines } from "../../src/db/repos/video.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { saveEdlRevision } from "../../src/edit/edl-ops.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { planRecheck } from "../../src/pipeline/plan-recheck.js";
import { timelineBuild } from "../../src/pipeline/timeline-build.js";
import { buildTimelineDoc, timelineIdFor } from "../../src/timeline/build.js";
import { saveTimelineRevision } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, id, seedScene, seedTimelineProject } from "./helpers.js";

let env: TimelineEnv;
let runner: JobRunner | undefined;
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const clipsOf = (d: { scenes: { item_id: string; start_frame: number; duration_frames: number }[] }) => d.scenes.map((c) => [c.item_id, c.start_frame, c.duration_frames]);

describe("buildTimelineDoc", () => {
  it("две сцены с C → клипы на кадрах плана, длина — план, якоря — ключевые слова в кадрах таймлайна", async () => {
    env = await seedTimelineProject("ms-v42-build-");
    seedScene(env, ITEMS[0]!);
    seedScene(env, ITEMS[1]!);
    const d = buildTimelineDoc(env.db, env.s.root, "p1");
    expect(clipsOf(d)).toEqual([["sp_001", 300, 87], ["sp_002", 600, 132]]);
    expect(d.scenes[0]!.anchors).toEqual([{ word_id: id(24), text: "слово24", frame: 351 }]);
    expect(d.scenes.map((c) => c.include)).toEqual(["approved", "approved"]);
    expect(d).toMatchObject({ timeline_id: timelineIdFor("p1"), revision: 1, duration_frames: 900, excluded: [], issues: [] });
    expect(d.inputs.edl).toMatchObject({ id: "edl_1", revision: 1 });
    expect(d.inputs.plan).toMatchObject({ id: "pln_1", revision: 1 });
    expect(d.video).toEqual([{ idx: 0, from: 0, durationInFrames: 900, startFrom: 0 }]);
    expect(VideoTimelineDocSchema.parse(d)).toEqual(d);
  });

  it("без C → excluded not_approved; без видеосцены → no_version; отпечаток не тот → stale", async () => {
    env = await seedTimelineProject("ms-v42-build-ex-");
    seedScene(env, ITEMS[0]!, { withC: false });
    expect(buildTimelineDoc(env.db, env.s.root, "p1").excluded).toEqual([{ item_id: "sp_001", reason: "not_approved" }, { item_id: "sp_002", reason: "no_version" }]);
    env.db.prepare("UPDATE video_scenes SET item_fingerprint = 'old' WHERE item_id = 'sp_001'").run();
    expect(buildTimelineDoc(env.db, env.s.root, "p1").excluded[0]).toEqual({ item_id: "sp_001", reason: "stale" });
  });

  it("версия длиной не по плану → duration_mismatch (blocking)", async () => {
    env = await seedTimelineProject("ms-v42-build-dur-");
    seedScene(env, ITEMS[0]!, { frames: 80 });
    const d = buildTimelineDoc(env.db, env.s.root, "p1");
    expect(d.issues).toContainEqual(expect.objectContaining({ item_id: "sp_001", code: "duration_mismatch", severity: "blocking" }));
  });

  it("C на старую версию остаётся утверждённой (текущая новее); отозванное C — not_approved", async () => {
    env = await seedTimelineProject("ms-v42-build-old-");
    const { sceneId, version } = seedScene(env, ITEMS[0]!);
    addVersion(env.db, sceneId, 87);
    expect(buildTimelineDoc(env.db, env.s.root, "p1").scenes[0]).toMatchObject({ version_id: version.id, version_number: 1, include: "approved" });
    approvalsRepo.revokeActive(env.db, "p1", "C", `scene:${sceneId}`);
    expect(buildTimelineDoc(env.db, env.s.root, "p1").excluded[0]).toEqual({ item_id: "sp_001", reason: "not_approved" });
  });

  it("A или B не валидны → approval_required", async () => {
    env = await seedTimelineProject("ms-v42-build-ab-");
    approvalsRepo.revokeActive(env.db, "p1", "B");
    expect(() => buildTimelineDoc(env.db, env.s.root, "p1")).toThrow(/approval_required/);
  });
});

function deps(): Phase46Deps {
  const svc = { root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), storageCheck: env.s.guard } as unknown as CoreServices;
  return { svc, options: {}, exporter: {} as Phase46Deps["exporter"] };
}

async function runBuild(key: string) {
  runner ??= new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: {
    "timeline.build": timelineBuild(deps),
    "plan.recheck": planRecheck(() => ({ root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), storage: env.s.guard })),
  }, pollMs: 5 });
  runner.start();
  const j = enqueue(env.db, { type: "timeline.build", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: key }).job;
  await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, j.id)!.status), "итог timeline.build", 15_000);
  return jobs.get(env.db, j.id)!;
}

describe("timeline.build", () => {
  it("r1 публикуется с fencing и индексом; без изменений — no_change; после вырезки до сцены — r2 с переносом сдвига", async () => {
    env = await seedTimelineProject("ms-v42-job-");
    seedScene(env, ITEMS[0]!);
    seedScene(env, ITEMS[1]!);
    const j1 = await runBuild("tb-1");
    expect(j1.status, JSON.stringify(j1.error)).toBe("completed");
    const tid = timelineIdFor("p1");
    expect(j1.output_refs).toMatchObject({ timeline_id: tid, revision: 1, scenes: 2, excluded: 0, blocking: 0 });
    const row = videoTimelines.revision(env.db, tid, 1)!;
    expect(row.rel_path).toBe(`${artifactPaths(env.s.root, "p1").timelineRev(tid, 1)}/timeline.json`);
    const r1 = VideoTimelineDocSchema.parse(JSON.parse(readFileSync(join(env.s.root, row.rel_path), "utf8")));
    expect(clipsOf(r1)).toEqual([["sp_001", 300, 87], ["sp_002", 600, 132]]);

    expect((await runBuild("tb-2")).output_refs).toMatchObject({ no_change: true, revision: 1 });

    // пользователь сдвинул sp_002: начало 621 при якоре 651 (смещение −30; 621 — начало слова, без прилипания)
    const r2 = await saveTimelineRevision({ db: env.db, store: env.store, root: env.s.root }, tid, { base_revision: 1, ops: [{ op: "move", clip_id: "clip_sp_002", start_frame: 621 }] });
    expect(r2.scenes[1]!.start_frame).toBe(621);
    // вырезка слов 6–8 до обеих сцен: A и B устарели — сборки нет
    await saveEdlRevision({ db: env.db, store: env.store, root: env.s.root }, "edl_1", { base_revision: 1, ops: [{ op: "add_cut", start_word_id: id(6), end_word_id: id(8) }] });
    const refused = await runBuild("tb-3");
    expect(refused.status).toBe("failed");
    expect(refused.error).toMatchObject({ code: "approval_required" });
    // plan.recheck (поставлен правкой EDL) → A и B заново → r3: sp_001 на новой позиции плана, sp_002 — смещение от якоря сохранено
    await until(() => jobs.list(env.db, { projectId: "p1" }).some((x) => x.type === "plan.recheck" && x.status === "completed"), "plan.recheck", 15_000);
    approveRoughCut(env.db, "p1");
    approveVisualPlan(env.db, "p1", env.s.root);
    const plan = currentPlan(env.db, env.s.root, "pln_1");
    const shift = 300 - plan.items[0]!.frames.start;
    expect(shift).toBeGreaterThan(30);
    const j3 = await runBuild("tb-4");
    expect(j3.status, JSON.stringify(j3.error)).toBe("completed");
    expect(j3.output_refs).toMatchObject({ revision: 3, carried: ["clip_sp_002"], dropped: [] });
    const r3 = VideoTimelineDocSchema.parse(JSON.parse(readFileSync(join(env.s.root, videoTimelines.revision(env.db, tid, 3)!.rel_path), "utf8")));
    expect(r3).toMatchObject({ parent_revision: 2, inputs: { edl: { revision: 2 }, plan: { revision: 2 } } });
    expect(clipsOf(r3)).toEqual([["sp_001", 300 - shift, 87], ["sp_002", r3.scenes[1]!.anchors[0]!.frame - 30, 132]]);
    expect(r3.scenes[1]!.anchors[0]!.frame).toBe(651 - shift);
    expect(r3.ops).toEqual([{ op: "move", clip_id: "clip_sp_002", start_frame: 621 - shift }]);
    expect(r3.issues).toEqual([]);
  });
});
