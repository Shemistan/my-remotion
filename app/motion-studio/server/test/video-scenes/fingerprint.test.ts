// Task 37′: отпечаток видеосцены плана — всё, что идёт в бриф генерации, кроме позиции сцены
// в ролике (правка EDL до сцены сдвигает её, но не делает устаревшей, ADR 0009).
import { describe, expect, it } from "vitest";
import type { ScenePlanItem } from "@ms/contracts";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";
import { sc } from "../analysis/plan-helpers.js";

const base = sc(3_000_000, 6_000_000, { key_terms: [{ text: "40%", word_id: "w_000008", edited_at_us: 4_000_000 }] });
const style = { id: "sty_1", revision: 1 };
const fp = (x: ScenePlanItem, st: { id: string; revision: number } | null = style) => videoItemFingerprint(x, st);

/** Та же сцена на `d` кадров (30 fps) позже в смонтированном ролике. */
function shifted(x: ScenePlanItem, d: number): ScenePlanItem {
  const us = (d * 1_000_000) / 30;
  return {
    ...x,
    frames: { start: x.frames.start + d, end: x.frames.end + d },
    edited: { start_us: x.edited.start_us + us, end_us: x.edited.end_us + us },
    key_terms: x.key_terms.map((k) => ({ ...k, edited_at_us: k.edited_at_us + us })),
    evidence: x.evidence.map((e) => ({ ...e, edited: { start_us: e.edited.start_us + us, end_us: e.edited.end_us + us } })),
  };
}

describe("videoItemFingerprint", () => {
  it("сдвиг сцены на 45 кадров при той же длине — тот же отпечаток", () => {
    expect(fp(shifted(base, 45))).toBe(fp(base));
    expect(fp({ ...base, frames: { start: base.frames.start + 45, end: base.frames.end + 45 } })).toBe(fp(base));
  });

  it("другая зона, режим, прямоугольник, слово конца, длительность, ключевое слово, метафора, стиль — другой", () => {
    const f0 = fp(base);
    expect(fp({ ...base, zone: "right_third" })).not.toBe(f0);
    expect(fp({ ...base, composition_mode: "fullscreen" })).not.toBe(f0);
    expect(fp({ ...base, rect: { ...base.rect, w: 0.2 } })).not.toBe(f0);
    expect(fp({ ...base, end_word_id: "w_000010" })).not.toBe(f0);
    expect(fp({ ...base, frames: { start: base.frames.start, end: base.frames.end + 1 } })).not.toBe(f0);
    expect(fp({ ...base, key_terms: [{ ...base.key_terms[0]!, edited_at_us: 4_500_000 }] })).not.toBe(f0);
    expect(fp({ ...base, metaphor: "лестница" })).not.toBe(f0);
    expect(fp({ ...base, purpose: "другое" })).not.toBe(f0);
    expect(fp({ ...base, visual_type: "comparison" })).not.toBe(f0);
    expect(fp(base, { id: "sty_1", revision: 2 })).not.toBe(f0);
  });

  it("ревью: причина наложения на лицо и окно исходника — входят", () => {
    const f0 = fp(base);
    expect(fp({ ...base, face_overlap: { ...base.face_overlap, override_reason: "автор показывает на график" } })).not.toBe(f0);
    expect(fp({ ...base, source: { start_us: base.source.start_us + 1_000_000, end_us: base.source.end_us + 1_000_000 } })).not.toBe(f0);
  });

  it("статус и цитата — не входят", () => {
    expect(fp({ ...base, status: "accepted" })).toBe(fp(base));
    expect(fp({ ...base, evidence: base.evidence.map((e) => ({ ...e, quote: "другая цитата" })) })).toBe(fp(base));
  });
});
