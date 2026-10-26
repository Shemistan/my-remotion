// Приёмка Phase 4, шаг 4 (Task 41): правки сцен через Playground и план.
// Сцена 1 — две правки чатом подряд (вторая отправлена, пока идёт первая) → [A] интервалы задач не
// пересекаются, вторая версия — от результата первой, длительность = плану; «Сравнить» v1 с текущей и
// «Восстановить» v1 → новая версия от v1, прежние версии целы (sha256 каталогов).
// Сцена 3 — правка параметров («Интенсивность» → «Рендер»); FPS видеосцены — только чтение (fix 40).
// Сцена 2 — «Перегенерировать» на плитке → новая версия.
// Р-V6: границы сцены 3 в плане (конец — на несколько слов позже; в UI видеоплана правки границ нет —
// операцией `modify` API плана) → новая ревизия → B кнопкой UI → сцена `stale` → перегенерация с
// плитки → версия с новой плановой длиной.
import type { SceneDetailDto, VideoBatchDto } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { accepted, approveB, planDto } from "./phase4-batch.spec.js";
import { snapshot } from "./phase4-isolation.spec.js";
import {
  Checks, getJson, jobCost, jobRow, log, openProject, post, saveState, sceneOf, sceneVersions, scenesState, shot, state, tile, timing, waitBatches, waitJob,
  writeEvidence,
} from "./helpers.js";

const EDIT_TIMEOUT = 90 * 60_000;
const CHAT_A = "Сделай главную подпись крупнее и жирнее.";
const CHAT_B = "Сделай акцентный цвет теплее, ближе к оранжевому.";
const frames = (settingsJson: string) => (JSON.parse(settingsJson) as { duration_frames: number }).duration_frames;

async function openPlayground(page: Page, itemId: string, sceneId: string): Promise<void> {
  await openProject(page, "Сцены");
  await tile(page, itemId).getByRole("link", { name: "Доработать" }).click();
  await expect(page).toHaveURL(new RegExp(`/scenes/${sceneId}$`));
  await expect(page.getByRole("link", { name: "← К видео" })).toBeVisible();
}
async function sendChat(page: Page, sceneId: string, text: string): Promise<{ jobId: string; via: "ui" | "api" }> {
  const box = page.getByRole("region", { name: "Чат" }).getByLabel("Сообщение");
  if (await box.isEnabled()) {
    await box.fill(text);
    const send = page.getByRole("button", { name: "Отправить" });
    if (await send.isEnabled()) {
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${sceneId}/messages`)),
        send.click(),
      ]);
      expect(resp.status(), await resp.text()).toBe(202);
      return { jobId: ((await resp.json()) as { job: { id: string } }).job.id, via: "ui" };
    }
  }
  // чат занят первой правкой — вторая тем же запросом, что шлёт UI (как из второй вкладки)
  const r = await post(page.request, `/api/scenes/${sceneId}/messages`, { text });
  expect(r.status(), await r.text()).toBe(202);
  return { jobId: ((await r.json()) as { job: { id: string } }).job.id, via: "api" };
}
const versionOfJob = (sceneId: string, jobId: string) => sceneVersions(sceneId).find((v) => v.created_by_job_id === jobId);

export default function edit(): void {
  test("шаг 4: чат подряд, сравнение и восстановление, параметры, перегенерация, границы в плане → stale → новая длина", async ({ page }) => {
    test.setTimeout(6 * EDIT_TIMEOUT);
    const t0 = Date.now();
    const c = new Checks("edit");
    const st0 = await scenesState();
    const ready = state().items!.filter((id) => sceneOf(st0, id).status === "ready");
    expect(ready.length).toBeGreaterThanOrEqual(3);
    const [i1, i2, i3] = ready as [string, string, string];
    const sc = (id: string) => sceneOf(st0, id).scene_id!;
    const planFrames = async (id: string) => {
      const p = await planDto(page, state().planId!);
      const x = p.doc.items.find((y) => y.id === id)!;
      return x.frames.end - x.frames.start;
    };
    const costs: Record<string, number> = {};

    // --- сцена 1: две правки чатом подряд ---
    const s1 = sc(i1);
    await openPlayground(page, i1, s1);
    // продолжение шага (MS_ACC_REUSE): правки чатом уже сделаны — их проверки в checks.json
    if (!state().editChat) {
    const a = await sendChat(page, s1, CHAT_A);
    const b = await sendChat(page, s1, CHAT_B);
    log(`сцена 1: правки ${a.jobId} (${a.via}), ${b.jobId} (${b.via})`);
    const [ja, jb] = [await waitJob(a.jobId, EDIT_TIMEOUT), await waitJob(b.jobId, EDIT_TIMEOUT)];
    const [ra, rb] = [jobRow(a.jobId), jobRow(b.jobId)];
    const va = versionOfJob(s1, a.jobId);
    const vb = versionOfJob(s1, b.jobId);
    const p1 = await planFrames(i1);
    costs.chat = jobCost([a.jobId, b.jobId]);
    writeEvidence("edit", "chat-scene1.json", { item: i1, a: { job: ra, version: va ?? null }, b: { job: rb, version: vb ?? null }, plan_frames: p1, cost_usd: Number(costs.chat.toFixed(3)) });
    c.check("4.1", "сцена 1: обе правки чатом завершены, версии ready", ja.status === "completed" && jb.status === "completed" && va?.status === "ready" && vb?.status === "ready",
      { a: ja.status, b: jb.status, err_a: ja.error, err_b: jb.error });
    c.check("4.2", "две правки подряд: интервалы задач не пересекаются", Boolean(ra.finished_at && rb.started_at && ra.finished_at <= rb.started_at),
      { a: [ra.started_at, ra.finished_at], b: [rb.started_at, rb.finished_at] });
    c.check("4.3", "вторая правка — от результата первой (parent = версия первой)", Boolean(va && vb && vb.parent_version_id === va.id), { va: va?.id, vb_parent: vb?.parent_version_id });
    c.check("4.4", "длительность правок = кадрам плана", Boolean(va && vb && frames(va.settings_json) === p1 && frames(vb.settings_json) === p1), { plan: p1, va: va && frames(va.settings_json), vb: vb && frames(vb.settings_json) });
    saveState({ editChat: { a: a.jobId, b: b.jobId, cost_usd: costs.chat } });
    await page.reload();
    await shot(page, "edit", "01-scene1-chat");
    } else costs.chat = (state().editChat as { cost_usd: number }).cost_usd;

    // --- сцена 1: сравнение v1 с текущей и восстановление v1 ---
    const pre1 = snapshot(s1);
    const v1 = sceneVersions(s1).find((v) => v.number === 1)!;
    const cur = (await getJson<SceneDetailDto>(page.request, `/api/scenes/${s1}`)).scene.current_version_id!;
    // «Сравнить» у v1 — с текущей (у самой текущей кнопка недоступна)
    await page.locator(`[data-version-id="${v1.id}"] button[data-action="compare"]`).click();
    await expect(page.locator(".compare video")).toHaveCount(2, { timeout: 60_000 });
    await shot(page, "edit", "02-scene1-compare");
    c.check("4.5", "«Сравнить» v1 с текущей — два плеера версий", (await page.locator(".compare video").count()) === 2, { url: page.url(), v1: v1.id, current: cur });
    await page.goBack();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${s1}/restore`)),
      page.locator(`[data-version-id="${v1.id}"] button[data-action="restore"]`).click(),
    ]);
    expect(resp.status(), await resp.text()).toBeLessThan(300);
    const jr = await waitJob(((await resp.json()) as { job: { id: string } }).job.id, 30 * 60_000, 5000);
    const vr = versionOfJob(s1, jr.id);
    const post1 = snapshot(s1);
    const intact = pre1.every((v) => post1.find((w) => w.id === v.id)?.sha256 === v.sha256);
    const numbers = post1.map((v) => v.number);
    writeEvidence("edit", "restore-scene1.json", { restore_job: jobRow(jr.id), restored: vr ?? null, before: pre1, after: post1 });
    c.check("4.6", "«Восстановить» v1 → новая версия от v1", jr.status === "completed" && vr?.status === "ready" && vr.parent_version_id === v1.id, { job: jr.status, version: vr?.number, parent: vr?.parent_version_id, v1: v1.id });
    c.check("4.7", "история цела: прежние версии не изменены (sha256), номера подряд", intact && numbers.every((n, k) => n === k + 1), { numbers, intact });
    await page.reload();
    await shot(page, "edit", "03-scene1-restored");

    // --- сцена 3: правка параметров; FPS — только чтение ---
    const s3 = sc(i3);
    await openPlayground(page, i3, s3);
    const fps = page.getByLabel("FPS");
    c.check("4.8", "FPS видеосцены — только чтение (FPS проекта)", (await fps.getAttribute("readonly")) !== null, await fps.inputValue());
    const intensity = page.getByLabel("Интенсивность");
    const was = await intensity.inputValue();
    await intensity.selectOption(was === "calm" ? "energetic" : "calm");
    const [rr] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${s3}/render`)),
      page.getByRole("button", { name: "Рендер", exact: true }).click(),
    ]);
    expect(rr.status(), await rr.text()).toBe(202);
    const jp = await waitJob(((await rr.json()) as { job: { id: string } }).job.id, EDIT_TIMEOUT);
    const vp = versionOfJob(s3, jp.id);
    const p3 = await planFrames(i3);
    costs.params = jobCost([jp.id]);
    writeEvidence("edit", "params-scene3.json", { item: i3, from: was, job: jobRow(jp.id), version: vp ?? null, plan_frames: p3, cost_usd: Number(costs.params.toFixed(3)) });
    c.check("4.9", "сцена 3: правка параметров → новая версия ready той же длины", jp.status === "completed" && vp?.status === "ready" && frames(vp.settings_json) === p3, { job: jp.status, error: jp.error, frames: vp && frames(vp.settings_json), plan: p3 });
    await page.reload();
    await shot(page, "edit", "04-scene3-params");

    // --- сцена 2: «Перегенерировать» на плитке ---
    const s2 = sc(i2);
    const n2 = sceneVersions(s2).length;
    await openProject(page, "Сцены");
    const [rg] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/video\/generate$/.test(r.url())),
      tile(page, i2).getByRole("button", { name: "Перегенерировать" }).click(),
    ]);
    expect(rg.status(), await rg.text()).toBeLessThan(300);
    const bg = (await rg.json()) as VideoBatchDto;
    const [bgDone] = await waitBatches([bg.id], 3 * EDIT_TIMEOUT);
    const v2s = sceneVersions(s2);
    costs.regenerate = jobCost(bgDone!.items.flatMap((x) => (x.job ? [x.job.id] : [])));
    c.check("4.10", "сцена 2: «Перегенерировать» → новая версия", v2s.length > n2 && bgDone!.items[0]!.status === "ready", { before: n2, after: v2s.length, status: bgDone!.items[0]!.status, cost_usd: Number(costs.regenerate.toFixed(3)) });

    // --- Р-V6: границы сцены 3 в плане → B → stale → перегенерация с новой длиной ---
    const planId = state().planId!;
    let plan = await planDto(page, planId);
    const item3 = plan.doc.items.find((x) => x.id === i3)!;
    const oldLen = item3.frames.end - item3.frames.start;
    const next = accepted(plan.doc).find((x) => x.frames.start > item3.frames.end);
    const num = Number(item3.end_word_id.replace(/\D/g, ""));
    let moved: { end_word_id: string; revision: number } | undefined;
    const tried: unknown[] = [];
    for (const k of [6, 5, 4, 3, 2, 1]) {
      const wid = `w_${String(num + k).padStart(6, "0")}`;
      const r = await post(page.request, `/api/plans/${planId}/revisions`, { base_revision: plan.current_revision, ops: [{ op: "modify", item_id: i3, patch: { end_word_id: wid } }] });
      tried.push({ wid, status: r.status() });
      if (r.status() !== 201) continue;
      const doc = ((await r.json()) as { doc: typeof plan.doc; current_revision: number });
      const x = doc.doc.items.find((y) => y.id === i3)!;
      const blocking = doc.doc.issues.filter((i) => i.severity === "blocking");
      if (blocking.length === 0 && (!next || x.frames.end < next.frames.start)) {
        moved = { end_word_id: wid, revision: doc.current_revision };
        break;
      }
      // откат: вернуть прежний конец новой ревизией
      const back = await post(page.request, `/api/plans/${planId}/revisions`, { base_revision: doc.current_revision, ops: [{ op: "modify", item_id: i3, patch: { end_word_id: item3.end_word_id } }] });
      tried.push({ revert: back.status(), blocking });
      plan = await planDto(page, planId);
    }
    expect(moved, `границы сцены 3 не сдвинуть без blocking: ${JSON.stringify(tried)}`).toBeTruthy();
    plan = await planDto(page, planId);
    const newItem = plan.doc.items.find((x) => x.id === i3)!;
    const newLen = newItem.frames.end - newItem.frames.start;
    await approveB(page);
    const stS = await scenesState();
    const s3dto = sceneOf(stS, i3);
    const others = state().items!.filter((id) => id !== i3).map((id) => ({ id, stale: sceneOf(stS, id).stale, approval: sceneOf(stS, id).approval.state }));
    c.check("4.11", "границы сцены 3 сдвинуты → новая ревизия плана, длина сцены изменилась", newLen !== oldLen && plan.current_revision === moved!.revision, { from: { end: item3.end_word_id, frames: oldLen }, to: { end: moved!.end_word_id, frames: newLen }, revision: plan.current_revision, tried });
    c.check("4.12", "после B сцена 3 — stale, остальные — нет", s3dto.stale && others.every((o) => !o.stale), { s3: s3dto.stale, others });
    await openProject(page, "Сцены");
    await expect(tile(page, i3)).toContainText("сцена устарела");
    await shot(page, "edit", "05-scene3-stale");
    const regen = tile(page, i3).getByRole("button", { name: /^(Перегенерировать|Повторить)$/ });
    const [rs] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/video\/generate$/.test(r.url())),
      regen.first().click(),
    ]);
    expect(rs.status(), await rs.text()).toBeLessThan(300);
    const bs = (await rs.json()) as VideoBatchDto;
    saveState({ batches: { ...state().batches, stale: bs.id } });
    const [bsDone] = await waitBatches([bs.id], 3 * EDIT_TIMEOUT);
    const st3 = sceneOf(await scenesState(), i3);
    const v3 = sceneVersions(s3).find((v) => v.id === st3.version_id);
    costs.stale = jobCost(bsDone!.items.flatMap((x) => (x.job ? [x.job.id] : [])));
    writeEvidence("edit", "bounds-scene3.json", { item: i3, from: { end_word_id: item3.end_word_id, frames: item3.frames }, to: { end_word_id: moved!.end_word_id, frames: newItem.frames }, revision: plan.current_revision, batch: bs.id, version: v3 ?? null, stale_after: st3.stale, cost_usd: Number(costs.stale.toFixed(3)) });
    c.check("4.13", "перегенерация stale-сцены → версия с новой плановой длиной, не stale", st3.status === "ready" && !st3.stale && Boolean(v3 && frames(v3.settings_json) === newLen), { status: st3.status, stale: st3.stale, frames: v3 && frames(v3.settings_json), plan: newLen });
    await page.reload();
    await shot(page, "edit", "06-scene3-regenerated");
    saveState({ edit: { i1, i2, i3, costs } });
    timing("edit", { wall_ms: Date.now() - t0, cost_usd: Number(Object.values(costs).reduce((x, y) => x + y, 0).toFixed(3)) });
  });
}
