// Task 44: кадр финала на реальном ffmpeg — точность извлечения и сдвиг кадра против master.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alignmentOffset, extractFrame, psnr } from "../../src/final/frames.js";
import { F30, fx, prepare } from "./media.js";

let dir: string;
beforeAll(async () => {
  dir = await prepare("ms-final-frames-");
}, 180_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const md5 = async (p: string) => createHash("md5").update(await readFile(p)).digest("hex");
const cands = async (video: string, at: number) => {
  const out: { offset: number; path: string }[] = [];
  for (let off = -2; off <= 2; off++) out.push({ offset: off, path: await extractFrame(video, at + off, F30, join(dir, `c-${at}-${off}-${video.length}.png`)) });
  return out;
};

describe("extractFrame и alignmentOffset", () => {
  it("кадр по -ss — тот же, что select=eq(n,145)", async () => {
    const got = await extractFrame(fx("counter-30.mp4"), 145, F30, join(dir, "x145.png"));
    const ref = join(dir, "ref145.png");
    execFileSync("ffmpeg", ["-v", "error", "-i", fx("counter-30.mp4"), "-vf", "select=eq(n\\,145)", "-frames:v", "1", "-update", "1", ref]);
    expect(await md5(got)).toBe(await md5(ref));
    expect(await psnr(got, ref)).toEqual({ y: 99, u: 99, v: 99 });
  }, 60_000);

  it("counter-30: кадр 145 → 0, кадр 146 против кандидатов 145 → 1", async () => {
    const c = await cands(fx("counter-30.mp4"), 145);
    expect((await alignmentOffset(await extractFrame(fx("counter-30.mp4"), 145, F30, join(dir, "t1.png")), c)).offset).toBe(0);
    expect((await alignmentOffset(await extractFrame(fx("counter-30.mp4"), 146, F30, join(dir, "t2.png")), c)).offset).toBe(1);
  }, 60_000);

  it("неподвижный кадр → inconclusive", async () => {
    const r = await alignmentOffset(await extractFrame(fx("still-30.mp4"), 10, F30, join(dir, "t3.png")), await cands(fx("still-30.mp4"), 10));
    expect(r.offset).toBe("inconclusive");
    expect(r.psnr).toBeGreaterThan(40);
  }, 60_000);

  it("кадр за концом ролика — ошибка, прежний файл не выдаётся за кадр", async () => {
    const out = join(dir, "end.png");
    await writeFile(out, "старый кадр");
    await expect(extractFrame(fx("still-30.mp4"), 500, F30, out)).rejects.toThrow(/за концом/);
    await expect(stat(out)).rejects.toThrow();
  }, 60_000);
});
