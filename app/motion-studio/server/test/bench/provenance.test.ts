// Воспроизводимость bench: хеши промптов и судьи, отказ смешивать прогоны разных рубрик,
// сравнение «до/после» только при одном судье, разбиение калибровки train/holdout.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Scores, compareRuns } from "../../src/bench/compare.js";
import { CRITERIA, agreementBySplit } from "../../src/bench/metrics.js";
import { anchorsHash, judgeFingerprint, promptHashes, sameFingerprint, sha256 } from "../../src/bench/provenance.js";
import { REFERENCE } from "../../src/bench/reference.js";
import { makeTmp, removeTmp } from "../qa/helpers.js";

let tmp: string;
beforeEach(async () => (tmp = await makeTmp()));
afterEach(() => removeTmp(tmp));

describe("хеши", () => {
  it("promptHashes: все *.md каталога и partials, путь → sha256", async () => {
    await mkdir(join(tmp, "partials"));
    await writeFile(join(tmp, "engineer.md"), "a");
    await writeFile(join(tmp, "partials", "x.md"), "b");
    await writeFile(join(tmp, "notes.txt"), "c");
    expect(promptHashes(tmp)).toEqual({ "engineer.md": sha256("a"), "partials/x.md": sha256("b") });
  });

  it("judgeFingerprint: хеш рубрики и якорей; якоря зависят от текста и оценки, не от split", async () => {
    await writeFile(join(tmp, "rubric-judge.md"), "рубрика");
    const fp = judgeFingerprint(tmp);
    expect(fp.rubric_sha256).toBe(sha256("рубрика"));
    expect(fp.anchors_sha256).toBe(anchorsHash(REFERENCE));
    const other = REFERENCE.map((r, i) => (i === 0 ? { ...r, grade: r.grade + 0.5 } : r));
    expect(anchorsHash(other)).not.toBe(anchorsHash(REFERENCE));
    const resplit = REFERENCE.map((r) => ({ ...r, split: "holdout" as const }));
    expect(anchorsHash(resplit)).toBe(anchorsHash(REFERENCE));
  });

  it("sameFingerprint: один отпечаток — он; разные или без хеша — отказ с подсказкой --rejudge", () => {
    const a = { rubric_sha256: "r1", anchors_sha256: "a1" };
    expect(sameFingerprint([])).toBeNull();
    expect(sameFingerprint([{ where: "x/1", fp: a }, { where: "y/2", fp: { ...a } }])).toEqual(a);
    expect(() => sameFingerprint([{ where: "x/1", fp: a }, { where: "y/2", fp: { ...a, rubric_sha256: "r2" } }])).toThrow(/разн.*--rejudge/s);
    expect(() => sameFingerprint([{ where: "x/1", fp: a }, { where: "y/2", fp: { ...a, anchors_sha256: "a2" } }])).toThrow(/разн/);
    expect(() => sameFingerprint([{ where: "x/1", fp: {} }])).toThrow(/x\/1.*нет хеша.*--rejudge/s);
  });
});

const crit = (v: number) => Object.fromEntries(CRITERIA.map((c) => [c, v])) as Record<(typeof CRITERIA)[number], number>;
const scores = (run: string, rows: [string, number][], fp: Partial<{ rubric_sha256: string; anchors_sha256: string }> = { rubric_sha256: "r", anchors_sha256: "a" }): Scores => ({
  summary: { run, judge_model: "opus", ...(fp.rubric_sha256 || fp.anchors_sha256 ? { judge: fp } : {}) },
  rows: rows.map(([id, o]) => ({ id, judge: { overall: o, criteria: crit(o) } })),
});

describe("сравнение до/после", () => {
  it("отказ без хешей судьи у любой стороны и при разных хешах или моделях", () => {
    const ok = scores("a", [["s1", 6]]);
    expect(() => compareRuns(scores("b", [["s1", 6]], {}), ok)).toThrow(/b.*нет хеша/s);
    expect(() => compareRuns(ok, scores("b", [["s1", 6]], { rubric_sha256: "r" }))).toThrow(/b.*нет хеша/s);
    expect(() => compareRuns(ok, scores("b", [["s1", 6]], { rubric_sha256: "x", anchors_sha256: "a" }))).toThrow(/разные судьи/);
    // S17b (M5 ревью S16a): после смены рубрики — готовая команда перепрогона судьи базовой линии
    expect(() => compareRuns(ok, scores("b", [["s1", 6]], { rubric_sha256: "x", anchors_sha256: "a" })))
      .toThrow(/базовой линии a: npx tsx scripts\/bench-set\.mts --run a --judge-only --rejudge/);
    expect(() => compareRuns(ok, { ...ok, summary: { ...ok.summary, run: "b", judge_model: "sonnet" } })).toThrow(/модел/);
  });

  it("дельты по общим сценам и правило приёмки: среднее −0.15, сцена −1.0", () => {
    const before = scores("a", [["s1", 6], ["s2", 6], ["s3", 5]]);
    const fine = compareRuns(before, scores("b", [["s1", 6.5], ["s2", 5.5], ["s4", 9]]));
    expect(fine.scenes.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(fine.meanDelta).toBeCloseTo(0);
    expect(fine.accepted).toBe(true);
    expect(fine.scenes[0]!.criteria.hold).toBeCloseTo(0.5);

    const meanDrop = compareRuns(before, scores("b", [["s1", 5.5], ["s2", 6], ["s3", 5]]));
    expect(meanDrop.meanDelta).toBeCloseTo(-0.5 / 3);
    expect(meanDrop.accepted).toBe(false);

    const sceneDrop = compareRuns(before, scores("b", [["s1", 4.5], ["s2", 7], ["s3", 5.5]]));
    expect(sceneDrop.meanDelta).toBeCloseTo(0);
    expect(sceneDrop.accepted).toBe(false);
    expect(sceneDrop.reasons.join(" ")).toMatch(/s1/);
  });
});

describe("калибровка train/holdout", () => {
  it("разбиение по сценам: обе версии сцены в одной части; в holdout есть пара R1→R2", () => {
    const byScene = new Map<string, Set<string>>();
    for (const r of REFERENCE) byScene.set(r.scene, (byScene.get(r.scene) ?? new Set()).add(r.split));
    for (const s of byScene.values()) expect(s.size).toBe(1);
    const hold = REFERENCE.filter((r) => r.split === "holdout");
    expect(hold.length).toBeGreaterThanOrEqual(3);
    expect(REFERENCE.filter((r) => r.split === "train").length).toBeGreaterThan(hold.length);
    expect(hold.some((r) => r.review === "R1") && hold.some((r) => r.review === "R2" && hold.some((q) => q.review === "R1" && q.scene === r.scene))).toBe(true);
  });

  it("agreementBySplit: train и holdout считаются раздельно, плюс все вместе", () => {
    const rows = [
      { id: "t1", split: "train" as const, judge: 5, ref: 5 },
      { id: "t2", split: "train" as const, judge: 6, ref: 6 },
      { id: "h1", split: "holdout" as const, judge: 7, ref: 5 },
      { id: "h2", split: "holdout" as const, judge: 5, ref: 6 },
    ];
    const a = agreementBySplit(rows);
    expect(a.train!.mae).toBe(0);
    expect(a.holdout!.mae).toBeCloseTo(1.5);
    expect(a.all!.n).toBe(4);
    expect(agreementBySplit(rows.slice(0, 2)).holdout).toBeNull();
  });
});
