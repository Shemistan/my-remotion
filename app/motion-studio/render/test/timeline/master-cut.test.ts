// Ревью Task 36 (I3): вырезка master под кадры рендера — какие кадры master нужны диапазону,
// когда резать (короткий диапазон) и когда отдавать весь master, сдвиг последовательностей,
// аргументы ffmpeg с кадровой точностью (в т. ч. 30000/1001).
import type { SequenceSpec } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { cutArgs, masterSpan, planVideo } from "../../src/timeline/master-cut.js";

const F30 = { num: 30, den: 1 };
const NTSC = { num: 30000, den: 1001 };
// как в e2e: 0–59 → master 0–59, 60–554 → master 105–599 (вырезано 45 кадров)
const SEQ: SequenceSpec[] = [
  { idx: 0, from: 0, durationInFrames: 60, startFrom: 0 },
  { idx: 1, from: 60, durationInFrames: 495, startFrom: 105 },
];

describe("masterSpan", () => {
  it("кадры master под кадры ролика [a, b] по всем пересекающимся последовательностям", () => {
    expect(masterSpan(SEQ, 100, 100)).toEqual([145, 145]);
    expect(masterSpan(SEQ, 50, 70)).toEqual([50, 115]);
    expect(masterSpan(SEQ, 0, 554)).toEqual([0, 599]);
    expect(masterSpan(SEQ, 59, 60)).toEqual([59, 105]);
  });

  it("без видео под кадрами — null", () => {
    expect(masterSpan([{ idx: 0, from: 100, durationInFrames: 10, startFrom: 0 }], 0, 99)).toBeNull();
    expect(masterSpan([], 0, 10)).toBeNull();
  });
});

describe("planVideo", () => {
  it("короткий диапазон в длинном master — вырезка с запасом 1 с, последовательности обрезаны по ней", () => {
    // кадр 100 → master 145; вырезка 115..175; idx 1 видит её с кадра ролика 70 (master 115)
    expect(planVideo(SEQ, 100, 100, F30, 9000)).toEqual({
      kind: "cut", start: 115, frames: 61,
      sequences: [{ idx: 1, from: 70, durationInFrames: 61, startFrom: 0 }],
    });
    // trimBefore Remotion не бывает отрицательным: начало вырезки внутри последовательности
    expect(planVideo(SEQ, 0, 0, F30, 9000)).toEqual({ kind: "cut", start: 0, frames: 31, sequences: [{ idx: 0, from: 0, durationInFrames: 31, startFrom: 0 }] });
  });

  it("запас не выходит за начало и конец master", () => {
    const p = planVideo(SEQ, 0, 0, F30, 9000);
    expect(p).toMatchObject({ kind: "cut", start: 0, frames: 31 });
    const end = planVideo([{ idx: 0, from: 0, durationInFrames: 100, startFrom: 8900 }], 99, 99, F30, 9000);
    expect(end).toMatchObject({ kind: "cut", start: 8969, frames: 31 });
  });

  it("сдвиг: кадр ролика f видит кадр вырезки startFrom' + (f − from) = кадр master − start", () => {
    const p = planVideo(SEQ, 200, 230, F30, 9000);
    if (p.kind !== "cut") throw new Error(p.kind);
    const s = p.sequences[0]!;
    for (const f of [200, 215, 230]) {
      expect(f >= s.from && f < s.from + s.durationInFrames).toBe(true);
      expect(p.start + s.startFrom + (f - s.from)).toBe(105 + (f - 60));
    }
    expect(p.sequences.every((x) => x.startFrom >= 0 && x.startFrom + x.durationInFrames <= p.frames)).toBe(true);
  });

  it("вырезка больше половины master или длиннее 120 с — весь master", () => {
    expect(planVideo(SEQ, 0, 554, F30, 600).kind).toBe("full");
    expect(planVideo([{ idx: 0, from: 0, durationInFrames: 5000, startFrom: 0 }], 0, 4000, F30, 100_000).kind).toBe("full");
    expect(planVideo([{ idx: 0, from: 0, durationInFrames: 5000, startFrom: 0 }], 0, 3000, F30, 100_000).kind).toBe("cut");
  });

  it("кадры без видео — без видео (master не качается)", () => {
    expect(planVideo([{ idx: 0, from: 100, durationInFrames: 10, startFrom: 0 }], 0, 50, F30, 9000)).toEqual({ kind: "none", sequences: [] });
  });

  it("29,97: запас — округлённая секунда", () => {
    expect(planVideo([{ idx: 0, from: 0, durationInFrames: 9000, startFrom: 0 }], 4000, 4000, NTSC, 9000)).toMatchObject({ kind: "cut", start: 3970, frames: 61 });
  });
});

describe("cutArgs", () => {
  it("точный seek за полкадра до начала, перекодирование CRF 12, ровно N кадров, без звука", () => {
    const a = cutArgs("/m/master.mp4", "/t/cut.mp4", 115, 61, F30);
    expect(a.join(" ")).toContain("-protocol_whitelist file -ss 3.816667 -f mov -i file:/m/master.mp4");
    expect(a).toEqual(expect.arrayContaining(["-map", "0:v:0", "-an", "-c:v", "libx264", "-crf", "12", "-g", "30", "-fps_mode", "cfr"]));
    expect(a[a.indexOf("-vf") + 1]).toBe("setpts=PTS-STARTPTS");
    expect(a[a.indexOf("-frames:v") + 1]).toBe("61");
    expect(a[a.indexOf("-r") + 1]).toBe("30/1");
    expect(a.slice(-2)).toEqual(["-n", "/t/cut.mp4"]);
  });

  it("с начала master — без seek; 30000/1001 — дробью", () => {
    expect(cutArgs("/m/a.mp4", "/t/c.mp4", 0, 31, F30)).not.toContain("-ss");
    const a = cutArgs("/m/a.mp4", "/t/c.mp4", 3970, 61, NTSC);
    // (3970 − 0,5) · 1001 / 30000
    expect(a[a.indexOf("-ss") + 1]).toBe("132.448983");
    expect(a[a.indexOf("-r") + 1]).toBe("30000/1001");
  });
});
