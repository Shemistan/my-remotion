// Сравнение двух прогонов eval «до/после» (правило приёмки `scripts/EVAL.md`). Сравнивать
// можно только оценки одного судьи: без хешей рубрики и якорей или при разных — отказ.
import { CRITERIA, type Criterion, mean } from "./metrics.js";
import { type JudgeFingerprint, short } from "./provenance.js";

/** Допустимое падение среднего набора и одной сцены. */
export const MEAN_DROP = 0.15;
export const SCENE_DROP = 1.0;

/** Часть `scores.json`, нужная сравнению. */
export interface Scores {
  summary: { run: string; judge_model: string; judge?: Partial<JudgeFingerprint> | null };
  rows: { id: string; judge: { overall: number; criteria: Record<Criterion, number> } | null }[];
}

export interface SceneDelta {
  id: string;
  before: number;
  after: number;
  delta: number;
  criteria: Record<Criterion, number>;
}

export interface Comparison {
  before: string;
  after: string;
  judge: JudgeFingerprint;
  /** Сцены, оценённые в обоих прогонах. */
  scenes: SceneDelta[];
  meanBefore: number;
  meanAfter: number;
  meanDelta: number;
  accepted: boolean;
  reasons: string[];
}

function fingerprintOf(s: Scores): JudgeFingerprint {
  const fp = s.summary.judge;
  if (!fp?.rubric_sha256 || !fp.anchors_sha256) throw new Error(`eval: у прогона ${s.summary.run} нет хеша рубрики или якорей судьи — сравнение невозможно; перезапусти судью с --rejudge`);
  return { rubric_sha256: fp.rubric_sha256, anchors_sha256: fp.anchors_sha256 };
}

export function compareRuns(before: Scores, after: Scores): Comparison {
  const a = fingerprintOf(before);
  const b = fingerprintOf(after);
  if (a.rubric_sha256 !== b.rubric_sha256 || a.anchors_sha256 !== b.anchors_sha256) {
    throw new Error(`eval: разные судьи (${before.summary.run}: ${short(a)}; ${after.summary.run}: ${short(b)}) — перезапусти судью одного из прогонов с --rejudge`);
  }
  if (before.summary.judge_model !== after.summary.judge_model) {
    throw new Error(`eval: разные модели судьи: ${before.summary.judge_model} и ${after.summary.judge_model}`);
  }
  const prev = new Map(before.rows.filter((r) => r.judge).map((r) => [r.id, r.judge!]));
  const scenes: SceneDelta[] = after.rows.flatMap((r) => {
    const p = prev.get(r.id);
    if (!p || !r.judge) return [];
    const criteria = Object.fromEntries(CRITERIA.map((c) => [c, r.judge!.criteria[c] - p.criteria[c]])) as Record<Criterion, number>;
    return [{ id: r.id, before: p.overall, after: r.judge.overall, delta: r.judge.overall - p.overall, criteria }];
  });
  if (scenes.length === 0) throw new Error(`eval: у ${before.summary.run} и ${after.summary.run} нет общих оценённых сцен`);
  const meanBefore = mean(scenes.map((s) => s.before));
  const meanAfter = mean(scenes.map((s) => s.after));
  const meanDelta = meanAfter - meanBefore;
  const reasons: string[] = [];
  if (meanDelta < -MEAN_DROP) reasons.push(`среднее упало на ${(-meanDelta).toFixed(2)} (> ${MEAN_DROP})`);
  for (const s of scenes) if (s.delta < -SCENE_DROP) reasons.push(`${s.id} упала на ${(-s.delta).toFixed(1)} (> ${SCENE_DROP})`);
  return { before: before.summary.run, after: after.summary.run, judge: a, scenes, meanBefore, meanAfter, meanDelta, accepted: reasons.length === 0, reasons };
}

const sign = (x: number, d = 1) => `${x > 0 ? "+" : ""}${x.toFixed(d)}`;

/** Таблица дельт сцена × критерий для `scores.md`/PR. */
export function comparisonMd(c: Comparison): string {
  const head = ["Сцена", "До", "После", "Δ", ...CRITERIA.map((k) => k.slice(0, 5))];
  return [
    `# Eval ${c.after} против ${c.before}`,
    "",
    `Судья: ${short(c.judge)}. Сцен в обоих прогонах: ${c.scenes.length}.`,
    "",
    `Среднее: ${c.meanBefore.toFixed(2)} → ${c.meanAfter.toFixed(2)} (**${sign(c.meanDelta, 2)}**). Итог: **${c.accepted ? "принять" : "отклонить"}**${c.reasons.length ? ` — ${c.reasons.join("; ")}` : ""}.`,
    "",
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...c.scenes.map((s) => `| ${s.id} | ${s.before} | ${s.after} | ${sign(s.delta)} | ${CRITERIA.map((k) => sign(s.criteria[k])).join(" | ")} |`),
    "",
  ].join("\n");
}
