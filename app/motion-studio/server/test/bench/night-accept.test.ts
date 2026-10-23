// Правило приёмки ночной итерации (спека 2026-10-23-night-quality-loop): explainer +0.1 и
// `--compare` «принять», user не ниже −0.2, failed не растёт, p90 стоимости ≤ $5, медиана
// времени explainer не выше +25 %; неполный прогон — не принят.
import { describe, expect, it } from "vitest";
import { type BenchRow, type BenchScores, acceptNight } from "../../src/bench/night-accept.js";
import { CRITERIA, type Criterion } from "../../src/bench/metrics.js";

const FP = { rubric_sha256: "r".repeat(64), anchors_sha256: "a".repeat(64) };
const crit = (v: number) => Object.fromEntries(CRITERIA.map((c) => [c, v])) as Record<Criterion, number>;

interface RowOpt { cost?: number; min?: number; status?: string; judged?: boolean }
const row = (id: string, overall: number, o: RowOpt = {}): BenchRow => ({
  id,
  judge: o.judged === false ? null : { overall, criteria: crit(overall) },
  gen: { job_status: o.status ?? "completed", status: "completed", wall_ms: (o.min ?? 5) * 60_000 + 1000, stage_wall_ms: { total: (o.min ?? 5) * 60_000 } },
  gen_cost_total_usd: o.cost ?? 2,
});
const scores = (run: string, rows: BenchRow[]): BenchScores => ({ summary: { run, judge_model: "opus", judge: FP }, rows });

const EX = ["test1", "bench-abtest"];
const US = ["user-02", "user-06"];
const expected = { explainer: EX, user: US };
const side = (tag: string, ex: number[], us: number[], o: RowOpt = {}) => ({
  explainer: scores(`${tag}-x`, EX.map((id, i) => row(id, ex[i]!, o))),
  user: scores(`${tag}-u`, US.map((id, i) => row(id, us[i]!, o))),
});
const base = side("base", [6, 6], [5, 5]);

describe("acceptNight", () => {
  it("рост explainer ≥ +0.1, user не упал — принято; дельты по критериям в метриках", () => {
    const v = acceptNight(base, side("cand", [6.5, 6], [5, 5]), expected);
    expect(v.reasons).toEqual([]);
    expect(v.accepted).toBe(true);
    expect(v.metrics.explainer).toEqual({ before: 6, after: 6.25, delta: 0.25 });
    expect(v.metrics.explainer_criteria.hold).toBeCloseTo(0.25);
  });

  it("рост explainer меньше +0.1 — не принято", () => {
    const v = acceptNight(base, side("cand", [6, 6], [5, 5]), expected);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/explainer.*\+0\.10/);
  });

  it("ровно +0.1 — принято (граница включительно)", () => {
    expect(acceptNight(base, side("cand", [6.1, 6.1], [5, 5]), expected).accepted).toBe(true);
  });

  it("--compare «отклонить» (сцена упала больше чем на 1.0) — не принято при росте среднего", () => {
    const v = acceptNight(base, side("cand", [8.5, 4.5], [5, 5]), expected);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/compare.*bench-abtest/);
  });

  it("user упал больше чем на 0.2 — не принято; ровно 0.2 — допустимо", () => {
    expect(acceptNight(base, side("cand", [7, 7], [4.5, 4.5]), expected).reasons.join(" ")).toMatch(/user.*0\.50/);
    expect(acceptNight(base, side("cand", [7, 7], [4.8, 4.8]), expected).accepted).toBe(true);
  });

  it("неполный прогон (у сцены нет оценки или строки) — не принято, сравнение не считается", () => {
    const cand = side("cand", [9, 9], [9, 9]);
    cand.explainer.rows[1] = row("bench-abtest", 0, { judged: false });
    cand.user.rows.pop();
    const v = acceptNight(base, cand, expected);
    expect(v.accepted).toBe(false);
    expect(v.reasons).toEqual(["неполный прогон explainer: нет оценки у bench-abtest", "неполный прогон user: нет оценки у user-06"]);
  });

  it("неполная базовая линия — не принято с понятной причиной", () => {
    const b = side("base", [6, 6], [5, 5]);
    b.user.rows = b.user.rows.slice(0, 1);
    expect(acceptNight(b, side("cand", [7, 7], [5, 5]), expected).reasons).toEqual(["неполная базовая линия user: нет оценки у user-06"]);
  });

  it("число failed выросло — не принято", () => {
    const cand = side("cand", [7, 7], [5, 5]);
    cand.user.rows[0] = row("user-02", 5, { status: "failed" });
    const v = acceptNight(base, cand, expected);
    expect(v.accepted).toBe(false);
    expect(v.metrics.failed).toEqual({ before: 0, after: 1 });
  });

  it("p90 стоимости сцены по обоим наборам выше $5 — не принято", () => {
    const v = acceptNight(base, side("cand", [7, 7], [5, 5], { cost: 5.5 }), expected);
    expect(v.reasons.join(" ")).toMatch(/p90.*5\.50/);
  });

  it("медиана времени explainer выросла больше чем на 25 % — не принято; +25 % — допустимо", () => {
    expect(acceptNight(base, side("cand", [7, 7], [5, 5], { min: 6.5 }), expected).reasons.join(" ")).toMatch(/медиана времени.*\+30 %/);
    expect(acceptNight(base, side("cand", [7, 7], [5, 5], { min: 6.25 }), expected).accepted).toBe(true);
  });

  it("пункт «без регрессии»: роста не нужно, но --compare и прочие пороги действуют", () => {
    expect(acceptNight(base, side("cand", [6, 5.9], [5, 5]), expected, { requireGain: false }).accepted).toBe(true);
    const v = acceptNight(base, side("cand", [6, 4.5], [5, 5]), expected, { requireGain: false });
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/compare/);
    expect(v.reasons.join(" ")).not.toMatch(/нужно ≥/);
  });

  it("разные судьи — не принято, без исключения", () => {
    const cand = side("cand", [7, 7], [5, 5]);
    cand.explainer.summary.judge = { rubric_sha256: "x".repeat(64), anchors_sha256: FP.anchors_sha256 };
    const v = acceptNight(base, cand, expected);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/разные судьи/);
  });
});
