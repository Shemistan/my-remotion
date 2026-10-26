// Task 44: полная проверка финала на реальном ffmpeg (final-like: вырезка + сцена на 150–239).
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
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
    expect(r).toMatchObject({ sync_check: { status: "ok" }, color_matrix: "bt601" });
    expect(r.frames_skipped).toBeUndefined();
    // каналы: моно исходника продублировано в L и R
    expect(r.channels).toMatchObject({ mode: "mono", source_channels: 1, final_channels: 2, ok: true });
    expect(r.channels!.rms_diff_db!).toBeLessThan(1);
    expect(r.channels!.corr!).toBeGreaterThan(0.99);
    // RGB-still против финала yuv420p: по Y выше порога, U/V записаны
    const scene = r.frames.find((f) => f.kind === "scene")!;
    expect(scene.psnr_db).toBeGreaterThan(35);
    expect(scene.psnr_u_db).toBeGreaterThan(25);
    expect(scene.psnr_v_db).toBeGreaterThan(25);
    // кадры и WAV проверки удалены
    expect(await readdir(join(dir, "ok"))).toEqual([]);
  }, 180_000);

  it("fix 1: не та матрица финала (bt709 вместо bt601) → frames", async () => {
    const r = await verifyFinal({ ...okInput(await work("matrix")), colorMatrix: "bt709" });
    expect(r.color_matrix).toBe("bt709");
    expect(r.failures).toEqual(["frames"]);
  }, 180_000);

  it("fix 1: кадр вне doc.video — пропуск с причиной, не провал; без слов — синхронность «не проверено»", async () => {
    const base = okInput(await work("skip"));
    const video = base.doc.video.map((v, k, all) => (k === all.length - 1 ? { ...v, durationInFrames: 250 - v.from } : v));
    const r = await verifyFinal({ ...base, doc: { ...base.doc, video }, words: [] });
    expect(r.frames_skipped).toEqual([{ frame: 255, kind: "source", reason: expect.stringMatching(/вне последовательностей/) }]);
    expect(r.frames.map((f) => f.frame)).not.toContain(255);
    expect(r.sync).toEqual([]);
    expect(r.sync_check).toEqual({ status: "unchecked", message: expect.stringMatching(/не проверена/) });
    expect(r).toMatchObject({ verdict: "pass", failures: [] });
  }, 180_000);

  it("Task 43 fix 1: звук только в левом канале → channels; теги цвета не bt709 → probe", async () => {
    const left = await verifyFinal({ ...okInput(await work("left")), finalPath: fx("final-like-left.mp4") });
    expect(left.failures).toContain("channels");
    expect(left.channels).toMatchObject({ mode: "mono", ok: false });
    const tags = await verifyFinal({ ...okInput(await work("tags")), expectColorTags: "bt709" });
    expect(tags.failures).toEqual(["probe"]);
    expect(tags.probe).toEqual([expect.stringMatching(/^color_tags .*ожидались bt709/)]);
    expect(tags.color_tags).toBeDefined();
  }, 300_000);

  it("delayed-audio → sync в failures", async () => {
    const r = await verifyFinal({ ...okInput(await work("delayed")), finalPath: fx("delayed-audio-st.mp4") });
    expect(r.verdict).toBe("fail");
    expect(r.failures).toContain("sync");
  }, 180_000);

  it("louder → loudness; still вместо сцены → frames", async () => {
    const loud = await verifyFinal({ ...okInput(await work("louder")), finalPath: fx("louder-st.mp4"), editedAudio: fx("counter-30.mp4") });
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
