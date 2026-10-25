// Task 26: обработчик `asr.transcribe` с фейковым воркером (только логика: реальные ffmpeg и
// импорт Task 25, вместо mlx-модели — `fixtures/bin/fake-asr-worker.py` под системным python3).
// Хранилище — tmp/ репозитория; «ai-platform» и модели — tmp-каталоги с той же раскладкой.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Job, JobErrorSchema, TranscriptRevisionDocSchema } from "@ms/contracts";
import { fileProcessRegistry, groupExists, killGroup, spawnTracked } from "@ms/core";
import type { AsrConfig } from "../../src/config.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { type AsrTranscribeDeps, type AsrTranscribeResult, asrTranscribe, transcriptIdFor } from "../../src/pipeline/asr-transcribe.js";
import { mediaImport } from "../../src/pipeline/media-import.js";
import { sha256File } from "../../src/scenes/hash.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const FAKE = new URL("../fixtures/bin/fake-asr-worker.py", import.meta.url);
const PY = "/usr/bin/python3";

let s: TestStore;
let db: Db;
let clip: string;
let montage: string;
let cfg: AsrConfig;
let n = 0;

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
const sem = () => new AttemptPermits(new Semaphore(1));

beforeAll(async () => {
  s = await makeStore("ms-asr-handler-");
  db = openDb(s.root);
  await migrate(db);
  const roots = join(s.tmp, "media");
  await mkdir(roots, { recursive: true });
  clip = join(roots, "talk.mp4");
  // 6 с: тон, тишина 2–3,2 с, тон
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "aevalsrc='if(between(t,2,3.2),0,0.4*sin(2*PI*440*t))':s=48000:d=6",
    "-t", "6", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
  const aip = join(s.tmp, "ai-platform");
  montage = join(aip, "app/platform/aiplatform/montage");
  await mkdir(montage, { recursive: true });
  copyFileSync(FAKE, join(montage, "asr_worker.py"));
  const models = join(s.tmp, "models");
  await mkdir(join(models, "asr/whisper-large-v3-turbo"), { recursive: true });
  writeFileSync(join(models, "asr/whisper-large-v3-turbo/config.json"), "{}\n");
  cfg = {
    python: PY, worker: join(montage, "asr_worker.py"), modelsDir: models, model: "whisper-large-v3-turbo", language: "ru",
    expectedWorkerSha256: await sha256File(join(montage, "asr_worker.py")), timeoutMs: 60_000, noOutputTimeoutMs: 20_000,
  };
}, 60_000);
/**
 * Процессы тестов не переживают тест (утечка из ревью Task 28, L1): контроллеры всех задач и
 * незавершённые обработчики — в реестре; после теста — отмена всех, ожидание пустого реестра
 * процессов, оставшимся группам — SIGKILL и снятие записи.
 */
const controllers = new Set<AbortController>();
const running = new Set<Promise<unknown>>();
async function stopAll(): Promise<void> {
  for (const ac of controllers) ac.abort();
  controllers.clear();
  await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 10_000))]);
  running.clear();
  if (!s || !existsSync(s.root)) return;
  const reg = fileProcessRegistry(s.root);
  const until = Date.now() + 5_000;
  while ((await reg.live()).length > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  for (const p of await reg.live()) {
    killGroup(p.pgid, "SIGKILL");
    await reg.end(p, { code: null, signal: "SIGKILL" });
  }
}
afterEach(stopAll, 30_000);
afterAll(async () => {
  await stopAll();
  db?.close();
  if (s) await removeStore(s);
}, 30_000);
beforeEach(() => {
  rmSync(join(montage, "modes"), { recursive: true, force: true });
  rmSync(join(montage, "calls.jsonl"), { force: true });
});

/** Режим фейкового воркера для задач исходника `mediaId` (L3: свой у каждого теста, общего файла нет). */
const mode = (mediaId: string, m: Record<string, unknown>) => {
  mkdirSync(join(montage, "modes"), { recursive: true });
  writeFileSync(join(montage, "modes", `${mediaId}.json`), JSON.stringify(m));
};
const calls = (): { pid: number; key: string; argv: string[]; env: string[]; cwd: string }[] =>
  existsSync(join(montage, "calls.jsonl")) ? readFileSync(join(montage, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const storage: AsrTranscribeDeps["storage"] = async () => ({ ok: true, root: s.root, marker: s.marker, freeBytes: 50 * 1024 ** 3 });

/** Видеопроект с импортированным исходником (реальный media.import Task 25). */
async function videoProject(): Promise<{ projectId: string; mediaId: string }> {
  const projectId = `p${++n}`;
  projects.create(db, { id: projectId, kind: "video", title: `Видео ${n}` });
  enqueue(db, { type: "media.import", projectId, input: { projectId, method: "path", path: clip }, idempotencyKey: `imp${++n}` });
  const { job, attempt } = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  const ac = new AbortController();
  controllers.add(ac);
  const ctx = context(job, attempt, ac);
  const r = await mediaImport(() => ({
    root: s.root, media: { importRoots: [join(s.tmp, "media")], proxyShortSide: 720, thumbEveryUs: 2_000_000 }, storage, minFreeBytes: 1024 ** 3,
  }))(ctx);
  finish(db, job.id, attempt, r);
  expect(r.status, JSON.stringify(r)).toBe("completed");
  return { projectId, mediaId: media.byProject(db, projectId)!.id };
}

function context(job: Job, attempt: number, ac: AbortController, o: { heavy?: Semaphore; progress?: (p: number, st: string) => void; events?: { kind: string; message: string; data?: unknown }[] } = {}): JobContext {
  return {
    db, job, attempt, signal: ac.signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message, data) => o.events?.push({ kind, message, data }),
    progress: (p, st) => o.progress?.(p, st),
    fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: o.heavy ? new AttemptPermits(o.heavy) : sem(),
  };
}

interface RunOpts {
  input?: Record<string, unknown>;
  jobId?: string;
  noFinish?: boolean;
  heavy?: Semaphore;
  deps?: Partial<AsrTranscribeDeps>;
  onStart?: (ac: AbortController, job: Job) => void;
}

async function runAsr(projectId: string, mediaId: string, o: RunOpts = {}) {
  if (!o.jobId) enqueue(db, { type: "asr.transcribe", projectId, input: { projectId, mediaId, ...o.input }, idempotencyKey: `asr${++n}` });
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  expect(claim, "задача не захвачена").toBeTruthy();
  const { job, attempt } = claim;
  const ac = new AbortController();
  controllers.add(ac);
  const progress: [number, string][] = [];
  const events: { kind: string; message: string; data?: unknown }[] = [];
  o.onStart?.(ac, job);
  const deps: AsrTranscribeDeps = { root: s.root, asr: cfg, storage, ...o.deps };
  const work = asrTranscribe(() => deps)(context(job, attempt, ac, { heavy: o.heavy, progress: (p, st) => progress.push([p, st]), events }));
  running.add(work);
  let r: HandlerResult;
  try {
    r = await work;
  } finally {
    running.delete(work);
    controllers.delete(ac);
  }
  if (!o.noFinish) finish(db, job.id, attempt, r);
  return { r, job, attempt, progress, events };
}

const live = async () => fileProcessRegistry(s.root).live();
const draftsOf = (jobId: string) => (existsSync(join(s.root, "workspace/drafts")) ? readdirSync(join(s.root, "workspace/drafts")).filter((d) => d.startsWith(jobId)) : []);
const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitFor = async (cond: () => boolean, ms = 10_000) => {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error("не дождались условия");
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe("asr.transcribe", () => {
  it("фейковый воркер: ревизия r1 опубликована read-only, индекс в БД, аргументы массивом, env минимальный, прогресс", async () => {
    const { projectId, mediaId } = await videoProject();
    const seen: { cmd: string; env: NodeJS.ProcessEnv }[] = [];
    const spawn: typeof spawnTracked = (root, ref, cmd, args, opts) => {
      seen.push({ cmd, env: opts.env });
      return spawnTracked(root, ref, cmd, args, opts);
    };
    const { r, job, progress } = await runAsr(projectId, mediaId, { input: { hotwords: ["Claude Code"] }, deps: { spawn } });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const out = (r as { outputRefs: AsrTranscribeResult }).outputRefs;
    const trnId = transcriptIdFor(job.id);
    expect(out).toMatchObject({ transcript_id: trnId, revision: 1, words: 3, segments: 2, reused: false });
    const row = transcripts.get(db, trnId)!;
    expect(row).toMatchObject({ project_id: projectId, media_id: mediaId, current_revision: 1, language: "ru" });
    const rev = transcripts.revision(db, trnId, 1)!;
    const docPath = join(s.root, rev.rel_path);
    const doc = TranscriptRevisionDocSchema.parse(JSON.parse(readFileSync(docPath, "utf8")));
    expect(doc).toMatchObject({ revision: 1, author: "asr", language: "ru", media_sha256: media.get(db, mediaId)!.sha256, removed_word_ids: [] });
    expect(doc.asr).toMatchObject({ model: "whisper-large-v3-turbo", worker_sha256: cfg.expectedWorkerSha256 });
    expect(doc.asr!.ai_platform_commit).toMatch(/^([0-9a-f]{40}|unknown)$/);
    expect(doc.words.map((w) => w.text)).toEqual(["Привет.", "Мир", "пользователей."]);
    expect(doc.segments.map((x) => x.word_ids.length)).toEqual([2, 1]);
    expect(transcripts.words(db, trnId, 1)).toHaveLength(3);
    expect(statSync(docPath).mode & 0o222).toBe(0);
    expect(await sha256File(docPath)).toBe(rev.sha256);
    // воркер: python + путь воркера + аргументы, без shell; cwd — draft попытки; env — allowlist
    const [c] = calls();
    expect(c!.argv.slice(0, 2)).toEqual(["--kind", "whisper"]);
    expect(c!.argv).toContain("--hotwords");
    expect(c!.argv[c!.argv.indexOf("--hotwords") + 1]).toBe("Claude Code");
    expect(c!.argv).not.toContain("--splits"); // 6 с — один кусок
    expect(c!.argv[c!.argv.indexOf("--model") + 1]).toBe(join(cfg.modelsDir, "asr/whisper-large-v3-turbo"));
    // env, переданный процессу (сам python от xcrun может дописать свои переменные)
    const allowed = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "PYTHONNOUSERSITE", "PYTHONDONTWRITEBYTECODE", "PYTHONUNBUFFERED",
      "HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"];
    expect(seen).toHaveLength(1);
    expect(seen[0]!.cmd).toBe(PY);
    for (const k of Object.keys(seen[0]!.env)) expect(allowed, k).toContain(k);
    expect(seen[0]!.env).toMatchObject({ PYTHONNOUSERSITE: "1", HF_HUB_OFFLINE: "1", TMPDIR: c!.cwd });
    expect(c!.env).toContain("PYTHONNOUSERSITE");
    // cwd и --out — рабочий каталог попытки в run/tmp хранилища, не draft (в ревизию попадает только наше)
    expect(c!.cwd).toContain(join("run/tmp", `${job.id}-a1-asr-`));
    expect(c!.argv[c!.argv.indexOf("--out") + 1]).toBe(join(c!.cwd, "words.json"));
    expect(progress.some(([, st]) => /кусок 1 из 1/.test(st))).toBe(true);
    expect(progress.at(-1)).toEqual([1, "done"]);
    expect(draftsOf(job.id)).toEqual([]);
    expect(await live()).toEqual([]);
    // сырой вывод воркера сохранён рядом с ревизией
    expect(readdirSync(join(s.root, rev.rel_path, ".."))).toEqual(expect.arrayContaining(["transcript.json", "asr-worker.json"]));
  });

  it("M3: попытка 1 опубликовала r1 и упала до finish → попытка 2 завершается по опубликованному, r2 нет, воркер не запускается", async () => {
    const { projectId, mediaId } = await videoProject();
    const first = await runAsr(projectId, mediaId, { noFinish: true });
    expect(first.r.status).toBe("completed");
    const trnId = transcriptIdFor(first.job.id);
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    rmSync(join(montage, "calls.jsonl"), { force: true });
    // рабочий каталог попытки 1, оставленный kill -9 (ревью Task 26, m8), и чужой задачи
    const left = join(s.root, "run/tmp", `${first.job.id}-a1-asr-XXXX`);
    const foreign = join(s.root, "run/tmp", "job_01OTHER-a1-asr-YYYY");
    await mkdir(left, { recursive: true });
    await mkdir(foreign, { recursive: true });
    writeFileSync(join(left, "words.json"), "{}");
    const second = await runAsr(projectId, mediaId, { jobId: first.job.id });
    expect(second.attempt).toBe(2);
    expect(second.r).toMatchObject({ status: "completed", outputRefs: { transcript_id: trnId, revision: 1, reused: true } });
    expect(calls()).toEqual([]);
    expect(existsSync(left)).toBe(false);
    expect(existsSync(foreign)).toBe(true);
    rmSync(foreign, { recursive: true, force: true });
    expect(db.prepare("SELECT COUNT(*) FROM transcript_revisions WHERE transcript_id = ?").pluck().get(trnId)).toBe(1);
    expect(db.prepare("SELECT job_id, attempt FROM artifact_publications WHERE dest_rel LIKE ?").all(`%/transcript/${trnId}/%`)).toEqual([{ job_id: first.job.id, attempt: 1 }]);
    expect(draftsOf(first.job.id)).toEqual([]);
  });

  it("тишина в звуке → разрезы по silencedetect (кусок ≤ maxChunkS)", async () => {
    const { projectId, mediaId } = await videoProject();
    const { r } = await runAsr(projectId, mediaId, { deps: { maxChunkS: 4 } });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const argv = calls()[0]!.argv;
    const splits = argv[argv.indexOf("--splits") + 1]!.split(",").map(Number);
    expect(splits).toHaveLength(1);
    expect(splits[0]!).toBeGreaterThan(2);
    expect(splits[0]!).toBeLessThan(3.3); // середина тишины 2–3,2 с
  });

  it("heavy: две задачи разных проектов — вторая ждёт семафор и не запускает воркер", async () => {
    const a = await videoProject();
    const b = await videoProject();
    mode(a.mediaId, { hang: true });
    mode(b.mediaId, { hang: true });
    const heavy = new Semaphore(1);
    let acA: AbortController | undefined;
    let acB: AbortController | undefined;
    const stagesB: string[] = [];
    try {
      const pa = runAsr(a.projectId, a.mediaId, { heavy, onStart: (ac) => (acA = ac) });
      await waitFor(() => calls().length === 1);
      const pb = runAsr(b.projectId, b.mediaId, { heavy, onStart: (ac) => (acB = ac), deps: { onStage: (st) => void stagesB.push(st) } });
      await waitFor(() => stagesB.includes("heavy_wait"));
      await new Promise((r) => setTimeout(r, 1500));
      // вторая задача стоит на семафоре: до этапа transcribe не дошла, воркер не запущен
      expect(stagesB.at(-1)).toBe("heavy_wait");
      expect(stagesB).not.toContain("transcribe");
      expect(calls()).toHaveLength(1);
      acA!.abort();
      const ra = await pa;
      expect(ra.r.status).toBe("failed");
      await waitFor(() => calls().length === 2);
      expect(stagesB).toContain("transcribe");
      acB!.abort();
      const rb = await pb;
      expect(rb.r.status).toBe("failed");
      expect(rb.progress.some(([, st]) => st === "heavy_wait")).toBe(true);
      expect(await live()).toEqual([]);
    } finally {
      acA?.abort();
      acB?.abort();
    }
  }, 30_000);

  it("отмена: воркер висит → requestCancel + abort → группа убита, cancelled, транскрипта нет, draft убран", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { hang: true });
    let ac: AbortController | undefined;
    let job: Job | undefined;
    try {
      const p = runAsr(projectId, mediaId, { onStart: (a, j) => ((ac = a), (job = j)) });
      await waitFor(() => calls().length === 1);
      const pid = calls()[0]!.pid;
      expect(pidAlive(pid)).toBe(true);
      requestCancel(db, job!.id, { attemptAlive: true });
      ac!.abort();
      const { r } = await p;
      expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
      expect(pidAlive(pid)).toBe(false);
      expect(transcripts.byProject(db, projectId)).toBeUndefined();
      expect(draftsOf(job!.id)).toEqual([]);
      expect(await live()).toEqual([]);
    } finally {
      ac?.abort();
    }
  });

  it("воркер игнорирует SIGTERM → SIGKILL группе после паузы; прерывание (не отмена) → interrupted", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { hang: true, ignore_term: true });
    let ac: AbortController | undefined;
    try {
      const p = runAsr(projectId, mediaId, { onStart: (a) => (ac = a), deps: { killGraceMs: 300 } });
      await waitFor(() => calls().length === 1);
      const pid = calls()[0]!.pid;
      ac!.abort();
      const { r } = await p;
      expect(r).toMatchObject({ status: "failed", error: { code: "interrupted" } });
      expect(pidAlive(pid)).toBe(false);
      expect(groupExists(pid)).toBe(false);
      expect(await live()).toEqual([]);
    } finally {
      ac?.abort();
    }
  });

  it("группа не исчезла (orphaned) → blocked stale_process, draft в карантине", async () => {
    const { projectId, mediaId } = await videoProject();
    const spawn: typeof spawnTracked = async (...a) => ({ ...(await spawnTracked(...a)), orphaned: true });
    const { r, job } = await runAsr(projectId, mediaId, { deps: { spawn } });
    expect(r).toMatchObject({ status: "blocked", error: { code: "stale_process", stage: "orphaned" } });
    const d = draftsOf(job.id);
    expect(d).toHaveLength(1);
    expect(existsSync(join(s.root, "workspace/drafts", d[0]!, ".quarantined"))).toBe(true);
    expect(transcripts.byProject(db, projectId)).toBeUndefined();
  });

  it("нет вывода дольше noOutputTimeoutMs → failed asr_failed (transcribe), группа убита", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { hang: true, stdout: [] });
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, noOutputTimeoutMs: 700 }, killGraceMs: 200 } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_failed", stage: "transcribe", message: expect.stringMatching(/нет вывода/) } });
    expect(pidAlive(calls()[0]!.pid)).toBe(false);
    expect(await live()).toEqual([]);
  });

  it("общий таймаут timeoutMs при живом прогрессе → failed asr_failed (transcribe)", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { hang: true });
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, timeoutMs: 800 }, killGraceMs: 200 } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_failed", stage: "transcribe", message: expect.stringMatching(/не уложился/) } });
  });

  it("воркер упал с кодом ≠ 0 и stderr → failed asr_failed (transcribe) с хвостом stderr, транскрипта нет — не «ASR не установлен»", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { stderr: "Traceback (most recent call last):\nMemoryError: Metal OOM\n", exit: 3 });
    const { r, job } = await runAsr(projectId, mediaId);
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_failed", stage: "transcribe", message: expect.stringMatching(/код 3.*Metal OOM/s) } });
    expect(JobErrorSchema.safeParse((r as { error: unknown }).error).success).toBe(true);
    expect(transcripts.byProject(db, projectId)).toBeUndefined();
    expect(draftsOf(job.id)).toEqual([]);
  });

  const violations: [string, Record<string, unknown>, RegExp][] = [
    ["s > e (words-bad-order.json)", { raw: readFileSync(new URL("../fixtures/asr/words-bad-order.json", import.meta.url), "utf8") }, /контракт/],
    ["лишнее поле (words-extra-field.json)", { raw: readFileSync(new URL("../fixtures/asr/words-extra-field.json", import.meta.url), "utf8") }, /контракт/],
    ["вывод не JSON", { raw: "Segmentation fault?" }, /JSON/],
    ["пустой вывод", { raw: "" }, /пуст/],
    ["файл не записан", { no_out: true }, /пуст|не записал/],
    ["NaN во времени", { raw: '{"language":"ru","duration":6,"elapsed_s":1,"words":[{"w":"a","s":NaN,"e":1}]}' }, /JSON/],
    ["отрицательное время", { output: { language: "ru", duration: "auto", elapsed_s: 1, words: [{ w: "a", s: -1, e: 0.5 }] } }, /контракт/],
    ["длительность расходится > 0,1 с", { output: { language: "ru", duration: 9.5, elapsed_s: 1, words: [{ w: "a", s: 0.1, e: 0.5 }] } }, /длительност/],
    ["слово за пределами длительности", { output: { language: "ru", duration: "auto", elapsed_s: 1, words: [{ w: "a", s: 5.9, e: 7.5 }] } }, /за пределами/],
  ];
  for (const [name, m, re] of violations) {
    it(`нарушение контракта: ${name} → failed asr_contract_violation, transcripts пуст, вывод в журнале и в карантине`, async () => {
      const { projectId, mediaId } = await videoProject();
      mode(mediaId, m);
      const { r, job, events } = await runAsr(projectId, mediaId);
      expect(r).toMatchObject({ status: "failed", error: { code: "asr_contract_violation", message: expect.stringMatching(re) } });
      expect(transcripts.byProject(db, projectId)).toBeUndefined();
      expect(events.some((e) => e.kind === "asr_output_rejected")).toBe(true);
      const d = draftsOf(job.id);
      expect(d).toHaveLength(1);
      expect(existsSync(join(s.root, "workspace/drafts", d[0]!, ".quarantined"))).toBe(true);
    });
  }

  it("воркер вернул 0 слов → failed (речь не распознана), транскрипта нет", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { output: { language: "ru", duration: "auto", elapsed_s: 1, words: [] } });
    const { r } = await runAsr(projectId, mediaId);
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", message: expect.stringMatching(/речь не распознана/) } });
    expect(transcripts.byProject(db, projectId)).toBeUndefined();
  });

  it("контракт воркера изменился (sha256) → failed asr_contract_changed, воркер не запускается", async () => {
    const { projectId, mediaId } = await videoProject();
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, expectedWorkerSha256: "b".repeat(64) } } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_contract_changed" } });
    expect(calls()).toEqual([]);
  });

  it("python нет → failed asr_unavailable (python_missing); у исходника нет звука → failed no_audio", async () => {
    const { projectId, mediaId } = await videoProject();
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, python: join(s.tmp, "no-python") } } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_unavailable", message: expect.stringMatching(/python_missing/) } });
    // исходник без звука: строка media_assets без audio
    const silentId = "med_SILENT";
    const asset = media.get(db, mediaId)!;
    const p2 = `p${++n}`;
    projects.create(db, { id: p2, kind: "video", title: "без звука" });
    media.insert(db, { ...asset, id: silentId, project_id: p2, probe: { ...asset.probe, audio: undefined } as never });
    const { r: r2 } = await runAsr(p2, silentId);
    expect(r2).toMatchObject({ status: "failed", error: { code: "no_audio" } });
  });

  it("вход: hotwords с `|` или управляющими символами, чужой mediaId, projectId не тот → failed до воркера", async () => {
    const { projectId, mediaId } = await videoProject();
    for (const input of [{ hotwords: ["a|b"] }, { hotwords: ["x\u0007"] }, { language: "-h" }, { language: "xx" }, { language: "rus" }, { mediaId: "med_NOPE" }, { model: "large" }]) {
      const { r } = await runAsr(projectId, mediaId, { input });
      expect(r, JSON.stringify(input)).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare" } });
    }
    const other = await videoProject();
    const { r } = await runAsr(projectId, other.mediaId);
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare", message: expect.stringMatching(/не из проекта/) } });
    expect(calls()).toEqual([]);
  });

  it("хранилище недоступно → storage_unavailable", async () => {
    const { projectId, mediaId } = await videoProject();
    const { r } = await runAsr(projectId, mediaId, { deps: { storage: async () => ({ ok: false, reason: "offline", detail: "диск отключён" }) as never } });
    expect(r).toMatchObject({ status: "failed", error: { code: "storage_unavailable", stage: "storage" } });
  });

  it("порт ai-platform 8780 занят → предупреждение gpu_contention, задача идёт", async () => {
    const { projectId, mediaId } = await videoProject();
    const { r, events } = await runAsr(projectId, mediaId, { deps: { portBusy: async () => true } });
    expect(r.status).toBe("completed");
    expect(events.find((e) => e.kind === "gpu_contention")?.message).toMatch(/8780/);
  });

  it("ревью Task 26 (m7): sha256 воркера пересчитывается перед запуском (после heavy) — подмена → asr_contract_changed, воркер не запущен", async () => {
    const { projectId, mediaId } = await videoProject();
    let k = 0;
    const sha256 = async () => (++k === 1 ? cfg.expectedWorkerSha256 : "c".repeat(64));
    const { r } = await runAsr(projectId, mediaId, { deps: { capability: { sha256File: sha256 } } });
    expect(k).toBe(2);
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_contract_changed", message: expect.stringMatching(/c{64}/) } });
    expect(calls()).toEqual([]);
  });

  it("ревью Task 26 (m5): words.json больше лимита → asr_contract_violation по stat, файл не читается и не копируется", async () => {
    const { projectId, mediaId } = await videoProject();
    mode(mediaId, { raw: JSON.stringify({ language: "ru", duration: 6, elapsed_s: 1, words: Array.from({ length: 100 }, (_, i) => ({ w: "слово", s: i * 0.01, e: i * 0.01 })) }) });
    const { r, job } = await runAsr(projectId, mediaId, { deps: { maxOutputBytes: 1024 } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_contract_violation", message: expect.stringMatching(/больше 1024 байт/) } });
    const d = draftsOf(job.id);
    expect(d).toHaveLength(1);
    expect(existsSync(join(s.root, "workspace/drafts", d[0]!, "asr-worker.json"))).toBe(false);
  });

  it("ревью Task 26 (m6): звук длиннее видео → audio_duration_mismatch; слова за концом видео обрезаны с предупреждением", async () => {
    const { projectId, mediaId } = await videoProject();
    // видео «короче» звука: 3,5 с против 6 с
    db.prepare("UPDATE media_assets SET probe_json = json_set(probe_json, '$.duration_us', 3500000), duration_us = 3500000 WHERE id = ?").run(mediaId);
    mode(mediaId, { output: { language: "ru", duration: "auto", elapsed_s: 1, words: [{ w: "a", s: 0.1, e: 0.5 }, { w: "b", s: 3.2, e: 3.9 }, { w: "c", s: 4.2, e: 4.6 }] } });
    const { r, job, events } = await runAsr(projectId, mediaId);
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(events.find((e) => e.kind === "audio_duration_mismatch")?.message).toMatch(/длиннее/);
    expect(events.find((e) => e.kind === "words_trimmed")?.data).toMatchObject({ dropped: 1, clamped: 1 });
    const rev = transcripts.revision(db, transcriptIdFor(job.id), 1)!;
    const doc = TranscriptRevisionDocSchema.parse(JSON.parse(readFileSync(join(s.root, rev.rel_path), "utf8")));
    expect(doc.words.map((w) => [w.text, w.end_us])).toEqual([["a", 500_000], ["b", 3_500_000]]);
  });

  it("ревью Task 26 (m6): звук короче видео → audio_duration_mismatch «короче»", async () => {
    const { projectId, mediaId } = await videoProject();
    db.prepare("UPDATE media_assets SET probe_json = json_set(probe_json, '$.duration_us', 9000000), duration_us = 9000000 WHERE id = ?").run(mediaId);
    const { r, events } = await runAsr(projectId, mediaId);
    expect(r.status).toBe("completed");
    expect(events.find((e) => e.kind === "audio_duration_mismatch")?.message).toMatch(/короче/);
    expect(events.some((e) => e.kind === "words_trimmed")).toBe(false);
  });

  it("ревью Task 26 (m9): hotwords сверх окна промпта whisper — хвост списка отброшен с предупреждением", async () => {
    const { projectId, mediaId } = await videoProject();
    const many = Array.from({ length: 40 }, (_, i) => `термин${i}`);
    const { r, events } = await runAsr(projectId, mediaId, { input: { hotwords: many } });
    expect(r.status).toBe("completed");
    const ev = events.find((e) => e.kind === "hotwords_truncated");
    expect(ev).toBeTruthy();
    const argv = calls()[0]!.argv;
    const sent = argv[argv.indexOf("--hotwords") + 1]!.split("|");
    expect(sent).toEqual(many.slice(0, sent.length));
    expect(sent.length).toBeLessThan(many.length);
    expect((ev!.data as { dropped: string[] }).dropped).toEqual(many.slice(sent.length));
  });

  it("фикстура (ревью Task 28, L2): висящий воркер, чей родитель убит kill -9, выходит сам ≤ 2 с", async () => {
    const tag = `orphan_${process.pid}`;
    mode(tag, { hang: true });
    const argv = [join(montage, "asr_worker.py"), "--kind", "whisper", "--model", "m", "--audio", join(s.tmp, tag, "a.wav"), "--out", join(s.tmp, tag, "o.json")];
    // родитель — отдельный node: он запускает воркер в своей группе и печатает его pid
    const script = `const c = require("node:child_process").spawn(${JSON.stringify(PY)}, ${JSON.stringify(argv)}, { detached: true, stdio: "ignore" }); console.log(c.pid); setInterval(() => {}, 1000);`;
    const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "inherit"] });
    const pid = await new Promise<number>((res) => parent.stdout!.once("data", (d) => res(Number(String(d).trim()))));
    try {
      await waitFor(() => calls().some((c) => c.pid === pid && c["key"] === tag));
      expect(pidAlive(pid)).toBe(true);
      parent.kill("SIGKILL");
      const t0 = Date.now();
      await waitFor(() => !pidAlive(pid), 5_000);
      expect(Date.now() - t0).toBeLessThanOrEqual(2_000);
    } finally {
      parent.kill("SIGKILL");
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // уже вышел
      }
    }
  });
});
