// S15b: один герой сцены сценария — по кандидатам пробы (kit 0.5.8) на пике payoff (начало
// payoff + 10) и в удержании: no_hero, hero_split, text_dominant по приёму.
import { describe, expect, it } from "vitest";
import { type HeroFrame, heroIssues } from "../../src/qa/layout.js";

type Cand = HeroFrame["heroes"][number];
const cand = (share: number, kind: Cand["kind"] = "graphic", accent = false): Cand => ({ kind, share, accent, rect: { x: 0, y: 0, w: 10, h: 10 } });
const hf = (frame: number, heroes: Cand[], areas = { text: 0.05, graphic: 0.3 }): HeroFrame => ({ frame, heroes, areas });
const codes = (xs: { code: string; severity: string }[]) => xs.map((x) => `${x.code}:${x.severity}`);
const STRICT = { noHero: true, textDominant: true };
const SOFT = { noHero: false, textDominant: false };

describe("no_hero", () => {
  it("герой < 18 % кадра и на пике payoff, и в удержании — no_hero (blocking после калибровки, иначе warning)", () => {
    const small = [hf(160, [cand(0.1)]), hf(320, [cand(0.12)])] as const;
    expect(codes(heroIssues({ peak: small[0], hold: small[1], technique: "line-trend", blocking: STRICT }))).toEqual(["no_hero:blocking"]);
    expect(codes(heroIssues({ peak: small[0], hold: small[1], technique: "line-trend", blocking: SOFT }))).toEqual(["no_hero:warning"]);
  });

  it("крупный герой хотя бы на одном из кадров — нет замечания; нет данных пробы — проверки нет", () => {
    expect(heroIssues({ peak: hf(160, [cand(0.1)]), hold: hf(320, [cand(0.3)]), technique: "line-trend", blocking: STRICT })).toEqual([]);
    expect(heroIssues({ technique: "line-trend", blocking: STRICT })).toEqual([]);
  });
});

describe("hero_split", () => {
  it("две равные графики одного вида без акцента — warning «один объект крупнее в 1,6× или акцент на одном»", () => {
    const out = heroIssues({ peak: hf(160, [cand(0.22, "box"), cand(0.2, "box")]), hold: hf(320, [cand(0.3)]), technique: "split-versus", blocking: STRICT });
    expect(codes(out)).toEqual(["hero_split:warning"]);
    expect(out[0]!.fix_hint).toMatch(/1,6/);
  });

  it("одна под акцентом, разный вид или одна крупнее в 1,25× — не раздвоение", () => {
    expect(heroIssues({ peak: hf(160, [cand(0.22, "box", true), cand(0.2, "box")]), technique: "split-versus", blocking: STRICT })).toEqual([]);
    expect(heroIssues({ peak: hf(160, [cand(0.22, "box"), cand(0.2, "number")]), technique: "split-versus", blocking: STRICT })).toEqual([]);
    expect(heroIssues({ peak: hf(160, [cand(0.3, "box"), cand(0.2, "box")]), technique: "split-versus", blocking: STRICT })).toEqual([]);
  });
});

describe("text_dominant по приёму", () => {
  const wordy = { text: 0.25, graphic: 0.05 };
  it("приём с графикой kit (timeline), графики < 10 %, текст > 3× — blocking после калибровки", () => {
    const out = heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "timeline", blocking: STRICT });
    expect(codes(out)).toEqual(["text_dominant:blocking"]);
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "timeline", blocking: SOFT }))).toEqual(["text_dominant:warning"]);
  });

  it("checklist и прочие приёмы без графики kit — только warning; split-versus — blocking только с метром стороны", () => {
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "checklist", blocking: STRICT }))).toEqual(["text_dominant:warning"]);
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "kinetic-quote", blocking: STRICT }))).toEqual(["text_dominant:warning"]);
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "split-versus", blocking: STRICT }))).toEqual(["text_dominant:warning"]);
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], wordy), technique: "split-versus", metric: true, blocking: STRICT }))).toEqual(["text_dominant:blocking"]);
  });

  it("мягкий порог прежний (графика < 12 %, текст > 2×) — warning; графика на треть кадра — норма", () => {
    expect(codes(heroIssues({ hold: hf(320, [cand(0.3)], { text: 0.25, graphic: 0.11 }), technique: "timeline", blocking: STRICT }))).toEqual(["text_dominant:warning"]);
    expect(heroIssues({ hold: hf(320, [cand(0.3)], { text: 0.2, graphic: 0.32 }), technique: "timeline", blocking: STRICT })).toEqual([]);
  });
});
