// S15b: пауза плана битов без активного бита фазы ≥ DEAD_AIR_FRAMES в окне речи — вина
// планировщика (мёртвый воздух, судья S15a: «~3 с ничего не происходит»). planInWindow
// заполняет её длящимся битом (sustain) прошлого бита и пишет это в changes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type MotionSpec, type Settings, defaultSettings, isHoldBeat } from "@ms/contracts";
import { fillDeadAir, planInWindow } from "../../src/pipeline/steps.js";
import { DEAD_AIR_FRAMES } from "../../src/qa/temporal.js";
import type { KeyMoment } from "../../src/qa/spec-checks.js";

const FIX = join(import.meta.dirname, "../fixtures/script-anchors");
const director = (f: string) => (JSON.parse(readFileSync(join(FIX, f), "utf8")) as { output: { spec: Record<string, unknown>; composition: Record<string, unknown> } }).output;
const settingsFor = (total: number): Settings => ({ ...defaultSettings(), duration_frames: total, style_preset: "tech-neon", animation_intensity: "balanced" });

/** Самая длинная пауза без активного бита фазы (кроме удержания) в [lead; total − tail). */
function longestGap(spec: MotionSpec, lead: number, end: number): { from: number; to: number } {
  const active = spec.beats.filter((b) => b.phase !== undefined && !isHoldBeat(b)).map((b) => [b.start_frame, b.end_frame] as const).sort((a, b) => a[0] - b[0]);
  let best = { from: lead, to: lead };
  let cur = lead;
  for (const [s, e] of active) {
    if (s > cur && Math.min(s, end) - cur > best.to - best.from) best = { from: cur, to: Math.min(s, end) };
    cur = Math.max(cur, e);
  }
  // до удержания (или конца речи)
  const holdStart = Math.min(end, ...spec.beats.filter((b) => isHoldBeat(b) && b.phase !== undefined).map((b) => b.start_frame));
  if (holdStart > cur && holdStart - cur > best.to - best.from) best = { from: cur, to: holdStart };
  return best;
}

const SC3: KeyMoment[] = [{ text: "ответах", frame: 123 }, { text: "реализацию", frame: 171 }, { text: "нет", frame: 231 }];

describe("fillDeadAir / planInWindow", () => {
  it("пауза ≥ 45 кадров без бита — длящийся бит прошлого бита на всю паузу; changes говорят об этом", () => {
    const beats = [
      { id: "split-in", start_frame: 15, end_frame: 39, action: "вход", description: "", element_ids: ["split"], phase: "q", kind: "enter" as const },
      { id: "answers", start_frame: 114, end_frame: 135, action: "акцент", description: "", element_ids: ["split"], phase: "a", kind: "accent" as const },
      { id: "hold", start_frame: 217, end_frame: 273, action: "удержание", description: "", element_ids: ["split"], phase: "h", kind: "hold" as const },
    ];
    const r = fillDeadAir(beats, { lead: 15, end: 243 });
    const added = r.beats.filter((b) => !beats.some((x) => x.id === b.id));
    expect(added.map((b) => b.id)).toEqual(["split-in-sustain", "answers-sustain"]);
    expect(added[0]).toMatchObject({ start_frame: 39, end_frame: 114, phase: "q", kind: "sustain", element_ids: ["split"] });
    // 135 → 217: тоже пауза (до удержания) — длящийся бит удара
    expect(r.beats.find((b) => b.id === "answers-sustain")).toMatchObject({ start_frame: 135, end_frame: 217, phase: "a", kind: "sustain" });
    expect(r.changes.join("\n")).toMatch(/пауза 39–114 без бита/);
  });

  it("паузы короче 45 кадров не трогаются; id бита не повторяется", () => {
    const beats = [
      { id: "a", start_frame: 15, end_frame: 40, action: "вход", description: "", element_ids: ["x"], phase: "p", kind: "enter" as const },
      { id: "a-sustain", start_frame: 60, end_frame: 100, action: "рисование", description: "", element_ids: ["x"], phase: "p", kind: "sustain" as const },
      { id: "b", start_frame: 200, end_frame: 230, action: "акцент", description: "", element_ids: ["x"], phase: "p", kind: "accent" as const },
    ];
    const r = fillDeadAir(beats, { lead: 15, end: 230 });
    expect(r.beats.filter((b) => b.start_frame === 100)).toEqual([expect.objectContaining({ id: "a-sustain-sustain", end_frame: 200 })]);
    expect(r.beats.some((b) => b.start_frame === 40)).toBe(false);
  });

  it("на фикстурах Director (с якорями и без) после planInWindow в окне речи нет паузы без бита ≥ 45 кадров", () => {
    for (const f of ["b1-ss001-director.json", "b1-s14-ss001-director.json", "b1-s15a-ss003-director.json", "b1-s15a-ss004-director.json", "b2-ss004-director.json"]) {
      for (const ms of [undefined, f === "b1-s15a-ss003-director.json" ? SC3 : undefined]) {
        const d = director(f);
        const total = d.spec.duration_frames as number;
        const window = { lead: 15, speech: total - 45, tail: 30 };
        const r = planInWindow({ ...d.spec, composition: d.composition, style_preset: "tech-neon" } as never, settingsFor(total), window, ms);
        if (!r.ok) throw new Error(r.message);
        const gap = longestGap(r.spec as MotionSpec, window.lead, total - window.tail);
        expect(gap.to - gap.from, `${f}: пауза ${gap.from}–${gap.to}`).toBeLessThan(DEAD_AIR_FRAMES);
      }
    }
  });
});
