// Правило приёмки ночной итерации (спека 2026-10-23-night-quality-loop): explainer +0.1 и
// `--compare` «принять», user не ниже −0.2, failed не растёт, p90 стоимости ≤ $5, медиана
// времени explainer не выше +25 %; неполный прогон — не принят.
import { describe, expect, it } from "vitest";
import { type BenchRow, type BenchScores, acceptNight, averageScores, pairedStats } from "../../src/bench/night-accept.js";
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
    const v = acceptNight(base, side("cand", [6.25, 6.25], [5, 5]), expected);
    expect(v.reasons).toEqual([]);
    expect(v.accepted).toBe(true);
    expect(v.metrics.explainer).toMatchObject({ before: 6, after: 6.25, delta: 0.25, se: 0, lower: 0.25 });
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

  it("разные судьи — причина помечена как сбой инфраструктуры (infra), а не «не дало роста»", () => {
    const cand = side("cand", [7, 7], [5, 5]);
    cand.user.summary.judge = { rubric_sha256: "x".repeat(64), anchors_sha256: FP.anchors_sha256 };
    expect(acceptNight(base, cand, expected).infra).toMatch(/разные судьи/);
    expect(acceptNight(base, side("cand", [6, 6], [5, 5]), expected).infra).toBeUndefined();
  });

  it("p90 стоимости: сцены без записанной стоимости не считаются как $0 (L7)", () => {
    const cand = side("cand", [7, 7], [5, 5], { cost: 6 });
    for (const r of cand.user.rows) delete r.gen_cost_total_usd;
    for (const r of cand.explainer.rows) delete r.gen_cost_total_usd;
    cand.explainer.rows[0]!.gen_cost_total_usd = 6;
    const v = acceptNight(base, cand, expected);
    expect(v.metrics.p90_cost_usd).toBe(6);
    expect(v.accepted).toBe(false);
  });
});

// Парный тест по сценам (ревью ночи I4): шум судьи и генерации ~0.5–1.0 на сцену, поэтому
// решение — по средней дельте сцен и её стандартной ошибке, а не по точечной оценке.
describe("acceptNight — парный тест по сценам", () => {
  const EX12 = Array.from({ length: 12 }, (_, i) => `x${i + 1}`);
  const US6 = Array.from({ length: 6 }, (_, i) => `u${i + 1}`);
  const exp12 = { explainer: EX12, user: US6 };
  const mk = (tag: string, ex: number[], us: number[]) => ({
    explainer: scores(`${tag}-x`, EX12.map((id, i) => row(id, ex[i]!))),
    user: scores(`${tag}-u`, US6.map((id, i) => row(id, us[i]!))),
  });
  const b12 = mk("base", EX12.map(() => 6), US6.map(() => 5));
  const plus = (d: number[]) => d.map((x) => 6 + x);
  const userOf = (d: number[]) => d.map((x) => 5 + x);

  it("pairedStats: среднее, SE = sd/√n, односторонняя граница t(0.9, n−1)", () => {
    const s = pairedStats([0.1, 0.3, 0.2, 0.2]);
    expect(s.mean).toBeCloseTo(0.2);
    expect(s.se).toBeCloseTo(Math.sqrt(0.02 / 3) / 2);
    expect(s.lower).toBeCloseTo(0.2 - 1.638 * s.se, 3);
    expect(s.upper).toBeCloseTo(0.2 + 1.638 * s.se, 3);
    expect(pairedStats([0.4]).se).toBe(Number.POSITIVE_INFINITY);
  });

  it("стабильный рост по сценам (+0.15 ± 0.05) — принято", () => {
    const v = acceptNight(b12, mk("cand", plus([0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2]), userOf([0, 0, 0, 0, 0, 0])), exp12);
    expect(v.reasons).toEqual([]);
    expect(v.accepted).toBe(true);
    expect(v.metrics.explainer!.lower).toBeGreaterThan(0);
  });

  it("средний рост +0.2 в шуме (сцены ±0.9) — не принято: нижняя граница ≤ 0", () => {
    const d = [0.9, -0.7, 0.9, -0.5, 0.8, -0.6, 0.9, -0.4, 0.8, -0.3, 0.9, -0.3];
    const v = acceptNight(b12, mk("cand", plus(d), userOf([0, 0, 0, 0, 0, 0])), exp12);
    expect(v.metrics.explainer!.delta).toBeCloseTo(0.2);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/нижняя граница/);
  });

  it("user: падение среднего −0.3 в шуме — не повод отклонять; уверенное −0.3 — отклонить", () => {
    const ex = plus(EX12.map(() => 0.3));
    expect(acceptNight(b12, mk("cand", ex, userOf([-0.9, 0.5, -0.9, 0.4, -0.8, -0.1])), exp12).accepted).toBe(true);
    const v = acceptNight(b12, mk("cand", ex, userOf([-0.3, -0.3, -0.3, -0.3, -0.3, -0.3])), exp12);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/user упал на 0\.30/);
  });

  it("user: сцена упала больше чем на 1.0 — не принято, как и в explainer (M4)", () => {
    const v = acceptNight(b12, mk("cand", plus(EX12.map(() => 0.3)), userOf([-1.5, 0.4, 0.4, 0.4, 0.3, 0])), exp12);
    expect(v.metrics.user!.delta).toBeCloseTo(0);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/user.*u1 упала на 1\.5/);
  });

  it("пограничное «принято»: дельта у порога в пределах SE — borderline; уверенный рост — нет", () => {
    const near = acceptNight(b12, mk("cand", plus([0.05, 0.2, 0.05, 0.2, 0.05, 0.2, 0.05, 0.2, 0.05, 0.2, 0.05, 0.2]), userOf([0, 0, 0, 0, 0, 0])), exp12);
    expect(near.accepted).toBe(true);
    expect(near.borderline).toBe(true);
    const far = acceptNight(b12, mk("cand", plus([0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6]), userOf([0, 0, 0, 0, 0, 0])), exp12);
    expect(far.accepted).toBe(true);
    expect(far.borderline).toBe(false);
  });
});

describe("averageScores", () => {
  it("среднее двух прогонов по сценам: overall и критерии; failed — если упала хоть в одном; без оценки в одном — без оценки", () => {
    const a = scores("a", [row("s1", 6), row("s2", 5), row("s3", 7)]);
    const b = scores("b", [row("s1", 7, { cost: 4, min: 7 }), row("s2", 6, { status: "failed" }), row("s3", 7, { judged: false })]);
    const m = averageScores(a, b, "a+b");
    expect(m.summary.run).toBe("a+b");
    expect(m.summary.judge).toEqual(FP);
    expect(m.rows.map((r) => r.judge?.overall ?? null)).toEqual([6.5, 5.5, null]);
    expect(m.rows[0]!.judge!.criteria.hold).toBeCloseTo(6.5);
    expect(m.rows[0]!.gen_cost_total_usd).toBe(3);
    expect(m.rows[0]!.gen!.stage_wall_ms!.total).toBe(6 * 60_000);
    expect(m.rows[1]!.gen!.job_status).toBe("failed");
  });
});
