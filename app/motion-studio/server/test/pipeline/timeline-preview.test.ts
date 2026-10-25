// Task 42: обработчик `timeline.preview` с подменой рендера и звука — запрос рендера (прокси,
// последовательности EDL, сцены ревизии, масштаб 0,5, CRF 23), проверка длительности, публикация в
// `preview/<timeline>/r<N>/`, повтор — `reused`, живой процесс рендера — `blocked(stale_process)`.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TimelineRenderRequest, TimelineRenderResult } from "@ms/render";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { type TimelinePreviewImpl, timelinePreviewWith } from "../../src/pipeline/timeline-preview.js";
import * as versions from "../../src/db/repos/versions.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { publishTimelineRevision } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { ITEMS, type TimelineEnv, seedScene, seedTimelineProject } from "../timeline/helpers.js";

let env: TimelineEnv;
let runner: JobRunner | undefined;
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

async function ready() {
  env = await seedTimelineProject("ms-v42-prev-");
  const proxyRel = "workspace/projects/p1/proxy/med_1/proxy.mp4";
  mkdirSync(dirname(join(env.s.root, proxyRel)), { recursive: true });
  writeFileSync(join(env.s.root, proxyRel), "proxy");
  media.setDerivative(env.db, "med_1", { kind: "proxy", rel_path: proxyRel, sha256: "c".repeat(64), params: {} });
  for (const it of ITEMS) {
    const { version } = seedScene(env, it);
    mkdirSync(join(env.s.root, version.path), { recursive: true });
    writeFileSync(join(env.s.root, version.path, "props.json"), JSON.stringify({ timing: { duration_frames: versions.get(env.db, version.id)!.settings.duration_frames } }));
  }
  const doc = await publishTimelineRevision({ db: env.db, store: env.store, root: env.s.root }, "p1", buildTimelineDoc(env.db, env.s.root, "p1"));
  return doc;
}

function start(impl: TimelinePreviewImpl) {
  const svc = { root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), storageCheck: env.s.guard } as unknown as CoreServices;
  const deps = (): Phase46Deps => ({ svc, options: {}, exporter: {} as Phase46Deps["exporter"] });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "timeline.preview": timelinePreviewWith(deps, impl) }, pollMs: 5 });
  runner.start();
}

async function runPreview(input: Record<string, unknown>, key: string) {
  const j = enqueue(env.db, { type: "timeline.preview", projectId: "p1", input, idempotencyKey: key }).job;
  await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, j.id)!.status), "итог timeline.preview", 15_000);
  return jobs.get(env.db, j.id)!;
}

const editedAudio: TimelinePreviewImpl["editedAudio"] = async (req) => {
  writeFileSync(req.out, "wav");
  return { path: req.out, sha256: "d".repeat(64), samples: 1 };
};

describe("timeline.preview", () => {
  it("запрос рендера по ревизии, публикация preview/<timeline>/r1, повтор — reused", async () => {
    const doc = await ready();
    const calls: TimelineRenderRequest[] = [];
    start({
      editedAudio,
      render: async (req): Promise<TimelineRenderResult> => {
        calls.push(req);
        writeFileSync(req.output!.path, "mp4");
        return { ok: true, stills: [], browserLogs: [], allowedOrigins: [], outPath: req.output!.path, probe: { durationMs: (doc.duration_frames * 1000) / 30, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" } };
      },
    });
    const j = await runPreview({ timelineId: doc.timeline_id, revision: 1 }, "p-1");
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    const rel = `${artifactPaths(env.s.root, "p1").previewRev(doc.timeline_id, 1)}/preview.mp4`;
    expect(j.output_refs).toMatchObject({ rel_path: rel, reused: false, scenes: 2, width: 960, height: 540 });
    expect(existsSync(join(env.s.root, rel))).toBe(true);
    const req = calls[0]!;
    expect(req.output).toMatchObject({ codec: "h264", crf: 23, scale: 0.5 });
    expect(req.props).toMatchObject({ width: 1920, height: 1080, duration_frames: doc.duration_frames, video: { path: join(env.s.root, "workspace/projects/p1/proxy/med_1/proxy.mp4"), sequences: doc.video } });
    expect(req.props.audio?.path).toMatch(/edited-audio\.wav$/);
    expect(req.props.scenes.map((s) => [s.clip_id, s.start_frame, s.duration_frames, s.transparent])).toEqual(doc.scenes.map((c) => [c.clip_id, c.start_frame, c.duration_frames, true]));
    expect(Object.keys(req.versionDirs).sort()).toEqual(doc.scenes.map((c) => c.version_id).sort());
    const again = await runPreview({ timelineId: doc.timeline_id, revision: 1 }, "p-2");
    expect(again.output_refs).toMatchObject({ reused: true, rel_path: rel });
    expect(calls).toHaveLength(1);
  });

  it("длительность не та → failed(probe); живой рендер → blocked(stale_process); нет ревизии → failed(prepare)", async () => {
    const doc = await ready();
    let mode: "short" | "orphan" = "short";
    start({
      editedAudio,
      render: async (req): Promise<TimelineRenderResult> => {
        if (mode === "orphan") return { ok: false, stills: [], browserLogs: [], allowedOrigins: [], error: { stage: "orphaned", message: "worker жив" } };
        writeFileSync(req.output!.path, "mp4");
        return { ok: true, stills: [], browserLogs: [], allowedOrigins: [], outPath: req.output!.path, probe: { durationMs: 1000, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" } };
      },
    });
    const short = await runPreview({ timelineId: doc.timeline_id, revision: 1 }, "s-1");
    expect(short.status).toBe("failed");
    expect(short.error).toMatchObject({ code: "pipeline", stage: "probe" });
    mode = "orphan";
    const orphan = await runPreview({ timelineId: doc.timeline_id, revision: 1 }, "s-2");
    expect(orphan.status).toBe("blocked");
    expect(orphan.error).toMatchObject({ code: "stale_process", stage: "orphaned" });
    const none = await runPreview({ timelineId: doc.timeline_id, revision: 5 }, "s-3");
    expect(none.error).toMatchObject({ code: "pipeline", stage: "prepare" });
  });
});
