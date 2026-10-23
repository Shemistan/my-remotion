// Тестовые хуки приёмки (Task 22, `09` §5 п. 8–9): включаются только MS_TEST_HOOKS=1,
// маршрутов не регистрируют; взвод — файл `arm.json` в MS_TEST_HOOKS_DIR, одноразовый.
// stale-attempt: после рендера экспорта задача возвращается в очередь, новая попытка её
// захватывает, а старая доходит до публикации → fenced_out, draft в карантине, экспорт один.
// orphan: экспорт запускает процесс, игнорирующий SIGTERM, через spawnTracked (реестр попытки).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ExportRequest, type Settings, defaultSettings } from "@ms/contracts";
import { fileProcessRegistry, procInfo } from "@ms/core";
import type { ExportResult, ExportVersionRequest, exportVersion } from "@ms/render";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { testHooks } from "../../src/jobs/test-hooks.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { sceneExport } from "../../src/pipeline/scene-export.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { QUARANTINE } from "../../src/scenes/store.js";
import { removeStore } from "../db/helpers.js";
import { fakeRender, makeDeps, makeSkills, okStatus } from "../pipeline/helpers.js";
import { setupDb, until, type JobsEnv } from "./helpers.js";
import { ORPHAN_RENDER, killLeftovers, readPid, track, waitFor } from "./procs.js";

let env: JobsEnv;
let repo: SceneRepo;
let runner: JobRunner | undefined;
let hooksDir: string;
beforeEach(async () => {
  env = await setupDb("ms-test-hooks-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  hooksDir = join(env.s.tmp, "hooks");
  mkdirSync(hooksDir, { recursive: true });
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  killLeftovers();
  env.db.close();
  await removeStore(env.s);
});

const MP4: ExportRequest = { format: "mp4", crf: 18, scale: 1 };
const on = () => ({ MS_TEST_HOOKS: "1", MS_TEST_HOOKS_DIR: hooksDir, MS_DATA_DIR: env.s.root });

async function readyVersion(settings: Settings = defaultSettings()) {
  const d = await makeDeps(env.s.root, await makeSkills(env.s.tmp), { render: fakeRender({ png: true }).render });
  const r = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", pollMs: 5, handlers: { "playground.generate": playgroundGenerate({ deps: () => d, repo }) } });
  r.start();
  try {
    const scene = repo.createScene("playground", { prompt: "p", settings });
    const id = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { sceneId: scene.id, prompt: "p", settings }, idempotencyKey: `g-${scene.id}` }).job.id;
    await until(() => ["completed", "failed"].includes(jobs.get(env.db, id)!.status), "генерация", 20_000);
    return versions.listByScene(env.db, scene.id)[0]!;
  } finally {
    await r.stop({ abortRunning: true });
  }
}

/** Фейк exportVersion: пишет файл, probe под настройки; считает вызовы по попыткам. */
function fakeExport() {
  const calls: ExportVersionRequest[] = [];
  const fn = async (req: ExportVersionRequest): Promise<ExportResult> => {
    calls.push(req);
    writeFileSync(req.outPath, "video");
    const s = req.settings;
    return {
      ok: true, gate: [], tempo: null, warnings: [],
      probe: { durationMs: (s.duration_frames * 1000 * s.fps.den) / s.fps.num, width: s.width, height: s.height, fps: s.fps, codec: "h264", audioCodec: "aac" },
    };
  };
  return { fn: fn as typeof exportVersion, calls };
}

function startRunner(exp: typeof exportVersion, env2: NodeJS.ProcessEnv) {
  const hooks = testHooks(env2)!;
  const handlers = hooks.wrap({
    "scene.export": sceneExport({ repo, deps: () => ({ storage: () => okStatus(env.s.root), export: hooks.exportVersion(exp), alpha: async () => 0 }) }),
  });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", pollMs: 10, heartbeatMs: 50, handlers, abortTimeoutMs: 15_000 });
  runner.start();
}

const enqueueExport = (versionId: string, key: string) =>
  enqueue(env.db, { type: "scene.export", projectId: "playground", versionId, input: { versionId, request: MP4 }, idempotencyKey: key }).job;
const events = (id: string) => jobEvents.listSince(env.db, 0, { jobId: id, limit: 200 }).map((e) => `${e.kind}: ${e.message}`);
const done = (id: string) => ["completed", "failed", "cancelled", "blocked"].includes(jobs.get(env.db, id)!.status);

describe("testHooks", () => {
  it("выключены без MS_TEST_HOOKS=1; без MS_TEST_HOOKS_DIR — ошибка старта", () => {
    expect(testHooks({})).toBeUndefined();
    expect(testHooks({ MS_TEST_HOOKS: "0", MS_TEST_HOOKS_DIR: hooksDir })).toBeUndefined();
    expect(() => testHooks({ MS_TEST_HOOKS: "1", MS_DATA_DIR: env.s.root })).toThrow(/MS_TEST_HOOKS_DIR/);
  });

  it("включаются только на хранилище приёмки (*-acceptance) или во временном каталоге", () => {
    const hooks = (dataDir?: string) => testHooks({ MS_TEST_HOOKS: "1", MS_TEST_HOOKS_DIR: hooksDir, ...(dataDir === undefined ? {} : { MS_DATA_DIR: dataDir }) });
    expect(() => hooks()).toThrow(/MS_DATA_DIR/);
    expect(() => hooks("/Volumes/External SSD/MotionStudio")).toThrow(/-acceptance/);
    expect(() => hooks("/Volumes/External SSD/MotionStudio-acceptance-old")).toThrow(/-acceptance/);
    expect(() => hooks(join(tmpdir(), "..", "..", "MotionStudio"))).toThrow(/-acceptance/);
    expect(hooks("/Volumes/External SSD/MotionStudio-acceptance")).toBeDefined();
    expect(hooks("/Volumes/External SSD/MotionStudio-acceptance/")).toBeDefined();
    expect(hooks(env.s.root)).toBeDefined(); // tmp/ репозитория
    expect(hooks(join(tmpdir(), "ms-hooks-store"))).toBeDefined();
  });

  it.each([
    ["неизвестный хук", { hook: "explode" }, /неизвестный|explode/],
    ["orphan без cmd", { hook: "orphan", args: [] }, /cmd/],
    ["лишнее поле", { hook: "stale-attempt", extra: 1 }, /extra/],
  ])("arm.json не по форме (%s) — задача failed с явной ошибкой, экспорт не идёт", async (_name, arm, re) => {
    const v = await readyVersion();
    const exp = fakeExport();
    writeFileSync(join(hooksDir, "arm.json"), JSON.stringify(arm));
    startRunner(exp.fn, on());
    const job = enqueueExport(v.id, `bad-${String(_name)}`);
    await until(() => done(job.id), "экспорт", 10_000);
    const j = jobs.get(env.db, job.id)!;
    expect(j.status).toBe("failed");
    expect(j.error?.message).toMatch(/arm\.json/);
    expect(j.error?.message).toMatch(re);
    expect(exp.calls).toHaveLength(0);
  });

  it("без взвода — экспорт как обычно (одна попытка)", async () => {
    const v = await readyVersion();
    const exp = fakeExport();
    startRunner(exp.fn, on());
    const job = enqueueExport(v.id, "plain");
    await until(() => done(job.id), "экспорт", 10_000);
    expect(jobs.get(env.db, job.id)).toMatchObject({ status: "completed", attempt: 1 });
    expect(exp.calls).toHaveLength(1);
  });

  it("stale-attempt: новая попытка захватила задачу → публикация старой fenced_out, экспорт один", async () => {
    const v = await readyVersion();
    const exp = fakeExport();
    writeFileSync(join(hooksDir, "arm.json"), JSON.stringify({ hook: "stale-attempt" }));
    startRunner(exp.fn, on());
    const job = enqueueExport(v.id, "stale");
    await until(() => done(job.id), "экспорт", 15_000);
    const j = jobs.get(env.db, job.id)!;
    expect(j).toMatchObject({ status: "completed", attempt: 2 });
    // взвод одноразовый: забран попыткой 1
    expect(existsSync(join(hooksDir, "arm.json"))).toBe(false);
    expect(exp.calls.map((c) => c.run.attempt)).toEqual([1, 2]);
    // попытка 1 дошла до публикации позже попытки 2: её отказ — карантин draft с причиной
    const marker = join(env.s.root, "workspace/drafts", `${job.id}-a1`, QUARANTINE);
    // маркер появляется пустым (open "w") и дописывается: ждём содержимое, а не только файл
    await until(() => existsSync(marker) && readFileSync(marker, "utf8").length > 0, "карантин draft попытки 1", 10_000);
    expect(readFileSync(marker, "utf8")).toMatch(/fenced_out: попытка 1 задачи \S+ устарела \(текущая: 2\)/);
    // раннер тоже видит устаревшую попытку (heartbeat): событие fenced_out в журнале задачи
    expect(events(job.id).some((k) => k.startsWith("fenced_out: попытка 1 устарела"))).toBe(true);
    expect(events(job.id).some((k) => k.startsWith("test_hook:"))).toBe(true);
    // экспорт опубликован один раз — попыткой 2
    expect(exportsRepo.listByVersion(env.db, v.id)).toHaveLength(1);
    expect(jobs.get(env.db, job.id)).toMatchObject({ status: "completed", attempt: 2 });
  }, 30_000);

  it("orphan: процесс попытки в реестре, игнорирует SIGTERM; abort убивает его группу", async () => {
    const v = await readyVersion();
    const pidFile = join(env.s.tmp, "orphan.pid");
    writeFileSync(join(hooksDir, "arm.json"), JSON.stringify({ hook: "orphan", cmd: ORPHAN_RENDER, args: [pidFile] }));
    const exp = fakeExport();
    startRunner(exp.fn, on());
    const job = enqueueExport(v.id, "orphan");
    const grandchild = await waitFor(() => readPid(pidFile), "pid внука");
    track(grandchild);
    expect(await procInfo(grandchild)).toBeDefined();
    expect(jobs.get(env.db, job.id)!.status).toBe("running");
    // процесс записан в реестр попытки (раннер без registry — файловый run/processes/)
    const live = await fileProcessRegistry(env.s.root).live({ runId: job.id, attempt: 1 });
    expect(live.map((p) => p.cmd).join(" ")).toContain("orphan-render.sh");
    expect(exp.calls).toHaveLength(0);
    await runner!.stop({ abortRunning: true });
    runner = undefined;
    expect(await procInfo(grandchild)).toBeUndefined();
  }, 20_000);
});
