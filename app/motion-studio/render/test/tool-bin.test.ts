// S19: ffmpeg/ffprobe рендера — сначала закреплённая сборка `.deps/ffmpeg`, потом PATH.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ffmpegBin } from "../src/node/ffmpeg.js";
import { ffprobeBin } from "../src/node/ffprobe.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
const saved = { deps: process.env.MS_DEPS_DIR, path: process.env.PATH };
beforeEach(async () => {
  tmp = await makeTmp();
});
afterEach(async () => {
  for (const [k, v] of [["MS_DEPS_DIR", saved.deps], ["PATH", saved.path]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await removeTmp(tmp);
});

const exe = (dir: string, name: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), "#!/bin/sh\n");
  chmodSync(join(dir, name), 0o755);
};

it("ffmpegBin/ffprobeBin: .deps/ffmpeg раньше PATH; нигде нет — ошибка с подсказкой ./setup", async () => {
  const deps = join(tmp, "deps");
  const sys = join(tmp, "sys");
  exe(sys, "ffmpeg");
  exe(sys, "ffprobe");
  process.env.MS_DEPS_DIR = deps;
  process.env.PATH = sys;
  expect(await ffmpegBin()).toBe(join(sys, "ffmpeg"));
  exe(join(deps, "ffmpeg"), "ffmpeg");
  exe(join(deps, "ffmpeg"), "ffprobe");
  expect(await ffmpegBin()).toBe(join(deps, "ffmpeg", "ffmpeg"));
  expect(await ffprobeBin()).toBe(join(deps, "ffmpeg", "ffprobe"));
  process.env.MS_DEPS_DIR = join(tmp, "none");
  process.env.PATH = join(tmp, "none");
  await expect(ffmpegBin()).rejects.toThrow(/\.\/setup/);
  await expect(ffprobeBin()).rejects.toThrow(/\.\/setup/);
});
