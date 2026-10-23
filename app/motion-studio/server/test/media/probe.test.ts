// Task 25: разбор ffprobe (чистая функция) на реальных выводах ffprobe фикстур.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MediaInvalidError, parseProbe } from "../../src/media/probe.js";

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
    expect(v.timeline_fps.num / v.timeline_fps.den).toBeGreaterThan(25);
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
