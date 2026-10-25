// Task 43: обработчики `final.render` / `final.reproduce` с подменой master, звука, рендера, проверки и
// сравнения — гейт, место, публикация `final/<id>/` с fencing и `final_exports`, провал проверки,
// гейт протух за время рендера, повтор по манифесту.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type FinalExportRequest, FinalManifestSchema, type FinalVerifyReport } from "@ms/contracts";
import type { TimelineRenderRequest, TimelineRenderResult } from "@ms/render";
import { artifactPaths } from "../../src/artifacts/paths.js";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { finalExports } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { requestFinal } from "../../src/final/request.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { type FinalImpl, finalRenderWith } from "../../src/pipeline/final-render.js";
import { finalReproduceWith } from "../../src/pipeline/final-reproduce.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { buildTimelineDoc } from "../../src/timeline/build.js";
import { publishTimelineRevision } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { until } from "../jobs/helpers.js";
import { ITEMS, type TimelineEnv, addVersion, approveC, seedScene, seedTimelineProject } from "../timeline/helpers.js";

let env: TimelineEnv;
let runner: JobRunner | undefined;
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const req1080: FinalExportRequest = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 };
const H = (c: string) => c.repeat(64);
const ENV = { remotion: "4.0.537", render_lock_sha256: H("e"), motion_kit: "sha256:0123456789abcdef", chrome_headless_shell: "x", node: "22.21.1" };

async function ready() {
  env = await seedTimelineProject("ms-v43-final-");
  const scenes = ITEMS.map((it) => {
    const s = seedScene(env, it);
    mkdirSync(join(env.s.root, s.version.path), { recursive: true });
    writeFileSync(join(env.s.root, s.version.path, "props.json"), JSON.stringify({ timing: { duration_frames: s.version.settings.duration_frames } }));
    return s;
  });
  const doc = await publishTimelineRevision({ db: env.db, store: env.store, root: env.s.root }, "p1", buildTimelineDoc(env.db, env.s.root, "p1"));
  return { doc, scenes };
}

const report = (verdict: "pass" | "fail"): FinalVerifyReport => ({
  probe: [], duration: { expected_frames: 900, actual_us: 30_000_000, delta_frames: 0 }, sync: [], frames: [],
  loudness: { source_lufs: -20, final_lufs: -20, delta_lu: 0, final_peak_db: -3, source_peak_db: -3 },
  verdict, failures: verdict === "pass" ? [] : ["frames"], color_matrix: "bt709",
});

interface Fakes {
  impl: FinalImpl;
  renders: TimelineRenderRequest[];
  masters: number;
  verifyColor: (string | undefined)[];
}

function fakes(o: { verdict?: "pass" | "fail"; duringRender?: () => void } = {}): Fakes {
  const f: Fakes = { impl: {}, renders: [], masters: 0, verifyColor: [] };
  f.impl = {
    master: async () => {
      f.masters++;
      const p = join(env.s.root, "master-fake.mp4");
      writeFileSync(p, "master");
      return { path: p, sha256: H("b") };
    },
    editedAudio: async (req) => {
      writeFileSync(req.out, "wav");
      return { path: req.out, sha256: H("d"), samples: 1 };
    },
    audio16k: async (_in, out) => {
      writeFileSync(out, "wav16");
    },
    render: async (req): Promise<TimelineRenderResult> => {
      f.renders.push(req);
      writeFileSync(req.output!.path, "mp4");
      mkdirSync(req.stillsDir!, { recursive: true });
      for (const s of req.stills) writeFileSync(join(req.stillsDir!, `${s}.png`), "png");
      o.duringRender?.();
      return {
        ok: true, stills: req.stills.map((s) => join(req.stillsDir!, `${s}.png`)), browserLogs: [], allowedOrigins: [], outPath: req.output!.path,
        probe: { durationMs: 30_000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", pixFmt: "yuv420p", audioSampleRate: 48_000, audioChannels: 2 },
      };
    },
    verify: async (i) => {
      f.verifyColor.push(i.colorMatrix);
      expect(await i.stillsFor([165])).toHaveLength(1);
      return report(o.verdict ?? "pass");
    },
    compare: async () => ({ inputs_equal: true, probe_equal: true, frames: [{ frame: 0, psnr_db: 99 }], file_sha256_equal: true, verdict: "reproduced" }),
    renderEnv: async () => ENV,
  };
  return f;
}

function start(f: Fakes, free = 500 * 1024 ** 3) {
  const svc = {
    root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), minFreeBytes: 10 * 1024 ** 3,
    storageCheck: async () => ({ ...(await env.s.guard()), freeBytes: free }),
  } as unknown as CoreServices;
  const deps = (): Phase46Deps => ({ svc, options: {}, exporter: {} as Phase46Deps["exporter"] });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "final.render": finalRenderWith(deps, f.impl), "final.reproduce": finalReproduceWith(deps, f.impl) }, pollMs: 5 });
  runner.start();
}

async function settle(id: string) {
  await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, id)!.status), "итог задачи финала", 8_000);
  return jobs.get(env.db, id)!;
}

const finalRel = (exportId: string) => artifactPaths(env.s.root, "p1").finalExport(exportId);
const kinds = (jobId: string) => jobEvents.listSince(env.db, 0, { jobId, limit: 1000 }).map((e) => e.kind);

describe("final.render", () => {
  it("гейт → место → master → звук → рендер (BT.709) → проверка → публикация final/<id>/ и строка final_exports", async () => {
    const { doc, scenes } = await ready();
    const f = fakes();
    start(f);
    const { job, approval } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const j = await settle(job.id);
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    const out = j.output_refs as { export_id: string; rel_path: string; verdict: string };
    expect(out.verdict).toBe("pass");
    const row = finalExports.get(env.db, out.export_id)!;
    expect(row).toMatchObject({ status: "ready", timeline_id: doc.timeline_id, timeline_revision: 1, approval_id: approval.id, job_id: job.id, request: req1080 });
    const dir = join(env.s.root, finalRel(out.export_id));
    expect(out.rel_path).toBe(`${finalRel(out.export_id)}/final.mp4`);
    for (const name of ["final.mp4", "final-manifest.json", "verify.json", "project-snapshot.json"]) expect(existsSync(join(dir, name)), name).toBe(true);
    expect(statSync(join(dir, "final.mp4")).mode & 0o222).toBe(0);
    const m = FinalManifestSchema.parse(JSON.parse(readFileSync(join(dir, "final-manifest.json"), "utf8")));
    expect(m).toMatchObject({
      export_id: out.export_id, project_id: "p1", timeline: { id: doc.timeline_id, revision: 1 }, request: req1080,
      output: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, frames: doc.duration_frames }, render_env: ENV,
      inputs: { master_sha256: H("b"), audio_sha256: H("d"), scenes: scenes.map((s, k) => ({ clip_id: `clip_${ITEMS[k]!.id}`, version_id: s.version.id, manifest_sha256: s.version.manifest_sha256 })) },
      verify: { verdict: "pass", report: "verify.json" },
    });
    expect(row.inputs_hash).toBe(m.inputs_hash);
    // рендер: master целиком, звук, весь ролик, BT.709; проверка — по матрице bt709
    expect(f.renders).toHaveLength(1);
    expect(f.renders[0]!.range).toBeUndefined();
    expect(f.renders[0]!.output).toMatchObject({ codec: "h264", crf: 20, scale: 1, audioBitrateKbps: 192, x264Preset: "medium", colorSpace: "bt709" });
    expect(f.verifyColor).toEqual(["bt709"]);
    expect(kinds(job.id)).toContain("final_render");
  });

  it("verify fail → публикация есть, final_exports.status = failed_verification, задача failed(verify_failed), success-события нет", async () => {
    const { doc } = await ready();
    start(fakes({ verdict: "fail" }));
    const { job } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const j = await settle(job.id);
    expect(j.status).toBe("failed");
    expect(j.error).toMatchObject({ code: "verify_failed", message: expect.stringMatching(/frames/) });
    const [row] = finalExports.listByProject(env.db, "p1");
    expect(row).toMatchObject({ status: "failed_verification", job_id: job.id });
    expect(existsSync(join(env.s.root, row!.rel_path))).toBe(true);
    expect(kinds(job.id)).not.toContain("final_render");
  });

  it("гейт протух за время рендера → failed(timeline_stale), в final/ ничего", async () => {
    const { doc, scenes } = await ready();
    start(fakes({ duringRender: () => approveC(env.db, addVersion(env.db, scenes[0]!.sceneId, 87).id) }));
    const { job } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const j = await settle(job.id);
    expect(j.status).toBe("failed");
    expect(j.error).toMatchObject({ code: "timeline_stale" });
    expect(finalExports.listByProject(env.db, "p1")).toEqual([]);
    expect(existsSync(join(env.s.root, "workspace/projects/p1/final"))).toBe(false);
  });

  it("места не хватает → failed(low_space) до master и рендера", async () => {
    const { doc } = await ready();
    const f = fakes();
    start(f, 10.5 * 1024 ** 3);
    const { job } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const j = await settle(job.id);
    expect(j.status).toBe("failed");
    expect(j.error).toMatchObject({ code: "low_space", message: expect.stringMatching(/ГиБ/) });
    expect(f.masters).toBe(0);
    expect(f.renders).toEqual([]);
  });

  it("решение final не того субъекта → approval_required", async () => {
    const { doc } = await ready();
    start(fakes());
    const { approval } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const other = enqueue(env.db, {
      type: "final.render", projectId: "p1", idempotencyKey: "x", input: { timelineId: doc.timeline_id, revision: 1, request: { ...req1080, quality: "high" }, approvalId: approval.id },
    }).job;
    const j = await settle(other.id);
    expect(j.status).toBe("failed");
    expect(j.error).toMatchObject({ code: "approval_required" });
  });
});

describe("final.reproduce", () => {
  it("те же входы → новый экспорт и compare.json (reproduced); версия сцены изменилась → failed(verify_failed, inputs_changed)", async () => {
    const { doc, scenes } = await ready();
    const f = fakes();
    start(f);
    const { job } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: doc.timeline_id, revision: 1, request: req1080 });
    const first = await settle(job.id);
    const exportId = (first.output_refs as { export_id: string }).export_id;

    const rep = enqueue(env.db, { type: "final.reproduce", projectId: "p1", input: { exportId }, idempotencyKey: "rep-1" }).job;
    const r = await settle(rep.id);
    expect(r.status, JSON.stringify(r.error)).toBe("completed");
    const out = r.output_refs as { export_id: string; compare: { verdict: string }; reproduced_from: string };
    expect(out).toMatchObject({ reproduced_from: exportId, compare: { verdict: "reproduced" } });
    expect(out.export_id).not.toBe(exportId);
    expect(existsSync(join(env.s.root, finalRel(out.export_id), "compare.json"))).toBe(true);
    expect(finalExports.listByProject(env.db, "p1").map((x) => x.status)).toEqual(["ready", "ready"]);
    expect(f.renders).toHaveLength(2);

    env.db.prepare("UPDATE scene_versions SET manifest_sha256 = ? WHERE id = ?").run(H("f"), scenes[0]!.version.id);
    expect(versions.get(env.db, scenes[0]!.version.id)!.manifest_sha256).toBe(H("f"));
    const bad = enqueue(env.db, { type: "final.reproduce", projectId: "p1", input: { exportId }, idempotencyKey: "rep-2" }).job;
    const b = await settle(bad.id);
    expect(b.status).toBe("failed");
    expect(b.error).toMatchObject({ code: "verify_failed", message: expect.stringMatching(/inputs_changed/) });
    expect(f.renders).toHaveLength(2);
  });
});
