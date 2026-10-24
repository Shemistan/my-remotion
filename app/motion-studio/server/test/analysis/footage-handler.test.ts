// Task 30: обработчик `footage.analyze` — реальный ffmpeg на синтетическом прокси (смены сцен на
// 2 и 4 с), фейковые vision-detect (shell-скрипт) и рантайм агента (только логика): режимы
// vision / vision+llm / llm_only, рабочий каталог агента, frame_us, переотправка, чекпоинт, M3,
// отмена во время Vision и агента, вертикальное видео.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chmod, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FootageAgentOutput, FootageAnalysisSchema, type Job, JobErrorSchema } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import type { ZodType } from "zod";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { type AppConfig, loadConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as footageRepo from "../../src/db/repos/footage.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { type FootageAnalyzeDeps, type FootageAnalyzeResult, agentBatches, footageAnalyze, footageIdFor } from "../../src/pipeline/footage-analyze.js";
import { sweepAgentCwds } from "../../src/scenes/store.js";
import { asset } from "../db/video-fixtures.js";
import { type TestStore, makeStore, removeStore } from "../db/helpers.js";

let s: TestStore;
let db: Db;
let config: AppConfig;
let n = 0;
let landscape: string;
let portrait: string;
let bins: string;

/** Фейковый vision-detect: лицо справа (координаты Vision, снизу слева) на каждом кадре. */
const FACE_JSON = '"faces":[{"x":0.55,"y":0.4,"w":0.25,"h":0.45,"confidence":0.9}]';

async function bin(name: string, body: string): Promise<string> {
  const p = join(bins, name);
  await writeFile(p, `#!/bin/sh\n${body}\n`);
  await chmod(p, 0o755);
  return p;
}
const echoFrames = (faces: string) => `printf '['
sep=''
for p in "$@"; do printf '%s{"path":"%s","width":640,"height":360,${faces},"humans":[],"hands":[],"saliency":[]}' "$sep" "$p"; sep=','; done
printf ']\\n'`;

beforeAll(async () => {
  s = await makeStore("ms-footage-");
  db = openDb(s.root);
  await migrate(db);
  config = loadConfig({ MS_DATA_DIR: s.root });
  bins = join(s.tmp, "bins");
  await mkdir(bins);
  landscape = join(s.tmp, "cuts.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2", "-f", "lavfi", "-i", "smptebars=s=640x360:r=30:d=2",
    "-f", "lavfi", "-i", "mandelbrot=s=640x360:r=30", "-filter_complex", "[2:v]trim=duration=2,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1:a=0",
    "-c:v", "libx264", "-g", "60", "-pix_fmt", "yuv420p", landscape,
  ]);
  portrait = join(s.tmp, "portrait.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", portrait]);
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

/** Видеопроект с исходником и прокси (копия синтетического ролика). */
async function videoProject(o: { video?: string; durationUs?: number; width?: number; height?: number } = {}): Promise<{ projectId: string; mediaId: string }> {
  const k = ++n;
  const projectId = `p${k}`;
  const mediaId = `med_${k}`;
  projects.create(db, { id: projectId, kind: "video", title: `Видео ${k}` });
  const a = asset({ id: mediaId, project_id: projectId, rel_path: `workspace/projects/${projectId}/source/${mediaId}/original.mov` });
  a.probe.duration_us = o.durationUs ?? 6_000_000;
  if (a.probe.video) Object.assign(a.probe.video, { width: o.width ?? 640, height: o.height ?? 360, display_width: o.width ?? 640, display_height: o.height ?? 360 });
  media.insert(db, a);
  const rel = `workspace/projects/${projectId}/proxy/${mediaId}/proxy.mp4`;
  await mkdir(join(s.root, rel, ".."), { recursive: true });
  await copyFile(o.video ?? landscape, join(s.root, rel));
  media.setDerivative(db, mediaId, { kind: "proxy", rel_path: rel, sha256: "c".repeat(64), params: {} });
  return { projectId, mediaId };
}

type Reply = (task: AgentTask<unknown>, signal: AbortSignal) => Promise<Partial<AgentResult<unknown>>>;
function fakeAgents(replies: Reply[]): AgentRuntimeAdapter & { tasks: AgentTask<unknown>[] } {
  const tasks: AgentTask<unknown>[] = [];
  return {
    tasks,
    capabilities: async () => ({ available: true }),
    run: async <I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>> => {
      tasks.push(task as AgentTask<unknown>);
      const reply = replies.shift();
      if (!reply) throw new Error("лишний вызов агента");
      const r = await reply(task as AgentTask<unknown>, signal);
      const now = new Date().toISOString();
      const out = r.output === undefined ? undefined : schema.parse(r.output);
      return {
        status: "completed", usage: { model: "sonnet", inputTokens: 1000, outputTokens: 100, costUsd: 0.05 }, permissionDenials: [],
        stdoutPath: "", stderrPath: "", startedAt: now, finishedAt: now, ...r, ...(out !== undefined ? { output: out } : {}),
      } as AgentResult<O>;
    },
  };
}

/** Ответ агента по шотам из задачи: позиция `right`, объект на первом кадре шота. */
function answerFromTask(task: AgentTask<unknown>, over: (shot: string, firstUs: number) => Partial<FootageAgentOutput["shots"][number]> = () => ({})): FootageAgentOutput {
  const text = String(task.input);
  const shots = [...text.matchAll(/^## (sh_\d+)/gm)].map((m) => m[1]!);
  return {
    shots: shots.map((id) => {
      const first = Number(new RegExp(`## ${id}[^\\n]*\\n- frame_us (\\d+)`).exec(text)![1]);
      return { shot_id: id, author_position: "right", motion: "static", gestures: "low", objects: [], background: "тестовая таблица", notes: "синтетика", uncertainty: [], ...over(id, first) };
    }),
  };
}

const sem = () => new AttemptPermits(new Semaphore(2));
function context(job: Job, attempt: number, ac: AbortController, events: { kind: string; message: string; data?: unknown }[]): JobContext {
  return {
    db, job, attempt, signal: ac.signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message, data) => events.push({ kind, message, data }),
    progress: () => undefined, fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
}

interface RunOpts {
  useAgent?: boolean;
  agents?: AgentRuntimeAdapter;
  visionBin?: string;
  jobId?: string;
  noFinish?: boolean;
  deps?: Partial<FootageAnalyzeDeps>;
  onStart?: (ac: AbortController, job: Job) => void;
}

async function analyze(p: { projectId: string; mediaId: string }, o: RunOpts = {}) {
  if (!o.jobId) {
    enqueue(db, { type: "footage.analyze", projectId: p.projectId, input: { projectId: p.projectId, mediaId: p.mediaId, ...(o.useAgent !== undefined ? { useAgent: o.useAgent } : {}) }, idempotencyKey: `ft${++n}` });
  }
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  expect(claim, "задача не захвачена").toBeTruthy();
  const { job, attempt } = claim;
  const ac = new AbortController();
  const events: { kind: string; message: string; data?: unknown }[] = [];
  o.onStart?.(ac, job);
  const deps: FootageAnalyzeDeps = {
    root: s.root, config, storage: s.guard, agents: o.agents ?? fakeAgents([]), visionBin: o.visionBin ?? join(bins, "absent"), ...o.deps,
  };
  const r: HandlerResult = await footageAnalyze(() => deps)(context(job, attempt, ac, events));
  if (!o.noFinish) finish(db, job.id, attempt, r);
  if (r.status === "failed" || r.status === "cancelled" || r.status === "blocked") expect(JobErrorSchema.safeParse(r.error).success, JSON.stringify(r.error)).toBe(true);
  return { r, job, attempt, events, out: (r.status === "completed" ? r.outputRefs : undefined) as FootageAnalyzeResult | undefined };
}

const docOf = (out: FootageAnalyzeResult) => FootageAnalysisSchema.parse(JSON.parse(readFileSync(join(s.root, out.rel_path), "utf8")));
const draftsOf = (jobId: string) => (existsSync(join(s.root, "workspace/drafts")) ? readdirSync(join(s.root, "workspace/drafts")).filter((x) => x.startsWith(jobId)) : []);
const agentCwds = () => (existsSync(join(s.root, "run/agent-cwd")) ? readdirSync(join(s.root, "run/agent-cwd")) : []);
const liveProcs = async () => (await readdir(join(s.root, "run/processes")).catch(() => [] as string[])).filter((x) => x.endsWith(".json"));

describe("footage.analyze", () => {
  it("useAgent: false + Vision: 3 шота, ≥ 3 кадров у каждого, лицо справа, свободна левая треть; опубликовано с кадрами", async () => {
    const vision = await bin("vision-face.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const { out, events, job } = await analyze(p, { useAgent: false, visionBin: vision });
    expect(out, JSON.stringify(events)).toBeDefined();
    expect(out).toMatchObject({ mode: "vision", reused: false, shots: 3, vision: { status: "ok" }, agent: { status: "skipped" } });
    const doc = docOf(out!);
    expect(doc.id).toBe(footageIdFor(job.id));
    expect(doc.shots.map((x) => [x.source_start_us, x.source_end_us])).toEqual([[0, expect.any(Number)], [expect.any(Number), expect.any(Number)], [expect.any(Number), 6_000_000]]);
    for (const sh of doc.shots) {
      expect(sh.keyframes.length).toBeGreaterThanOrEqual(3);
      for (const k of sh.keyframes) {
        expect(k.us).toBeGreaterThanOrEqual(sh.source_start_us);
        expect(k.us).toBeLessThan(sh.source_end_us);
        expect(existsSync(join(s.root, out!.rel_path, "..", k.path))).toBe(true);
      }
      expect(sh.face).toMatchObject({ detected_ratio: 1, source: "vision", union: { x: 0.4875, y: 0.0375 } });
      expect(sh.author_position).toBe("right");
      expect(sh.free_zones.find((z) => z.zone === "left_third")!.free_ratio).toBe(1);
      expect(sh.uncertainty).toContain("движение камеры не оценено");
    }
    expect(existsSync(join(s.root, out!.rel_path, "..", "detections.json"))).toBe(true);
    expect(footageRepo.latest(db, p.projectId)).toMatchObject({ id: doc.id, mode: "vision", rel_path: out!.rel_path });
    expect(draftsOf(job.id)).toEqual([]);
    expect(await liveProcs()).toEqual([]);
  });

  it("нет бинарника → llm_only; без агента зон нет (не «всё свободно»), событие", async () => {
    const p = await videoProject();
    const { out, events } = await analyze(p, { useAgent: false });
    expect(out).toMatchObject({ mode: "llm_only", vision: { status: "unavailable" } });
    expect(events.map((e) => e.kind)).toContain("vision_unavailable");
    for (const sh of docOf(out!).shots) {
      expect(sh.free_zones).toEqual([]);
      expect(sh.face.source).toBe("llm");
      expect(sh.uncertainty).toContain("низкая уверенность зон: нет детектора Vision");
    }
  });

  it("сбой vision-detect → llm_only с событием, задача не падает", async () => {
    const broken = await bin("vision-broken.sh", "echo 'Vision упал' >&2; exit 3");
    const p = await videoProject();
    const { out, events } = await analyze(p, { useAgent: false, visionBin: broken });
    expect(out).toMatchObject({ mode: "llm_only", vision: { status: "failed" } });
    expect(events.find((e) => e.kind === "vision_failed")?.message).toMatch(/Vision упал/);
  });

  it("агент: только Read, cwd с кадрами, detections.json и checklist.md; таймкодов нет, кроме frame_us; объект с чужим frame_us отброшен", async () => {
    const vision = await bin("vision-face2.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    let seen: { files: string[]; frames: string[]; checklist: string } | undefined;
    const agents = fakeAgents([async (task) => {
      const dir = task.workdir;
      seen = { files: readdirSync(dir).sort(), frames: readdirSync(join(dir, "frames")).sort(), checklist: readFileSync(join(dir, "checklist.md"), "utf8") };
      return { output: answerFromTask(task, (id, first) => (id === "sh_1"
        ? { author_position: "left", objects: [{ kind: "object", label: "экран", frame_us: first, rect: { x: 0.05, y: 0.5, w: 0.3, h: 0.3 }, important: true }, { kind: "object", label: "призрак", frame_us: first + 1, rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, important: true }] }
        : {})) };
    }]);
    const { out, events } = await analyze(p, { agents, visionBin: vision });
    expect(out, JSON.stringify(events)).toBeDefined();
    expect(agents.tasks).toHaveLength(1);
    const t = agents.tasks[0]!;
    expect(t.role).toBe("footage_analyst");
    expect(t.tools).toEqual(["Read"]);
    expect(t.workdir).toMatch(/run\/agent-cwd\/job_[0-9A-Z]+-a1-footage_analyst$/);
    expect(seen!.files).toEqual(["checklist.md", "detections.json", "frames"]);
    expect(seen!.frames.length).toBe(out!.keyframes);
    expect(String(t.input)).not.toMatch(/\d+[,.]\d+\s*с\b|\d\d:\d\d/); // ни секунд, ни таймкодов
    expect(existsSync(t.workdir)).toBe(false); // рабочий каталог убран после вызова
    expect(out).toMatchObject({ mode: "vision+llm", agent: { status: "completed", calls: 1, batches: 1, dropped_objects: 1, cost_usd: 0.05 } });
    const doc = docOf(out!);
    expect(doc.shots[0]!.occupied).toContainEqual({ x: 0.05, y: 0.5, w: 0.3, h: 0.3 });
    expect(doc.shots[0]!.occupied).toContainEqual(expect.objectContaining({ x: 0.4875 })); // лицо не удалено
    expect(doc.shots[0]!.uncertainty).toEqual(expect.arrayContaining(["расхождение детектора и агента", "агент указал кадр не из списка"]));
    expect(doc.shots[1]!.uncertainty).not.toContain("расхождение детектора и агента");
    expect(events.map((e) => e.kind)).toContain("agent_objects_dropped");
  });

  it("ответ не прошёл схему — ровно одна переотправка; второй отказ — анализ по детектору", async () => {
    const vision = await bin("vision-face3.sh", echoFrames(FACE_JSON));
    const schemaFail: Reply = async () => ({ status: "failed", error: { kind: "schema", message: "structured_output не прошёл схему: shots.0.motion" } });
    const p = await videoProject();
    const a = fakeAgents([schemaFail, async (task) => ({ output: answerFromTask(task) })]);
    const { out, events } = await analyze(p, { agents: a, visionBin: vision });
    expect(a.tasks).toHaveLength(2);
    expect(String(a.tasks[1]!.input)).toMatch(/Прошлый ответ отклонён/);
    expect(out).toMatchObject({ mode: "vision+llm", agent: { status: "completed", retried: 1 } });
    expect(events.map((e) => e.kind)).toContain("agent_retry");

    const p2 = await videoProject();
    const b = fakeAgents([schemaFail, schemaFail]);
    const two = await analyze(p2, { agents: b, visionBin: vision });
    expect(b.tasks).toHaveLength(2);
    expect(two.out).toMatchObject({ mode: "vision", agent: { status: "failed" } });
  });

  it("бюджет analysis.maxCostUsd исчерпан — агент не запускается, анализ по детектору", async () => {
    const vision = await bin("vision-face4.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const saved = config.analysis.maxCostUsd;
    config.analysis.maxCostUsd = 0.1;
    try {
      const a = fakeAgents([]);
      const { out, events } = await analyze(p, { agents: a, visionBin: vision });
      expect(a.tasks).toHaveLength(0);
      expect(out).toMatchObject({ mode: "vision", agent: { status: "budget" } });
      expect(events.find((e) => e.kind === "budget")?.message).toMatch(/бюджет анализа/);
    } finally {
      config.analysis.maxCostUsd = saved;
    }
  });

  it("M3 и чекпоинт: попытка 1 получила ответ агента и упала до публикации → попытка 2 без агента; опубликованный анализ — reused", async () => {
    const vision = await bin("vision-face5.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const a1 = fakeAgents([async (task) => ({ output: answerFromTask(task) })]);
    const first = await analyze(p, { agents: a1, visionBin: vision, noFinish: true, deps: { onStage: (st) => { if (st === "publish") throw new Error("сбой до публикации"); } } });
    expect(first.r.status).toBe("failed");
    expect(draftsOf(first.job.id)).toEqual([]);
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const a2 = fakeAgents([]);
    const second = await analyze(p, { jobId: first.job.id, agents: a2, visionBin: vision, noFinish: true });
    expect(second.attempt).toBe(2);
    expect(second.out, JSON.stringify(second.r)).toMatchObject({ mode: "vision+llm", agent: { status: "completed", calls: 0, from_checkpoint: 1 } });
    expect(a2.tasks).toHaveLength(0);
    // попытка 3 (сбой после COMMIT, до finish): анализ уже опубликован — без ffmpeg и агента
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const third = await analyze(p, { jobId: first.job.id, agents: fakeAgents([]), visionBin: join(bins, "absent") });
    expect(third.out).toMatchObject({ reused: true, footage_id: second.out!.footage_id, mode: "vision+llm" });
    expect(third.events.map((e) => e.kind)).toContain("footage_reused");
    expect(db.prepare("SELECT COUNT(*) AS c FROM footage_analyses WHERE project_id = ?").get(p.projectId)).toEqual({ c: 1 });
  });

  it("отмена во время Vision: процесс убит, cancelled, draft и записи процессов убраны", async () => {
    const slow = await bin("vision-slow.sh", "exec sleep 30");
    const p = await videoProject();
    let ac!: AbortController;
    let job!: Job;
    const t0 = Date.now();
    const { r } = await analyze(p, {
      useAgent: false, visionBin: slow, onStart: (a, j) => ((ac = a), (job = j)),
      deps: { onStage: (st) => { if (st === "vision") setTimeout(() => { requestCancel(db, job.id, { attemptAlive: true }); ac.abort(); }, 300); } },
    });
    expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(draftsOf(job.id)).toEqual([]);
    expect(await liveProcs()).toEqual([]);
    expect(footageRepo.latest(db, p.projectId)).toBeUndefined();
  });

  it("отмена во время агента → cancelled, анализа нет, draft не остался", async () => {
    const vision = await bin("vision-face6.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    let started!: () => void;
    const called = new Promise<void>((res) => (started = res));
    const agents = fakeAgents([async (_t, signal) => {
      started();
      await new Promise<void>((res) => signal.addEventListener("abort", () => res(), { once: true }));
      return { status: "cancelled", error: { kind: "cancelled", message: "отменено" } };
    }]);
    let ac!: AbortController;
    let job!: Job;
    const run = analyze(p, { agents, visionBin: vision, onStart: (a, j) => ((ac = a), (job = j)) });
    await called;
    requestCancel(db, job.id, { attemptAlive: true });
    ac.abort();
    const { r } = await run;
    expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(footageRepo.latest(db, p.projectId)).toBeUndefined();
    expect(draftsOf(job.id)).toEqual([]);
    expect(agentCwds()).toEqual([]); // копии кадров порции не остались (m6)
  });

  it("вертикальное видео (один шот на весь ролик): кадры 360×640 — длинная сторона 640", async () => {
    const vision = await bin("vision-face7.sh", echoFrames(FACE_JSON));
    const p = await videoProject({ video: portrait, durationUs: 3_000_000, width: 360, height: 640 });
    const { out } = await analyze(p, { useAgent: false, visionBin: vision });
    const doc = docOf(out!);
    expect(doc.shots).toHaveLength(1);
    expect(doc.shots[0]!.keyframes).toHaveLength(3);
    const png = join(s.root, out!.rel_path, "..", doc.shots[0]!.keyframes[0]!.path);
    expect(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", png]).toString().trim()).toBe("360,640");
  });

  it("ревью Task 30: несколько порций, порция 2 сбой → partial; чекпоинт порции 1 переносится в попытку 2, порции 2–3 зовутся заново", async () => {
    const vision = await bin("vision-face8.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const ok: Reply = async (task) => ({ output: answerFromTask(task) });
    const broken: Reply = async () => ({ status: "failed", error: { kind: "cli", message: "claude упал" } });
    const a1 = fakeAgents([ok, broken]);
    // порция = один шот (3 кадра); попытка 1 падает до публикации, чтобы проверить перенос чекпоинта
    const first = await analyze(p, { agents: a1, visionBin: vision, noFinish: true, deps: { agentBatchFrames: 3, onStage: (st) => { if (st === "publish") throw new Error("сбой до публикации"); } } });
    expect(first.r.status).toBe("failed");
    expect(a1.tasks).toHaveLength(2); // порция 3 не звалась после сбоя порции 2
    expect(first.events.find((e) => e.kind === "agent_failed")?.message).toMatch(/часть шотов/);
    expect(agentCwds()).toEqual([]);
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const a2 = fakeAgents([ok, ok]);
    const second = await analyze(p, { jobId: first.job.id, agents: a2, visionBin: vision, deps: { agentBatchFrames: 3 } });
    expect(second.out, JSON.stringify(second.r)).toMatchObject({ mode: "vision+llm", agent: { status: "completed", batches: 3, calls: 2, from_checkpoint: 1 } });
    expect(a2.tasks.map((t) => [...String(t.input).matchAll(/^## (sh_\d+)/gm)].map((m) => m[1]))).toEqual([["sh_2"], ["sh_3"]]);
    for (const sh of docOf(second.out!).shots) expect(sh.uncertainty).not.toContain("агент не описал шот");

    // без падения публикации: сбой порции 2 → partial, шоты 2–3 по детектору
    const p2 = await videoProject();
    const part = await analyze(p2, { agents: fakeAgents([ok, broken]), visionBin: vision, deps: { agentBatchFrames: 3 } });
    expect(part.out).toMatchObject({ mode: "vision+llm", agent: { status: "partial", calls: 2 } });
    const doc = docOf(part.out!);
    expect(doc.shots[0]!.uncertainty).not.toContain("агент не описал шот");
    expect(doc.shots[1]!.uncertainty).toContain("агент не описал шот");
  });

  it("ревью Task 30: бюджет кончился между порциями — порция 1 учтена, остальные не зовутся, статус budget", async () => {
    const vision = await bin("vision-face9.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const saved = config.analysis.maxCostUsd;
    config.analysis.maxCostUsd = 0.52; // вызов стоит $0,05; после него свободно $0,47 < MIN_CALL_USD ($0,5)
    try {
      const a = fakeAgents([async (task) => ({ output: answerFromTask(task) })]);
      const { out, events } = await analyze(p, { agents: a, visionBin: vision, deps: { agentBatchFrames: 3 } });
      expect(a.tasks).toHaveLength(1);
      expect(out).toMatchObject({ mode: "vision+llm", agent: { status: "budget", calls: 1, cost_usd: 0.05, batches: 3 } });
      expect(events.find((e) => e.kind === "budget")?.message).toMatch(/часть шотов/);
      const doc = docOf(out!);
      expect(doc.shots[0]!.notes).toMatch(/синтетика/);
      expect(doc.shots[2]!.uncertainty).toContain("агент не описал шот");
      expect(agentCwds()).toEqual([]);
    } finally {
      config.analysis.maxCostUsd = saved;
    }
  });

  it("ревью Task 30, m1/m2: шоты чужой порции и повторы отброшены; их объекты не считаются в dropped_objects", async () => {
    const vision = await bin("vision-face10.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const intruder = (id: string): FootageAgentOutput["shots"][number] => ({
      shot_id: id, author_position: "left", motion: "moving", gestures: "high", background: "чужой", notes: "подмена", uncertainty: [],
      objects: [{ kind: "object", label: "x", frame_us: 1, rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, important: true }],
    });
    const a = fakeAgents([
      // порция 1 (sh_1) отвечает ещё и за sh_2 и sh_9; порция 2 (sh_2) дублирует sh_2
      async (task) => ({ output: { shots: [...answerFromTask(task).shots, intruder("sh_2"), intruder("sh_9")] } }),
      async (task) => ({ output: { shots: [...answerFromTask(task).shots, intruder("sh_2")] } }),
      async (task) => ({ output: answerFromTask(task) }),
    ]);
    const { out, events } = await analyze(p, { agents: a, visionBin: vision, deps: { agentBatchFrames: 3 } });
    expect(out).toMatchObject({ agent: { status: "completed", dropped_objects: 0 } });
    const doc = docOf(out!);
    expect(doc.shots[1]!.motion).toBe("static"); // ответ своей порции, не подмена
    expect(doc.shots[1]!.notes).not.toMatch(/подмена/);
    const unknown = events.filter((e) => e.kind === "agent_unknown_shots").map((e) => e.message);
    expect(unknown).toHaveLength(2);
    expect(unknown[0]).toMatch(/порция 1.*sh_2, sh_9/);
    expect(unknown[1]).toMatch(/порция 2.*sh_2/);
  });

  it("ревью Task 30, m6: сбой и отмена вызова агента — run/agent-cwd пуст; вызов отклонён рантаймом — копии кадров удалены, остался только маркер", async () => {
    const vision = await bin("vision-face11.sh", echoFrames(FACE_JSON));
    const p = await videoProject();
    const failing = fakeAgents([async () => ({ status: "failed", error: { kind: "cli", message: "упал" } })]);
    const f = await analyze(p, { agents: failing, visionBin: vision });
    expect(f.out).toMatchObject({ agent: { status: "failed" } });
    expect(agentCwds()).toEqual([]);

    const p2 = await videoProject();
    const throwing: AgentRuntimeAdapter = { capabilities: async () => ({ available: true }), run: async () => { throw new Error("рантайм отказал"); } };
    const t = await analyze(p2, { agents: throwing, visionBin: vision });
    expect(t.out).toMatchObject({ agent: { status: "failed" } });
    const left = agentCwds();
    expect(left).toHaveLength(1);
    expect(readdirSync(join(s.root, "run/agent-cwd", left[0]!))).toEqual([".quarantined"]);
    // восстановление на старте: процессов нет — каталог удалён целиком
    const swept = await sweepAgentCwds(s.root, fileProcessRegistry(s.root));
    expect(swept.removed).toHaveLength(1);
    expect(agentCwds()).toEqual([]);
  });

  it("ревью Task 30, m4: длительность исходника 0 → media_invalid, ffmpeg не запускается", async () => {
    const p = await videoProject({ durationUs: 0 });
    const { r } = await analyze(p, { useAgent: false });
    expect(r).toMatchObject({ status: "failed", error: { code: "media_invalid" } });
    expect(r.status === "failed" && r.error?.message).toMatch(/длительность 0/);
  });

  it("ревью Task 30, m7: детектор не прочитал кадр — задача не падает, событие, шот помечен", async () => {
    // первый переданный кадр — с error, остальные — с лицом
    const vision = await bin("vision-partial.sh", `printf '['
sep=''
k=0
for p in "$@"; do
  if [ $k -eq 0 ]; then printf '%s{"path":"%s","width":0,"height":0,"faces":[],"humans":[],"hands":[],"saliency":[],"error":"не читается как изображение"}' "$sep" "$p";
  else printf '%s{"path":"%s","width":640,"height":360,${FACE_JSON},"humans":[],"hands":[],"saliency":[]}' "$sep" "$p"; fi
  sep=','; k=$((k+1))
done
printf ']\\n'`);
    const p = await videoProject();
    const { out, events } = await analyze(p, { useAgent: false, visionBin: vision });
    expect(out).toMatchObject({ mode: "vision", vision: { status: "ok", message: expect.stringMatching(/не прочитано: 1/) } });
    expect(events.map((e) => e.kind)).toContain("vision_frame_errors");
    const doc = docOf(out!);
    expect(doc.shots[0]!.uncertainty).toContain("детектор не прочитал кадр");
    expect(doc.shots[0]!.face.detected_ratio).toBe(1);
    expect(doc.shots[1]!.uncertainty).not.toContain("детектор не прочитал кадр");
  });

  it("вход: чужой проект, нет прокси — понятный отказ prepare", async () => {
    const p = await videoProject();
    const other = await videoProject();
    enqueue(db, { type: "footage.analyze", projectId: p.projectId, input: { projectId: p.projectId, mediaId: other.mediaId }, idempotencyKey: `ft${++n}` });
    const { r } = await analyze(p, { jobId: "x" });
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare" } });
    expect(r.status === "failed" && r.error?.message).toMatch(/нет в проекте/);
  });
});

describe("agentBatches", () => {
  const sh = (id: string, k: number) => ({ shot_id: id, frames: Array.from({ length: k }, (_, i) => ({ us: i * 10 + 1, path: `frames/${i}.png` })) });
  it("порции ≤ 24 кадров, шот целиком; шот больше порции — прорежен; шоты без кадров пропущены", () => {
    const b = agentBatches([sh("a", 10), sh("b", 10), sh("c", 10), sh("d", 0), sh("e", 30)]);
    expect(b.map((x) => x.shots.map((y) => `${y.shot_id}:${y.frames.length}`))).toEqual([["a:10", "b:10"], ["c:10"], ["e:24"]]);
  });
});
