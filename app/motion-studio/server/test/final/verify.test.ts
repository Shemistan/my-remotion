// Task 44: ffprobe-гейт финала, число кадров при смене fps и правила провала отчёта (без ffmpeg).
import { describe, expect, it } from "vitest";
import { type FinalProbe, finalFrames, finalProbeGate, verifyFailures } from "../../src/final/verify.js";

const F30 = { num: 30, den: 1 };
const probe = (o: Partial<FinalProbe> & { durationUs?: number } = {}): FinalProbe => {
  const { durationUs = 8_500_000, ...rest } = o;
  return { durationMs: durationUs / 1000, width: 1920, height: 1080, fps: F30, codec: "h264", audioCodec: "aac", pixFmt: "yuv420p", audioSampleRate: 48_000, audioChannels: 2, ...rest };
};
const exp = (frames: number) => ({ width: 1920, height: 1080, fps: F30, frames, audioChannels: 2 });

describe("finalProbeGate", () => {
  it("+1 кадр — в допуске, +2 — duration", () => {
    expect(finalProbeGate(probe({ durationUs: 8_533_333 }), exp(255))).toEqual([]);
    expect(finalProbeGate(probe({ durationUs: 8_466_667 }), exp(255))).toEqual([]);
    expect(finalProbeGate(probe({ durationUs: 8_566_667 }), exp(255))).toEqual([expect.stringMatching(/^duration/)]);
  });

  it("pix_fmt, кодеки, размер, fps, частота и каналы звука", () => {
    expect(finalProbeGate(probe({ pixFmt: "yuv444p" }), exp(255))).toEqual([expect.stringMatching(/^pix_fmt/)]);
    expect(finalProbeGate(probe({ codec: "hevc" }), exp(255))).toEqual([expect.stringMatching(/^codec/)]);
    const noAudio = probe();
    delete noAudio.audioCodec;
    expect(finalProbeGate(noAudio, exp(255))).toEqual([expect.stringMatching(/^audio_codec/)]);
    expect(finalProbeGate(probe({ width: 1280 }), exp(255))).toEqual([expect.stringMatching(/^size/)]);
    expect(finalProbeGate(probe({ fps: { num: 25, den: 1 } }), exp(255))).toEqual([expect.stringMatching(/^fps/)]);
    expect(finalProbeGate(probe({ audioSampleRate: 44_100 }), exp(255))).toEqual([expect.stringMatching(/^audio_sample_rate/)]);
    expect(finalProbeGate(probe({ audioChannels: 1 }), exp(255))).toEqual([expect.stringMatching(/^audio_channels/)]);
    expect(finalProbeGate(probe({ audioChannels: 1 }), { ...exp(255), audioChannels: undefined })).toEqual([]);
  });

  it("NTSC: допуск — кадр 30000/1001 + 1 мкс", () => {
    const ntsc = { num: 30000, den: 1001 };
    // 300 кадров = 10 010 000 мкс, кадр = 33 367 мкс
    expect(finalProbeGate(probe({ fps: ntsc, durationUs: 10_043_367 }), { ...exp(300), fps: ntsc })).toEqual([]);
    expect(finalProbeGate(probe({ fps: ntsc, durationUs: 10_043_369 }), { ...exp(300), fps: ntsc })).toEqual([expect.stringMatching(/^duration/)]);
  });
});

describe("finalFrames", () => {
  it("тот же fps — кадры таймлайна, иначе пропорционально", () => {
    expect(finalFrames({ fps: F30, duration_frames: 270 }, F30)).toBe(270);
    expect(finalFrames({ fps: F30, duration_frames: 270 }, { num: 60, den: 1 })).toBe(540);
    expect(finalFrames({ fps: F30, duration_frames: 271 }, { num: 25, den: 1 })).toBe(226);
  });
});

describe("verifyFailures", () => {
  const ok = {
    probe: [], duration: { expected_frames: 270, actual_us: 9_000_000, delta_frames: 0 }, sync: [],
    frames: [
      { frame: 10, kind: "source" as const, psnr_db: 42, offset: 0 },
      { frame: 50, kind: "source" as const, psnr_db: 40, offset: "inconclusive" as const },
      { frame: 195, kind: "scene" as const, clip_id: "c1", psnr_db: 35, offset: 0 },
    ],
    loudness: { source_lufs: -23, final_lufs: -23.1, delta_lu: -0.1, final_peak_db: -3, source_peak_db: -3.05 },
  };
  it("всё в порогах — пусто", () => {
    expect(verifyFailures(ok, true)).toEqual([]);
  });
  it("каждая проверка проваливается своим именем", () => {
    expect(verifyFailures({ ...ok, probe: ["pix_fmt yuv444p"] }, true)).toEqual(["probe"]);
    expect(verifyFailures({ ...ok, duration: { ...ok.duration, delta_frames: 2 } }, true)).toEqual(["duration"]);
    expect(verifyFailures({ ...ok, duration: { ...ok.duration, delta_frames: -1 } }, true)).toEqual([]);
    expect(verifyFailures(ok, false)).toEqual(["sync"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[0]!, offset: 1 }] }, true)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[0]!, psnr_db: 29.9 }] }, true)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[2]!, psnr_db: 20 }] }, true)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, loudness: { ...ok.loudness, delta_lu: 0.6 } }, true)).toEqual(["loudness"]);
    expect(verifyFailures({ ...ok, loudness: { ...ok.loudness, final_peak_db: -2.9 } }, true)).toEqual(["loudness"]);
  });
});
