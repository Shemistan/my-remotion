import { defaultSettings } from "@ms/contracts";
import { expect, it } from "vitest";
import { parseProbe, probeGate } from "../src/node/ffprobe.js";

const s = { ...defaultSettings(), duration_frames: 60 };
const p = { durationMs: 2000, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" };

it("passes a matching probe and flags duration, size, fps and codec", () => {
  expect(probeGate(p, s, 0.5)).toEqual([]);
  expect(probeGate({ ...p, durationMs: 2100 }, s, 0.5)).toHaveLength(1);
  expect(probeGate({ ...p, width: 1920, height: 1080 }, s, 0.5)[0]).toMatch(/width/);
  expect(probeGate({ ...p, fps: { num: 25, den: 1 } }, s, 0.5)[0]).toMatch(/fps/);
  expect(probeGate({ ...p, codec: "hevc" }, s, 0.5)[0]).toMatch(/codec/);
});

it("tolerates exactly one frame of duration drift", () => {
  const frameMs = 1000 / 30;
  expect(probeGate({ ...p, durationMs: 2000 + frameMs }, s, 0.5)).toEqual([]);
  expect(probeGate({ ...p, durationMs: 2000 - frameMs }, s, 0.5)).toEqual([]);
  expect(probeGate({ ...p, durationMs: 2000 + frameMs + 1 }, s, 0.5)).toHaveLength(1);
});

it("compares fractional fps as fractions", () => {
  const ntsc = { ...s, fps: { num: 30000, den: 1001 } };
  expect(probeGate({ ...p, durationMs: (60 * 1001) / 30, fps: { num: 30000, den: 1001 } }, ntsc, 0.5)).toEqual([]);
  expect(probeGate({ ...p, durationMs: (60 * 1001) / 30, fps: { num: 60000, den: 2002 } }, ntsc, 0.5)).toEqual([]);
});

it("parses ffprobe JSON of an H.264 stream", () => {
  const json = {
    streams: [
      { codec_type: "audio", codec_name: "aac" },
      { codec_type: "video", codec_name: "h264", width: 640, height: 360, r_frame_rate: "30/1", avg_frame_rate: "30/1" },
    ],
    format: { duration: "2.000000" },
  };
  expect(parseProbe(JSON.stringify(json))).toEqual({
    durationMs: 2000, width: 640, height: 360, fps: { num: 30, den: 1 }, codec: "h264",
  });
  expect(() => parseProbe(JSON.stringify({ streams: [], format: {} }))).toThrow(/видеопоток/);
});
