// Технический gate экспорта (P1-14): кодек, звук/альфа, размеры, fps, длительность.
import { type ExportRequest, defaultSettings } from "@ms/contracts";
import { expect, it } from "vitest";
import { exportDurationFrames, exportFps, exportGate } from "../src/node/export-gate.js";
import { h264Size, parseProbe } from "../src/node/ffprobe.js";

const s = { ...defaultSettings(), duration_frames: 180 };
const ok = { durationMs: 6000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac" };
const mp4: ExportRequest = { format: "mp4", crf: 18, scale: 1 };
const prores: ExportRequest = { format: "prores4444", crf: 18, scale: 1 };

it("mp4: h264 + aac, размеры, fps и длительность настроек → pass", () => {
  expect(exportGate(ok, mp4, s)).toEqual([]);
});

it("mp4 без звуковой дорожки → первая проблема про audio", () => {
  expect(exportGate({ ...ok, audioCodec: undefined }, mp4, s)[0]).toMatch(/audio/);
});

it("mp4 не h264 → проблема кодека", () => {
  expect(exportGate({ ...ok, codec: "hevc" }, mp4, s)[0]).toMatch(/codec hevc/);
});

it("prores4444 без альфы (yuv422p10le) → первая проблема про yuva444p10le", () => {
  expect(exportGate({ ...ok, codec: "prores", pixFmt: "yuv422p10le" }, prores, s)[0]).toMatch(/yuva444p10le/);
});

it("prores4444 с альфой → pass; звук не обязателен", () => {
  expect(exportGate({ ...ok, codec: "prores", pixFmt: "yuva444p10le", audioCodec: undefined }, prores, s)).toEqual([]);
  // ffprobe ffmpeg 7 читает ProRes 4444 как 12-битный yuva444p12le — альфа та же
  expect(exportGate({ ...ok, codec: "prores", pixFmt: "yuva444p12le", audioCodec: undefined }, prores, s)).toEqual([]);
  expect(exportGate({ ...ok, codec: "prores", pixFmt: "yuv444p12le" }, prores, s)[0]).toMatch(/альфа/);
});

it("L7: размеры mp4 через h264Size (9:16, scale 0.5)", () => {
  const s9 = { ...defaultSettings(), aspect_ratio: "9:16" as const, width: 1080, height: 1920 };
  expect(exportGate({ ...ok, width: h264Size(1080, 0.5), height: h264Size(1920, 0.5) }, { format: "mp4", crf: 18, scale: 0.5 }, s9)).toEqual([]);
  expect(exportGate({ ...ok, width: 1080, height: 1920 }, { format: "mp4", crf: 18, scale: 0.5 }, s9).join("; ")).toMatch(/width 1080, ожидалось 540/);
});

it("fps из запроса: 60 fps — та же длительность ± 1 кадр, fps 60/1", () => {
  const r60: ExportRequest = { ...mp4, fps: 60 };
  expect(exportFps(s, r60)).toEqual({ num: 60, den: 1 });
  expect(exportDurationFrames(s, r60)).toBe(360);
  expect(exportGate({ ...ok, fps: { num: 60, den: 1 } }, r60, s)).toEqual([]);
  expect(exportGate({ ...ok, fps: { num: 60, den: 1 }, durationMs: 6000 + 1000 / 60 }, r60, s)).toEqual([]);
  expect(exportGate({ ...ok, fps: { num: 60, den: 1 }, durationMs: 6000 + 2000 / 60 + 1 }, r60, s).join("; ")).toMatch(/duration/);
  // файл в 30 fps при запросе 60 — провал
  expect(exportGate(ok, r60, s).join("; ")).toMatch(/fps 30\/1, ожидалось 60\/1/);
});

it("без fps в запросе — fps версии (в т. ч. дробный)", () => {
  const ntsc = { ...s, fps: { num: 30000, den: 1001 } };
  expect(exportFps(ntsc, mp4)).toEqual({ num: 30000, den: 1001 });
  expect(exportDurationFrames(ntsc, mp4)).toBe(180);
  expect(exportDurationFrames(ntsc, { ...mp4, fps: 30 })).toBe(Math.round((180 * 30 * 1001) / 30000));
});

it("parseProbe заполняет audioCodec и pixFmt (M4)", () => {
  const json = {
    streams: [
      { codec_type: "video", codec_name: "prores", width: 1280, height: 720, r_frame_rate: "30/1", pix_fmt: "yuva444p10le" },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { duration: "3.0" },
  };
  expect(parseProbe(JSON.stringify(json))).toEqual({
    durationMs: 3000, width: 1280, height: 720, fps: { num: 30, den: 1 }, codec: "prores", pixFmt: "yuva444p10le", audioCodec: "aac",
  });
});
