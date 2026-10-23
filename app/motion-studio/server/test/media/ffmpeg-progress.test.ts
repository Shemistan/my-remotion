import { describe, expect, it } from "vitest";
import type { ProbeSummary } from "@ms/contracts";
import { audio16kArgs } from "../../src/media/audio.js";
import { ProgressLines, parseFfmpegProgress } from "../../src/media/ffmpeg.js";
import { proxyArgs } from "../../src/media/proxy.js";
import { thumbsArgs } from "../../src/media/thumbs.js";

describe("прогресс ffmpeg", () => {
  it("out_time_us", () => {
    expect(parseFfmpegProgress("out_time_us=1234567")).toBe(1_234_567);
    expect(parseFfmpegProgress("out_time_us=N/A")).toBeUndefined();
    expect(parseFfmpegProgress("frame=10")).toBeUndefined();
  });
  it("строки, разрезанные на куски, собираются", () => {
    const got: number[] = [];
    const l = new ProgressLines((us) => got.push(us));
    l.push("frame=1\nout_time_us=10");
    l.push("00\nprogress=continue\nout_time_us=2000\n");
    expect(got).toEqual([1000, 2000]);
  });
});

const probe = (over: Partial<ProbeSummary["video"]> = {}, audio = true): ProbeSummary => ({
  container: "mov,mp4,m4a,3gp,3g2,mj2", duration_us: 20_000_000, size_bytes: 1, start_time_us: 0,
  video: { codec: "h264", width: 1280, height: 720, display_width: 1280, display_height: 720, rotation: 0,
    r_frame_rate: { num: 30, den: 1 }, avg_frame_rate: { num: 30, den: 1 }, pix_fmt: "yuv420p", ...over },
  ...(audio ? { audio: { codec: "aac", sample_rate: 48000, channels: 1 } } : {}),
  vfr: false, timeline_fps: { num: 30000, den: 1001 },
});

describe("аргументы ffmpeg", () => {
  it("прокси: H.264 veryfast CRF 23, короткая сторона, CFR на timeline_fps, GOP 2·fps, AAC 48 кГц, faststart", () => {
    const a = proxyArgs("/s/original.mp4", "/d/proxy.mp4", probe(), 720).join(" ");
    expect(a).toContain("-protocol_whitelist file -i file:/s/original.mp4");
    expect(a).toContain("scale=-2:720");
    expect(a).toContain("-fps_mode cfr -r 30000/1001");
    expect(a).toContain("-g 60");
    expect(a).toContain("-preset veryfast -crf 23");
    expect(a).toContain("-c:a aac -b:a 128k -ar 48000");
    expect(a).toContain("aresample=async=1:first_pts=0");
    expect(a).toContain("+faststart");
    expect(a).toContain("-t 20.000000");
    expect(a.endsWith("/d/proxy.mp4")).toBe(true);
    expect(a).not.toContain(" -y");
  });
  it("портрет: ширина = короткая сторона; меньше 720 — без увеличения; без звука — без -c:a", () => {
    expect(proxyArgs("/s/o.mov", "/d/p.mp4", probe({ display_width: 720, display_height: 1280, rotation: 90 }), 720).join(" ")).toContain("scale=720:-2");
    expect(proxyArgs("/s/o.mov", "/d/p.mp4", probe({ width: 640, height: 360, display_width: 640, display_height: 360 }), 720).join(" ")).toContain("scale=-2:360");
    expect(proxyArgs("/s/o.mov", "/d/p.mp4", probe({}, false), 720)).not.toContain("-c:a");
  });
  it("миниатюры и audio16k", () => {
    expect(thumbsArgs("/d/proxy.mp4", "/d/thumbs", 2_000_000, 180).join(" ")).toContain("fps=1000000/2000000,scale=-2:180");
    expect(thumbsArgs("/d/proxy.mp4", "/d/thumbs", 2_000_000, 180).at(-1)).toBe("/d/thumbs/%06d.jpg");
    expect(audio16kArgs("/s/o.mp4", "/d/audio16k.wav").join(" ")).toMatch(/-map 0:a:0 .*-ac 1 .*-c:a pcm_s16le/);
  });
});
