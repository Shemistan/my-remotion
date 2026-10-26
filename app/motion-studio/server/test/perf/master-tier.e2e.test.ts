// Task 49b, замер (реальный рендер, без claude): master в разрешении выхода. Синтетика 4K 60 с
// (testsrc2 + шум, звук — talk-ru-cfr по кругу) → проект-фикстура таймлайна → `final.render` 1080p
// дважды в отдельных хранилищах `materialsPath("e2e", "v49b", …)`: «до» — master в размере
// исходника (как до 49b: подмена `impl.master` без ступени), «после» — ступень 1080. Время master,
// рендера и всей задачи, размер master, байты медиасервера → tmp/v49b-master-measure.json.
// Долгий (≈ 15–25 мин), поэтому отдельный флаг поверх MS_E2E:
// `MS_E2E=1 MS_PERF_MASTER=1 ./scripts/with-node.sh npx vitest run server/test/perf/master-tier.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { MARKER_FILE, assertSsdWriteAllowed, initStore, macosProbe, materialsPath } from "@ms/core";
import { ensureRenderBrowser, renderTimelineRange } from "@ms/render";
import { ArtifactStore } from "../../src/artifacts/store.js";
import type { CoreServices } from "../../src/boot.js";
import { loadConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { requestFinal } from "../../src/final/request.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { ensureMaster } from "../../src/media/master.js";
import { type FinalImpl, finalRenderWith } from "../../src/pipeline/final-render.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { timelineBuild } from "../../src/pipeline/timeline-build.js";
import { until } from "../jobs/helpers.js";
import { MEDIA_FIXTURES, ensureMediaFixtures, seedFixtureProject } from "../timeline/fixture-project.js";

const ENABLED = process.env.MS_PERF_MASTER === "1";
const T = 90 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const BASE = materialsPath("e2e", "v49b");
const SRC = join(BASE, "src", "uhd-60s.mp4");
const results: Record<string, unknown> = {};

afterAll(() => {
  if (Object.keys(results).length === 0) return;
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  writeFileSync(join(REPO, "tmp", "v49b-master-measure.json"), JSON.stringify({ at: new Date().toISOString(), source: SRC, ...results }, null, 2) + "\n");
});

function makeSource(): void {
  if (existsSync(SRC)) return;
  ensureMediaFixtures();
  mkdirSync(join(BASE, "src"), { recursive: true });
  execFileSync("ffmpeg", [
    "-hide_banner", "-v", "error", "-n",
    "-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30:duration=60,noise=alls=12:allf=t",
    "-stream_loop", "-1", "-i", join(MEDIA_FIXTURES, "talk-ru-cfr.mp4"),
    "-map", "0:v", "-map", "1:a", "-t", "60",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "128k", SRC,
  ]);
}

async function run(label: "before" | "after"): Promise<void> {
  const root = join(BASE, `${label}-${Date.now()}`);
  assertSsdWriteAllowed(root);
  const marker = await initStore(root, macosProbe, {});
  expect(existsSync(join(root, MARKER_FILE))).toBe(true);
  const db: Db = openDb(root);
  await migrate(db);
  const guard = async () => {
    const st = statfsSync(root);
    return { ok: true as const, root, marker, freeBytes: Number(st.bavail) * Number(st.bsize) };
  };
  await seedFixtureProject(db, new ArtifactStore({ root, db, guard }), root, { source: SRC });
  const svc = { root, config: loadConfig({ MS_DATA_DIR: root }), minFreeBytes: 0, storageCheck: guard } as unknown as CoreServices;
  const deps = (): Phase46Deps => ({ svc, options: {}, exporter: {} as Phase46Deps["exporter"] });
  const m: { masterS?: number; masterPath?: string; renderS?: number; mediaBytes?: number } = {};
  const impl: FinalImpl = {
    master: async (d, mediaId, fps, height) => {
      const t = Date.now();
      // «до»: master в размере исходника, как до Task 49b
      const r = await ensureMaster(d, mediaId, fps, label === "before" ? undefined : height);
      m.masterS = (Date.now() - t) / 1000;
      m.masterPath = r.path;
      return r;
    },
    render: async (req, signal) => {
      const t = Date.now();
      const r = await renderTimelineRange(req, signal);
      m.renderS = (Date.now() - t) / 1000;
      if (r.mediaBytes !== undefined) m.mediaBytes = r.mediaBytes;
      return r;
    },
  };
  const runner = new JobRunner({ db, root, owner: "srv", pollMs: 50, handlers: { "timeline.build": timelineBuild(deps), "final.render": finalRenderWith(deps, impl) } });
  runner.start();
  try {
    const settle = async (id: string) => {
      await until(() => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(db, id)!.status), `итог ${id}`, T - 60_000);
      return jobs.get(db, id)!;
    };
    const built = await settle(enqueue(db, { type: "timeline.build", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "v49b-build" }).job.id);
    expect(built.status, JSON.stringify(built.error)).toBe("completed");
    const { timeline_id, revision } = built.output_refs as { timeline_id: string; revision: number };
    const t0 = Date.now();
    const { job } = requestFinal({ db, root }, { timelineId: timeline_id, revision, request: { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 } });
    const j = await settle(job.id);
    const totalS = (Date.now() - t0) / 1000;
    expect(j.status, JSON.stringify(j.error)).toBe("completed");
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", m.masterPath!]).toString()) as { streams: { width: number; height: number }[] };
    results[label] = {
      store: root, total_s: totalS, master_s: m.masterS, render_s: m.renderS, media_bytes: m.mediaBytes,
      master_bytes: statSync(m.masterPath!).size, master_size: `${probe.streams[0]!.width}x${probe.streams[0]!.height}`,
      export_id: (j.output_refs as { export_id: string }).export_id,
    };
    console.log(`v49b ${label}: ${JSON.stringify(results[label])}`);
  } finally {
    await runner.stop({ abortRunning: true });
    db.close();
  }
}

it.skipIf(!ENABLED)("4K 60 с → финал 1080p: master в размере исходника (до) и ступени 1080 (после)", async () => {
  await ensureRenderBrowser();
  makeSource();
  await run("after");
  await run("before");
}, 2 * T);
