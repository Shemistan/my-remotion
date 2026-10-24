// Task 34 Step 7: «Анализировать видеоряд» (Apple Vision + агент) → [A] у каждого шота ≥ 3 ключевых
// кадров, лицо найдено на ≥ 80 % кадров, у каждого шота есть свободная зона `free_ratio ≥ 0,9`; лицо
// в верхней половине кадра (исходник повёрнут на 180° матрицей — кадры не должны быть перевёрнуты) →
// «Смысловой анализ» с агентом → [A] все цитаты якорей и чисел проходят `verifyQuote`, граничные
// слова якорей не вырезаны, главы покрывают все оставленные слова → [H→агент] главы и тезисы
// осмысленны, факты отделены от предположений (выгрузка для просмотра — `semantic/review.txt`);
// кадры с наложенными зонами (`draw-zones.mjs`) — `phase-3/footage/acceptance/` и человеку.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "@playwright/test";
import { type EdlDto, type FootageDto, type Job, type SemanticDto, type TranscriptDto, type VideoProjectDto, verifyQuote } from "@ms/contracts";
import { ACC_ROOT, APP, Checks, EVIDENCE3, agentRuns, getJson, jobEvents, shot, state, timing, waitJob, writeEvidence } from "./helpers.js";

/** Примеры для человека (rulings 2026-10-24): кадры и фрагменты ≤ 30 с, только добавлять. */
export const EXAMPLES3 = "/Volumes/External SSD/Youtube/FinalVideo/MyProtocol/MotionStudio-примеры/task34-phase3";

type AgentInfo = { status: string; calls: number; cost_usd: number } | undefined;
const agentOf = (j: Job): AgentInfo => (j.output_refs as { agent?: AgentInfo } | null)?.agent;

export default function analysis(): void {
  test("Step 7: анализ видеоряда (Vision + агент) и смысловой анализ", async ({ page }) => {
    const c = new Checks("footage", EVIDENCE3);
    const projectId = state().projectId!;
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Анализ", exact: true }).click();

    // --- видеоряд ---
    const footagePanel = page.locator(".analysis-footage");
    await footagePanel.getByRole("checkbox", { name: "С агентом (LLM)" }).check();
    const t0 = Date.now();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/footage\/analyze$/.test(r.url())),
      page.getByRole("button", { name: "Анализировать видеоряд" }).click(),
    ]);
    expect([200, 202], await resp.text()).toContain(resp.status());
    const fj = await waitJob(page.request, ((await resp.json()) as { job: Job }).job.id, 60 * 60_000);
    const fAgent = agentOf(fj);
    timing("footage.analyze", { wall_ms: Date.now() - t0, cost_usd: fAgent?.cost_usd ?? 0 });
    writeEvidence("footage", "job.json", { job: fj, agent_runs: agentRuns(fj.id), events: jobEvents(fj.id) }, EVIDENCE3);
    c.check("7.1", "анализ видеоряда завершён, режим vision+llm, агент вызван", fj.status === "completed" && fAgent?.status === "completed" && fAgent.calls > 0,
      { status: fj.status, error: fj.error, output: fj.output_refs });

    const v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    const footageId = v.footage!.id;
    const ftg = (await getJson<FootageDto>(page.request, `/api/footage/${footageId}`)).analysis;
    writeEvidence("footage", "footage.json", ftg, EVIDENCE3);
    c.check("7.2", "режим анализа — vision+llm (детектор Apple Vision и агент)", ftg.mode === "vision+llm", ftg.mode);
    const perShot = ftg.shots.map((s) => ({
      id: s.id, from_s: s.source_start_us / 1e6, to_s: s.source_end_us / 1e6, keyframes: s.keyframes.length, face_ratio: s.face.detected_ratio, face_source: s.face.source,
      face_union: s.face.union, best_free: Math.max(0, ...s.free_zones.map((z) => z.free_ratio)), free_zones_09: s.free_zones.filter((z) => z.free_ratio >= 0.9).map((z) => z.zone),
      author: s.author_position, motion: s.motion, windows: s.windows.length, objects: s.objects.map((o) => o.label), notes: s.notes, uncertainty: s.uncertainty,
    }));
    writeEvidence("footage", "shots-summary.json", perShot, EVIDENCE3);
    c.check("7.3", "у каждого шота ≥ 3 ключевых кадров", ftg.shots.length > 0 && ftg.shots.every((s) => s.keyframes.length >= 3), perShot.map((s) => [s.id, s.keyframes]));
    const kfTotal = ftg.shots.reduce((a, s) => a + s.keyframes.length, 0);
    const faceTotal = ftg.shots.reduce((a, s) => a + s.face.detected_ratio * s.keyframes.length, 0) / Math.max(1, kfTotal);
    c.check("7.4", "лицо найдено детектором на ≥ 80 % ключевых кадров (по ролику)", faceTotal >= 0.8 && ftg.shots.every((s) => s.face.source === "vision"),
      { overall: Math.round(faceTotal * 1000) / 1000, keyframes: kfTotal, per_shot: perShot.map((s) => [s.id, s.face_ratio]) });
    c.check("7.4b", "лицо найдено на ≥ 80 % кадров в каждом шоте", ftg.shots.every((s) => s.face.detected_ratio >= 0.8), perShot.map((s) => [s.id, s.face_ratio]));
    c.check("7.5", "у каждого шота есть свободная зона free_ratio ≥ 0,9", ftg.shots.every((s) => s.free_zones.some((z) => z.free_ratio >= 0.9)), perShot.map((s) => [s.id, s.free_zones_09]));
    // шот-уровень — худший случай за весь шот (объединение окон); графика живёт на интервале — окна (Task 30)
    const winStats = ftg.shots.map((s) => ({ id: s.id, windows: s.windows.length, with_free_09: s.windows.filter((w) => w.free_zones.some((z) => z.free_ratio >= 0.9)).length }));
    c.check("7.5b", "по окнам времени: в каждом шоте есть окна со свободной зоной ≥ 0,9, и их ≥ 50 %", winStats.every((w) => w.windows > 0 && w.with_free_09 / w.windows >= 0.5), winStats);
    // поворот 180° в матрице исходника: прокси и кадры должны быть «правильной» стороной вверх —
    // у сидящего автора центр рамки лица в верхней половине кадра
    const faceCenters = ftg.shots.filter((s) => s.face.union).map((s) => ({ id: s.id, cy: Math.round((s.face.union!.y + s.face.union!.h / 2) * 1000) / 1000 }));
    c.check("7.6", "кадры не перевёрнуты: центр рамки лица в верхней половине кадра", faceCenters.length > 0 && faceCenters.every((f) => f.cy < 0.5), faceCenters);

    // кадры с зонами — evidence (≤ 480 px) и человеку
    const fdir = join(ACC_ROOT, `workspace/projects/${projectId}/analysis/footage/${footageId}`);
    const zonesOut = join(EVIDENCE3, "footage/acceptance");
    const drawn = execFileSync(process.execPath, [join(APP, "scripts/draw-zones.mjs"), fdir, zonesOut, "6"], { cwd: APP, encoding: "utf8", timeout: 300_000 })
      .trim().split("\n").filter(Boolean);
    mkdirSync(join(EXAMPLES3, "zones"), { recursive: true });
    for (const f of drawn) copyFileSync(f, join(EXAMPLES3, "zones", basename(f)));
    c.note("7.H1", "кадры с зонами (рамки лица/рук, свободные зоны) — не перевёрнуты, зоны не на лице: смотреть глазами", drawn.map((f) => basename(f)));
    await page.locator(".shot .shot-head").first().click();
    await expect(page.getByTestId("zone-face")).toBeVisible({ timeout: 30_000 });
    await shot(page, "footage", "01-shots-zones", EVIDENCE3);

    // --- смысловой анализ ---
    const cs = new Checks("semantic", EVIDENCE3);
    const semPanel = page.locator(".analysis-semantic");
    await expect(semPanel.getByRole("checkbox", { name: "С агентом (LLM)" })).toBeChecked();
    const t1 = Date.now();
    const [sr] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/semantic\/analyze$/.test(r.url())),
      page.getByRole("button", { name: "Смысловой анализ" }).click(),
    ]);
    expect([200, 202], await sr.text()).toContain(sr.status());
    const sj = await waitJob(page.request, ((await sr.json()) as { job: Job }).job.id, 45 * 60_000);
    const sAgent = agentOf(sj);
    timing("semantic.analyze", { wall_ms: Date.now() - t1, cost_usd: sAgent?.cost_usd ?? 0 });
    writeEvidence("semantic", "job.json", { job: sj, agent_runs: agentRuns(sj.id), events: jobEvents(sj.id) }, EVIDENCE3);
    cs.check("7.7", "смысловой анализ с агентом завершён", sj.status === "completed" && sAgent?.status === "completed" && sAgent.calls > 0, { status: sj.status, error: sj.error, output: sj.output_refs });

    const v2 = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    const sem = (await getJson<SemanticDto>(page.request, `/api/semantic/${v2.semantic!.id}`)).semantic;
    writeEvidence("semantic", "semantic.json", sem, EVIDENCE3);
    cs.check("7.8", "разметка свежая: по текущим ревизиям EDL и транскрипта", v2.semantic!.fresh, { transcript_ref: sem.transcript_ref, edl_ref: sem.edl_ref });
    const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${sem.transcript_ref.id}`);
    const edl = await getJson<EdlDto>(page.request, `/api/edls/${sem.edl_ref.id}`);
    const words = tr.doc.words;
    const quotes = [
      ...sem.anchors.map((a) => ({ kind: `anchor:${a.kind}`, id: a.id, s: a.start_word_id, e: a.end_word_id, quote: a.quote })),
      ...sem.numbers.map((n, i) => ({ kind: "number", id: `num_${i}`, s: n.start_word_id, e: n.end_word_id, quote: n.quote })),
    ].map((q) => ({ ...q, r: verifyQuote(words, q.s, q.e, q.quote) }));
    cs.check("7.9", "все цитаты якорей и чисел проходят verifyQuote", quotes.length > 0 && quotes.every((q) => q.r.ok), { total: quotes.length, failed: quotes.filter((q) => !q.r.ok) });
    const removed = (id: string) => edl.word_map[id]?.state === "removed";
    const inCut = sem.anchors.filter((a) => removed(a.start_word_id) || removed(a.end_word_id));
    const idx = new Map(words.map((w, i) => [w.id, i]));
    const innerCut = sem.anchors.map((a) => ({ id: a.id, removed_inside: words.slice(idx.get(a.start_word_id)!, idx.get(a.end_word_id)! + 1).filter((w) => removed(w.id)).length }))
      .filter((x) => x.removed_inside > 0);
    cs.check("7.10", "якоря не в вырезках (граничные слова не вырезаны)", inCut.length === 0, { in_cut: inCut, anchors_with_removed_inside: innerCut });
    const kept = words.map((w, i) => ({ w, i })).filter(({ w }) => !removed(w.id));
    const covered = (i: number) => sem.chapters.some((ch) => idx.get(ch.start_word_id)! <= i && i <= idx.get(ch.end_word_id)!);
    const gaps = kept.filter(({ i }) => !covered(i)).map(({ w }) => w.id);
    cs.check("7.11", "главы покрывают ролик (все оставленные слова)", sem.chapters.length > 0 && gaps.length === 0, { chapters: sem.chapters.length, uncovered: gaps.slice(0, 20), uncovered_n: gaps.length });
    const claims = sem.anchors.reduce<Record<string, number>>((a, x) => ({ ...a, [x.claim_type]: (a[x.claim_type] ?? 0) + 1 }), {});
    cs.note("7.12", "сводка разметки", { chapters: sem.chapters.length, anchors: sem.anchors.length, numbers: sem.numbers.length, entities: sem.entities.length, causal: sem.causal.length,
      disputed: sem.disputed.length, rejected: sem.rejected ?? [], claim_types: claims }, "info");

    // выгрузка для просмотра [H→агент]: главы с текстом, тезисы с типом утверждения
    const text = (s: string, e: string) => words.slice(idx.get(s)!, idx.get(e)! + 1).filter((w) => !removed(w.id)).map((w) => w.text).join(" ");
    const at = (id: string) => (edl.word_map[id]?.state !== "removed" ? ((edl.word_map[id] as { edited_start_us?: number } | undefined)?.edited_start_us ?? 0) / 1e6 : NaN);
    const review = [
      `Смысловая разметка ${sem.id} (транскрипт ${sem.transcript_ref.id} r${sem.transcript_ref.revision}, EDL r${sem.edl_ref.revision})`, "",
      "ГЛАВЫ",
      ...sem.chapters.map((ch) => `- [${at(ch.start_word_id).toFixed(1)} с] ${ch.title} — ${ch.summary}\n    «${text(ch.start_word_id, ch.end_word_id).slice(0, 400)}…»`), "",
      "ЯКОРЯ (тип / утверждение / важность)",
      ...sem.anchors.map((a) => `- ${a.id} [${at(a.start_word_id).toFixed(1)} с] ${a.kind} / ${a.claim_type} / ${a.importance}: «${a.quote}»${a.uncertainty ? ` (неуверенность: ${a.uncertainty})` : ""}`), "",
      "ЧИСЛА", ...sem.numbers.map((n) => `- ${n.value}${n.unit ? ` ${n.unit}` : ""} (${n.claim_type}): «${n.quote}»`), "",
      "СУЩНОСТИ", ...sem.entities.map((e) => `- ${e.name} (${e.kind}), упоминаний ${e.mention_word_ids.length}`), "",
      "СПОРНОЕ", ...sem.disputed.map((d) => `- «${text(d.start_word_id, d.end_word_id)}» — ${d.why}`), "",
    ].join("\n");
    writeEvidence("semantic", "review.txt", review, EVIDENCE3);
    mkdirSync(EXAMPLES3, { recursive: true });
    copyFileSync(join(EVIDENCE3, "semantic/review.txt"), join(EXAMPLES3, "semantic-review.txt"));
    cs.note("7.H2", "главы и тезисы осмысленны, факты отделены от предположений — оценка агента в REPORT, просмотр человеку", "semantic/review.txt");
    await expect(page.getByTestId("chapters")).toBeVisible({ timeout: 30_000 });
    await shot(page, "semantic", "01-chapters-anchors", EVIDENCE3);
  });
}
