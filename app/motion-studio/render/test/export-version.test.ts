// exportVersion на подменённом spawnTracked: задание worker в режиме export, fps из
// запроса, ошибки рендера словарём RenderStage, gate отдельным полем.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpawnTrackedOptions, SpawnTrackedResult } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CHROME_WRAPPER } from "../src/node/browser.js";
import { type ExportVersionRequest, exportVersion } from "../src/node/export-version.js";
import type { WorkerJob } from "../src/node/protocol.js";
import type { RenderDeps } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const FFPROBE = "/fake/ffprobe";
const probeJson = (o: { codec?: string; fps?: string; duration?: string; pixFmt?: string; audio?: boolean; w?: number; h?: number } = {}) =>
  JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: o.codec ?? "h264", width: o.w ?? 1280, height: o.h ?? 720, r_frame_rate: o.fps ?? "30/1", pix_fmt: o.pixFmt ?? "yuv420p" },
      ...(o.audio === false ? [] : [{ codec_type: "audio", codec_name: "aac" }]),
    ],
    format: { duration: o.duration ?? "3.0" },
  });

interface Call { cmd: string; args: string[]; opts: SpawnTrackedOptions }
type Responder = (c: Call) => Promise<Partial<SpawnTrackedResult>> | Partial<SpawnTrackedResult>;

let tmp: string;
let req: ExportVersionRequest;
let calls: Call[];

const jobOf = (c: Call) => JSON.parse(c.opts.stdin ?? "{}") as WorkerJob;

/** Worker «рендерит» экспорт: пишет файл и отвечает результатом. */
const exporting: Responder = async (c) => {
  const job = jobOf(c);
  await writeFile(job.export!.out, "video");
  return { stdout: JSON.stringify({ ok: true, stills: [], exportPath: job.export!.out, browserLogs: [] }) + "\n" };
};

function deps(worker: Responder = exporting, probe: Responder = () => ({ stdout: probeJson() })): RenderDeps {
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

beforeEach(async () => {
  tmp = await makeTmp();
  const root = await makeStore(tmp);
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  const out = join(tmp, "draft");
  await mkdir(out);
  req = {
    versionDir: await copyFixture("transparent-scene", join(tmp, "v1")),
    settings: { ...(await fixtureSettings("transparent-scene")), transparent_export: false },
    request: { format: "mp4", crf: 18, scale: 1 },
    cacheDir,
    outPath: join(out, "scene.mp4"),
    timeoutMs: 60_000,
    run: { root, runId: "job1", attempt: 1 },
  };
  calls = [];
});
afterEach(() => removeTmp(tmp));

it("mp4: worker в режиме export (h264, aac, enforceAudioTrack, crf, scale), Chrome — через обёртку, gate пуст", async () => {
  const r = await exportVersion(req, undefined, deps());
  expect(r).toMatchObject({ ok: true, gate: [], probe: { codec: "h264", audioCodec: "aac" } });
  const job = jobOf(calls[0]!);
  expect(job.mode).toBe("export");
  expect(job.export).toEqual({ out: req.outPath, codec: "h264", crf: 18, scale: 1, audioCodec: "aac", enforceAudioTrack: true });
  expect(job.preview).toBeNull();
  expect(job.stills).toEqual([]);
  expect(job.composition).toEqual({ width: 1280, height: 720, fps: 30, durationInFrames: 90 });
  // защита рендера та же: сеть Chrome закрыта обёрткой, окружение без секретов сервера
  expect(job.browserExecutable).toBe(CHROME_WRAPPER);
  expect(Object.keys(calls[0]!.opts.env ?? {}).sort()).toEqual(expect.arrayContaining(["TMPDIR"]));
  for (const k of Object.keys(calls[0]!.opts.env ?? {})) expect(["TMPDIR", "LANG", "PATH", "HOME"]).toContain(k);
  expect(job.run.renderId).toMatch(/^job1-a1-/);
  // ffprobe — по файлу экспорта
  expect(calls[1]!.cmd).toBe(FFPROBE);
  expect(calls[1]!.args.at(-1)).toBe(req.outPath);
  // в каталог экспорта не пишутся frames/
  expect(existsSync(join(tmp, "draft", "frames"))).toBe(false);
});

it("prores4444: codec prores, профиль 4444, yuva444p10le, PNG-кадры, .mov", async () => {
  const outPath = join(tmp, "draft", "scene.mov");
  const r = await exportVersion({ ...req, outPath, request: { format: "prores4444", crf: 18, scale: 1 } }, undefined,
    deps(exporting, () => ({ stdout: probeJson({ codec: "prores", pixFmt: "yuva444p10le", audio: false }) })));
  expect(r).toMatchObject({ ok: true, gate: [] });
  expect(jobOf(calls[0]!).export).toEqual({ out: outPath, codec: "prores", scale: 1, proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png" });
});

it("расширение файла не по формату — ошибка вызывающего", async () => {
  await expect(exportVersion({ ...req, outPath: join(tmp, "draft", "scene.mov") }, undefined, deps())).rejects.toThrow(/\.mp4/);
});

it("M11: fps 60 ≠ 30 версии → композиция 60 fps, props.timing и кадровые ключи content ×2", async () => {
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined,
    deps(exporting, () => ({ stdout: probeJson({ fps: "60/1" }) })));
  expect(r).toMatchObject({ ok: true, gate: [] });
  const job = jobOf(calls[0]!);
  expect(job.composition).toEqual({ width: 1280, height: 720, fps: 60, durationInFrames: 180 });
  const props = job.inputProps as { timing: { duration_frames: number; beats: { start_frame: number; end_frame: number }[] }; content: { stagger: number } };
  expect(props.timing.duration_frames).toBe(180);
  expect(props.timing.beats[0]).toMatchObject({ start_frame: 30, end_frame: 120 });
  expect(props.content.stagger).toBe(12);
});

it("тот же fps → props версии без изменений", async () => {
  await exportVersion(req, undefined, deps());
  const props = jobOf(calls[0]!).inputProps as { timing: { duration_frames: number }; content: { stagger: number } };
  expect(props.timing.duration_frames).toBe(90);
  expect(props.content.stagger).toBe(6);
});

it("gate не пройден — ok, но gate не пуст (это не ошибка рендера)", async () => {
  const r = await exportVersion(req, undefined, deps(exporting, () => ({ stdout: probeJson({ audio: false }) })));
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.gate[0]).toMatch(/audio/);
});

it("orphaned worker → error.stage orphaned, ffprobe не запускается", async () => {
  const r = await exportVersion(req, undefined, deps(async (c) => ({ ...(await exporting(c)), orphaned: true })));
  expect(r).toMatchObject({ ok: false, error: { stage: "orphaned" } });
  expect(calls.map((c) => c.cmd)).toEqual([process.execPath]);
});

it("orphaned ffprobe → error.stage orphaned", async () => {
  const r = await exportVersion(req, undefined, deps(exporting, () => ({ orphaned: true })));
  expect(r).toMatchObject({ ok: false, error: { stage: "orphaned" } });
});

it("ffprobe упал → error.stage ffprobe", async () => {
  const r = await exportVersion(req, undefined, deps(exporting, () => ({ code: 1, stderr: "boom" })));
  expect(r).toMatchObject({ ok: false, error: { stage: "ffprobe" } });
});

it("ошибка worker на этапе media → error.stage media", async () => {
  const r = await exportVersion(req, undefined, deps(() => ({ code: 1, stdout: JSON.stringify({ ok: false, stills: [], browserLogs: [], error: { stage: "media", message: "x" } }) + "\n" })));
  expect(r).toMatchObject({ ok: false, error: { stage: "media", message: "x" } });
});

it("таймаут → error.stage timeout", async () => {
  const r = await exportVersion({ ...req, timeoutMs: 20 }, undefined, deps(async (c) => {
    await new Promise((res) => c.opts.signal.addEventListener("abort", res));
    return { code: null, signal: "SIGKILL" };
  }));
  expect(r).toMatchObject({ ok: false, error: { stage: "timeout" } });
});

it("отмена signal → error.stage aborted", async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await exportVersion(req, ac.signal, deps());
  expect(r).toMatchObject({ ok: false, error: { stage: "aborted" } });
  expect(calls).toHaveLength(0);
});
