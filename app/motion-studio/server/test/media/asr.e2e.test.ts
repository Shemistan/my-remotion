// Task 26 e2e: `asr.transcribe` через настоящий bootCore, очередь и раннер; настоящий воркер ASR
// ai-platform (python mlx-audio, whisper-large-v3-turbo с SSD) на фикстуре `talk-ru-cfr.mp4`
// (`scripts/make-media-fixtures.mjs`, речь `say -v Milena` с паузами 1,5 с). Хранилище — tmp/
// репозитория (MS_ALLOW_SYSTEM_DISK=1), реальный MotionStudio не трогается.
// Запуск: `MS_E2E=1 npx vitest run server/test/media/asr.e2e.test.ts`.
// Время ASR (× реального времени) и пиковая память воркера — в консоль и tmp/asr-evidence/README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type TranscriptWord, normalizeToken } from "@ms/contracts";
import { fileProcessRegistry, initStore, macosProbe } from "@ms/core";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import { type AsrTranscribeResult, readTranscriptDoc } from "../../src/pipeline/asr-transcribe.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 20 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FIX = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, "tmp/asr-evidence");
const MS = join(REPO, "app/motion-studio");

let tmp: string;
let root: string;
let core: Core;
const mine = new Set<string>();
const notes: string[] = [];

beforeAll(async () => {
  execFileSync(process.execPath, [join(MS, "scripts/make-media-fixtures.mjs")], { stdio: "inherit" });
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  tmp = await mkdtemp(join(REPO, "tmp", "ms-asr-e2e-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [FIX] } }) + "\n");
  core = await bootCore({
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
  });
}, T);

afterAll(async () => {
  await core?.close();
  if (notes.length) {
    const md = ["# ASR (Task 26) — e2e на tmp-хранилище", "", `Прогон ${new Date().toISOString()}.`, "", ...notes, ""].join("\n");
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(join(EVIDENCE, "README.md"), md);
    console.log(md);
  }
  if (tmp) await removeStore({ tmp, root, marker: undefined as never, guard: undefined as never });
});

async function wait(id: string, onTick?: () => void): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    onTick?.();
    await new Promise((r) => setTimeout(r, 200));
  }
}

const maxGap = (ws: TranscriptWord[]) => ws.slice(1).reduce((m, w, i) => Math.max(m, w.start_us - ws[i]!.end_us), 0);

/** RSS (КиБ) процессов воркера этого хранилища (`asr_worker.py` и путь хранилища в командной строке). */
function workerRssKb(): number {
  const r = spawnSync("/bin/ps", ["-axww", "-o", "rss=,command="], { encoding: "utf8" });
  return r.stdout.split("\n").filter((l) => l.includes("asr_worker.py") && l.includes(root))
    .map((l) => Number(l.trim().split(/\s+/)[0])).filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);
}

it("реальный воркер ai-platform: r1 с таймкодами слов, паузы видны, сегменты; время и память — в отчёт", async () => {
  const projectId = projects.create(core.db, { kind: "video", title: "asr e2e" }).id;
  const imp = enqueue(core.db, { type: "media.import", projectId, input: { projectId, method: "path", path: join(FIX, "talk-ru-cfr.mp4") }, idempotencyKey: `e2e-t26-${newId("run")}` }).job.id;
  expect((await wait(imp)).status).toBe("completed");
  const mediaId = media.byProject(core.db, projectId)!.id;

  const t0 = Date.now();
  let peakKb = 0;
  const reg = fileProcessRegistry(root);
  const id = enqueue(core.db, { type: "asr.transcribe", projectId, input: { projectId, mediaId, language: "ru" }, idempotencyKey: `e2e-t26-${newId("run")}` }).job.id;
  const t = await wait(id, () => (peakKb = Math.max(peakKb, workerRssKb())));
  const wallS = (Date.now() - t0) / 1000;
  expect(t.status, JSON.stringify(t.error)).toBe("completed");
  const out = t.output_refs as AsrTranscribeResult;
  const row = transcripts.get(core.db, out.transcript_id)!;
  expect(row.current_revision).toBe(1);
  const doc = await readTranscriptDoc(root, transcripts.revision(core.db, row.id, 1)!.rel_path);
  expect(doc.asr).toMatchObject({ model: "whisper-large-v3-turbo", worker_sha256: core.config.asr.expectedWorkerSha256 });
  const text = doc.words.map((x) => normalizeToken(x.text)).join(" ");
  expect(text).toMatch(/пользовател/);
  expect(text).toMatch(/миллион|1 ?000 ?000/);
  doc.words.forEach((x, i) => {
    expect(x.start_us).toBeLessThanOrEqual(x.end_us);
    if (i) expect(x.start_us).toBeGreaterThanOrEqual(doc.words[i - 1]!.start_us);
  });
  expect(maxGap(doc.words)).toBeGreaterThanOrEqual(1_200_000); // пауза [[slnc 1500]] видна в таймингах
  expect(doc.segments.length).toBeGreaterThanOrEqual(2);
  expect(await reg.live({ runId: id })).toEqual([]);
  const line = `talk-ru-cfr.mp4: звук ${out.audio_s} с, воркер ${out.elapsed_s} с (×${out.rtf} реального времени, с загрузкой модели), задача ${wallS.toFixed(1)} с; ` +
    `пиковая RSS воркера ${(peakKb / 1024).toFixed(0)} МиБ (опрос ps каждые 200 мс); ${doc.words.length} слов, ${doc.segments.length} сегментов, ` +
    `макс. пауза ${(maxGap(doc.words) / 1e6).toFixed(2)} с; ai-platform ${doc.asr!.ai_platform_commit.slice(0, 7)}`;
  notes.push(`- ${line}`, "", "Текст:", "", `> ${doc.words.map((w) => w.text).join(" ")}`, "");
  console.log(line);
}, T);

it("kill -9 процесса ядра во время ASR → после рестарта воркер мёртв, задача pending → completed, r1 одна", async () => {
  const work = await mkdtemp(join(REPO, "tmp", "ms-asr-k9-"));
  const child = join(MS, "server/test/media/asr-kill9-child.mts");
  const node = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", child, ...args], { cwd: MS, encoding: "utf8", timeout: 900_000 });
  try {
    const start = node(["start", work, FIX, "talk-ru-cfr.mp4", "1500"]);
    expect(start.signal, start.stderr).toBe("SIGKILL");
    const resume = node(["resume", work]);
    expect(resume.status, resume.stderr).toBe(0);
    const out = JSON.parse(resume.stdout.trim().split("\n").at(-1)!) as {
      job: { status: string; attempt: number; output_refs: AsrTranscribeResult }; transcript: { id: string; current_revision: number } | null;
      revisions: number[]; pubs: { dest_rel: string; job_id: string; attempt: number }[];
      aliveBefore: string[]; aliveAfterBoot: string[]; aliveAfter: string[]; draftsBefore: string[]; draftsAfter: string[];
    };
    const line = `kill -9 во время ASR: воркер жив после смерти ядра — ${out.aliveBefore.length > 0 ? "да" : "нет"}, после старта ядра — ${out.aliveAfterBoot.length}; ` +
      `итог ${out.job.status}, попытка ${out.job.attempt}, drafts до рестарта ${JSON.stringify(out.draftsBefore)}`;
    console.log(line);
    notes.push(`- ${line}`);
    expect(out.aliveAfterBoot).toEqual([]);
    expect(out.job.status).toBe("completed");
    expect(out.job.attempt).toBeGreaterThanOrEqual(2);
    expect(out.revisions).toEqual([1]);
    expect(out.pubs).toHaveLength(1);
    expect(out.aliveAfter).toEqual([]);
    expect(out.draftsAfter).toEqual([]);
  } finally {
    await removeStore({ tmp: work, root: join(work, "store"), marker: undefined as never, guard: undefined as never });
  }
}, T);
