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
import { buildTimelineDoc, sceneStates, timelineIdFor } from "../../src/timeline/build.js";
import { saveTimelineRevision } from "../../src/timeline/ops.js";
import { videoScenesState } from "../../src/video-scenes/state.js";
import * as versions from "../../src/db/repos/versions.js";
import { removeStore } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, approveC, id, seedScene, seedTimelineProject } from "./helpers.js";

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

  it("состояние сцен — как videoScenesState (38-39): утверждённая и текущая версии, stale", async () => {
    env = await seedTimelineProject("ms-v42-build-same-");
    const a = seedScene(env, ITEMS[0]!);
    addVersion(env.db, a.sceneId, 87);
    seedScene(env, ITEMS[1]!, { withC: false });
    const plan = currentPlan(env.db, env.s.root, "pln_1", 1);
    const same = () => {
      const mine = sceneStates(env.db, env.s.root, plan);
      const dto = videoScenesState(env.db, env.s.root, "p1");
      expect(dto.scenes.map((s) => s.item_id)).toEqual(["sp_001", "sp_002"]);
      for (const s of dto.scenes) {
        const m = mine[s.item_id];
        expect([s.item_id, m?.scene_id ?? null, m?.approved?.version_id ?? null, m?.current?.version_id ?? null, m?.stale ?? false])
          .toEqual([s.item_id, s.scene_id, s.approval.state === "valid" ? s.approval.version_id : null, s.version_id, s.stale]);
      }
      return mine;
    };
    expect(same()["sp_001"]).toMatchObject({ approved: { version_number: 1 }, current: { version_number: 2 } });
    approveC(env.db, versions.listByScene(env.db, a.sceneId).find((v) => v.number === 2)!.id);
    expect(same()["sp_001"]!.approved).toMatchObject({ version_number: 2 });
    env.db.prepare("UPDATE video_scenes SET item_fingerprint = 'old' WHERE item_id = 'sp_002'").run();
    expect(same()["sp_002"]).toMatchObject({ stale: true });
    approvalsRepo.revokeActive(env.db, "p1", "C", `scene:${a.sceneId}`);
    expect(same()["sp_001"]!.approved).toBeUndefined();
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

  it("ревью I2: исключить → stale → пересобрать → перегенерировать + C → пересобрать → excluded: user; сдвиг ждал возвращения", async () => {
    env = await seedTimelineProject("ms-v42-job-defer-");
    const a = seedScene(env, ITEMS[0]!);
    const b = seedScene(env, ITEMS[1]!);
    expect((await runBuild("df-1")).status).toBe("completed");
    const tid = timelineIdFor("p1");
    const r2 = await saveTimelineRevision({ db: env.db, store: env.store, root: env.s.root }, tid, { base_revision: 1, ops: [
      { op: "move", clip_id: "clip_sp_001", start_frame: 290 }, { op: "include", clip_id: "clip_sp_002", include: false },
    ] });
    const moved = r2.scenes[0]!.start_frame;
    expect(moved).not.toBe(300);
    const fps = env.db.prepare("SELECT item_id, item_fingerprint AS f FROM video_scenes").all() as { item_id: string; f: string }[];
    env.db.prepare("UPDATE video_scenes SET item_fingerprint = 'old'").run();
    const j3 = await runBuild("df-2");
    expect(j3.status, JSON.stringify(j3.error)).toBe("completed");
    const r3 = VideoTimelineDocSchema.parse(JSON.parse(readFileSync(join(env.s.root, videoTimelines.revision(env.db, tid, 3)!.rel_path), "utf8")));
    expect(r3.scenes).toEqual([]);
    expect(r3.excluded.map((x) => x.reason)).toEqual(["stale", "stale"]);
    expect(r3.ops).toEqual(r2.ops);
    // перегенерация: отпечатки снова текущие, новые версии с C
    for (const x of fps) env.db.prepare("UPDATE video_scenes SET item_fingerprint = ? WHERE item_id = ?").run(x.f, x.item_id);
    approveC(env.db, addVersion(env.db, a.sceneId, 87).id);
    approveC(env.db, addVersion(env.db, b.sceneId, 132).id);
    const j4 = await runBuild("df-3");
    expect(j4.status, JSON.stringify(j4.error)).toBe("completed");
    const r4 = VideoTimelineDocSchema.parse(JSON.parse(readFileSync(join(env.s.root, videoTimelines.revision(env.db, tid, 4)!.rel_path), "utf8")));
    expect(r4.scenes.map((c) => [c.item_id, c.start_frame, c.version_number])).toEqual([["sp_001", moved, 2]]);
    expect(r4.excluded).toEqual([{ item_id: "sp_002", reason: "user" }]);
    expect(r4.issues).toEqual([]);
  });
});
