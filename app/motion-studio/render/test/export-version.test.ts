// exportVersion на подменённом spawnTracked: задание worker в режиме export, fps из
// запроса, ошибки рендера словарём RenderStage, gate отдельным полем.
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SpawnTrackedOptions, SpawnTrackedResult } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CHROME_WRAPPER } from "../src/node/browser.js";
import { type ExportVersionRequest, exportVersion } from "../src/node/export-version.js";
import { FfmpegError } from "../src/node/ffmpeg.js";
import type { WorkerJob } from "../src/node/protocol.js";
import type { TempoCheck, TempoCheckRequest } from "../src/node/tempo.js";
import type { RenderDeps } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const FFPROBE = "/fake/ffprobe";
const probeJson = (o: { codec?: string; fps?: string; duration?: string; pixFmt?: string; profile?: string; audio?: boolean; w?: number; h?: number } = {}) =>
  JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: o.codec ?? "h264", width: o.w ?? 1280, height: o.h ?? 720, r_frame_rate: o.fps ?? "30/1", pix_fmt: o.pixFmt ?? "yuv420p", ...(o.profile ? { profile: o.profile } : {}) },
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
    deps(exporting, () => ({ stdout: probeJson({ codec: "prores", profile: "4444", pixFmt: "yuva444p10le", audio: false }) })));
  expect(r).toMatchObject({ ok: true, gate: [] });
  expect(jobOf(calls[0]!).export).toEqual({ out: outPath, codec: "prores", scale: 1, proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png" });
});

it("расширение файла не по формату — ошибка вызывающего", async () => {
  await expect(exportVersion({ ...req, outPath: join(tmp, "draft", "scene.mov") }, undefined, deps())).rejects.toThrow(/\.mp4/);
});

/** Стоп-кадры версии (`frames/<n>.png`) — для сверки темпа при смене fps. */
async function withStills(...frames: number[]): Promise<void> {
  await mkdir(join(req.versionDir, "frames"), { recursive: true });
  for (const f of frames) await writeFile(join(req.versionDir, "frames", `${f}.png`), "png");
}
const TEMPO = { threshold: 0.06, hotTile: 0.03, hotTilesMin: 3, compare: { width: 480, height: 270 } };
const cleanTempo = (r: TempoCheckRequest): Promise<TempoCheck> => Promise.resolve({ factor: r.exportFps.num / r.versionFps.num, ...TEMPO, samples: [], mismatched: [] });

it("M11: fps 60 ≠ 30 версии → композиция 60 fps, props.timing и кадровые ключи content ×2", async () => {
  await withStills(15, 45);
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined,
    { ...deps(exporting, () => ({ stdout: probeJson({ fps: "60/1" }) })), tempo: cleanTempo });
  expect(r).toMatchObject({ ok: true, gate: [], tempo: { mismatched: [] }, warnings: [] });
  const job = jobOf(calls[0]!);
  expect(job.composition).toEqual({ width: 1280, height: 720, fps: 60, durationInFrames: 180 });
  const props = job.inputProps as { timing: { duration_frames: number; beats: { start_frame: number; end_frame: number }[] }; content: { stagger: number } };
  expect(props.timing.duration_frames).toBe(180);
  expect(props.timing.beats[0]).toMatchObject({ start_frame: 30, end_frame: 120 });
  expect(props.content.stagger).toBe(12);
});

it("F2: смена fps → сверка темпа по стоп-кадрам версии: реестр и сигнал попытки, размеры версии", async () => {
  await withStills(15, 45);
  const seen: TempoCheckRequest[] = [];
  const ac = new AbortController();
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, ac.signal, {
    ...deps(exporting, () => ({ stdout: probeJson({ fps: "60/1" }) })),
    tempo: async (x) => {
      seen.push(x);
      return { factor: 2, ...TEMPO, samples: [{ frame: 45, exportFrame: 90, maxTile: 0.2, hotTiles: 9, mean: 0.02 }], mismatched: [45] };
    },
  });
  expect(r).toMatchObject({ ok: true, gate: [], tempo: { mismatched: [45] } });
  expect(seen[0]).toMatchObject({
    exportPath: req.outPath, versionDir: req.versionDir, versionFps: { num: 30, den: 1 }, exportFps: { num: 60, den: 1 },
    versionFrames: 90, exportFrames: 180, width: 1280, height: 720, scale: 1, opaque: true, run: req.run, signal: ac.signal,
  });
});

/** Worker: экспорт пишет файл, рендер — стоп-кадры (`renderStills` сверки темпа). */
const exportingOrStills: Responder = async (c) => {
  const job = jobOf(c);
  if (job.mode === "export") return exporting(c);
  for (const s of job.stills) await writeFile(s.out, "png");
  return { stdout: JSON.stringify({ ok: true, stills: job.stills.map((s) => s.out), browserLogs: [] }) + "\n" };
};

it("R1: дорендер стоп-кадров для сверки — рендер версии в её fps в каталог внутри draft, без превью; каталог убран", async () => {
  await withStills(13, 43);
  let dir = "";
  let files: string[] = [];
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 24 } }, undefined, {
    ...deps(exportingOrStills, () => ({ stdout: probeJson({ fps: "24/1" }) })),
    tempo: async (x) => {
      dir = await x.renderStills!([15, 45]);
      files = await readdir(join(dir, "frames"));
      return cleanTempo(x);
    },
  });
  expect(r).toMatchObject({ ok: true, gate: [], tempo: { mismatched: [] } });
  expect(dirname(dir)).toBe(join(tmp, "draft"));
  expect(files.sort()).toEqual(["15.png", "45.png"]);
  const job = jobOf(calls.find((c) => c.cmd === process.execPath && jobOf(c).mode === "render")!);
  expect(job.composition).toEqual({ width: 1280, height: 720, fps: 30, durationInFrames: 90 });
  expect(job.preview).toBeNull();
  expect(job.stills.map((s) => s.frame)).toEqual([15, 45]);
  // props версии как есть (не пересчитанные под 24 fps)
  expect((job.inputProps as { timing: { duration_frames: number } }).timing.duration_frames).toBe(90);
  expect(job.run.renderId).toMatch(/^job1-a1-/);
  // в draft ничего не осталось, кроме файла экспорта
  expect(existsSync(dir)).toBe(false);
  expect(await readdir(join(tmp, "draft"))).toEqual(["scene.mp4"]);
});

it("R1: дорендер не удался → сверка падает с этапом рендера (orphaned остаётся orphaned)", async () => {
  await withStills(13);
  const run = (worker: Responder) => exportVersion({ ...req, request: { ...req.request, fps: 24 } }, undefined, {
    ...deps(worker, () => ({ stdout: probeJson({ fps: "24/1" }) })),
    tempo: async (x) => {
      await x.renderStills!([15]);
      return cleanTempo(x);
    },
  });
  const failing: Responder = async (c) => (jobOf(c).mode === "export" ? exporting(c) : { code: 1, stdout: JSON.stringify({ ok: false, stills: [], browserLogs: [], error: { stage: "still", message: "кадр не снят" } }) + "\n" });
  expect(await run(failing)).toMatchObject({ ok: false, error: { stage: "media", message: expect.stringMatching(/сверка темпа.*still.*кадр не снят/) } });
  const orphan: Responder = async (c) => (jobOf(c).mode === "export" ? exporting(c) : { ...(await exportingOrStills(c)), orphaned: true });
  expect(await run(orphan)).toMatchObject({ ok: false, error: { stage: "orphaned" } });
  // каталог живого дорендера не удаляется (draft уйдёт в карантин целиком)
  expect((await readdir(join(tmp, "draft"))).filter((n) => n.startsWith(".tempo-stills-"))).toHaveLength(1);
});

it("F2: props вне ScenePropsBase при смене fps → отказ fps_change_unsupported до рендера", async () => {
  await withStills(15);
  await writeFile(join(req.versionDir, "props.json"), JSON.stringify({ preset: "dark-premium" }));
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined, { ...deps(), tempo: cleanTempo });
  expect(r).toMatchObject({ ok: false, error: { stage: "unsupported", message: expect.stringMatching(/^fps_change_unsupported: .*ScenePropsBase/) } });
  expect(calls).toHaveLength(0);
  // в fps версии те же props годятся: масштабировать нечего
  expect(await exportVersion(req, undefined, deps())).toMatchObject({ ok: true, tempo: null });
});

it("F2: у версии нет стоп-кадров при смене fps → отказ fps_change_unsupported (темп не сверить)", async () => {
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined, { ...deps(), tempo: cleanTempo });
  expect(r).toMatchObject({ ok: false, error: { stage: "unsupported", message: expect.stringMatching(/fps_change_unsupported: .*стоп-кадр/) } });
  expect(calls).toHaveLength(0);
});

it("F2: время под именем вне договора (unscaledTimeKeys) → предупреждение при смене fps", async () => {
  await withStills(15);
  const props = JSON.parse(await readFile(join(req.versionDir, "props.json"), "utf8")) as { content: Record<string, unknown> };
  props.content.intro = { start: 30, end: 60 };
  await writeFile(join(req.versionDir, "props.json"), JSON.stringify(props));
  const r = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined,
    { ...deps(exporting, () => ({ stdout: probeJson({ fps: "60/1" }) })), tempo: cleanTempo });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.warnings.join("\n")).toMatch(/content\.intro\.start.*content\.intro\.end|content\.intro\.end/s);
});

it("F2: сбой сверки темпа — orphaned → stage orphaned, отмена → aborted, прочее → media", async () => {
  await withStills(15);
  const run = (e: Error) => exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined,
    { ...deps(exporting, () => ({ stdout: probeJson({ fps: "60/1" }) })), tempo: () => Promise.reject(e) });
  expect(await run(new FfmpegError("orphaned", "жив"))).toMatchObject({ ok: false, error: { stage: "orphaned" } });
  expect(await run(new FfmpegError("aborted", "стоп"))).toMatchObject({ ok: false, error: { stage: "aborted" } });
  expect(await run(new Error("кадра нет"))).toMatchObject({ ok: false, error: { stage: "media", message: expect.stringMatching(/сверка темпа/) } });
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
