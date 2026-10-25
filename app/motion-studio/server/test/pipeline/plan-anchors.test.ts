// S14: синхронизация с речью детерминированно — моменты слов (`key_moments` брифа) — якоря
// планировщика битов: конец счёта, начало payoff и акцента ключевого числа или термина ложатся
// на `кадр слова − 3…6`. Фикстуры — ответы Director смоука S11 (чекпоинты): «3» досчитывалось
// к 191 при слове на 231, «256» — к 93 при слове на 111.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type MotionSpec, type Settings, beatKind, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
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

// S15a: якорь не растягивает входы — время до слова забирают счёт/длящиеся биты (иначе пауза
// перед раскрытием), входы и акценты только сдвигаются. Фикстура — Director смоука S14, сц. 1:
// там «3» уезжало 155 → 239, а входы карточки и числа растягивались до ~101 кадра.
describe("planInWindow: якоря без растяжки входов (S15a)", () => {
  const S14: KeyMoment[] = [{ text: "map", frame: 147 }, { text: "3", value: 3, frame: 243 }, { text: "трёх", frame: 243 }, { text: "вопросах", frame: 255 }];
  const planS14 = (moments?: KeyMoment[], heroCaption = false) => {
    const d = director("b1-s14-ss001-director.json");
    // подпись под числом — раскрытие (роль героя): её момент — свой якорь
    if (heroCaption) for (const e of d.spec.elements as { id: string; role: string }[]) if (e.id === "number-caption") e.role = "hero-caption";
    const total = d.spec.duration_frames as number;
    const settings: Settings = { ...defaultSettings(), duration_frames: total, style_preset: "dark-premium", animation_intensity: "balanced" };
    const window = { lead: 15, speech: 276, tail: 30 };
    const r = planInWindow({ ...d.spec, composition: d.composition, style_preset: "dark-premium" } as never, settings, window, moments);
    if (!r.ok) throw new Error(r.message);
    return { spec: r.spec as MotionSpec, changes: r.changes, window, settings };
  };
  const E = resolveStyle({ preset: "dark-premium", intensity: "balanced", fps: { num: 30, den: 1 } }).motion.enter_frames;

  it("сц. 1 S14: раскрытие «3» на 239, входы в [enter; 1,5·enter], payoff ≥ enter", () => {
    const { spec, changes } = planS14(S14);
    expect(revealOf(spec, S14[1]!)).toBe(239);
    expect(changes.join("\n")).toMatch(/якорь «3»: раскрытие 155 → 239/);
    const enters = spec.beats.filter((b) => b.phase !== undefined && beatKind(b) === "enter");
    expect(enters.length).toBeGreaterThan(0);
    for (const b of enters) {
      const len = b.end_frame - b.start_frame;
      expect(len, b.id).toBeGreaterThanOrEqual(E);
      expect(len, b.id).toBeLessThanOrEqual(Math.round(1.5 * E));
    }
    for (const b of spec.beats.filter((x) => x.phase === "payoff")) expect(b.end_frame - b.start_frame, b.id).toBeGreaterThanOrEqual(E);
    // запас забрал счёт: число видно до начала счёта, счёт кончается на раскрытии
    const count = spec.beats.find((b) => b.id === "b-count")!;
    const numberIn = spec.beats.find((b) => b.id === "b-number-in")!;
    expect(count.end_frame).toBe(239);
    expect(count.start_frame).toBeGreaterThanOrEqual(numberIn.start_frame);
    // входы до якоря на прежних местах: карточка и число не уехали
    const before = planS14();
    for (const id of ["b-card-in", "b-number-in"]) {
      expect(spec.beats.find((b) => b.id === id)!.start_frame, id).toBe(before.spec.beats.find((b) => b.id === id)!.start_frame);
    }
  });

  it("окно речи цело, удержание ≥ tail, hold до конца", () => {
    const { spec, window, settings } = planS14(S14);
    expect(specChecks(spec, settings, { speechWindow: window }).filter((x) => x.code === "speech_window")).toEqual([]);
    const hold = spec.beats.find((b) => b.phase === "hold")!;
    expect(hold.end_frame).toBe(spec.duration_frames);
    expect(spec.duration_frames - hold.start_frame).toBeGreaterThanOrEqual(window.tail);
    for (const b of spec.beats) expect(b.end_frame, b.id).toBeGreaterThan(b.start_frame);
  });

  it("старые фикстуры: входы после якорей не длиннее 1,5·enter (или прежней длины)", () => {
    const Etn = resolveStyle({ preset: "tech-neon", intensity: "balanced", fps: { num: 30, den: 1 } }).motion.enter_frames;
    for (const [f, ms] of [["b1-ss001-director.json", B1], ["b2-ss004-director.json", B2]] as const) {
      const before = plan(f);
      const { spec } = plan(f, ms);
      for (const b of spec.beats.filter((x) => x.phase !== undefined && beatKind(x) === "enter")) {
        const len = b.end_frame - b.start_frame;
        const was = before.spec.beats.find((x) => x.id === b.id)!;
        expect(len, `${f} ${b.id}`).toBeLessThanOrEqual(Math.min(Math.max(Math.round(1.5 * Etn), Etn), Math.max(Etn, was.end_frame - was.start_frame)));
      }
    }
  });

  it("момент не по порядку слов — пропущен и назван в changes", () => {
    // подпись «собеседования» и «3» раскрываются на одном кадре (155), а звучат на 200 и 243
    const { changes } = planS14([{ text: "3", value: 3, frame: 243 }, { text: "собеседования", frame: 200 }], true);
    expect(changes.join("\n")).toMatch(/якорь «собеседования»: раскрытие 155 → 196/);
    expect(changes.join("\n")).toMatch(/якорь «3»: пропущен/);
  });
});
