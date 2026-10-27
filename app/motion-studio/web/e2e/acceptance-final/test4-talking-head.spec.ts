// Test 4 ТЗ (§14, `09` §7) — talking head от исходного ролика до финального MP4 через UI (Task 46).
// `prepare`: новый видеопроект → импорт копии-вырезки 116 с сырого ролика → ASR → черновой монтаж с
// агентом (решения по вырезкам кнопками, «Восстановить» обратимо) → превью → аудит времени (10 слов) →
// A → анализ видеоряда и смысловой анализ → план с агентом → ≤ 3 сцены (overlay и fullscreen; режим —
// через инспектор) → B → «Сгенерировать все» → C каждой готовой сцены.
// `test4` (после шагов Phase 5): таблица [A]/[H] Test 4 со ссылками на evidence шагов,
// `final-timing-audit.mjs` по финалу 1080p (10 слов ± 1 кадр), sha256 оригинала до/после.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acceptedCuts, buildTimeline } from "@ms/contracts";
import type { EdlDto, Job, PlanDto, ScenePlanItem, TranscriptDto, VideoBatchDto, VideoProjectDto, VisualPlanRevisionDoc } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import {
  ACC_ROOT, APP, Checks, EVIDENCE, ORIGINAL, ORIGINAL_SHA256, agentRuns, approvalsOf, clickJob, db, ffprobe, getJson, importViaUi, jobCost, jobEvents, log, newVideoProject,
  openProject, qaOf, saveState, sceneOf, scenesState, shasum, shot, state, tab, tile, timing, waitBatches, waitJob, writeEvidence,
} from "./helpers.js";

const DIR = "test4";
const GEN_TIMEOUT = 3 * 60 * 60_000;
const canon = (x: unknown) => JSON.stringify(x);
export const accepted = (doc: VisualPlanRevisionDoc): ScenePlanItem[] =>
  doc.items.filter((x) => x.status === "accepted").sort((a, b) => a.frames.start - b.frames.start);
export const planDto = (page: Page, planId: string) => getJson<PlanDto>(page.request, `/api/plans/${planId}`);
const agentOf = (j: Job) => (j.output_refs as { agent?: { status: string; calls: number; cost_usd: number } } | null)?.agent;

/** Сцена в инспекторе плана (строка сцены → кнопка). */
export async function selectPlanItem(page: Page, id: string): Promise<void> {
  await page.getByTestId(`scene-row-${id}`).locator(".scene-row-btn").click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("aria-label", `Сцена ${id}`);
}
/** Утверждение плана (B) кнопкой вкладки «План». */
export async function approveB(page: Page): Promise<void> {
  await openProject(page, "План");
  const approve = page.getByRole("button", { name: "Утвердить визуальный план (B)" });
  await expect(approve).toBeEnabled({ timeout: 60_000 });
  await approve.click();
  await expect(page.getByTestId("approval-B")).toContainText("утверждено", { timeout: 60_000 });
}
/** «Утвердить (C)» на плитке (с подтверждением, если у версии есть blocking-замечания QA). */
export async function approveTile(page: Page, itemId: string): Promise<void> {
  const t = tile(page, itemId);
  const btn = t.getByRole("button", { name: "Утвердить (C)" });
  await expect(btn.or(t.getByTestId("approval-c-badge").filter({ hasText: /^утверждена v\d+$/ }))).toBeVisible({ timeout: 30_000 });
  if ((await btn.count()) === 0) return;
  await btn.click();
  const confirm = page.getByRole("button", { name: "Утвердить с замечаниями" });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
  await expect(t.getByTestId("approval-c-badge")).toContainText("утверждена", { timeout: 30_000 });
}
/** «Сгенерировать все» (с инлайн-подтверждением пакета) или перегенерация с плитки → пакет. */
export async function generate(page: Page, button: import("@playwright/test").Locator): Promise<VideoBatchDto> {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/video\/generate$/.test(r.url())),
    (async () => {
      await button.click();
      const go = page.getByRole("button", { name: "Запустить" });
      if (await go.isVisible({ timeout: 3000 }).catch(() => false)) await go.click();
    })(),
  ]);
  expect(resp.status(), await resp.text()).toBeLessThan(300);
  return (await resp.json()) as VideoBatchDto;
}

export function prepare(): void {
  test("Test 4 (1/2): импорт, ASR, черновой монтаж, A, анализ, план, B, сцены, C", async ({ page }) => {
    test.setTimeout(GEN_TIMEOUT + 3 * 60 * 60_000);
    const c = new Checks(DIR);
    const st0 = state();
    const video = st0.video!;
    const tAll = Date.now();

    // --- импорт и ASR ---
    let projectId = st0.projectId;
    if (!projectId) {
      projectId = await newVideoProject(page, `Приёмка Phase 5 — talking head ${new Date().toISOString().slice(0, 16)}`);
      saveState({ projectId });
    }
    await page.goto(`/projects/${projectId}`);
    let v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    if (!v.media) {
      const t0 = Date.now();
      const imp = await waitJob((await importViaUi(page, video.path)).id, 60 * 60_000, 5000);
      c.check("T4.1", "импорт вырезки завершён", imp.status === "completed", { status: imp.status, error: imp.error });
      timing("import", { wall_ms: Date.now() - t0 });
      v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    }
    const m = v.media!;
    saveState({ mediaId: m.asset.id });
    const durS = m.asset.probe.duration_us / 1e6;
    c.check("T4.2", "ролик 60–120 с, исходник = копии (sha256)", durS >= 60 && durS <= 120 && m.asset.sha256 === video.sha256 && shasum(video.path) === video.sha256,
      { duration_s: durS, asset: m.asset.sha256, video: video.sha256 });
    writeEvidence(DIR, "media.json", { asset: { ...m.asset, rel_path: m.asset.rel_path }, source_ffprobe: ffprobe(video.path) });
    await page.reload();
    if (!v.transcript) {
      const t0 = Date.now();
      await expect(page.getByRole("button", { name: "Распознать речь", exact: true })).toBeEnabled({ timeout: 60_000 });
      const asr = await waitJob((await clickJob(page, page.getByRole("button", { name: "Распознать речь", exact: true }), /\/transcribe$/)).id, 60 * 60_000, 5000);
      timing("asr", { wall_ms: Date.now() - t0 });
      c.check("T4.3", "ASR завершён", asr.status === "completed", { status: asr.status, error: asr.error });
      v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    }
    const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${v.transcript!.id}`);
    const words = tr.doc.words;
    const mono = words.every((w, i) => w.start_us < w.end_us && (i === 0 || words[i - 1]!.start_us <= w.start_us) && w.end_us <= m.asset.probe.duration_us + 40_000);
    const numbers = words.filter((w) => /\d|два|две|втор|перв|три|четыр|пят/i.test(w.text)).map((w) => `${w.id}:${w.text}`);
    c.check("T4.4", "ASR: слова со временем, монотонны, в пределах ролика", words.length > 100 && mono, { words: words.length, segments: tr.doc.segments.length });
    c.check("T4.5", "в речи есть цифра (Test 4: «хотя бы одна цифра»)", numbers.length > 0, numbers.slice(0, 12));
    writeEvidence(DIR, "transcript.txt", tr.doc.segments.map((s) => `[${(s.start_us / 1e6).toFixed(1)}–${(s.end_us / 1e6).toFixed(1)}] ${s.word_ids.map((id) => words.find((w) => w.id === id)?.text ?? "").join(" ")}`).join("\n") + "\n");

    // --- черновой монтаж с агентом ---
    await openProject(page, "Черновой монтаж");
    if (!v.edl || (await getJson<EdlDto>(page.request, `/api/edls/${v.edl.id}`)).doc.decisions.length === 0) {
      await page.getByLabel("С агентом-монтажёром (LLM)").check();
      const t0 = Date.now();
      const pj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Предложить монтаж" }), /\/roughcut\/propose$/)).id, 45 * 60_000, 5000);
      timing("roughcut.propose", { wall_ms: Date.now() - t0, cost_usd: agentOf(pj)?.cost_usd ?? jobCost([pj.id]) });
      c.check("T4.6", "предложение монтажа с агентом завершено (паузы, повторы)", pj.status === "completed" && (agentOf(pj)?.calls ?? 0) > 0, { status: pj.status, error: pj.error, agent: agentOf(pj) });
      writeEvidence(DIR, "roughcut-propose-job.json", { job: pj, agent_runs: agentRuns(pj.id) });
      v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    }
    const edlId = v.edl!.id;
    saveState({ edlId });
    const edl0 = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    let edl = edl0;
    const byReason = edl.doc.decisions.reduce<Record<string, number>>((a, d) => ({ ...a, [`${d.origin}:${d.reason}`]: (a[`${d.origin}:${d.reason}`] ?? 0) + 1 }), {});
    c.check("T4.7", "предложены вырезки пауз/повторов с причиной и уверенностью", edl.doc.decisions.length > 0, byReason);
    const waitEdl = async (rev: number) => expect.poll(async () => (edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`)).current_revision, { timeout: 30_000 }).toBeGreaterThan(rev);
    const confident = page.getByRole("button", { name: "Принять все ≥ 0,8" });
    if (edl.doc.decisions.some((d) => d.status === "proposed") && (await confident.isEnabled())) {
      const rev = edl.current_revision;
      await confident.click();
      await waitEdl(rev);
    }
    for (let guard = 0; guard < 80; guard++) {
      edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
      const next = edl.doc.decisions.find((d) => d.status === "proposed");
      if (!next) break;
      const rev = edl.current_revision;
      await page.getByTestId(`cut-${next.id}`).locator(`button[data-action='${next.confidence >= 0.6 ? "accept" : "reject"}']`).click();
      await waitEdl(rev);
    }
    // обратимость: «Восстановить» принятую вырезку → таймлайн = построенному без неё
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    const restoreTarget = [...edl.doc.decisions].filter((d) => d.status === "accepted").sort((a, b) => (a.source_end_us - a.source_start_us) - (b.source_end_us - b.source_start_us))[0];
    if (restoreTarget && !state().restored) {
      const without = buildTimeline(edl.timeline.source_duration_us, acceptedCuts({ decisions: edl.doc.decisions.filter((d) => d.id !== restoreTarget.id) }), edl.doc.timeline_fps);
      const rev = edl.current_revision;
      await page.getByTestId(`cut-${restoreTarget.id}`).locator("button[data-action='restore']").click();
      await waitEdl(rev);
      c.check("T4.8", "rough cut обратим: «Восстановить» → таймлайн байт-в-байт как без вырезки", canon(edl.timeline) === canon(without), { restored: restoreTarget.id, reason: restoreTarget.reason, ms: (restoreTarget.source_end_us - restoreTarget.source_start_us) / 1e3 });
      saveState({ restored: restoreTarget.id });
    }
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    const acc = edl.doc.decisions.filter((d) => d.status === "accepted");
    writeEvidence(DIR, "edl-final.json", { revision: edl.current_revision, decisions: edl.doc.decisions.map((d) => ({ id: d.id, origin: d.origin, reason: d.reason, status: d.status, confidence: d.confidence, ms: (d.source_end_us - d.source_start_us) / 1e3, explanation: d.explanation })), source_s: edl.timeline.source_duration_us / 1e6, edited_s: edl.timeline.duration_us / 1e6 });
    c.check("T4.9", "после монтажа ролик короче (паузы и повторы вырезаны)", acc.length > 0 && edl.timeline.duration_us < edl.timeline.source_duration_us, { accepted: acc.length, source_s: edl.timeline.source_duration_us / 1e6, edited_s: edl.timeline.duration_us / 1e6 });
    await shot(page, DIR, "01-roughcut");
    const t1 = Date.now();
    await page.reload();
    await tab(page, "Черновой монтаж");
    const pj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Собрать превью" }), /\/revisions\/\d+\/preview$/)).id, 60 * 60_000, 5000);
    timing("roughcut.preview", { wall_ms: Date.now() - t1 });
    c.check("T4.10", "превью чернового монтажа собрано", pj.status === "completed", { status: pj.status, error: pj.error });
    // source↔edited: 10 слов ± 1 кадр (аудит времени по превью)
    let audit: { ok: boolean };
    try {
      audit = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "scripts/timing-audit.mjs", projectId, join(EVIDENCE, DIR, "roughcut-audit")], { cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT }, encoding: "utf8", timeout: 600_000 }).trim().split("\n").pop()!) as { ok: boolean };
    } catch (e) {
      audit = JSON.parse(((e as { stdout?: string }).stdout ?? "{}").trim().split("\n").pop() || "{}") as { ok: boolean };
    }
    c.check("T4.11", "source↔edited: 10 слов ± 1 кадр по превью, обратное отображение без потерь (`timing-audit.mjs`)", audit.ok === true, audit);
    const approveA = page.getByRole("button", { name: "Утвердить черновой монтаж (A)" });
    await expect(approveA).toBeEnabled({ timeout: 60_000 });
    await approveA.click();
    await expect(page.getByTestId("approval-A")).toContainText("утверждено");

    // --- анализ ---
    v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    await openProject(page, "Анализ");
    if (!v.footage) {
      await page.locator(".analysis-footage").getByRole("checkbox", { name: "С агентом (LLM)" }).check();
      const t0 = Date.now();
      const fj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Анализировать видеоряд" }), /\/footage\/analyze$/)).id, 60 * 60_000, 5000);
      timing("footage.analyze", { wall_ms: Date.now() - t0, cost_usd: jobCost([fj.id]) });
      c.check("T4.12", "анализ видеоряда (Vision + агент) завершён", fj.status === "completed", { status: fj.status, error: fj.error });
    }
    await page.reload();
    await tab(page, "Анализ");
    const t2 = Date.now();
    const sj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Смысловой анализ" }), /\/semantic\/analyze$/)).id, 45 * 60_000, 5000);
    timing("semantic.analyze", { wall_ms: Date.now() - t2, cost_usd: jobCost([sj.id]) });
    c.check("T4.13", "смысловой анализ с агентом завершён", sj.status === "completed", { status: sj.status, error: sj.error });

    // --- план ---
    await openProject(page, "План");
    await expect(page.locator(".plan-panel").getByRole("checkbox", { name: "С агентом (LLM)" })).toBeChecked();
    const t3 = Date.now();
    const plj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Построить план" }), /\/plan\/generate$/)).id, 45 * 60_000, 5000);
    timing("plan.visual", { wall_ms: Date.now() - t3, cost_usd: jobCost([plj.id]) });
    c.check("T4.14", "визуальный план с агентом построен", plj.status === "completed", { status: plj.status, error: plj.error });
    v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    const planId = v.plan!.id;
    saveState({ planId });
    let plan = await planDto(page, planId);
    writeEvidence(DIR, `plan-r${plan.current_revision}-proposed.json`, { items: plan.doc.items.map((x) => ({ id: x.id, status: x.status, mode: x.composition_mode, zone: x.zone, frames: x.frames, usefulness: x.usefulness, face: x.face_overlap.ratio, purpose: x.purpose })), issues: plan.doc.issues });
    await page.reload();
    await tab(page, "План");
    await shot(page, DIR, "02-plan-proposed");
    const refresh = async () => (plan = await planDto(page, planId));
    const waitRev = async (rev: number) => expect.poll(async () => (await refresh()).current_revision, { timeout: 60_000 }).toBeGreaterThan(rev);
    const inspector = page.getByTestId("inspector");
    const actions: unknown[] = [];
    const blockingOf = (id: string) => plan.doc.issues.some((i) => i.severity === "blocking" && i.item_id === id);
    // выбор: ≤ 3 сцены без blocking по полезности; нужна overlay-подобная и одна fullscreen
    const live = plan.doc.items.filter((x) => x.status !== "rejected" && !blockingOf(x.id)).sort((a, b) => b.usefulness - a.usefulness);
    const pickList: ScenePlanItem[] = [];
    const full = live.find((x) => x.composition_mode === "fullscreen");
    const over = live.find((x) => x.composition_mode === "overlay" || x.composition_mode === "callout");
    for (const x of [full, over, ...live]) if (x && !pickList.includes(x) && pickList.length < 3) pickList.push(x);
    // режимы — через инспектор: нет fullscreen → самую короткую из выбранных (не overlay); нет overlay → другую
    const setMode = async (x: ScenePlanItem, mode: "fullscreen" | "overlay") => {
      await selectPlanItem(page, x.id);
      let rev = plan.current_revision;
      await inspector.getByRole("button", { name: "Изменить" }).click();
      await inspector.getByLabel("Режим").selectOption(mode);
      await inspector.getByRole("button", { name: "Сохранить" }).click();
      await waitRev(rev);
      if (mode === "fullscreen") {
        rev = plan.current_revision;
        await inspector.getByLabel("Зона").selectOption("full");
        await waitRev(rev);
      }
      actions.push({ op: "modify", id: x.id, detail: `${x.composition_mode}/${x.zone} → ${mode}` });
    };
    if (!full) await setMode([...pickList].filter((x) => x !== over).sort((a, b) => (a.frames.end - a.frames.start) - (b.frames.end - b.frames.start))[0]!, "fullscreen");
    if (!over) await setMode(pickList.find((x) => x.composition_mode !== "fullscreen" && plan.doc.items.find((y) => y.id === x.id)?.composition_mode !== "fullscreen")!, "overlay");
    const keep = new Set(pickList.map((x) => x.id));
    for (let guard = 0; guard < 60; guard++) {
      await refresh();
      const b = plan.doc.issues.find((i) => i.severity === "blocking" && i.item_id && plan.doc.items.find((x) => x.id === i.item_id)?.status !== "rejected");
      const extra = plan.doc.items.find((x) => x.status !== "rejected" && !keep.has(x.id));
      const todo = plan.doc.items.find((x) => keep.has(x.id) && (x.status === "proposed" || x.status === "stale"));
      const rev = plan.current_revision;
      if (b) {
        await selectPlanItem(page, b.item_id!);
        await inspector.getByRole("button", { name: "Отклонить" }).click();
        keep.delete(b.item_id!);
        actions.push({ op: "reject (blocking)", id: b.item_id, detail: `${b.code}: ${b.message}` });
      } else if (extra) {
        await selectPlanItem(page, extra.id);
        await inspector.getByRole("button", { name: "Отклонить" }).click();
        actions.push({ op: "reject (лимит ≤ 3 сцены)", id: extra.id });
      } else if (todo) {
        await selectPlanItem(page, todo.id);
        await inspector.getByRole("button", { name: "Принять" }).click();
        actions.push({ op: "accept", id: todo.id });
      } else break;
      await waitRev(rev);
    }
    writeEvidence(DIR, "plan-ui-actions.json", actions);
    await approveB(page);
    await refresh();
    const accd = accepted(plan.doc);
    saveState({ items: accd.map((x) => x.id) });
    writeEvidence(DIR, `plan-r${plan.current_revision}-approved.json`, { revision: plan.current_revision, accepted: accd.map((x) => ({ id: x.id, mode: x.composition_mode, zone: x.zone, frames: x.frames, key_terms: x.key_terms, face: x.face_overlap })), issues: plan.doc.issues });
    c.check("T4.15", "план: 2–3 принятые сцены, есть overlay/callout и fullscreen", accd.length >= 2 && accd.length <= 3 && accd.some((x) => x.composition_mode === "fullscreen") && accd.some((x) => x.composition_mode !== "fullscreen"), accd.map((x) => `${x.id}:${x.composition_mode}/${x.zone}`));
    c.check("T4.16", "предложения графики не закрывают лицо: blocking нет, у прозрачных сцен face_overlap ≤ 0,05", plan.doc.issues.every((i) => i.severity !== "blocking") && accd.every((x) => x.composition_mode === "fullscreen" || x.face_overlap.ratio <= 0.05), accd.map((x) => ({ id: x.id, mode: x.composition_mode, face: x.face_overlap.ratio })));
    await shot(page, DIR, "03-plan-approved-B");

    // --- сцены: пакет, C ---
    await openProject(page, "Сцены");
    await expect(page.getByTestId("video-scene-tile")).toHaveCount(accd.length);
    const t4 = Date.now();
    const b0 = await generate(page, page.getByRole("button", { name: "Сгенерировать все" }));
    saveState({ batches: { main: b0.id } });
    log(`пакет ${b0.id}: ${b0.items.length} сцен`);
    const [b] = await waitBatches([b0.id], GEN_TIMEOUT);
    const jobs = b!.items.flatMap((x) => (x.job ? [x.job.id] : []));
    timing("generate", { wall_ms: Date.now() - t4, cost_usd: jobCost(jobs) });
    const sst = await scenesState();
    const rows = accd.map((x) => {
      const s = sceneOf(sst, x.id);
      const q = s.version_id ? qaOf(s.version_id) : undefined;
      return { item: x.id, mode: x.composition_mode, status: s.status, version: s.version_number, blocking: (q?.issues ?? []).filter((i) => i.severity === "blocking").map((i) => i.code) };
    });
    writeEvidence(DIR, "scenes.json", { batch: b, rows, events: jobs.map((j) => ({ job: j, events: jobEvents(j).slice(-15) })) });
    c.check("T4.17", "все сцены пакета ready", rows.every((r) => r.status === "ready"), rows);
    c.check("T4.18", "нет blocking размещения (face_ink/outside_zone/duration_changed/layout_rect)", rows.every((r) => !r.blocking.some((code) => ["face_ink", "outside_zone", "duration_changed", "layout_rect"].includes(code))), rows);
    await page.reload();
    await tab(page, "Сцены");
    for (const x of accd) if (sceneOf(sst, x.id).status === "ready") await approveTile(page, x.id);
    const st2 = await scenesState();
    c.check("T4.19", "C каждой готовой сцены valid на её текущую версию", accd.every((x) => sceneOf(st2, x.id).approval.state === "valid" && sceneOf(st2, x.id).approval.version_id === sceneOf(st2, x.id).version_id), accd.map((x) => sceneOf(st2, x.id).approval));
    await shot(page, DIR, "04-scenes-approved-C");
    writeEvidence(DIR, "approvals-prepare.json", approvalsOf(projectId));
    timing("prepare", { wall_ms: Date.now() - tAll });
  });
}

export default function test4(): void {
  test("Test 4 (2/2): таблица [A]/[H], аудит финала (10 слов ± 1 кадр), оригинал не изменён", async ({ page }) => {
    test.setTimeout(60 * 60_000);
    const c = new Checks(DIR);
    const st = state();
    const fid = st.exports?.["1080p"];
    expect(fid, "нет финала 1080p (шаг export)").toBeTruthy();
    let audit: { ok?: boolean };
    try {
      audit = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "scripts/final-timing-audit.mjs", fid!, join(EVIDENCE, DIR, "final-audit")], { cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT }, encoding: "utf8", timeout: 900_000 }).trim().split("\n").pop()!) as { ok: boolean };
    } catch (e) {
      audit = JSON.parse(((e as { stdout?: string }).stdout ?? "{}").trim().split("\n").pop() || "{}") as { ok: boolean };
    }
    c.check("T4.20", "финал 1080p: 10 слов source→final ± 1 кадр (звук), обратное отображение без потерь (`final-timing-audit.mjs`)", audit.ok === true, audit);
    const after = shasum(ORIGINAL);
    saveState({ original: { sha256_before: st.original?.sha256_before ?? "", sha256_after: after } });
    c.check("T4.21", "оригинал IMG_0685.MOV не изменён (sha256 до = после = эталон)", after === ORIGINAL_SHA256 && (!st.original?.sha256_before || st.original.sha256_before === after), { before: st.original?.sha256_before, after });
    const copy = st.video!;
    c.check("T4.22", "копия-вырезка не изменена (sha256)", shasum(copy.path) === copy.sha256, copy.sha256);
    const ap = approvalsOf(st.projectId!);
    writeEvidence(DIR, "approvals.json", ap);
    // решение финала 1080p: final на ревизию таймлайна; A/B/C — приняты (статусы на конец прогона — после
    // правки EDL шага 5в A и прежние final могут быть stale/revoked — это ожидаемо)
    const exp = db((d) => d.prepare("SELECT approval_id, timeline_id, timeline_revision FROM final_exports WHERE id = ?").get(fid!)) as { approval_id: string; timeline_id: string; timeline_revision: number };
    const fin = ap.find((a) => a.id === exp.approval_id);
    const kinds = new Set(ap.map((a) => a.kind));
    c.check("T4.23", "approvals A, B, C, final приняты; решение финала 1080p — на его ревизию таймлайна", ["A", "B", "C", "final"].every((k) => kinds.has(k)) && fin?.kind === "final" && fin.subject_ref === `timeline:${exp.timeline_id}@r${exp.timeline_revision}`,
      { kinds: [...kinds], final: fin, statuses: ap.map((a) => `${a.kind}:${a.subject_ref}:${a.status}`) });
    // сводная таблица по всем checks.json шагов
    const steps = ["test4", "assemble", "export-1080p", "export-720p25", "reproduce", "resilience"];
    const all = steps.flatMap((s) => {
      try {
        return (JSON.parse(readFileSync(join(EVIDENCE, s, "checks.json"), "utf8")) as { id: string; title: string; kind: string; pass: boolean }[]).map((r) => ({ step: s, ...r }));
      } catch {
        return [];
      }
    });
    writeEvidence(DIR, "summary.json", { checks: all.length, failed: all.filter((r) => r.kind === "A" && !r.pass).map((r) => `${r.step}/${r.id}`), timings: st.timings });
    await page.goto("/");
  });
}

