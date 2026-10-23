// Task 26: обработчик `asr.transcribe` с фейковым воркером (только логика: реальные ffmpeg и
// импорт Task 25, вместо mlx-модели — `fixtures/bin/fake-asr-worker.py` под системным python3).
// Хранилище — tmp/ репозитория; «ai-platform» и модели — tmp-каталоги с той же раскладкой.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Job, TranscriptRevisionDocSchema } from "@ms/contracts";
import { fileProcessRegistry, groupExists, spawnTracked } from "@ms/core";
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
    python: PY, aiPlatformRoot: aip, modelsDir: models, model: "whisper-large-v3-turbo", language: "ru",
    expectedWorkerSha256: await sha256File(join(montage, "asr_worker.py")), timeoutMs: 60_000, noOutputTimeoutMs: 20_000,
  };
}, 60_000);
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});
beforeEach(() => {
  rmSync(join(montage, "fake-mode.json"), { force: true });
  rmSync(join(montage, "calls.jsonl"), { force: true });
});

const mode = (m: Record<string, unknown>) => writeFileSync(join(montage, "fake-mode.json"), JSON.stringify(m));
const calls = (): { pid: number; argv: string[]; env: string[]; cwd: string }[] =>
  existsSync(join(montage, "calls.jsonl")) ? readFileSync(join(montage, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const storage: AsrTranscribeDeps["storage"] = async () => ({ ok: true, root: s.root, marker: s.marker, freeBytes: 50 * 1024 ** 3 });

/** Видеопроект с импортированным исходником (реальный media.import Task 25). */
async function videoProject(): Promise<{ projectId: string; mediaId: string }> {
  const projectId = `p${++n}`;
  projects.create(db, { id: projectId, kind: "video", title: `Видео ${n}` });
  enqueue(db, { type: "media.import", projectId, input: { projectId, method: "path", path: clip }, idempotencyKey: `imp${++n}` });
  const { job, attempt } = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  const ctx = context(job, attempt, new AbortController());
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
  const progress: [number, string][] = [];
  const events: { kind: string; message: string; data?: unknown }[] = [];
  o.onStart?.(ac, job);
  const deps: AsrTranscribeDeps = { root: s.root, asr: cfg, storage, ...o.deps };
  const r: HandlerResult = await asrTranscribe(() => deps)(context(job, attempt, ac, { heavy: o.heavy, progress: (p, st) => progress.push([p, st]), events }));
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
    const second = await runAsr(projectId, mediaId, { jobId: first.job.id });
    expect(second.attempt).toBe(2);
    expect(second.r).toMatchObject({ status: "completed", outputRefs: { transcript_id: trnId, revision: 1, reused: true } });
    expect(calls()).toEqual([]);
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
    mode({ hang: true });
    const heavy = new Semaphore(1);
    let acA: AbortController | undefined;
    let acB: AbortController | undefined;
    let jobB: Job | undefined;
    const pa = runAsr(a.projectId, a.mediaId, { heavy, onStart: (ac) => (acA = ac) });
    await waitFor(() => calls().length === 1);
    const pb = runAsr(b.projectId, b.mediaId, { heavy, onStart: (ac, j) => ((acB = ac), (jobB = j)) });
    await new Promise((r) => setTimeout(r, 1500));
    expect(calls()).toHaveLength(1);
    expect(jobs.get(db, jobB!.id)!.stage ?? "").not.toBe("transcribe");
    acA!.abort();
    const ra = await pa;
    expect(ra.r.status).toBe("failed");
    await waitFor(() => calls().length === 2);
    acB!.abort();
    const rb = await pb;
    expect(rb.r.status).toBe("failed");
    expect(rb.progress.some(([, st]) => st === "heavy_wait")).toBe(true);
    expect(await live()).toEqual([]);
  }, 30_000);

  it("отмена: воркер висит → requestCancel + abort → группа убита, cancelled, транскрипта нет, draft убран", async () => {
    const { projectId, mediaId } = await videoProject();
    mode({ hang: true });
    let ac: AbortController | undefined;
    let job: Job | undefined;
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
  });

  it("воркер игнорирует SIGTERM → SIGKILL группе после паузы; прерывание (не отмена) → interrupted", async () => {
    const { projectId, mediaId } = await videoProject();
    mode({ hang: true, ignore_term: true });
    let ac: AbortController | undefined;
    const p = runAsr(projectId, mediaId, { onStart: (a) => (ac = a), deps: { killGraceMs: 300 } });
    await waitFor(() => calls().length === 1);
    const pid = calls()[0]!.pid;
    ac!.abort();
    const { r } = await p;
    expect(r).toMatchObject({ status: "failed", error: { code: "interrupted" } });
    expect(pidAlive(pid)).toBe(false);
    expect(groupExists(pid)).toBe(false);
    expect(await live()).toEqual([]);
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

  it("нет вывода дольше noOutputTimeoutMs → failed asr_unavailable, группа убита", async () => {
    const { projectId, mediaId } = await videoProject();
    mode({ hang: true, stdout: [] });
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, noOutputTimeoutMs: 700 }, killGraceMs: 200 } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_unavailable", message: expect.stringMatching(/нет вывода/) } });
    expect(pidAlive(calls()[0]!.pid)).toBe(false);
    expect(await live()).toEqual([]);
  });

  it("общий таймаут timeoutMs при живом прогрессе → failed asr_unavailable", async () => {
    const { projectId, mediaId } = await videoProject();
    mode({ hang: true });
    const { r } = await runAsr(projectId, mediaId, { deps: { asr: { ...cfg, timeoutMs: 800 }, killGraceMs: 200 } });
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_unavailable", message: expect.stringMatching(/не уложился/) } });
  });

  it("воркер упал с кодом ≠ 0 и stderr → failed asr_unavailable с хвостом stderr, транскрипта нет", async () => {
    const { projectId, mediaId } = await videoProject();
    mode({ stderr: "Traceback (most recent call last):\nMemoryError: Metal OOM\n", exit: 3 });
    const { r, job } = await runAsr(projectId, mediaId);
    expect(r).toMatchObject({ status: "failed", error: { code: "asr_unavailable", message: expect.stringMatching(/код 3.*Metal OOM/s) } });
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
      mode(m);
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
    mode({ output: { language: "ru", duration: "auto", elapsed_s: 1, words: [] } });
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
    for (const input of [{ hotwords: ["a|b"] }, { hotwords: ["x\u0007"] }, { language: "-h" }, { mediaId: "med_NOPE" }, { model: "large" }]) {
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
});
