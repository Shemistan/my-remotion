// Логика renderVersion на подменённом spawnTracked: без Chrome, бандла и ffprobe.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type SpawnTrackedOptions, type SpawnTrackedResult, groupExists, procInfo, safeMkdir } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CHROME_WRAPPER } from "../src/node/browser.js";
import { currentRenderConcurrency } from "../src/node/concurrency.js";
import { type RenderDeps, type RenderRequest, type RenderResult, WORKER_PATH, innerTimeoutMs, renderVersion } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const FFPROBE = "/fake/ffprobe";
const PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: "video", codec_name: "h264", width: 640, height: 360, r_frame_rate: "30/1" }],
  format: { duration: "2.0" },
});

interface Call { cmd: string; args: string[]; opts: SpawnTrackedOptions }
type Responder = (c: Call) => Promise<Partial<SpawnTrackedResult>> | Partial<SpawnTrackedResult>;

let tmp: string;
let req: RenderRequest;
let calls: Call[];

function deps(worker: Responder, probe: Responder = () => ({ stdout: PROBE_JSON })): RenderDeps {
  return {
    browserPath: async () => "/fake/chrome-headless-shell",
    ffprobeBin: async () => FFPROBE,
    spawn: async (_root, _ref, cmd, args, opts) => {
      const c = { cmd, args, opts };
      calls.push(c);
      const r = await (cmd === FFPROBE ? probe : worker)(c);
      return { code: 0, signal: null, stdout: "", stderr: "", orphaned: false, ...r };
    },
  };
}

function workerOut(result: object, extra: string[] = []): string {
  return [...extra, JSON.stringify(result)].join("\n") + "\n";
}

const okResult = (r: RenderRequest) => ({
  ok: true,
  stills: r.stills.map((f) => join(r.versionDir, "frames", `${f}.png`)),
  previewPath: join(r.versionDir, "preview.mp4"),
  browserLogs: [],
});

beforeEach(async () => {
  tmp = await makeTmp();
  const root = await makeStore(tmp);
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  req = {
    versionDir: await copyFixture("hello-scene", join(tmp, "v1")),
    settings: await fixtureSettings("hello-scene"),
    cacheDir,
    stills: [0, 30, 59],
    preview: { scale: 1, crf: 23 },
    timeoutMs: 60_000,
    run: { root, runId: "run1", attempt: 1 },
  };
  calls = [];
});
afterEach(() => removeTmp(tmp));

it("orphaned worker group is reported as stage orphaned, never as success", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({ orphaned: true, stdout: workerOut(okResult(req)) })));
  expect(r).toMatchObject({ ok: false, error: { stage: "orphaned" } });
  expect(r.error!.message).toMatch(/групп/);
  // ffprobe после неподтверждённой смерти группы не запускается
  expect(calls.map((c) => c.cmd)).toEqual([process.execPath]);
});

it("orphaned wins over a timeout as well", async () => {
  const r = await renderVersion({ ...req, timeoutMs: 20 }, undefined, deps(async (c) => {
    await new Promise((res) => c.opts.signal.addEventListener("abort", res));
    return { code: null, signal: "SIGKILL", orphaned: true };
  }));
  expect(r).toMatchObject({ ok: false, error: { stage: "orphaned" } });
});

it("orphaned ffprobe is reported as stage orphaned", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({ stdout: workerOut(okResult(req)) }), () => ({ orphaned: true })));
  expect(r).toMatchObject({ ok: false, error: { stage: "orphaned" } });
});

it("fresh store without run/processes: the directory exists before the worker (Chrome wrapper) starts", async () => {
  await rm(join(req.run.root, "run/processes"), { recursive: true, force: true });
  let seen: boolean | undefined;
  const r = await renderVersion(req, undefined, deps(() => {
    seen = existsSync(join(req.run.root, "run/processes"));
    return { stdout: workerOut(okResult(req)) };
  }));
  expect(seen).toBe(true);
  expect(r.ok).toBe(true);
});

it("success: parses the last stdout line, streams browser logs and probes the preview", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({
    stdout: workerOut(okResult(req), [
      "@@ms:stage bundle",
      `@@ms:log ${JSON.stringify("[log] привет\nвторая строка")}`,
      "какой-то шум remotion",
      "@@ms:stage media",
    ]),
  })));
  expect(r.ok).toBe(true);
  expect(r.error).toBeUndefined();
  expect(r.stills).toEqual([0, 30, 59].map((f) => join(req.versionDir, "frames", `${f}.png`)));
  expect(r.previewPath).toBe(join(req.versionDir, "preview.mp4"));
  expect(r.probe).toEqual({ durationMs: 2000, width: 640, height: 360, fps: { num: 30, den: 1 }, codec: "h264" });
  expect(r.browserLogs).toEqual(["[log] привет\nвторая строка"]);

  const [w, p] = calls;
  expect(w!.cmd).toBe(process.execPath);
  expect(w!.args.at(-1)).toBe(WORKER_PATH);
  expect(p!.args).toEqual(["-v", "error", "-print_format", "json", "-show_streams", "-show_format", r.previewPath]);
});

it("worker gets a minimal env, TMPDIR inside run/tmp and the job on stdin; run tmp is removed", async () => {
  await renderVersion(req, undefined, deps(() => ({ stdout: workerOut(okResult(req)) })));
  const w = calls[0]!;
  const childEnv = w.opts.env;
  expect(Object.keys(childEnv).sort()).toEqual(["HOME", "LANG", "PATH", "TMPDIR"]);
  const tmpdir = childEnv.TMPDIR!;
  expect(tmpdir.startsWith(join(req.run.root, "run", "tmp") + "/")).toBe(true);
  expect(w.opts.cwd).toBe(tmpdir);
  expect(existsSync(tmpdir)).toBe(false);

  const job = JSON.parse(w.opts.stdin!);
  expect(job).toMatchObject({
    entryPoint: expect.stringMatching(/entries\/[0-9a-f]{64}\/index\.tsx$/),
    bundleDir: expect.stringMatching(/bundles\/[0-9a-f]{64}$/),
    browserExecutable: CHROME_WRAPPER,
    chrome: "/fake/chrome-headless-shell",
    run: req.run,
    inputProps: { title: "Hello, Motion Studio" },
    composition: { width: 640, height: 360, fps: 30, durationInFrames: 60 },
    stills: [0, 30, 59].map((f) => ({ frame: f, out: join(req.versionDir, "frames", `${f}.png`) })),
    preview: { out: join(req.versionDir, "preview.mp4"), scale: 1, crf: 23 },
    timeoutMs: 54_000, // внутренний таймаут Remotion чуть меньше внешнего
    concurrency: currentRenderConcurrency(), // Task 49a: render.concurrency или по ядрам
  });
  // каталоги созданы: frames/ версии, entries/ и bundles/ кэша
  expect(existsSync(join(req.versionDir, "frames"))).toBe(true);
  // used/ — отметка использования ключа для уборки кэша (Task 49a)
  expect(readdirSync(req.cacheDir).sort()).toEqual(["bundles", "entries", "used"]);
  const key = basename(job.bundleDir as string);
  // отметка на пару (ключ, задача) — до записи в кэш (writeEntry → onKey)
  expect(JSON.parse(readFileSync(join(req.cacheDir, "used", key, `${req.run.runId}.json`), "utf8"))).toMatchObject({ job_id: req.run.runId });
});

it("worker error result is passed through with its stage", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({
    code: 1,
    stdout: workerOut({ ok: false, stills: [], browserLogs: ["[error] boom"], error: { stage: "still", message: "boom" } }),
  })));
  expect(r).toMatchObject({ ok: false, error: { stage: "still", message: "boom" }, browserLogs: ["[error] boom"] });
  expect(calls).toHaveLength(1);
});

it("worker crash without a result is attributed to the last started stage", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({
    code: null,
    signal: "SIGSEGV",
    stdout: "@@ms:stage bundle\n@@ms:stage still\n@@ms:stage media\n",
    stderr: "compositor упал\n",
  })));
  expect(r).toMatchObject({ ok: false, error: { stage: "media" } });
  expect(r.error!.message).toMatch(/SIGSEGV/);
  expect(r.error!.message).toMatch(/compositor упал/);
});

it("timeout kills the worker and reports stage timeout with the logs collected so far", async () => {
  const r = await renderVersion({ ...req, timeoutMs: 30 }, undefined, deps(async (c) => {
    await new Promise((res) => c.opts.signal.addEventListener("abort", res));
    return { code: null, signal: "SIGTERM", stdout: `@@ms:stage still\n@@ms:log ${JSON.stringify("[log] hang")}\n` };
  }));
  expect(r).toMatchObject({ ok: false, error: { stage: "timeout" }, browserLogs: ["[log] hang"] });
  expect(r.error!.message).toMatch(/30 мс/);
});

it("caller abort is reported as stage aborted", async () => {
  const ac = new AbortController();
  const r = await renderVersion(req, ac.signal, deps(async (c) => {
    setTimeout(() => ac.abort(), 5);
    await new Promise((res) => c.opts.signal.addEventListener("abort", res));
    return { code: null, signal: "SIGTERM" };
  }));
  expect(r).toMatchObject({ ok: false, error: { stage: "aborted" } });

  calls = [];
  const pre = await renderVersion(req, AbortSignal.abort(), deps(() => ({})));
  expect(pre).toMatchObject({ ok: false, error: { stage: "aborted" } });
  expect(calls).toEqual([]);
});

it("ffprobe failure is reported as stage ffprobe (not the pipeline probe gate)", async () => {
  const r = await renderVersion(req, undefined, deps(
    () => ({ stdout: workerOut(okResult(req)) }),
    () => ({ code: 1, stderr: "moov atom not found" }),
  ));
  expect(r).toMatchObject({ ok: false, error: { stage: "ffprobe" }, previewPath: join(req.versionDir, "preview.mp4") });
  expect(r.error!.message).toMatch(/moov atom/);
});

it("rejects out-of-range stills and broken versions before spawning", async () => {
  const bad = await renderVersion({ ...req, stills: [0, 60] }, undefined, deps(() => ({})));
  expect(bad).toMatchObject({ ok: false, error: { stage: "still", message: expect.stringMatching(/60/) } });

  await rm(join(req.versionDir, "props.json"));
  const broken = await renderVersion(req, undefined, deps(() => ({})));
  expect(broken).toMatchObject({ ok: false, error: { stage: "bundle", message: expect.stringMatching(/props\.json/) } });
  expect(calls).toEqual([]);
});

it("the real worker runs under Node type stripping and answers a bad job with a JSON last line", () => {
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", WORKER_PATH], {
    input: "{}",
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  const last = r.stdout.trim().split("\n").at(-1)!;
  expect(JSON.parse(last)).toMatchObject({ ok: false, error: { stage: "bundle" } });
  expect(r.status).toBe(1);
});

it("removes partial preview and bundle leftovers of dead workers after a failed render", async () => {
  const bundles = join(req.cacheDir, "bundles");
  const r = await renderVersion(req, undefined, deps(async (c) => {
    // worker умер посреди сборки и записи превью
    const job = JSON.parse(c.opts.stdin!) as { bundleDir: string };
    await mkdir(`${job.bundleDir}.tmp-999999`);
    await writeFile(join(req.versionDir, ".preview-999999.tmp.mp4"), "partial");
    return { code: null, signal: "SIGKILL", stdout: "@@ms:stage media\n" };
  }));
  expect(r.error?.stage).toBe("media");
  expect(readdirSync(bundles)).toEqual([]);
  expect(readdirSync(req.versionDir).filter((n) => n.includes("preview"))).toEqual([]);
});

it("abort that arrives while preparing (before spawn) is not lost", async () => {
  const ac = new AbortController();
  const d = deps(() => ({ stdout: workerOut(okResult(req)) }));
  const r = await renderVersion(req, ac.signal, {
    ...d,
    browserPath: async () => {
      ac.abort();
      return "/fake/chrome-headless-shell";
    },
  });
  expect(r).toMatchObject({ ok: false, error: { stage: "aborted" } });
  expect(calls).toEqual([]);
});

it("inner Remotion timeout is slightly below the outer one", () => {
  expect(innerTimeoutMs(60_000)).toBe(54_000);
  expect(innerTimeoutMs(15_000)).toBe(13_000);
  expect(innerTimeoutMs(300_000)).toBe(270_000);
  expect(innerTimeoutMs(1000)).toBe(500);
});

it("orphaned worker keeps run tmp as *.quarantined instead of deleting it", async () => {
  let tmpdir = "";
  await renderVersion(req, undefined, deps((c) => {
    tmpdir = c.opts.cwd;
    return { orphaned: true };
  }));
  expect(existsSync(tmpdir)).toBe(false);
  expect(existsSync(`${tmpdir}.quarantined`)).toBe(true);
});

it("outDir: stills and preview go to a separate dir, the version dir is only read", async () => {
  const out = join(tmp, "rerender");
  await mkdir(out);
  const r2 = { ...req, outDir: out };
  const res = await renderVersion(r2, undefined, deps((c) => {
    const job = JSON.parse(c.opts.stdin!) as { stills: { out: string }[]; preview: { out: string } };
    expect(job.stills.map((s) => s.out)).toEqual(r2.stills.map((f) => join(out, "frames", `${f}.png`)));
    expect(job.preview.out).toBe(join(out, "preview.mp4"));
    return { stdout: workerOut({ ok: true, stills: job.stills.map((s) => s.out), previewPath: job.preview.out, browserLogs: [] }) };
  }));
  expect(res.ok).toBe(true);
  expect(res.previewPath).toBe(join(out, "preview.mp4"));
  expect(existsSync(join(out, "frames"))).toBe(true);
  expect(existsSync(join(req.versionDir, "frames"))).toBe(false);
});

it("preview null: только стоп-кадры (проба раскладки) — worker без превью, ffprobe не зовётся", async () => {
  const out = join(tmp, "probe");
  await mkdir(out);
  const res = await renderVersion({ ...req, outDir: out, stills: [59], preview: null }, undefined, deps((c) => {
    const job = JSON.parse(c.opts.stdin!) as { stills: { out: string }[]; preview: unknown };
    expect(job.preview).toBeNull();
    return { stdout: workerOut({ ok: true, stills: job.stills.map((s) => s.out), browserLogs: ["[motion-kit:layout] {}"] }) };
  }));
  expect(res).toEqual({ ok: true, stills: [join(out, "frames", "59.png")], browserLogs: ["[motion-kit:layout] {}"] });
  expect(calls.map((c) => c.cmd)).toEqual([process.execPath]);
  const bad = await renderVersion({ ...req, outDir: out, stills: [59], preview: null }, undefined, deps(() => ({ stdout: workerOut({ ok: false, stills: [], browserLogs: [], error: { stage: "still", message: "boom" } }) })));
  expect(bad).toMatchObject({ ok: false, error: { stage: "still", message: "boom" } });
});

it("run.registry goes to spawnTracked for worker and ffprobe; the worker job gets no registry", async () => {
  const registry = { add: async () => undefined, end: async () => undefined, live: async () => [] };
  const r = await renderVersion({ ...req, run: { ...req.run, registry } }, undefined, deps(() => ({ stdout: workerOut(okResult(req)) })));
  expect(r.ok).toBe(true);
  expect(calls.map((c) => c.opts.registry)).toEqual([registry, registry]);
  expect(JSON.parse(calls[0]!.opts.stdin!).run).toEqual({
    root: req.run.root,
    runId: "run1",
    attempt: 1,
    renderId: expect.stringMatching(/^run1-a1-\w{6}$/),
  });
});

it("two parallel renders of one attempt (two takes) do not kill each other's Chrome", async () => {
  // Chrome запускает настоящий chrome-wrapper.sh с окружением, как у worker; вместо Chrome — sleep
  const fake = join(tmp, "fake-chrome.sh");
  await writeFile(fake, "#!/bin/sh\nexec sleep 60\n", { mode: 0o755 });
  await safeMkdir(req.run.root, "run/processes");
  const launched: ChildProcess[] = [];
  const launch = (job: { run: { root: string; runId: string; attempt: number; renderId?: string } }) => {
    const vars: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      MS_CHROME: fake,
      MS_RUN_ROOT: job.run.root,
      MS_RUN_ID: job.run.runId,
      MS_RUN_ATTEMPT: String(job.run.attempt),
      MS_BUNDLE_PORT: "3123",
    };
    if (job.run.renderId !== undefined) vars.MS_RENDER_ID = job.run.renderId;
    const c = spawn(CHROME_WRAPPER, ["about:blank"], { detached: true, stdio: "ignore", env: vars });
    launched.push(c);
    return c;
  };
  const registered = async (pid: number) => {
    const end = Date.now() + 5000;
    while (!existsSync(join(req.run.root, "run/processes", `run1-a1-${pid}.json`)) || (await procInfo(pid)) === undefined) {
      if (Date.now() > end) throw new Error("Chrome не зарегистрировался");
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  let bStarted!: () => void;
  const bReady = new Promise<void>((r) => (bStarted = r));
  let aDone!: () => void;
  const aFinished = new Promise<void>((r) => (aDone = r));
  let bAliveAfterA: boolean | undefined;
  try {
    // у дублей разное содержимое — свой кэш, чтобы бандлы не делили одну запись entries/
    const cacheB = join(tmp, "cache-b");
    await mkdir(cacheB);
    const reqB = { ...req, cacheDir: cacheB, versionDir: await copyFixture("hello-scene", join(tmp, "v2")) };
    const later: { b?: Promise<RenderResult> } = {};
    const a = renderVersion(req, undefined, deps(async (c) => {
      const chrome = launch(JSON.parse(c.opts.stdin!));
      await registered(chrome.pid!);
      // рендер B уже держит свой Chrome (или сам завершился — тогда тест упадёт ниже)
      await Promise.race([bReady, later.b]);
      return { stdout: workerOut(okResult(req)) };
    }));
    const b = renderVersion(reqB, undefined, deps(async (c) => {
      const chrome = launch(JSON.parse(c.opts.stdin!));
      await registered(chrome.pid!);
      bStarted();
      await aFinished; // A закончил и убрал за собой
      bAliveAfterA = groupExists(chrome.pid!);
      return { stdout: workerOut(okResult(reqB)) };
    }));
    later.b = b;
    const ra = await a;
    aDone();
    const rb = await b;
    expect(ra.ok).toBe(true);
    expect(bAliveAfterA).toBe(true);
    expect(rb.ok).toBe(true);
    // каждый рендер убрал свой Chrome и закрыл его запись
    for (const c of launched) expect(groupExists(c.pid!)).toBe(false);
    expect(readdirSync(join(req.run.root, "run/processes"))).toEqual([]);
  } finally {
    aDone();
    bStarted();
    for (const c of launched) {
      try {
        process.kill(-c.pid!, "SIGKILL");
      } catch {
        // уже нет
      }
    }
  }
});

it("S15b: временной проход пробы уходит в задание worker только вместе с превью", async () => {
  const jobs: { sweep?: unknown }[] = [];
  const d = deps((c) => {
    const job = JSON.parse(c.opts.stdin!) as { sweep?: unknown; stills: { out: string }[]; preview: { out: string } | null };
    jobs.push(job);
    return { stdout: workerOut({ ok: true, stills: job.stills.map((s) => s.out), ...(job.preview ? { previewPath: job.preview.out } : {}), browserLogs: [] }) };
  });
  await renderVersion({ ...req, sweep: { every: 6, scale: 0.25 } }, undefined, d);
  await renderVersion({ ...req, preview: null, sweep: { every: 6, scale: 0.25 } }, undefined, d);
  await renderVersion(req, undefined, d);
  expect(jobs.map((j) => j.sweep)).toEqual([{ every: 6, scale: 0.25 }, undefined, undefined]);
});

it("S21: worker убит сигналом без результата — killed (не ошибка сцены); ошибка сцены и таймаут — без killed", async () => {
  const r = await renderVersion(req, undefined, deps(() => ({ code: null, signal: "SIGKILL", stdout: "@@ms:stage media\n" })));
  expect(r).toMatchObject({ ok: false, error: { stage: "media" }, killed: "SIGKILL" });

  const scene = await renderVersion(req, undefined, deps(() => ({
    code: 1,
    stdout: workerOut({ ok: false, stills: [], browserLogs: [], error: { stage: "still", message: "ReferenceError: x is not defined" } }),
  })));
  expect(scene.killed).toBeUndefined();

  // ревью S21: падение процесса (SIGSEGV/SIGABRT) — ошибка как раньше, не «убит снаружи»
  for (const sig of ["SIGSEGV", "SIGABRT", "SIGTERM"]) {
    const crash = await renderVersion(req, undefined, deps(() => ({ code: null, signal: sig, stdout: "@@ms:stage media\n" })));
    expect(crash).toMatchObject({ ok: false, error: { stage: "media" } });
    expect(crash.killed).toBeUndefined();
  }

  const late = await renderVersion({ ...req, timeoutMs: 30 }, undefined, deps(async (c) => {
    await new Promise((res) => c.opts.signal.addEventListener("abort", res));
    return { code: null, signal: "SIGKILL" };
  }));
  expect(late).toMatchObject({ ok: false, error: { stage: "timeout" } });
  expect(late.killed).toBeUndefined();
});
