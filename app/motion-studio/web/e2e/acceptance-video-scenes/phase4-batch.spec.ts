// Приёмка Phase 4, шаги 1–2 (Task 41). Подготовка: план проекта приёмки Phase 3 — через UI вкладки
// «План»: split_screen с автором в центре кадра B не пройдёт (`split_face_center`, Р-V5), поэтому одна
// такая сцена переводится в «полный экран» (режим + зона «весь кадр»), остальные split_screen
// отклоняются; в пакете ≥ 3 сцен, среди них overlay и fullscreen; Approval B — кнопкой UI.
// Пакет: «Сгенерировать все» на вкладке «Сцены» → [A] каждая сцена ready или failed с журналом;
// у ready — нет blocking `face_ink` / `outside_zone` / `duration_changed`, длительность версии =
// кадрам плана; стоимость справочно (agent_runs). [H] превью «В контексте» каждой готовой сцены
// (кнопка «Собрать») — кадры ≤ 480 px в evidence (до сцены, середина, момент ключевого слова) и MP4
// человеку в examples/phase4/41-приёмка/context/.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Fps, type ScenePlanItem, type VideoBatchDto, type VisualPlanRevisionDoc, usToFrame } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import {
  ACC_ROOT, Checks, EVIDENCE, EXAMPLES, type VersionRow, frame480, getJson, jobCost, jobEvents, log, openProject, qaOf, saveState, sceneOf, sceneVersions, scenesState,
  shot, state, tab, tile, timing, waitBatches, writeEvidence,
} from "./helpers.js";

export interface PlanDto { plan_id: string; current_revision: number; doc: VisualPlanRevisionDoc; [k: string]: unknown }
export const planDto = (page: Page, planId: string) => getJson<PlanDto>(page.request, `/api/plans/${planId}`);
export const accepted = (doc: VisualPlanRevisionDoc): ScenePlanItem[] =>
  doc.items.filter((x) => x.status === "accepted").sort((a, b) => a.frames.start - b.frames.start);
export const fpsOf = (v: VersionRow): Fps => (JSON.parse(v.settings_json) as { fps: Fps }).fps;
const GEN_TIMEOUT = 5 * 60 * 60_000;
/** Блокирующие замечания размещения и длительности видеосцены (Task 37′/38-39). */
export const PLACEMENT_CODES = ["face_ink", "outside_zone", "duration_changed", "layout_rect"];

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

/** Превью в контексте версии через UI плитки: «В контексте» → «Собрать» → видео. Возвращает путь MP4 в хранилище. */
export async function buildContext(page: Page, itemId: string): Promise<string> {
  const t = tile(page, itemId);
  await t.getByRole("tab", { name: "В контексте" }).click();
  const build = t.getByRole("button", { name: /^(Собрать|Перерисовать)$/ });
  if (await build.isVisible()) await build.click();
  await expect(t.getByTestId("context-video")).toBeVisible({ timeout: 20 * 60_000 });
  const s = sceneOf(await scenesState(), itemId);
  return s.context_preview!.rel_path;
}

export function prepare(): void {
  test("шаг 1: план — ≥ 3 принятых сцен с overlay и fullscreen, split_screen с лицом в центре сменён через UI, B", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    const t0 = Date.now();
    const c = new Checks("prepare");
    const st0 = await scenesState();
    expect(st0.plan, "у проекта приёмки нет визуального плана").not.toBeNull();
    const planId = st0.plan!.id;
    saveState({ planId });
    let plan = await planDto(page, planId);
    writeEvidence("prepare", `plan-r${plan.current_revision}-before.json`, { revision: plan.current_revision, items: plan.doc.items.map((x) => ({ id: x.id, status: x.status, mode: x.composition_mode, zone: x.zone, frames: x.frames, face: x.face_overlap.ratio })), issues: plan.doc.issues });
    const refresh = async () => (plan = await planDto(page, planId));
    const waitRev = async (rev: number) => expect.poll(async () => (await refresh()).current_revision, { timeout: 60_000 }).toBeGreaterThan(rev);
    const inspector = page.getByTestId("inspector");
    const actions: unknown[] = [];

    await openProject(page, "План");
    await shot(page, "prepare", "01-plan-before");
    const acc0 = accepted(plan.doc);
    const splits = acc0.filter((x) => x.composition_mode === "split_screen");
    const hasFull = acc0.some((x) => x.composition_mode === "fullscreen");
    // одна split_screen → полный экран (режим, затем зона «весь кадр»), прочие split_screen — отклонить
    const toFull = hasFull ? undefined : [...splits].sort((a, b) => (a.frames.end - a.frames.start) - (b.frames.end - b.frames.start))[0];
    if (toFull) {
      await selectPlanItem(page, toFull.id);
      let rev = plan.current_revision;
      await inspector.getByRole("button", { name: "Изменить" }).click();
      await inspector.getByLabel("Режим").selectOption("fullscreen");
      await inspector.getByRole("button", { name: "Сохранить" }).click();
      await waitRev(rev);
      rev = plan.current_revision;
      await inspector.getByLabel("Зона").selectOption("full");
      await waitRev(rev);
      actions.push({ op: "modify", id: toFull.id, detail: `split_screen/${toFull.zone} → fullscreen/full` });
    }
    for (const x of splits.filter((s) => s.id !== toFull?.id)) {
      await selectPlanItem(page, x.id);
      const rev = plan.current_revision;
      await inspector.getByRole("button", { name: "Отклонить" }).click();
      await waitRev(rev);
      const issues = plan.doc.issues.filter((i) => i.item_id === x.id).map((i) => `${i.severity}:${i.code}`);
      actions.push({ op: "reject", id: x.id, detail: `split_screen при авторе в центре кадра (Р-V5; замечания ревизии: ${issues.join(", ") || "нет — план собран до проверки split_face_center"})` });
    }
    // прочие blocking по принятым сценам — честно отклонить (запись в actions)
    for (let guard = 0; guard < 10; guard++) {
      await refresh();
      const b = plan.doc.issues.find((i) => i.severity === "blocking" && i.item_id && plan.doc.items.find((x) => x.id === i.item_id)?.status !== "rejected");
      if (!b) break;
      await selectPlanItem(page, b.item_id!);
      const rev = plan.current_revision;
      await inspector.getByRole("button", { name: "Отклонить" }).click();
      await waitRev(rev);
      actions.push({ op: "reject (blocking)", id: b.item_id, detail: `${b.code}: ${b.message}` });
    }
    writeEvidence("prepare", "ui-actions.json", actions);
    await shot(page, "prepare", "02-plan-decided");

    await approveB(page);
    await refresh();
    const acc = accepted(plan.doc);
    const st = await scenesState();
    saveState({ items: acc.map((x) => x.id) });
    writeEvidence("prepare", `plan-r${plan.current_revision}-approved.json`, { revision: plan.current_revision, accepted: acc.map((x) => ({ id: x.id, mode: x.composition_mode, zone: x.zone, frames: x.frames, key_terms: x.key_terms })), issues: plan.doc.issues });
    c.check("1.1", "в плане ≥ 3 принятых сцен", acc.length >= 3, acc.map((x) => x.id));
    c.check("1.2", "среди принятых есть overlay и fullscreen", acc.some((x) => x.composition_mode === "overlay") && acc.some((x) => x.composition_mode === "fullscreen"), acc.map((x) => `${x.id}:${x.composition_mode}/${x.zone}`));
    c.check("1.3", "blocking-замечаний плана нет", plan.doc.issues.every((i) => i.severity !== "blocking"), plan.doc.issues);
    c.check("1.4", "Approval B valid на текущую ревизию", st.approval_b.state === "valid" && st.approval_b.ref === `plan:${planId}@r${plan.current_revision}`, st.approval_b);
    c.check("1.5", "смена режима split_screen → fullscreen сделана через UI (новая ревизия)", Boolean(hasFull || (toFull && plan.doc.items.find((x) => x.id === toFull.id)?.composition_mode === "fullscreen")), actions);
    await shot(page, "prepare", "03-approved-B");
    timing("prepare", { wall_ms: Date.now() - t0 });
  });
}

export default function batch(): void {
  test("шаг 2: «Сгенерировать все» → ready/failed, проверки размещения и длительности, превью в контексте", async ({ page }) => {
    test.setTimeout(GEN_TIMEOUT + 90 * 60_000);
    const t0 = Date.now();
    const c = new Checks("batch");
    const items = state().items!;
    await openProject(page, "Сцены");
    await expect(page.getByTestId("video-scene-tile")).toHaveCount(items.length);
    await shot(page, "batch", "01-tiles-before");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/video\/generate$/.test(r.url())),
      page.getByRole("button", { name: "Сгенерировать все" }).click(),
    ]);
    expect([200, 202], await resp.text()).toContain(resp.status());
    const b0 = (await resp.json()) as VideoBatchDto;
    saveState({ batches: { ...state().batches, main: b0.id } });
    log(`пакет ${b0.id}: ${b0.items.length} сцен, не вошли ${JSON.stringify(b0.skipped ?? [])}`);
    await expect(page.getByTestId("batch-bar")).toBeVisible();
    await shot(page, "batch", "02-batch-running");
    const [b] = await waitBatches([b0.id], GEN_TIMEOUT);
    const genMs = Date.now() - t0;
    const jobIds = b!.items.flatMap((x) => (x.job ? [x.job.id] : []));
    const cost = jobCost(jobIds);
    await page.reload();
    await tab(page, "Сцены");
    await shot(page, "batch", "03-tiles-after");

    const st = await scenesState();
    const plan = await planDto(page, state().planId!);
    const rows = [];
    for (const it of b!.items) {
      const s = sceneOf(st, it.item_id);
      const item = plan.doc.items.find((x) => x.id === it.item_id)!;
      const vs = it.scene_id ? sceneVersions(it.scene_id) : [];
      const v = vs.find((x) => x.id === s.version_id);
      const qa = v ? qaOf(v.id) : undefined;
      const blocking = (qa?.issues ?? []).filter((i) => i.severity === "blocking");
      const placement = blocking.filter((i) => PLACEMENT_CODES.includes(i.code));
      const frames = v ? (JSON.parse(v.settings_json) as { duration_frames: number }).duration_frames : null;
      const row = {
        item: it.item_id, mode: item.composition_mode, zone: item.zone, status: s.status, job: it.job?.id, attempt: it.job?.attempt, error: it.job?.error ?? null,
        version: v ? { id: v.id, number: v.number } : null, plan_frames: item.frames.end - item.frames.start, version_frames: frames,
        qa: qa?.verdicts ?? null, qa_codes: (qa?.issues ?? []).map((i) => `${i.severity}:${i.code}`), placement_blocking: placement.map((i) => i.code),
        events: it.job ? jobEvents(it.job.id).length : 0, cost_usd: it.job ? Number(jobCost([it.job.id]).toFixed(3)) : 0,
      };
      rows.push(row);
      c.check(`2.1-${it.item_id}`, `сцена ${it.item_id}: ready или failed с журналом`, s.status === "ready" || (s.status === "failed" && row.events > 0), { status: s.status, error: row.error, events: row.events });
      if (s.status === "ready") {
        c.check(`2.2-${it.item_id}`, `сцена ${it.item_id}: без blocking face_ink/outside_zone/duration_changed`, placement.length === 0, row.qa_codes);
        c.check(`2.3-${it.item_id}`, `сцена ${it.item_id}: длительность версии = кадрам плана`, frames === row.plan_frames, { plan: row.plan_frames, version: frames });
      }
    }
    writeEvidence("batch", "scenes.json", { batch: b0.id, plan_revision: b!.plan_revision, counts: b!.counts, skipped: b0.skipped ?? [], gen_ms: genMs, cost_usd: Number(cost.toFixed(3)), rows });
    c.check("2.4", "пакет завершён: каждая сцена в конечном статусе", b!.items.every((x) => ["ready", "failed", "cancelled", "blocked"].includes(x.status)), b!.counts);
    c.note("2.5", "время и стоимость пакета (справочно)", { gen_min: Math.round(genMs / 60_000), cost_usd: Number(cost.toFixed(3)), counts: b!.counts }, "info");

    // [H] превью в контексте каждой готовой сцены — кадры человеку/агенту
    const ctxRows = [];
    for (const it of b!.items.filter((x) => sceneOf(st, x.item_id).status === "ready")) {
      const t1 = Date.now();
      const rel = await buildContext(page, it.item_id);
      const s = sceneOf(await scenesState(), it.item_id);
      const item = plan.doc.items.find((x) => x.id === it.item_id)!;
      const abs = join(ACC_ROOT, rel);
      const fps: Fps = { num: 30, den: 1 };
      const pad = s.context_preview!.pad_frames;
      const kw = item.key_terms[0];
      const kwFrame = kw ? usToFrame(kw.edited_at_us, fps) - item.frames.start : undefined;
      const at = { before: Math.max(0, pad - 10), mid: pad + Math.floor((item.frames.end - item.frames.start) / 2), ...(kwFrame !== undefined ? { keyword: pad + kwFrame + 3 } : {}) };
      const dir = join(EVIDENCE, "batch", "context");
      for (const [k, f] of Object.entries(at)) frame480(abs, f / 30, join(dir, `${it.item_id}-${k}-f${f}.png`));
      mkdirSync(join(EXAMPLES, "context"), { recursive: true });
      copyFileSync(abs, join(EXAMPLES, "context", `${it.item_id}-${item.composition_mode}-v${s.version_number}-в-контексте.mp4`));
      ctxRows.push({ item: it.item_id, mode: item.composition_mode, zone: item.zone, version: s.version_number, pad, frames: at, keyword: kw?.text ?? null, ms: Date.now() - t1 });
      await shot(page, "batch", `04-context-${it.item_id}`);
    }
    writeEvidence("batch", "context.json", ctxRows);
    c.note("2.6", "превью в контексте собраны (кадры — batch/context/, MP4 — examples/phase4/41-приёмка/context/)", ctxRows.map((r) => r.item), "H");
    writeFileSync(join(state().runDir, "batch-done.txt"), new Date().toISOString() + "\n");
    timing("batch", { wall_ms: Date.now() - t0, cost_usd: Number(cost.toFixed(3)), note: `генерация ${Math.round(genMs / 60_000)} мин` });
  });
}
