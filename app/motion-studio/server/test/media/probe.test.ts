// Task 25: разбор ffprobe (чистая функция) на реальных выводах ffprobe фикстур.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MediaInvalidError, demuxerFor, demuxerForExt, parseProbe, parsePtsCsv, vfrTimelineFps } from "../../src/media/probe.js";
import { detectVfr } from "../../src/media/vfr.js";

const fx = (name: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/ffprobe/${name}`, import.meta.url), "utf8"));
const ptsCfr = Array.from({ length: 300 }, (_, i) => Math.round((i * 1_000_000) / 30));

describe("parseProbe", () => {
  it("CFR 1280×720 30/1 со звуком", () => {
    const cfr = parseProbe(fx("cfr.json"), ptsCfr);
    expect(cfr).toMatchObject({ video: { width: 1280, height: 720, rotation: 0 }, vfr: false, timeline_fps: { num: 30, den: 1 }, audio: { sample_rate: expect.any(Number) } });
    expect(cfr).toMatchObject({ duration_us: 20_000_000, start_time_us: 0, video: { codec: "h264", pix_fmt: "yuv420p", bit_depth: 8, display_width: 1280, display_height: 720 } });
    expect(cfr.container).toMatch(/mp4/);
    expect(cfr.size_bytes).toBeGreaterThan(0);
  });

  it("поворот: display_* в отображаемой ориентации", () => {
    expect(parseProbe(fx("rotated.json"), ptsCfr)).toMatchObject({ video: { display_width: 720, display_height: 1280 } });
    expect(Math.abs(parseProbe(fx("rotated.json"), ptsCfr).video.rotation)).toBe(90);
  });

  it("без звука — audio нет", () => {
    expect(parseProbe(fx("no-audio.json"), ptsCfr).audio).toBeUndefined();
  });

  it("VFR: таймлайн — snapFps(avg_frame_rate), vfr по pts", () => {
    const pts = Array.from({ length: 300 }, (_, i) => (i < 150 ? i * 40_000 : 6_000_000 + (i - 150) * 33_333));
    const v = parseProbe(fx("vfr.json"), pts);
    expect(v.vfr).toBe(true);
    expect(v.timeline_fps).toEqual({ num: 30, den: 1 }); // I2: стандарт сверху к частоте по p10 интервалов
    expect(v.video.start_time_us).toBe(21_000);
  });

  it("I1: start_time потоков, длительность до конца самого длинного потока от начала файла", () => {
    const cfr = parseProbe(fx("cfr.json"), ptsCfr);
    expect(cfr.video.start_time_us).toBe(0);
    expect(cfr.audio?.start_time_us).toBe(0);
    const j = fx("cfr.json") as { streams: Record<string, unknown>[]; format: Record<string, unknown> };
    const late = {
      ...j,
      streams: j.streams.map((s) => (s.codec_type === "video" ? { ...s, start_time: "0.500000", duration: "4.000000" } : { ...s, start_time: "0.000000", duration: "4.500000" })),
      format: { ...j.format, start_time: "0.000000", duration: "4.500000" },
    };
    expect(parseProbe(late, ptsCfr)).toMatchObject({ duration_us: 4_500_000, start_time_us: 0, video: { start_time_us: 500_000 }, audio: { start_time_us: 0 } });
    // начало файла не ноль: шкала от него
    const shifted = {
      ...late,
      streams: late.streams.map((s) => ({ ...s, start_time: (s as { codec_type?: string }).codec_type === "video" ? "10.500000" : "10.000000" })),
      format: { ...late.format, start_time: "10.000000" },
    };
    expect(parseProbe(shifted, ptsCfr)).toMatchObject({ duration_us: 4_500_000, start_time_us: 10_000_000 });
  });

  it("I2: vfrTimelineFps — стандарт сверху в пределах 5 %, иначе snapFps(r_frame_rate), иначе 30/1", () => {
    expect(vfrTimelineFps(33_333, { num: 30, den: 1 })).toEqual({ num: 30, den: 1 });
    expect(vfrTimelineFps(40_000, { num: 90_000, den: 1 })).toEqual({ num: 25, den: 1 });
    expect(vfrTimelineFps(16_683, { num: 60_000, den: 1001 })).toEqual({ num: 60000, den: 1001 });
    expect(vfrTimelineFps(1e6 / 29, { num: 90_000, den: 1 })).toEqual({ num: 30000, den: 1001 });
    // 27 fps: ближайший сверху 29,97 дальше 5 % → snapFps(r_frame_rate), не стандарт → 30/1
    expect(vfrTimelineFps(1e6 / 27, { num: 25, den: 1 })).toEqual({ num: 25, den: 1 });
    expect(vfrTimelineFps(1e6 / 27, { num: 90_000, den: 1 })).toEqual({ num: 30, den: 1 });
    expect(vfrTimelineFps(0, { num: 90_000, den: 1 })).toEqual({ num: 30, den: 1 });
  });

  it("N1 (ревью Task 25): VFR около 24 с фликером pts — 24/1, не 25/1; средняя частота в симметричном допуске 2 %", () => {
    // номинал 24, pts дрожат ±1 667 µs: p10(Δ) ≈ 40 000 (25 fps), среднее 41 667 (24 fps)
    const pts = Array.from({ length: 240 }, (_, i) => Math.round((i * 1e6) / 24) + (i % 2 ? 1_667 : 0));
    const v = detectVfr(pts);
    expect(v.vfr).toBe(true);
    expect(vfrTimelineFps(v.p10DeltaUs, { num: 90_000, den: 1 }, v.meanDeltaUs)).toEqual({ num: 24, den: 1 });
    // 23,976 с фликером — 24000/1001
    expect(vfrTimelineFps(40_000, { num: 90_000, den: 1 }, 1e6 / (24000 / 1001))).toEqual({ num: 24000, den: 1001 });
    // 30 с выпавшими кадрами: среднее 29,5 — кандидаты 29,97 и 30, рабочая частота p10 решает → 30/1
    expect(vfrTimelineFps(33_333, { num: 30, den: 1 }, 1e6 / 29.5)).toEqual({ num: 30, den: 1 });
    // смесь 25 + 30: среднее 27,5 ни к чему не ближе 2 % → прежнее правило по p10 → 30/1
    expect(vfrTimelineFps(33_333, { num: 90_000, den: 1 }, 1e6 / 27.5)).toEqual({ num: 30, den: 1 });
  });

  it("pts из csv ffprobe: пустые строки и N/A не превращаются в 0 (иначе видео с началом 0,5 с — «VFR»)", () => {
    expect(parsePtsCsv("0.500000\n0.533333,\nN/A\n\n0.566667\n")).toEqual([500_000, 533_333, 566_667]);
  });

  it("M1: демультиплексор ffmpeg по контейнеру и по расширению", () => {
    expect(demuxerFor("mov,mp4,m4a,3gp,3g2,mj2")).toBe("mov");
    expect(demuxerFor("matroska,webm")).toBe("matroska");
    expect(() => demuxerFor("hls")).toThrow(/media_invalid/);
    expect(demuxerForExt("clip.MOV")).toBe("mov");
    expect(demuxerForExt("a.m4v")).toBe("mov");
    expect(demuxerForExt("a.webm")).toBe("matroska");
    expect(() => demuxerForExt("a.m3u8")).toThrow(/media_invalid/);
  });

  it("нет видеопотока / мусор → media_invalid", () => {
    const j = fx("cfr.json") as { streams: { codec_type: string }[] };
    expect(() => parseProbe({ ...j, streams: j.streams.filter((s) => s.codec_type !== "video") }, [])).toThrow(MediaInvalidError);
    expect(() => parseProbe({ nope: 1 }, [])).toThrow(/media_invalid/);
  });

  it("недопустимый контейнер (concat/hls и т. п.) → media_invalid", () => {
    const j = fx("cfr.json") as { format: Record<string, unknown> };
    expect(() => parseProbe({ ...j, format: { ...j.format, format_name: "hls" } }, ptsCfr)).toThrow(/media_invalid/);
    expect(() => parseProbe({ ...j, format: { ...j.format, format_name: "concat" } }, ptsCfr)).toThrow(/media_invalid/);
  });
});
