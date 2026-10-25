// Task 36: renderTimelineRange без настоящего рендера — задание worker-timeline (прозрачные props,
// медиа, диапазон, кадры), проверки до запуска (static check, overlay_unsupported, кадры вне ролика)
// и результат (allowedOrigins, ffprobe со звуком 48 кГц). worker и ffprobe подменены.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpawnTrackedOptions, SpawnTrackedResult } from "@ms/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSceneDir } from "../../../server/src/scenes/static-check.js";
import type { RenderDeps } from "../../src/node/render-version.js";
import type { TimelineWorkerJob } from "../../src/timeline/protocol.js";
import { type TimelineRenderRequest, renderTimelineRange } from "../../src/timeline/render-range.js";
import { copyFixture, makeStore, makeTmp, removeTmp } from "../helpers.js";

const FFPROBE = "/fake/ffprobe";
const MP4 = JSON.stringify({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1280, height: 720, r_frame_rate: "30/1", duration: "18.5", pix_fmt: "yuv420p" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2, duration: "18.5" },
  ],
  format: { duration: "18.5" },
});
const ORIGINS = ["http://127.0.0.1:50001", "http://localhost:50002", "http://127.0.0.1:50002"];

interface Call { cmd: string; args: string[]; opts: SpawnTrackedOptions }
let tmp: string;
let calls: Call[];
let base: TimelineRenderRequest;
const FFMPEG = "/fake/ffmpeg";
const jobOf = (c: Call) => JSON.parse(c.opts.stdin ?? "{}") as TimelineWorkerJob;
const workerCall = () => calls.find((c) => /worker-timeline\.ts$/.test(c.args.at(-1) ?? ""))!;

function deps(): RenderDeps {
  return {
    browserPath: async () => "/fake/chrome-headless-shell",
    ffprobeBin: async () => FFPROBE,
    ffmpegBin: async () => FFMPEG,
    spawn: async (_root, _ref, cmd, args, opts) => {
      const c = { cmd, args, opts };
      calls.push(c);
      let r: Partial<SpawnTrackedResult> = { stdout: MP4 };
      if (cmd === FFMPEG) {
        await writeFile(args.at(-1)!, "cut");
        r = { stdout: "" };
      } else if (cmd !== FFPROBE) {
        const job = jobOf(c);
        if (job.output) await writeFile(job.output.out, "video");
        r = {
          stdout: `@@ms:origins ${JSON.stringify(ORIGINS)}\n` +
            JSON.stringify({ ok: true, stills: job.stills.map((s) => s.out), ...(job.output ? { outPath: job.output.out } : {}), browserLogs: [], allowedOrigins: ORIGINS, mediaBytes: 4242 }) + "\n",
        };
      }
      return { code: 0, signal: null, stdout: "", stderr: "", orphaned: false, ...r };
    },
  };
}

beforeEach(async () => {
  tmp = await makeTmp();
  const root = await makeStore(tmp);
  await mkdir(join(tmp, "cache"));
  await mkdir(join(tmp, "out"));
  const card = await copyFixture("timeline/fullscreen-card", join(tmp, "card"));
  const lower = await copyFixture("timeline/overlay-lower-third", join(tmp, "lower"));
  await writeFile(join(tmp, "master.mp4"), "m");
  await writeFile(join(tmp, "audio.wav"), "a");
  const props = (dir: string) => import("node:fs/promises").then(async (f) => JSON.parse(await f.readFile(join(dir, "props.json"), "utf8")) as Record<string, unknown>);
  calls = [];
  base = {
    props: {
      width: 1280, height: 720, fps: { num: 30, den: 1 }, duration_frames: 555,
      video: { path: join(tmp, "master.mp4"), sequences: [{ idx: 0, from: 0, durationInFrames: 60, startFrom: 0 }, { idx: 1, from: 60, durationInFrames: 495, startFrom: 105 }] },
      audio: { path: join(tmp, "audio.wav") },
      scenes: [
        { clip_id: "clip_a", key: "S1", props: await props(lower), start_frame: 150, duration_frames: 90, transparent: true, z: 1 },
        { clip_id: "clip_b", key: "S0", props: await props(card), start_frame: 300, duration_frames: 60, transparent: false, z: 0 },
      ],
    },
    versionDirs: { S0: card, S1: lower },
    cacheDir: join(tmp, "cache"),
    check: checkSceneDir,
    stills: [100, 200],
    stillsDir: join(tmp, "out", "frames"),
    output: { path: join(tmp, "out", "timeline.mp4"), codec: "h264", crf: 18, scale: 1, audioBitrateKbps: 192, x264Preset: "medium" },
    timeoutMs: 60_000,
    run: { root, runId: "job_TL1", attempt: 1 },
  };
});
afterEach(async () => {
  if (tmp) await removeTmp(tmp);
});

describe("renderTimelineRange", () => {
  it("задание worker: прозрачные props через overlayInputProps, медиа файлами, композиция и кадры; результат с origin и ffprobe", async () => {
    const r = await renderTimelineRange({ ...base, range: [90, 359] }, undefined, deps());
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.allowedOrigins).toEqual(ORIGINS);
    expect(r.probe).toMatchObject({ codec: "h264", audioCodec: "aac", audioSampleRate: 48_000, audioChannels: 2 });
    expect(r.stills).toEqual([join(tmp, "out", "frames", "100.png"), join(tmp, "out", "frames", "200.png")]);
    expect(r.outPath).toBe(join(tmp, "out", "timeline.mp4"));
    const job = jobOf(workerCall());
    // ffprobe master → две вырезки (кадры 100 и 200) → worker → ffprobe файла
    expect(calls.map((c) => (c.cmd === FFPROBE ? "probe" : c.cmd === FFMPEG ? "cut" : "worker"))).toEqual(["probe", "cut", "cut", "worker", "probe"]);
    expect(calls[0]!.args.at(-1)).toBe(join(tmp, "master.mp4"));
    expect(job.entryPoint).toMatch(/\/entries\/tl-[0-9a-f]{64}\/index\.tsx$/);
    expect(job.bundleDir).toMatch(/\/bundles\/tl-[0-9a-f]{64}$/);
    expect(job.media).toMatchObject({ video: join(tmp, "master.mp4"), audio: join(tmp, "audio.wav") });
    expect(r.mediaBytes).toBe(4242);
    expect(job.props.audio).toBe(true);
    expect(job.composition).toEqual({ width: 1280, height: 720, fps: 30, durationInFrames: 555 });
    expect(job.output).toMatchObject({ crf: 18, audioBitrateKbps: 192, x264Preset: "medium", frameRange: [90, 359] });
    const [a, b] = job.props.scenes;
    expect((a!.props.style as { transparent: boolean }).transparent).toBe(true);
    expect((b!.props.style as { transparent: boolean }).transparent).toBe(false);
    // исходные props вызывающего не тронуты
    expect((base.props.scenes[0]!.props.style as { transparent: boolean }).transparent).toBe(false);
  });

  it("ревью I3: кадры и короткий диапазон — по вырезкам master, длинный диапазон — весь master", async () => {
    // master 18,5 с = 555 кадров; кадр 100 → master 145, кадр 200 → master 245; запас 30 кадров
    await renderTimelineRange({ ...base, range: [90, 359] }, undefined, deps());
    const job = jobOf(workerCall());
    const cuts = calls.filter((c) => c.cmd === FFMPEG);
    expect(Object.keys(job.media.cuts!)).toEqual(["cut0", "cut1"]);
    expect(cuts.map((c) => c.args.at(-1))).toEqual([job.media.cuts!.cut0, job.media.cuts!.cut1]);
    expect(cuts[0]!.args.join(" ")).toContain(`-ss 3.816667 -f mov -i file:${join(tmp, "master.mp4")}`);
    expect(cuts[0]!.args[cuts[0]!.args.indexOf("-frames:v") + 1]).toBe("61");
    // вырезки — во временном каталоге попытки (TMPDIR worker), не рядом с master
    expect(job.media.cuts!.cut0!.startsWith(cuts[0]!.opts.cwd!)).toBe(true);
    expect(job.stills).toEqual([
      { frame: 100, out: join(tmp, "out", "frames", "100.png"), video: { file: "cut0", sequences: [{ idx: 1, from: 70, durationInFrames: 61, startFrom: 0 }] } },
      { frame: 200, out: join(tmp, "out", "frames", "200.png"), video: { file: "cut1", sequences: [{ idx: 1, from: 170, durationInFrames: 61, startFrom: 0 }] } },
    ]);
    // [90, 359] → master 135..404 + запас = 330 кадров > половины master: весь master
    expect(job.output!.video).toBeUndefined();

    calls = [];
    await renderTimelineRange({ ...base, stills: [], range: [100, 129] }, undefined, deps());
    const short = jobOf(workerCall());
    expect(short.output!.video).toEqual({ file: "cut0", sequences: [{ idx: 1, from: 70, durationInFrames: 90, startFrom: 0 }] });
    expect(calls.filter((c) => c.cmd === FFMPEG)[0]!.args.join(" ")).toContain("-frames:v 90");
  });

  it("30000/1001: композиция на дробном fps, вырезка — на той же сетке", async () => {
    const NTSC = { num: 30000, den: 1001 };
    await renderTimelineRange({ ...base, props: { ...base.props, fps: NTSC }, output: undefined }, undefined, deps());
    const job = jobOf(workerCall());
    expect(job.composition.fps).toBe(30000 / 1001);
    expect(job.props.fps).toEqual(NTSC);
    const cut = calls.find((c) => c.cmd === FFMPEG)!.args;
    expect(cut[cut.indexOf("-r") + 1]).toBe("30000/1001");
    // кадр 100 → master 145, запас round(29,97) = 30: с кадра 115, seek за полкадра — (114,5 · 1001) / 30000
    expect(cut[cut.indexOf("-ss") + 1]).toBe(((114.5 * 1001) / 30000).toFixed(6));
  });

  it("одинаковые вырезки не дублируются; кадр без видео — без master", async () => {
    const props = { ...base.props, video: { ...base.props.video, sequences: [{ idx: 0, from: 100, durationInFrames: 455, startFrom: 0 }] } };
    await renderTimelineRange({ ...base, props, stills: [10, 300, 300], output: undefined }, undefined, deps());
    const job = jobOf(workerCall());
    expect(job.stills.map((s) => s.video)).toEqual([
      { file: "video", sequences: [] },
      { file: "cut0", sequences: [{ idx: 0, from: 270, durationInFrames: 61, startFrom: 0 }] },
      { file: "cut0", sequences: [{ idx: 0, from: 270, durationInFrames: 61, startFrom: 0 }] },
    ]);
    expect(calls.filter((c) => c.cmd === FFMPEG)).toHaveLength(1);
  });

  it("без звука и без файла: только кадры, ffprobe — только master", async () => {
    const props = { ...base.props };
    delete props.audio;
    const rest = { ...base, props };
    delete rest.output;
    const r = await renderTimelineRange(rest, undefined, deps());
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => c.cmd === FFPROBE)).toHaveLength(1);
    expect(jobOf(workerCall()).media).toMatchObject({ video: join(tmp, "master.mp4") });
    expect(jobOf(workerCall()).media.audio).toBeUndefined();
    expect(jobOf(workerCall()).output).toBeNull();
  });

  it("до запуска worker: прозрачная сцена вне ScenePropsBase, кадры и диапазон вне ролика, нет медиа, static check", async () => {
    const odd = { ...base, props: { ...base.props, scenes: [{ ...base.props.scenes[0]!, props: { title: "срез" } }] } };
    expect((await renderTimelineRange(odd, undefined, deps())).error).toMatchObject({ stage: "unsupported", message: expect.stringMatching(/overlay_unsupported: сцена clip_a/) });
    expect((await renderTimelineRange({ ...base, stills: [555] }, undefined, deps())).error).toMatchObject({ stage: "unsupported", message: expect.stringMatching(/кадры вне 0\.\.554: 555/) });
    expect((await renderTimelineRange({ ...base, range: [10, 555] }, undefined, deps())).error?.stage).toBe("unsupported");
    const late = { ...base, props: { ...base.props, scenes: [{ ...base.props.scenes[1]!, start_frame: 520 }] } };
    expect((await renderTimelineRange(late, undefined, deps())).error?.message).toMatch(/вне ролика/);
    const gone = { ...base, props: { ...base.props, video: { ...base.props.video, path: join(tmp, "none.mp4") } } };
    expect((await renderTimelineRange(gone, undefined, deps())).error?.message).toMatch(/файла медиа нет/);
    const bad = await renderTimelineRange({ ...base, check: async () => [{ rule: "forbidden-global", file: "src/Scene.tsx", line: 3, message: "fetch" }] }, undefined, deps());
    expect(bad.error).toMatchObject({ stage: "bundle", message: expect.stringMatching(/forbidden-global/) });
    expect(calls).toEqual([]);
    const ac = new AbortController();
    ac.abort();
    expect((await renderTimelineRange(base, ac.signal, deps())).error?.stage).toBe("aborted");
  });
});
