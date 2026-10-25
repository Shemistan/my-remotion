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
const jobOf = (c: Call) => JSON.parse(c.opts.stdin ?? "{}") as TimelineWorkerJob;

function deps(): RenderDeps {
  return {
    browserPath: async () => "/fake/chrome-headless-shell",
    ffprobeBin: async () => FFPROBE,
    spawn: async (_root, _ref, cmd, args, opts) => {
      const c = { cmd, args, opts };
      calls.push(c);
      let r: Partial<SpawnTrackedResult> = { stdout: MP4 };
      if (cmd !== FFPROBE) {
        const job = jobOf(c);
        if (job.output) await writeFile(job.output.out, "video");
        r = {
          stdout: `@@ms:origins ${JSON.stringify(ORIGINS)}\n` +
            JSON.stringify({ ok: true, stills: job.stills.map((s) => s.out), ...(job.output ? { outPath: job.output.out } : {}), browserLogs: [], allowedOrigins: ORIGINS }) + "\n",
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
    const job = jobOf(calls[0]!);
    expect(calls[0]!.args.at(-1)).toMatch(/worker-timeline\.ts$/);
    expect(job.entryPoint).toMatch(/\/entries\/tl-[0-9a-f]{64}\/index\.tsx$/);
    expect(job.bundleDir).toMatch(/\/bundles\/tl-[0-9a-f]{64}$/);
    expect(job.media).toEqual({ video: join(tmp, "master.mp4"), audio: join(tmp, "audio.wav") });
    expect(job.props.audio).toBe(true);
    expect(job.composition).toEqual({ width: 1280, height: 720, fps: 30, durationInFrames: 555 });
    expect(job.output).toMatchObject({ crf: 18, audioBitrateKbps: 192, x264Preset: "medium", frameRange: [90, 359] });
    const [a, b] = job.props.scenes;
    expect((a!.props.style as { transparent: boolean }).transparent).toBe(true);
    expect((b!.props.style as { transparent: boolean }).transparent).toBe(false);
    // исходные props вызывающего не тронуты
    expect((base.props.scenes[0]!.props.style as { transparent: boolean }).transparent).toBe(false);
    expect(calls[1]!.cmd).toBe(FFPROBE);
  });

  it("без звука и без файла: только кадры, ffprobe не зовётся", async () => {
    const props = { ...base.props };
    delete props.audio;
    const rest = { ...base, props };
    delete rest.output;
    const r = await renderTimelineRange(rest, undefined, deps());
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(jobOf(calls[0]!).media).toEqual({ video: join(tmp, "master.mp4") });
    expect(jobOf(calls[0]!).output).toBeNull();
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
