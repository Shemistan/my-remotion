// Task 28: граф ffmpeg превью и разбиение на куски.
import { describe, expect, it } from "vitest";
import { buildTimeline, frameToUs } from "@ms/contracts";
import { buildPreviewFilter, clipFrames, previewChunks } from "../../src/edit/preview-filter.js";
import { F30 } from "./helpers.js";

const NTSC = { num: 30000, den: 1001 };

describe("buildPreviewFilter", () => {
  it("trim по кадрам, atrim по сэмплам с фейдами, concat в конце", () => {
    const f = buildPreviewFilter([
      { idx: 0, source_start_us: 0, source_end_us: 2_000_000, edited_start_us: 0 },
      { idx: 1, source_start_us: 3_500_000, source_end_us: 5_000_000, edited_start_us: 2_000_000 },
    ], F30, 48000, 8_000);
    expect(f).toContain("[0:v]trim=start_frame=0:end_frame=60,setpts=PTS-STARTPTS[v0]");
    expect(f).toContain("[0:a]atrim=start_sample=0:end_sample=96000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,afade=t=out:st=1.992:d=0.008[a0]");
    expect(f).toContain("[0:v]trim=start_frame=105:end_frame=150");
    expect(f).toContain("[0:a]atrim=start_sample=168000:end_sample=240000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,afade=t=out:st=1.492:d=0.008[a1]");
    expect(f.endsWith("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")).toBe(true);
  });

  it("без звука — только видео; смещение куска; клип короче кадра пропускается; короткий клип — фейд в половину", () => {
    const clips = [
      { idx: 0, source_start_us: frameToUs(300, F30), source_end_us: frameToUs(301, F30), edited_start_us: 0 },
      { idx: 1, source_start_us: frameToUs(400, F30), source_end_us: frameToUs(400, F30) + 10_000, edited_start_us: 33_334 },
    ];
    expect(buildPreviewFilter(clips, F30, 48000, 8_000, { audio: false, frameOffset: 300 })).toBe(
      "[0:v]trim=start_frame=0:end_frame=1,setpts=PTS-STARTPTS[v0];\n[0:v]trim=start_frame=100:end_frame=101,setpts=PTS-STARTPTS[v1];\n[v0][v1]concat=n=2:v=1:a=0[v]");
    const sub = [{ idx: 0, source_start_us: 10_000_000, source_end_us: 10_000_000 + 20_000, edited_start_us: 0 }];
    // 20 мс не на кадре: кадр начала 300, конец — первый кадр не раньше конца (301)
    expect(clipFrames(sub[0]!, F30)).toEqual({ start: 300, end: 301 });
    const a = buildPreviewFilter([{ idx: 0, source_start_us: 0, source_end_us: frameToUs(1, F30), edited_start_us: 0 }], F30, 48000, 30_000);
    expect(a).toContain("afade=t=in:st=0:d=0.016667,afade=t=out:st=0.016667:d=0.016667");
    expect(() => buildPreviewFilter([], F30, 48000, 8_000)).toThrow(/нет ни одного клипа/);
  });

  it("клип за концом звука добивается тишиной до своей длины", () => {
    const clips = [
      { idx: 0, source_start_us: 0, source_end_us: 1_000_000, edited_start_us: 0 },
      { idx: 1, source_start_us: 2_000_000, source_end_us: 3_000_000, edited_start_us: 1_000_000 },
    ];
    const f = buildPreviewFilter(clips, F30, 48000, 8_000, { audioEndUs: 2_500_000 });
    expect(f).toContain("atrim=start_sample=0:end_sample=48000,asetpts=PTS-STARTPTS,afade");
    expect(f).toContain("atrim=start_sample=96000:end_sample=144000,asetpts=PTS-STARTPTS,apad=whole_len=48000,afade");
  });

  it("сотни клипов: граф строится, каждый клип — своя пара веток", () => {
    const cuts = Array.from({ length: 600 }, (_, i) => ({ start_us: i * 1_000_000 + 600_000, end_us: i * 1_000_000 + 1_000_000 }));
    const tl = buildTimeline(600_000_000, cuts, F30);
    const f = buildPreviewFilter(tl.clips, F30, 48000, 8_000);
    expect(f.match(/trim=start_frame/g)).toHaveLength(tl.clips.length);
    expect(f).toMatch(new RegExp(`concat=n=${tl.clips.length}:v=1:a=1\\[v\\]\\[a\\]$`));
  });
});

describe("previewChunks", () => {
  it("куски по N клипов; вход — на ½ кадра раньше первого кадра, кратно 125 µs; сэмпл входа целый", () => {
    const cuts = Array.from({ length: 100 }, (_, i) => ({ start_us: i * 1_000_000 + 600_000, end_us: i * 1_000_000 + 1_000_000 }));
    for (const fps of [F30, NTSC, { num: 25, den: 1 }, { num: 24000, den: 1001 }, { num: 60, den: 1 }]) {
      const tl = buildTimeline(100_000_000, cuts, fps);
      const ch = previewChunks(tl.clips, fps, 48000, 40);
      expect(ch.map((c) => c.clips.length)).toEqual([40, 40, 20]);
      expect(ch.flatMap((c) => c.clips)).toEqual(tl.clips);
      expect(ch[0]!.seekUs).toBe(0);
      const frameUs = (1e6 * fps.den) / fps.num;
      for (const c of ch.slice(1)) {
        const firstUs = (c.frameOffset * 1e6 * fps.den) / fps.num;
        expect(c.seekUs % 125).toBe(0);
        // кадр frameOffset проходит -ss, предыдущий — нет
        expect(c.seekUs).toBeLessThanOrEqual(firstUs);
        expect(c.seekUs).toBeGreaterThan(firstUs - frameUs);
        expect(c.sampleOffset).toBe((c.seekUs * 48000) / 1e6);
        expect(Number.isInteger(c.sampleOffset)).toBe(true);
        const lastEnd = c.clips.at(-1)!.source_end_us;
        expect(c.seekUs + c.readUs).toBeGreaterThanOrEqual(lastEnd);
        // граф куска строится от его входа
        expect(() => buildPreviewFilter(c.clips, fps, 48000, 8_000, { frameOffset: c.frameOffset, sampleOffset: c.sampleOffset })).not.toThrow();
      }
      expect(ch.reduce((s, c) => s + c.frames, 0)).toBe(tl.clips.reduce((s, c) => { const f = clipFrames(c, fps); return s + f.end - f.start; }, 0));
    }
  });
});
