// Task 25 (ревью I1, M1, M11, M6, M12): аргументы ffmpeg прокси/audio16k/миниатюр, разбор отказов
// ffmpeg, настройки проекта после импорта.
import type { ProbeSummary } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { audio16kArgs } from "../../src/media/audio.js";
import { ffmpegFailureKind } from "../../src/media/ffmpeg.js";
import { proxyArgs } from "../../src/media/proxy.js";
import { thumbsArgs } from "../../src/media/thumbs.js";
import { settingsFromProbe } from "../../src/pipeline/media-import.js";

const probe = (over: Partial<ProbeSummary> = {}): ProbeSummary => ({
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  duration_us: 4_500_000,
  size_bytes: 1,
  start_time_us: 0,
  video: {
    codec: "h264", width: 1280, height: 720, display_width: 1280, display_height: 720, rotation: 0,
    r_frame_rate: { num: 30, den: 1 }, avg_frame_rate: { num: 30, den: 1 }, pix_fmt: "yuv420p", start_time_us: 500_000,
  },
  audio: { codec: "aac", sample_rate: 48000, channels: 1, start_time_us: 0 },
  vfr: false,
  timeline_fps: { num: 30, den: 1 },
  ...over,
});

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("proxyArgs", () => {
  it("I1: шкала от начала файла — fps-фильтр с start_time=0 (добивает начало клоном первого кадра), -t до конца самого длинного потока", () => {
    const a = proxyArgs("/s/original.mp4", "/d/proxy.mp4", probe(), 720);
    expect(after(a, "-vf")).toMatch(/^fps=30\/1:start_time=0,scale=-2:720,format=yuv420p$/);
    expect(after(a, "-t")).toBe("4.500000");
    expect(after(a, "-af")).toBe("aresample=async=1:first_pts=0");
  });

  it("M1: демультиплексор задан явно по контейнеру из probe (плейлисты и прочее не открываются)", () => {
    const a = proxyArgs("/s/original.mp4", "/d/proxy.mp4", probe(), 720);
    expect(a.slice(0, 6)).toEqual(["-protocol_whitelist", "file", "-f", "mov", "-i", "file:/s/original.mp4"]);
    const mkv = proxyArgs("/s/original.mkv", "/d/proxy.mp4", probe({ container: "matroska,webm" }), 720);
    expect(after(mkv, "-f")).toBe("matroska");
    expect(after(audio16kArgs("/s/original.mkv", "/d/a.wav", "matroska"), "-f")).toBe("matroska");
  });
});

describe("thumbsArgs", () => {
  it("M11: `%` в пути каталога экранируется для шаблона image2", () => {
    const a = thumbsArgs("/d/proxy.mp4", "/data/100% готово/thumbs", 1_000_000);
    expect(a.at(-1)).toBe("/data/100%% готово/thumbs/%06d.jpg");
    expect(after(a, "-f")).toBe("mov");
  });
});

describe("ffmpegFailureKind (M6)", () => {
  it("нет места → low_space; ошибки ввода-вывода → io; прочее — undefined", () => {
    expect(ffmpegFailureKind("ffmpeg: код 1: [out#0/mp4] Error writing trailer: No space left on device")).toBe("low_space");
    expect(ffmpegFailureKind("av_interleaved_write_frame(): Input/output error")).toBe("io");
    expect(ffmpegFailureKind("Error opening output file: No such file or directory")).toBe("io");
    expect(ffmpegFailureKind("Unrecognized option 'nope'")).toBeUndefined();
  });
});

describe("settingsFromProbe (M12)", () => {
  it("duration_frames пересчитывается под новый fps с сохранением длительности в секундах", () => {
    const base = { ...settingsFromProbe(null, probe()), fps: { num: 30, den: 1 }, duration_frames: 180 };
    const s = settingsFromProbe(base, probe({ timeline_fps: { num: 25, den: 1 } }));
    expect(s).toMatchObject({ fps: { num: 25, den: 1 }, duration_frames: 150 });
    const ntsc = settingsFromProbe(base, probe({ timeline_fps: { num: 30000, den: 1001 } }));
    expect(ntsc.duration_frames).toBe(180); // 6 с · 29,97 = 179,8 → 180
  });
});
