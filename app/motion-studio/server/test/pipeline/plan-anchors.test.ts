// S14: синхронизация с речью детерминированно — моменты слов (`key_moments` брифа) — якоря
// планировщика битов: конец счёта, начало payoff и акцента ключевого числа или термина ложатся
// на `кадр слова − 3…6`. Фикстуры — ответы Director смоука S11 (чекпоинты): «3» досчитывалось
// к 191 при слове на 231, «256» — к 93 при слове на 111.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type MotionSpec, type Settings, beatKind, defaultSettings } from "@ms/contracts";
import { planInWindow } from "../../src/pipeline/steps.js";
import { type KeyMoment, keyTermEarly, momentReveals, specChecks } from "../../src/qa/spec-checks.js";

const FIX = join(import.meta.dirname, "../fixtures/script-anchors");
const director = (f: string) => (JSON.parse(readFileSync(join(FIX, f), "utf8")) as { output: { spec: Record<string, unknown>; composition: Record<string, unknown> } }).output;
const settingsFor = (total: number): Settings => ({ ...defaultSettings(), duration_frames: total, style_preset: "tech-neon", animation_intensity: "balanced" });

function plan(f: string, moments?: KeyMoment[]) {
  const d = director(f);
  const total = d.spec.duration_frames as number;
  const window = { lead: 15, speech: total - 45, tail: 30 };
  const r = planInWindow({ ...d.spec, composition: d.composition, style_preset: "tech-neon" } as never, settingsFor(total), window, moments);
  if (!r.ok) throw new Error(r.message);
  return { spec: r.spec as MotionSpec, changes: r.changes, window, settings: settingsFor(total) };
}

/** Кадр раскрытия момента: конец счёта числа, начало payoff/акцента. */
const revealOf = (spec: MotionSpec, m: KeyMoment) => momentReveals(spec, [m]).find((x) => x.m === m)?.at;

const B1: KeyMoment[] = [{ text: "map", frame: 147 }, { text: "3", value: 3, frame: 231 }, { text: "трёх", frame: 243 }, { text: "вопросах", frame: 255 }];
const B2: KeyMoment[] = [{ text: "вероятностью", frame: 99 }, { text: "256", value: 256, frame: 111 }, { text: "шести", frame: 159 }];

describe("planInWindow: якоря моментов слов (S14)", () => {
  it("б1 ss_001 «3»: без якорей счёт кончается рано (как в смоуке), с якорем — за 3…6 кадров до слова", () => {
    const three = B1[1]!;
    const before = plan("b1-ss001-director.json");
    expect(231 - revealOf(before.spec, three)!).toBeGreaterThan(30);
    const after = plan("b1-ss001-director.json", B1);
    const at = revealOf(after.spec, three)!;
    expect(231 - at).toBeGreaterThanOrEqual(3);
    expect(231 - at).toBeLessThanOrEqual(6);
    expect(keyTermEarly(after.spec, B1, after.window)).toEqual([]);
    expect(after.changes.join("\n")).toMatch(/якорь «3»/);
  });

  it("б2 ss_004 «256»: конец счёта за 3…6 кадров до слова 111", () => {
    const n = B2[1]!;
    const before = plan("b2-ss004-director.json");
    expect(111 - revealOf(before.spec, n)!).toBeGreaterThan(6);
    const after = plan("b2-ss004-director.json", B2);
    const at = revealOf(after.spec, n)!;
    expect(111 - at).toBeGreaterThanOrEqual(3);
    expect(111 - at).toBeLessThanOrEqual(6);
    expect(keyTermEarly(after.spec, B2, after.window)).toEqual([]);
  });

  it("окно речи и удержание после якорей не ломаются; порядок битов фазы сохранён", () => {
    for (const [f, ms] of [["b1-ss001-director.json", B1], ["b2-ss004-director.json", B2]] as const) {
      const { spec, window, settings } = plan(f, ms);
      const issues = specChecks(spec, settings, { speechWindow: window }).filter((x) => x.code === "speech_window");
      expect(issues, f).toEqual([]);
      for (const b of spec.beats) {
        expect(b.end_frame, `${f} ${b.id}`).toBeGreaterThan(b.start_frame);
        expect(b.start_frame, `${f} ${b.id}`).toBeGreaterThanOrEqual(window.lead);
      }
      // счёт по-прежнему видит «от» до старта и кончается до удержания
      const count = spec.beats.find((b) => beatKind(b) === "count")!;
      const hold = spec.beats.find((b) => b.phase === "hold")!;
      expect(count.end_frame).toBeLessThanOrEqual(hold.start_frame);
    }
  });

  it("поздний момент (позже конца речи − 15) якорем не становится; ранний — не раньше lead", () => {
    const d = plan("b2-ss004-director.json");
    const late = plan("b2-ss004-director.json", [{ text: "256", value: 256, frame: 190 }]);
    expect(late.spec.beats).toEqual(d.spec.beats);
    const early = plan("b2-ss004-director.json", [{ text: "256", value: 256, frame: 10 }]);
    for (const b of early.spec.beats) expect(b.start_frame).toBeGreaterThanOrEqual(15);
  });

  it("раскрытие позже слова — тянется раньше, к кадру слова − 3…6", () => {
    const { spec } = plan("b2-ss004-director.json");
    const at = revealOf(spec, B2[1]!)!;
    const word = at - 30; // слово звучит на 30 кадров раньше, чем досчитали
    const r = plan("b2-ss004-director.json", [{ text: "256", value: 256, frame: word }]);
    const moved = revealOf(r.spec, { text: "256", value: 256, frame: word })!;
    expect(word - moved).toBeGreaterThanOrEqual(3);
    expect(word - moved).toBeLessThanOrEqual(6);
  });

  it("без моментов и без окна речи — план прежний", () => {
    const d = director("b2-ss004-director.json");
    const s = settingsFor(201);
    const a = planInWindow({ ...d.spec, composition: d.composition, style_preset: "tech-neon" } as never, s, undefined, B2);
    const b = planInWindow({ ...d.spec, composition: d.composition, style_preset: "tech-neon" } as never, s, undefined);
    expect(a.ok && b.ok && a.spec.beats).toEqual(b.ok && b.spec.beats);
  });
});
