// Дочерний процесс e2e «kill -9 посреди импорта» (ревью Task 25, I5): настоящий bootCore на
// tmp-хранилище. `start <workdir> <fixtureDir> <fixture> <stage> <delayMs>` — ставит media.import и
// убивает себя SIGKILL через delayMs после начала этапа; `resume <workdir>` — поднимает ядро на
// том же хранилище, ждёт итога задачи и печатает последней строкой JSON с состоянием.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initStore, macosProbe } from "@ms/core";
import { bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";

const [mode, work, ...rest] = process.argv.slice(2);
if (!work) throw new Error("usage: kill9-child.mts start|resume <workdir> …");
const root = join(work, "store");
const env = { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" };
const ffmpegAlive = () =>
  execFileSync("/bin/ps", ["-axww", "-o", "pid=,command="]).toString().split("\n").filter((l) => l.includes(root) && /ffmpeg|ffprobe/.test(l));

if (mode === "start") {
  const [fixDir, fixture, stage, delay] = rest as [string, string, string, string];
  mkdirSync(work, { recursive: true });
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [fixDir] } }) + "\n");
  const mine = new Set<string>();
  const core = await bootCore({
    env, kind: "cli", runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, {
      onImportStage: (st) => {
        if (st === stage) setTimeout(() => process.kill(process.pid, "SIGKILL"), Number(delay));
      },
    }),
  });
  const p = projects.create(core.db, { kind: "video", title: "kill9" });
  const id = enqueue(core.db, {
    type: "media.import", projectId: p.id, input: { projectId: p.id, method: "path", path: join(fixDir, fixture) }, idempotencyKey: `k9-${Date.now()}`,
  }).job.id;
  writeFileSync(join(work, "job.json"), JSON.stringify({ id, projectId: p.id }));
  mine.add(id);
  await new Promise((r) => setTimeout(r, 120_000));
  console.log("не убит за 120 с:", jobs.get(core.db, id)?.status);
  process.exit(3);
} else if (mode === "resume") {
  const { id, projectId } = JSON.parse(readFileSync(join(work, "job.json"), "utf8")) as { id: string; projectId: string };
  const draftsBefore = readdirSync(join(root, "workspace/drafts"));
  const mine = new Set<string>([id]);
  const core = await bootCore({ env, kind: "cli", runner: { onlyIds: mine }, handlers: (svc) => registerHandlers(svc, {}) });
  let j = jobs.get(core.db, id)!;
  const t0 = Date.now();
  while (!["completed", "failed", "cancelled", "blocked"].includes(j.status) && Date.now() - t0 < 120_000) {
    await new Promise((r) => setTimeout(r, 100));
    j = jobs.get(core.db, id)!;
  }
  const a = media.byProject(core.db, projectId);
  const dirs = (k: string) => {
    const d = join(root, "workspace/projects", projectId, k);
    return existsSync(d) ? readdirSync(d) : [];
  };
  const out = {
    job: { status: j.status, attempt: j.attempt, error: j.error, output_refs: j.output_refs },
    asset: a ? { id: a.id, rel_path: a.rel_path } : null,
    pubs: core.db.prepare("SELECT dest_rel, job_id, attempt FROM artifact_publications ORDER BY dest_rel").all(),
    derivs: a ? media.derivatives(core.db, a.id).map((d) => d.kind) : [],
    source: dirs("source"),
    proxy: dirs("proxy"),
    draftsBefore,
    draftsAfter: readdirSync(join(root, "workspace/drafts")),
    ffmpegAlive: ffmpegAlive(),
  };
  await core.close();
  console.log(JSON.stringify(out));
} else {
  throw new Error(`неизвестный режим ${mode}`);
}
