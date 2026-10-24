// Дочерний процесс e2e «kill -9 во время ASR» (Task 26, Review Focus 6): настоящий bootCore на
// tmp-хранилище и настоящий воркер ai-platform. `start <workdir> <fixtureDir> <fixture> <delayMs>` —
// импортирует фикстуру, ставит asr.transcribe и убивает себя SIGKILL через delayMs после появления
// воркера в реестре процессов; `resume <workdir>` — поднимает ядро на том же хранилище, ждёт итога
// и печатает последней строкой JSON с состоянием (живые воркеры, публикации, drafts).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initStore, macosProbe } from "@ms/core";
import { bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";

const [mode, work, ...rest] = process.argv.slice(2);
if (!work) throw new Error("usage: asr-kill9-child.mts start|resume <workdir> …");
const root = join(work, "store");
const env = { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" };
const workerAlive = () =>
  execFileSync("/bin/ps", ["-axww", "-o", "pid=,command="]).toString().split("\n").filter((l) => l.includes("asr_worker.py") && l.includes(root));
const TERMINAL = ["completed", "failed", "cancelled", "blocked"];

async function waitJob(db: Parameters<typeof jobs.get>[0], id: string, ms: number) {
  const t0 = Date.now();
  let j = jobs.get(db, id)!;
  while (!TERMINAL.includes(j.status) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 100));
    j = jobs.get(db, id)!;
  }
  return j;
}

if (mode === "start") {
  const [fixDir, fixture, delay] = rest as [string, string, string];
  mkdirSync(work, { recursive: true });
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [fixDir] } }) + "\n");
  const mine = new Set<string>();
  const core = await bootCore({ env, kind: "cli", runner: { onlyIds: mine }, handlers: (svc) => registerHandlers(svc, {}) });
  const p = projects.create(core.db, { kind: "video", title: "asr-kill9" });
  const imp = enqueue(core.db, { type: "media.import", projectId: p.id, input: { projectId: p.id, method: "path", path: join(fixDir, fixture) }, idempotencyKey: `k9i-${Date.now()}` }).job.id;
  mine.add(imp);
  const ij = await waitJob(core.db, imp, 120_000);
  if (ij.status !== "completed") throw new Error(`импорт: ${ij.status} ${JSON.stringify(ij.error)}`);
  const mediaId = media.byProject(core.db, p.id)!.id;
  const id = enqueue(core.db, { type: "asr.transcribe", projectId: p.id, input: { projectId: p.id, mediaId, language: "ru" }, idempotencyKey: `k9a-${Date.now()}` }).job.id;
  writeFileSync(join(work, "job.json"), JSON.stringify({ id, projectId: p.id }));
  mine.add(id);
  const t0 = Date.now();
  while (workerAlive().length === 0 && Date.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 50));
  if (workerAlive().length === 0) throw new Error(`воркер не появился: ${jobs.get(core.db, id)?.status} ${JSON.stringify(jobs.get(core.db, id)?.error)}`);
  writeFileSync(join(work, "worker.txt"), workerAlive().join("\n"));
  setTimeout(() => process.kill(process.pid, "SIGKILL"), Number(delay));
  await new Promise((r) => setTimeout(r, 300_000));
  console.log("не убит:", jobs.get(core.db, id)?.status);
  process.exit(3);
} else if (mode === "resume") {
  const { id, projectId } = JSON.parse(readFileSync(join(work, "job.json"), "utf8")) as { id: string; projectId: string };
  const aliveBefore = workerAlive();
  const draftsBefore = readdirSync(join(root, "workspace/drafts"));
  const mine = new Set<string>([id]);
  const core = await bootCore({ env, kind: "cli", runner: { onlyIds: mine }, handlers: (svc) => registerHandlers(svc, {}) });
  // восстановление при старте убивает группу прежней попытки до захвата
  const aliveAfterBoot = workerAlive();
  const j = await waitJob(core.db, id, 600_000);
  const t = transcripts.byProject(core.db, projectId);
  const out = {
    job: { status: j.status, attempt: j.attempt, error: j.error, output_refs: j.output_refs },
    transcript: t ? { id: t.id, current_revision: t.current_revision } : null,
    revisions: t ? core.db.prepare("SELECT revision FROM transcript_revisions WHERE transcript_id = ?").pluck().all(t.id) : [],
    pubs: core.db.prepare("SELECT dest_rel, job_id, attempt FROM artifact_publications WHERE dest_rel LIKE '%/transcript/%' ORDER BY dest_rel").all(),
    aliveBefore,
    aliveAfterBoot,
    aliveAfter: workerAlive(),
    draftsBefore,
    draftsAfter: existsSync(join(root, "workspace/drafts")) ? readdirSync(join(root, "workspace/drafts")) : [],
  };
  await core.close();
  console.log(JSON.stringify(out));
} else {
  throw new Error(`неизвестный режим ${mode}`);
}
