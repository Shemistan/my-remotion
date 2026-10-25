// Task 44: воспроизводимость — два экспорта final-like на реальном ffmpeg.
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FinalManifest, FinalManifestSchema } from "@ms/contracts";
import { compareExports } from "../../src/final/compare.js";
import { F30, REQUEST, fx, prepare } from "./media.js";

let dir: string;
beforeAll(async () => {
  dir = await prepare("ms-final-compare-");
}, 180_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const sha = (c: string) => c.repeat(64);
const ref = { id: "x", revision: 1, hash: sha("a") };
const manifest = (exportId: string, inputsHash = sha("b")): FinalManifest => FinalManifestSchema.parse({
  schema_version: 1, export_id: exportId, project_id: "p1", timeline: { id: "tl1", revision: 1, hash: sha("c") },
  inputs: { edl: ref, plan: ref, style: ref, media_sha256: sha("d"), master_sha256: sha("e"), audio_sha256: sha("f"), scenes: [{ clip_id: "clip_s1", version_id: "v1", manifest_sha256: sha("1") }] },
  request: REQUEST, output: { width: 640, height: 360, fps: F30, frames: 270 },
  render_env: { remotion: "4.0.537", render_lock_sha256: sha("2"), motion_kit: "0.5.9", chrome_headless_shell: "x", node: "22.21.1" },
  inputs_hash: inputsHash,
  ffprobe: { durationMs: 9000, width: 640, height: 360, fps: F30, codec: "h264" },
  verify: { verdict: "pass", report: "verify.json" }, created_at: "2026-10-25T00:00:00.000Z",
});

describe("compareExports", () => {
  it("две копии → reproduced, sha256 совпадает", async () => {
    const b = join(dir, "b.mp4");
    await copyFile(fx("final-like.mp4"), b);
    const work = join(dir, "w1");
    await mkdir(work);
    const r = await compareExports({ ...manifest("e1"), path: fx("final-like.mp4") }, { ...manifest("e2"), path: b }, { workDir: work });
    expect(r).toMatchObject({ inputs_equal: true, probe_equal: true, file_sha256_equal: true, verdict: "reproduced" });
    expect(r.frames).toHaveLength(12);
    expect(r.frames.every((f) => f.psnr_db === 99)).toBe(true);
    expect(await readdir(work)).toEqual([]);
  }, 120_000);

  it("другие входы или другой файл → differs", async () => {
    const work = join(dir, "w2");
    await mkdir(work);
    const r = await compareExports({ ...manifest("e1"), path: fx("final-like.mp4") }, { ...manifest("e2", sha("9")), path: fx("final-like.mp4") }, { workDir: work });
    expect(r).toMatchObject({ inputs_equal: false, verdict: "differs" });
    const work3 = join(dir, "w3");
    await mkdir(work3);
    const r2 = await compareExports({ ...manifest("e1"), path: fx("final-like.mp4") }, { ...manifest("e2"), path: fx("louder.mp4") }, { workDir: work3 });
    expect(r2).toMatchObject({ inputs_equal: true, probe_equal: false, file_sha256_equal: false, verdict: "differs" });
  }, 120_000);
});
