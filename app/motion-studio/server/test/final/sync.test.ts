// Task 44: опорные слова синхронности финала (без ffmpeg).
import { describe, expect, it } from "vitest";
import { buildTimeline } from "@ms/contracts";
import { syncAnchors } from "../../src/final/sync.js";

const F30 = { num: 30, den: 1 };
// 14 слов по 0,35 с через 0,7 с; вырезан исходник [3 с, 4 с) — слова w5 (3,5 с) вырезано
const words = Array.from({ length: 14 }, (_, k) => ({ id: `w${k}`, start_us: k * 700_000, end_us: k * 700_000 + 350_000 }));
const tl = buildTimeline(10_000_000, [{ start_us: 3_000_000, end_us: 4_000_000 }], F30);
const anchor = (word_id: string) => ({ word_id, text: word_id, frame: 0 });

describe("syncAnchors", () => {
  it("сначала ключевые слова сцен, затем равномерно по оставленным; по edited-времени", () => {
    const doc = { scenes: [{ anchors: [anchor("w9"), anchor("w5")] }, { anchors: [anchor("w9"), anchor("w12")] }] } as never;
    const got = syncAnchors(doc, words, tl, 5);
    expect(got.map((a) => a.word_id)).toEqual(["w1", "w6", "w9", "w11", "w12"]);
    expect(got.find((a) => a.word_id === "w9")).toEqual({ word_id: "w9", source_us: 6_300_000, edited_us: 5_300_000 });
    expect(got.find((a) => a.word_id === "w1")).toEqual({ word_id: "w1", source_us: 700_000, edited_us: 700_000 });
  });

  it("слов меньше n — все оставленные; вырезанное слово не берётся", () => {
    const got = syncAnchors({ scenes: [] }, words.slice(4, 7), tl, 5);
    expect(got.map((a) => a.word_id)).toEqual(["w4", "w6"]);
  });
});
