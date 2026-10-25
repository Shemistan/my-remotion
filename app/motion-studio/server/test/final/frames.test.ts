// Task 44: выбор кадров сверки, кадр master под кадром таймлайна, разбор PSNR (без ffmpeg).
import { describe, expect, it } from "vitest";
import { matrixFromColorSpace, parsePsnr, sampleVerifyFrames, sourceFrameAt } from "../../src/final/frames.js";

const clip = (id: string, start: number, duration: number) => ({ clip_id: id, start_frame: start, duration_frames: duration }) as never;

describe("sampleVerifyFrames", () => {
  it("6 кадров вне сцен равномерно и середина каждой сцены, по возрастанию", () => {
    const doc2scenes = { duration_frames: 300, scenes: [clip("c2", 180, 30), clip("c1", 120, 30)] };
    const got = sampleVerifyFrames(doc2scenes);
    expect(got.map((f) => f.kind)).toEqual(["source", "source", "source", "scene", "source", "scene", "source", "source"]);
    expect(got).toEqual([
      { frame: 20, kind: "source" }, { frame: 60, kind: "source" }, { frame: 100, kind: "source" },
      { frame: 135, kind: "scene", clip_id: "c1" }, { frame: 170, kind: "source" },
      { frame: 195, kind: "scene", clip_id: "c2" }, { frame: 240, kind: "source" }, { frame: 280, kind: "source" },
    ]);
  });

  it("сцен больше 6 — 6 равномерно; кадры сверки исходника не попадают в окна сцен", () => {
    const starts = Array.from({ length: 9 }, (_, k) => k * 100 + 10);
    const got = sampleVerifyFrames({ duration_frames: 1000, scenes: starts.map((s, k) => clip(`c${k}`, s, 50)) });
    expect(got.filter((f) => f.kind === "scene")).toHaveLength(6);
    expect(got.filter((f) => f.kind === "source")).toHaveLength(6);
    for (const f of got.filter((x) => x.kind === "source")) expect(starts.some((s) => f.frame >= s && f.frame < s + 50), `кадр ${f.frame}`).toBe(false);
  });

  it("короткий ролик без свободных кадров и пустой ролик", () => {
    expect(sampleVerifyFrames({ duration_frames: 3, scenes: [] }).map((f) => f.frame)).toEqual([0, 1, 2]);
    expect(sampleVerifyFrames({ duration_frames: 30, scenes: [clip("c", 0, 30)] })).toEqual([{ frame: 15, kind: "scene", clip_id: "c" }]);
    expect(sampleVerifyFrames({ duration_frames: 0, scenes: [] })).toEqual([]);
  });
});

describe("sourceFrameAt", () => {
  const doc = { video: [{ idx: 0, from: 0, durationInFrames: 90, startFrom: 0 }, { idx: 1, from: 90, durationInFrames: 180, startFrom: 120 }] };
  it("кадр таймлайна → кадр master по последовательностям", () => {
    expect(sourceFrameAt(doc, 0)).toBe(0);
    expect(sourceFrameAt(doc, 89)).toBe(89);
    expect(sourceFrameAt(doc, 90)).toBe(120);
    expect(sourceFrameAt(doc, 269)).toBe(299);
    expect(sourceFrameAt(doc, 270)).toBeUndefined();
  });
});

describe("parsePsnr", () => {
  it("Y, U, V по сводке psnr (yuv420p), inf → 99, нет сводки — ошибка", () => {
    expect(parsePsnr("[Parsed_psnr_4 @ 0x1] PSNR y:44.01 u:41.20 v:40.10 average:43.00 min:43.00 max:43.00\n")).toEqual({ y: 44.01, u: 41.2, v: 40.1 });
    expect(parsePsnr("[Parsed_psnr_4 @ 0x1] PSNR y:inf u:inf v:inf average:inf min:inf max:inf\n")).toEqual({ y: 99, u: 99, v: 99 });
    expect(() => parsePsnr("ничего")).toThrow(/psnr/);
  });
});

describe("matrixFromColorSpace", () => {
  it("теги ffprobe → матрица; неизвестно — undefined", () => {
    expect(matrixFromColorSpace("bt709")).toBe("bt709");
    expect(matrixFromColorSpace("smpte170m")).toBe("bt601");
    expect(matrixFromColorSpace("bt470bg")).toBe("bt601");
    expect(matrixFromColorSpace("unknown")).toBeUndefined();
    expect(matrixFromColorSpace(undefined)).toBeUndefined();
  });
});
