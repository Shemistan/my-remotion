// Task 43 e2e (реальный рендер, `make e2e`): проект-фикстура таймлайна (`fixture-project.ts`:
// talk-ru-cfr.mp4 1280×720 30 fps с вырезкой 2,0–3,5 с, overlay в lower_third и fullscreen, A/B/C
// утверждены) → `timeline.build` r1 → `requestFinal` 720p `standard` → `final.render`: [A] `final.mp4`
// 1280×720 H.264/AAC 48 кГц BT.709, манифест по схеме, `verify.verdict = pass`; `final.reproduce` →
// `reproduced`, master построен один раз (повтор взял кэш), оригинал не изменён (sha256). [H] кадры
// середины сцен (≤ 480 px) — tmp/final-evidence/, с MS_WRITE_EVIDENCE=1 — docs/evidence/phase-5/final/.
// Хранилище — tmp/ репозитория. Запуск:
// `MS_E2E=1 ./scripts/with-node.sh npx vitest run server/test/final/final.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FinalManifestSchema, FinalVerifyReportSchema } from "@ms/contracts";
import { ensureRenderBrowser } from "@ms/render";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore, publicationOf } from "../../src/artifacts/store.js";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { finalExports } from "../../src/db/repos/video.js";
import { requestFinal } from "../../src/final/request.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { finalRender } from "../../src/pipeline/final-render.js";
import { finalReproduce } from "../../src/pipeline/final-reproduce.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { timelineBuild } from "../../src/pipeline/timeline-build.js";
import { sha256File } from "../../src/scenes/hash.js";
import { readTimelineDoc } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { type JobsEnv, setupDb, until } from "../jobs/helpers.js";
import { type FixtureProject, seedFixtureProject } from "../timeline/fixture-project.js";

const T = 30 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-5/final" : "tmp/final-evidence");

let env: JobsEnv;
let fx: FixtureProject;
let runner: JobRunner;
const notes: string[] = [];

beforeAll(async () => {
  await ensureRenderBrowser();
  env = await setupDb("ms-v43-e2e-");
  fx = await seedFixtureProject(env.db, new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard }), env.s.root);
  // свободное место — по-настоящему (тестовый guard отвечает 1 байт)
  const free = () => {
    const st = statfsSync(env.s.root);
    return Number(st.bavail) * Number(st.bsize);
  };
  const svc = {
    root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), minFreeBytes: 0,
    storageCheck: async () => ({ ...(await env.s.guard()), freeBytes: free() }),
  } as unknown as CoreServices;
  const deps = (): Phase46Deps => ({ svc, options: {}, exporter: {} as Phase46Deps["exporter"] });
  runner = new JobRunner({
    db: env.db, root: env.s.root, owner: "srv", pollMs: 20,
    handlers: { "timeline.build": timelineBuild(deps), "final.render": finalRender(deps), "final.reproduce": finalReproduce(deps) },
  });
  runner.start();
  mkdirSync(EVIDENCE, { recursive: true });
}, T);

afterAll(async () => {
  await runner?.stop({ abortRunning: true });
  if (notes.length > 0) {
    writeFileSync(join(EVIDENCE, "README.md"), [
      "# Финал видеопроекта (Task 43) — e2e",
      "",
      `Прогон ${new Date().toISOString()}: проект-фикстура (talk-ru-cfr.mp4, 1280×720, 30 fps, вырезка 2,0–3,5 с), сцены`,
      "overlay-lower-third (прозрачная, графика в lower_third) и fullscreen-card; timeline.build → requestFinal 720p standard →",
      "final.render (master + edited-audio целиком, renderTimelineRange весь ролик, BT.709, verifyFinal) → final.reproduce.",
      "Ролик в git не кладётся.",
      "",
      ...notes,
      "",
    ].join("\n"));
  }
  env?.db.close();
  if (env && process.env.MS_KEEP_TMP !== "1") await removeStore(env.s);
});

async function settle(id: string) {
  await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, id)!.status), `итог ${id}`, T - 60_000);
  return jobs.get(env.db, id)!;
}

it("timeline.build → requestFinal 720p → final.render: verify pass; final.reproduce: reproduced, master из кэша; оригинал цел", async () => {
  const b = enqueue(env.db, { type: "timeline.build", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "e2e-build" }).job;
  const built = await settle(b.id);
  expect(built.status, JSON.stringify(built.error)).toBe("completed");
  const { timeline_id, revision } = built.output_refs as { timeline_id: string; revision: number };
  const doc = readTimelineDoc(env.db, env.s.root, timeline_id, revision);

  const t0 = Date.now();
  const { job } = requestFinal({ db: env.db, root: env.s.root }, { timelineId: timeline_id, revision, request: { resolution: "720p", quality: "standard", audio_bitrate_kbps: 192 } });
  const j = await settle(job.id);
  const renderS = (Date.now() - t0) / 1000;
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const out = j.output_refs as { export_id: string; rel_path: string; verdict: string };
  expect(out.verdict).toBe("pass");
  const dir = join(env.s.root, artifactPaths(env.s.root, "p1").finalExport(out.export_id));
  const file = join(dir, "final.mp4");
  const m = FinalManifestSchema.parse(JSON.parse(readFileSync(join(dir, "final-manifest.json"), "utf8")));
  const report = FinalVerifyReportSchema.parse(JSON.parse(readFileSync(join(dir, "verify.json"), "utf8")));
  expect(report).toMatchObject({ verdict: "pass", failures: [], color_matrix: "bt709" });
  expect(m.output).toEqual({ width: 1280, height: 720, fps: { num: 30, den: 1 }, frames: doc.duration_frames });
  expect(finalExports.get(env.db, out.export_id)).toMatchObject({ status: "ready", inputs_hash: m.inputs_hash });
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", file], { encoding: "utf8" })) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string; sample_rate?: string; color_space?: string; pix_fmt?: string }[];
  };
  const v = probe.streams.find((s) => s.codec_type === "video")!;
  const a = probe.streams.find((s) => s.codec_type === "audio")!;
  expect([v.codec_name, v.width, v.height, v.pix_fmt, v.color_space]).toEqual(["h264", 1280, 720, "yuv420p", "bt709"]);
  expect(Math.abs(Number(v.nb_read_frames) - doc.duration_frames)).toBeLessThanOrEqual(1);
  expect([a.codec_name, a.sample_rate]).toEqual(["aac", "48000"]);
  notes.push(`- ${timeline_id} r${revision}: ${doc.duration_frames} кадров, сцены ${doc.scenes.map((c) => `${c.item_id} ${c.placement.mode} [${c.start_frame}, +${c.duration_frames})`).join(", ")}`);
  notes.push(`- final.render ${out.export_id}: ${v.width}×${v.height} ${v.color_space}, ${v.nb_read_frames} кадров, звук ${a.codec_name} ${a.sample_rate} Гц; задача ${renderS.toFixed(1)} с; sha256 ${await sha256File(file)}`);
  notes.push(`- verify: ${report.verdict}; кадры ${report.frames.map((f) => `${f.kind}@${f.frame} ${f.psnr_db} дБ${f.kind === "source" ? ` off ${f.offset}` : ""}`).join(", ")}; sync ${report.sync_check?.status} (${report.sync.length} слов); громкость Δ ${report.loudness.delta_lu} LU, true peak ${report.loudness.final_peak_db} dBTP`);

  // [H] кадры середины сцен, ≤ 480 px
  for (const c of doc.scenes) {
    const mid = c.start_frame + Math.floor(c.duration_frames / 2);
    const png = join(EVIDENCE, `final-${c.item_id}-${c.placement.mode}-f${mid}.png`);
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", file, "-vf", `select=eq(n\\,${mid}),scale=480:-2`, "-vframes", "1", "-fps_mode", "passthrough", png]);
    notes.push(`- кадр ${mid} (середина ${c.item_id}, ${c.placement.mode}): \`${png.slice(REPO.length)}\``);
  }

  // повтор: те же входы, master — из кэша (публикация master — первой задачи финала)
  const masterRel = artifactPaths(env.s.root, "p1").master("med_1", doc.fps);
  expect(publicationOf(env.db, masterRel)?.job_id).toBe(job.id);
  const t1 = Date.now();
  const rep = enqueue(env.db, { type: "final.reproduce", projectId: "p1", input: { exportId: out.export_id }, idempotencyKey: "e2e-reproduce" }).job;
  const r = await settle(rep.id);
  expect(r.status, JSON.stringify(r.error)).toBe("completed");
  const ro = r.output_refs as { export_id: string; compare: { verdict: string; frames: { psnr_db: number }[]; file_sha256_equal: boolean } };
  expect(ro.compare.verdict).toBe("reproduced");
  expect(publicationOf(env.db, masterRel)?.job_id).toBe(job.id);
  notes.push(`- final.reproduce ${ro.export_id}: ${ro.compare.verdict}, PSNR кадров min ${Math.min(...ro.compare.frames.map((f) => f.psnr_db))} дБ, sha256 файла ${ro.compare.file_sha256_equal ? "совпал" : "другой"}; задача ${((Date.now() - t1) / 1000).toFixed(1)} с; master из кэша`);
  expect(await sha256File(join(env.s.root, "workspace/projects/p1/source/med_1/original.mp4"))).toBe(fx.sourceSha256);
  expect(await sha256File(fx.sourcePath)).toBe(fx.sourceSha256);
}, T);
