// exportVersion с `overlay` (S6, Р5): ProRes 4444 с альфой из непрозрачной версии —
// перерендер с props.style.transparent = true; worker и ffprobe подменены.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpawnTrackedOptions, SpawnTrackedResult } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type ExportVersionRequest, exportVersion } from "../src/node/export-version.js";
import type { WorkerJob } from "../src/node/protocol.js";
import type { RenderDeps } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const FFPROBE = "/fake/ffprobe";
const PRORES = JSON.stringify({
  streams: [{ codec_type: "video", codec_name: "prores", width: 1280, height: 720, r_frame_rate: "30/1", pix_fmt: "yuva444p10le", profile: "4444" }],
  format: { duration: "3.0" },
});

interface Call { cmd: string; opts: SpawnTrackedOptions }
let tmp: string;
let req: ExportVersionRequest;
let calls: Call[];
const jobOf = (c: Call) => JSON.parse(c.opts.stdin ?? "{}") as WorkerJob;

function deps(): RenderDeps {
  return {
    browserPath: async () => "/fake/chrome-headless-shell",
    ffprobeBin: async () => FFPROBE,
    spawn: async (_root, _ref, cmd, _args, opts) => {
      const c = { cmd, opts };
      calls.push(c);
      let r: Partial<SpawnTrackedResult> = { stdout: PRORES };
      if (cmd !== FFPROBE) {
        const job = jobOf(c);
        await writeFile(job.export!.out, "video");
        r = { stdout: JSON.stringify({ ok: true, stills: [], exportPath: job.export!.out, browserLogs: [] }) + "\n" };
      }
      return { code: 0, signal: null, stdout: "", stderr: "", orphaned: false, ...r };
    },
  };
}

beforeEach(async () => {
  tmp = await makeTmp();
  const root = await makeStore(tmp);
  await mkdir(join(tmp, "cache"));
  await mkdir(join(tmp, "draft"));
  const versionDir = await copyFixture("transparent-scene", join(tmp, "v1"));
  // непрозрачная версия: фон сцены рисует Background
  const props = JSON.parse(await import("node:fs/promises").then((f) => f.readFile(join(versionDir, "props.json"), "utf8")));
  props.style.transparent = false;
  await writeFile(join(versionDir, "props.json"), JSON.stringify(props));
  req = {
    versionDir,
    settings: { ...(await fixtureSettings("transparent-scene")), transparent_export: false },
    request: { format: "prores4444", crf: 18, scale: 1, overlay: true },
    cacheDir: join(tmp, "cache"),
    outPath: join(tmp, "draft", "scene.mov"),
    timeoutMs: 60_000,
    run: { root, runId: "job1", attempt: 1 },
  };
  calls = [];
});
afterEach(() => removeTmp(tmp));

it("overlay: props.style.transparent = true, остальные props как у версии; ProRes 4444 с альфой", async () => {
  const r = await exportVersion(req, undefined, deps());
  expect(r).toMatchObject({ ok: true, gate: [] });
  const job = jobOf(calls[0]!);
  const props = job.inputProps as { style: { transparent: boolean; preset: string }; content: { title: string } };
  expect(props.style).toMatchObject({ transparent: true, preset: "dark-premium" });
  expect(props.content.title).toBe("Прозрачный экспорт");
  expect(job.export).toMatchObject({ codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png" });
});

it("без overlay props версии не меняются", async () => {
  await exportVersion({ ...req, request: { format: "prores4444", crf: 18, scale: 1 } }, undefined, deps());
  expect((jobOf(calls[0]!).inputProps as { style: { transparent: boolean } }).style.transparent).toBe(false);
});

it("props вне ScenePropsBase → unsupported overlay_unsupported до рендера", async () => {
  await writeFile(join(req.versionDir, "props.json"), JSON.stringify({ not: "base" }));
  const r = await exportVersion(req, undefined, deps());
  expect(r).toMatchObject({ ok: false, error: { stage: "unsupported", message: expect.stringMatching(/^overlay_unsupported: /) } });
  expect(calls).toHaveLength(0);
});

it("overlay с mp4 → unsupported overlay_mp4; со сменой fps → overlay_unsupported", async () => {
  const mp4 = await exportVersion({ ...req, outPath: join(tmp, "draft", "scene.mp4"), request: { format: "mp4", crf: 18, scale: 1, overlay: true } }, undefined, deps());
  expect(mp4).toMatchObject({ ok: false, error: { stage: "unsupported", message: expect.stringMatching(/^overlay_mp4: /) } });
  const fps = await exportVersion({ ...req, request: { ...req.request, fps: 60 } }, undefined, deps());
  expect(fps).toMatchObject({ ok: false, error: { stage: "unsupported", message: expect.stringMatching(/^overlay_unsupported: .*fps/) } });
  expect(calls).toHaveLength(0);
});

it("версия уже прозрачная — overlay игнорируется (props как есть)", async () => {
  const r = await exportVersion({ ...req, settings: { ...req.settings, transparent_export: true } }, undefined, deps());
  expect(r).toMatchObject({ ok: true });
  expect((jobOf(calls[0]!).inputProps as { style: { transparent: boolean } }).style.transparent).toBe(false);
});
