// Task 44: ffprobe-гейт финала, число кадров при смене fps и правила провала отчёта (без ffmpeg).
import { describe, expect, it } from "vitest";
import { type FinalProbe, finalFrames, finalProbeGate, syncStatus, verifyFailures } from "../../src/final/verify.js";

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
  const o = { sync: "ok" as const, fps: F30 };
  it("всё в порогах — пусто; синхронность «не проверено» — не провал", () => {
    expect(verifyFailures(ok, o)).toEqual([]);
    expect(verifyFailures(ok, { ...o, sync: "unchecked" })).toEqual([]);
  });
  it("каждая проверка проваливается своим именем", () => {
    expect(verifyFailures({ ...ok, probe: ["pix_fmt yuv444p"] }, o)).toEqual(["probe"]);
    expect(verifyFailures(ok, { ...o, sync: "failed" })).toEqual(["sync"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[0]!, offset: 1 }] }, o)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[0]!, psnr_db: 29.9 }] }, o)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[2]!, psnr_db: 20 }] }, o)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, loudness: { ...ok.loudness, delta_lu: 0.6 } }, o)).toEqual(["loudness"]);
  });
  it("fix 1, I3: длительность — по точной разнице в мкс (±1 кадр + 1 мкс), delta_frames — справочно", () => {
    const at = (us: number) => ({ ...ok, duration: { expected_frames: 270, actual_us: us, delta_frames: Math.round((us - 9_000_000) / 33_334) } });
    expect(verifyFailures(at(9_033_334), o)).toEqual([]);
    expect(verifyFailures(at(8_966_666), o)).toEqual([]);
    expect(verifyFailures(at(9_033_335), o)).toEqual([]);
    expect(verifyFailures(at(9_033_336), o)).toEqual(["duration"]);
    // +1,4 кадра: delta_frames округляется до 1, но это провал
    expect(at(9_046_667).duration.delta_frames).toBe(1);
    expect(verifyFailures(at(9_046_667), o)).toEqual(["duration"]);
  });
  it("fix 1, I1: кадр по яркости ≥ 30 дБ, U/V — мягкий порог 25 дБ", () => {
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[2]!, psnr_db: 31, psnr_u_db: 26, psnr_v_db: 27 }] }, o)).toEqual([]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[2]!, psnr_db: 40, psnr_u_db: 24.9 }] }, o)).toEqual(["frames"]);
    expect(verifyFailures({ ...ok, frames: [{ ...ok.frames[0]!, psnr_db: 40, psnr_v_db: 20 }] }, o)).toEqual(["frames"]);
  });
  it("fix 1, I2: true peak — провал, только если финал выше −0,1 dBTP, а звук ниже", () => {
    const l = (final_peak_db: number, source_peak_db: number) => ({ ...ok, loudness: { ...ok.loudness, final_peak_db, source_peak_db } });
    // перебор AAC на речи ниже потолка — не провал
    expect(verifyFailures(l(-0.4, -1.2), o)).toEqual([]);
    expect(verifyFailures(l(-0.1, -1.2), o)).toEqual([]);
    expect(verifyFailures(l(-0.05, -1.2), o)).toEqual(["loudness"]);
    expect(verifyFailures(l(0.3, -0.5), o)).toEqual(["loudness"]);
    // звук уже у потолка — финал не виноват
    expect(verifyFailures(l(0.2, 0.1), o)).toEqual([]);
  });
});

describe("syncStatus", () => {
  const s = (offset_us: number, corr: number, energy = true) => ({ word_id: "w_000001", offset_us, corr, energy, pass: 1 as const });
  it("без замеров и на тишине — unchecked; сдвиг больше кадра — failed; иначе ok", () => {
    expect(syncStatus([], 33_335)).toMatchObject({ status: "unchecked" });
    expect(syncStatus([s(0, 0.1, false), s(500_000, 0.2, false)], 33_335)).toMatchObject({ status: "unchecked" });
    expect(syncStatus([s(66_000, 0.9), s(66_000, 0.9)], 33_335)).toMatchObject({ status: "failed" });
    expect(syncStatus([s(0, 0.9), s(1_000, 0.8)], 33_335)).toMatchObject({ status: "ok" });
  });
});
