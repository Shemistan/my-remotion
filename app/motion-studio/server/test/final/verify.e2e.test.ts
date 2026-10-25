// Task 44: полная проверка финала на реальном ffmpeg (final-like: вырезка + сцена на 150–239).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinalVerifyReportSchema } from "@ms/contracts";
import { verifyFinal } from "../../src/final/verify.js";
import { fx, okInput, prepare } from "./media.js";

let dir: string;
beforeAll(async () => {
  dir = await prepare("ms-final-verify-");
}, 180_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const work = async (name: string) => {
  const d = join(dir, name);
  await mkdir(d, { recursive: true });
  return d;
};

describe("verifyFinal", () => {
  it("final-like → pass", async () => {
    const r = await verifyFinal(okInput(await work("ok")));
    if (process.env.MS_FINAL_VERIFY_OUT) await writeFile(process.env.MS_FINAL_VERIFY_OUT, JSON.stringify(r, null, 2) + "\n");
    expect(FinalVerifyReportSchema.parse(r)).toEqual(r);
    expect(r).toMatchObject({ verdict: "pass", failures: [], probe: [], duration: { expected_frames: 270, delta_frames: 0 } });
    expect(r.frames.map((f) => f.kind)).toEqual(["source", "source", "source", "source", "source", "scene", "source"]);
    expect(r.sync.length).toBe(5);
  }, 180_000);

  it("delayed-audio → sync в failures", async () => {
    const r = await verifyFinal({ ...okInput(await work("delayed")), finalPath: fx("delayed-audio.mp4") });
    expect(r.verdict).toBe("fail");
    expect(r.failures).toContain("sync");
  }, 180_000);

  it("louder → loudness; still вместо сцены → frames", async () => {
    const loud = await verifyFinal({ ...okInput(await work("louder")), finalPath: fx("louder.mp4"), editedAudio: fx("counter-30.mp4") });
    expect(loud.failures).toContain("loudness");
    const base = okInput(await work("still"));
    const wrong = await verifyFinal({ ...base, stillsFor: (frames) => Promise.all(frames.map(() => base.stillsFor([0]).then((x) => x[0]!))) });
    expect(wrong.failures).toEqual(["frames"]);
  }, 300_000);

  it("Review Focus 4: финал сдвинут на 1 кадр относительно исходника → frames, смещение −1", async () => {
    const base = okInput(await work("shift"));
    const doc = { ...base.doc, video: base.doc.video.map((v) => ({ ...v, startFrom: v.startFrom + 1 })) };
    const r = await verifyFinal({ ...base, doc });
    expect(r.failures).toEqual(["frames"]);
    expect(r.frames.filter((f) => f.kind === "source").map((f) => f.offset)).toEqual([-1, -1, -1, -1, -1, -1]);
  }, 180_000);
});
