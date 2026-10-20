// Логика renderVersion на подменённом spawnTracked: без Chrome, бандла и ffprobe.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpawnTrackedOptions, SpawnTrackedResult } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CHROME_WRAPPER } from "../src/node/browser.js";
import { type RenderDeps, type RenderRequest, WORKER_PATH, innerTimeoutMs, renderVersion } from "../src/node/render-version.js";
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
  });
  // каталоги созданы: frames/ версии, entries/ и bundles/ кэша
  expect(existsSync(join(req.versionDir, "frames"))).toBe(true);
  expect(readdirSync(req.cacheDir).sort()).toEqual(["bundles", "entries"]);
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

it("ffprobe failure is reported as stage probe", async () => {
  const r = await renderVersion(req, undefined, deps(
    () => ({ stdout: workerOut(okResult(req)) }),
    () => ({ code: 1, stderr: "moov atom not found" }),
  ));
  expect(r).toMatchObject({ ok: false, error: { stage: "probe" }, previewPath: join(req.versionDir, "preview.mp4") });
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
