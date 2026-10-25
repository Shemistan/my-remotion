// Task 42 e2e (реальный рендер, `make e2e`): проект-фикстура таймлайна (`fixture-project.ts`:
// talk-ru-cfr.mp4 с вырезкой 2,0–3,5 с, overlay в lower_third и fullscreen, A/B/C утверждены) →
// `timeline.build` → `timeline.preview` (прокси + edited-audio из прокси + `renderTimelineRange`
// целиком, масштаб 0,5, CRF 23). [A] длительность видео = duration_frames / fps ± 1 кадр, размер
// 960×540, звук AAC; повтор — `reused`; исходник не изменён (sha256). [H] кадры середины сцен
// (≤ 480 px) — tmp/timeline-preview-evidence/, с MS_WRITE_EVIDENCE=1 — docs/evidence/phase-5/timeline/.
// Хранилище — tmp/ репозитория. Запуск:
// `MS_E2E=1 ./scripts/with-node.sh npx vitest run server/test/pipeline/timeline-preview.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "@ms/render";
import { ArtifactStore } from "../../src/artifacts/store.js";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { timelineBuild } from "../../src/pipeline/timeline-build.js";
import { type TimelinePreviewResult, timelinePreview } from "../../src/pipeline/timeline-preview.js";
import { sha256File } from "../../src/scenes/hash.js";
import { readTimelineDoc } from "../../src/timeline/ops.js";
import { removeStore } from "../db/helpers.js";
import { type JobsEnv, setupDb, until } from "../jobs/helpers.js";
import { type FixtureProject, seedFixtureProject } from "../timeline/fixture-project.js";

const T = 20 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-5/timeline" : "tmp/timeline-preview-evidence");

let env: JobsEnv;
let fx: FixtureProject;
let runner: JobRunner;
const notes: string[] = [];

beforeAll(async () => {
  await ensureRenderBrowser();
  env = await setupDb("ms-v42-e2e-");
  fx = await seedFixtureProject(env.db, new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard }), env.s.root);
  const svc = { root: env.s.root, config: loadConfig({ MS_DATA_DIR: env.s.root }), storageCheck: env.s.guard } as unknown as CoreServices;
  const deps = (): Phase46Deps => ({ svc, options: {}, exporter: {} as Phase46Deps["exporter"] });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "timeline.build": timelineBuild(deps), "timeline.preview": timelinePreview(deps) }, pollMs: 20 });
  runner.start();
  mkdirSync(EVIDENCE, { recursive: true });
}, T);

afterAll(async () => {
  await runner?.stop({ abortRunning: true });
  if (notes.length > 0) {
    writeFileSync(join(EVIDENCE, "README.md"), [
      "# Превью таймлайна проекта (Task 42) — e2e",
      "",
      `Прогон ${new Date().toISOString()}: проект-фикстура (talk-ru-cfr.mp4, 1280×720, 30 fps, вырезка 2,0–3,5 с), сцены`,
      "overlay-lower-third (прозрачная, графика в lower_third) и fullscreen-card; timeline.build → timeline.preview",
      "(прокси + edited-audio из прокси + renderTimelineRange целиком, масштаб 0,5, CRF 23). Ролик в git не кладётся.",
      "",
      ...notes,
      "",
    ].join("\n"));
  }
  env?.db.close();
  if (env && process.env.MS_KEEP_TMP !== "1") await removeStore(env.s);
});

async function runJob(type: "timeline.build" | "timeline.preview", input: Record<string, unknown>, key: string) {
  const j = enqueue(env.db, { type, projectId: "p1", input, idempotencyKey: key }).job;
  await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, j.id)!.status), `итог ${type}`, T - 60_000);
  return jobs.get(env.db, j.id)!;
}

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);

it("timeline.build → timeline.preview: длительность ± кадр, размер 0,5, звук; повтор — reused; кадры середины сцен", async () => {
  const b = await runJob("timeline.build", { projectId: "p1" }, "e2e-build");
  expect(b.status, JSON.stringify(b.error)).toBe("completed");
  const { timeline_id, revision } = b.output_refs as { timeline_id: string; revision: number };
  const doc = readTimelineDoc(env.db, env.s.root, timeline_id, revision);
  expect(doc.scenes.map((c) => [c.item_id, c.include, c.placement.transparent])).toEqual([["sp_001", "approved", true], ["sp_002", "approved", false]]);
  expect(doc.issues.filter((i) => i.severity === "blocking")).toEqual([]);

  const t0 = Date.now();
  const p = await runJob("timeline.preview", { timelineId: timeline_id, revision }, "e2e-preview");
  expect(p.status, JSON.stringify(p.error)).toBe("completed");
  const out = p.output_refs as TimelinePreviewResult;
  const file = join(env.s.root, out.rel_path);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", file], { encoding: "utf8" })) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string; sample_rate?: string; duration?: string }[] };
  const v = probe.streams.find((s) => s.codec_type === "video")!;
  const a = probe.streams.find((s) => s.codec_type === "audio");
  const frames = Number(v.nb_read_frames);
  const seconds = doc.duration_frames / 30;
  notes.push(`- ${timeline_id} r${revision}: ${doc.duration_frames} кадров (${seconds.toFixed(2)} с), сцены ${doc.scenes.map((c) => `${c.item_id} ${c.placement.mode} [${c.start_frame}, +${c.duration_frames})`).join(", ")}`);
  notes.push(`- превью: ${v.codec_name} ${v.width}×${v.height}, ${frames} кадров, звук ${a ? `${a.codec_name} ${a.sample_rate} Гц, ${Number(a.duration).toFixed(3)} с` : "нет"}; задача ${((Date.now() - t0) / 1000).toFixed(1)} с; sha256 ${await sha256File(file)}`);
  expect(Math.abs(frames - doc.duration_frames)).toBeLessThanOrEqual(1);
  expect(Math.abs((out.duration_ms ?? 0) / 1000 - seconds)).toBeLessThanOrEqual(1 / 30 + 1e-3);
  expect([v.width, v.height]).toEqual([960, 540]);
  expect(a?.codec_name).toBe("aac");
  expect(Math.abs(Number(a!.duration) - seconds)).toBeLessThan(0.05);

  // [H] кадры середины сцен, ≤ 480 px
  for (const c of doc.scenes) {
    const mid = c.start_frame + Math.floor(c.duration_frames / 2);
    const png = join(EVIDENCE, `timeline-${c.item_id}-${c.placement.mode}-f${mid}.png`);
    ff(["-i", file, "-vf", `select=eq(n\\,${mid}),scale=480:-2`, "-vframes", "1", "-fps_mode", "passthrough", png]);
    notes.push(`- кадр ${mid} (середина ${c.item_id}, ${c.placement.mode}): \`${png.slice(REPO.length)}\``);
  }

  const again = await runJob("timeline.preview", { timelineId: timeline_id, revision }, "e2e-preview-2");
  expect(again.output_refs).toMatchObject({ reused: true, rel_path: out.rel_path });
  expect(await sha256File(join(env.s.root, "workspace/projects/p1/source/med_1/original.mp4"))).toBe(fx.sourceSha256);
}, T);
