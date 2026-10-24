// Task 34 Step 9: в транскрипте вырезать слова, на которых стоит одна принятая сцена агента →
// [A] A и B `stale` → переутвердить A → «Перепроверить план» → [A] эта сцена `stale(anchor_cut)`,
// остальные `remapped` с новыми edited-временами (source прежний, `editedToSource` сходится) без
// вызова LLM: у задачи `plan.recheck` нет агента, новых задач с `output_refs.agent.calls > 0` нет,
// `agent_runs` не прибавились (оракул по находке F1 части A — `output_refs`, agent_runs — справочно)
// → B не утверждается, пока сцена не решена (сборки из устаревшего плана нет: Phase 4 нет, но
// POST approvals B → 409) → отклонить сцену → B снова утверждается.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { type EdlDto, type Job, type PlanDto, type ProjectApprovalsDto, type VideoProjectDto, editedToSource, usToFrame } from "@ms/contracts";
import { Checks, EVIDENCE3, ORIGIN, db, getJson, shot, state, timing, waitJob, writeEvidence } from "./helpers.js";

type JobRow = { id: string; type: string; status: string; output_refs_json: string | null };
/** Задачи проекта с вызовом агента (оракул «без LLM») и число строк agent_runs проекта. */
function agentSnapshot(projectId: string) {
  const rows = db((d) => d.prepare("SELECT id, type, status, output_refs_json FROM jobs WHERE project_id = ?").all(projectId)) as JobRow[];
  const withAgent = rows.map((r) => ({ id: r.id, type: r.type, calls: (JSON.parse(r.output_refs_json ?? "null") as { agent?: { calls?: number } } | null)?.agent?.calls ?? 0 }))
    .filter((r) => r.calls > 0);
  const runs = db((d) => d.prepare("SELECT COUNT(*) FROM agent_runs WHERE job_id IN (SELECT id FROM jobs WHERE project_id = ?)").pluck().get(projectId)) as number;
  return { jobs: rows.length, with_agent: withAgent, agent_calls: withAgent.reduce((a, r) => a + r.calls, 0), agent_runs: runs };
}

export default function recheck(): void {
  test("Step 9: вырезка под сценой → A и B устарели → перепроверка без LLM → решение → B", async ({ page }) => {
    const c = new Checks("recheck", EVIDENCE3);
    const projectId = state().projectId!;
    const v0 = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    const planId = v0.plan!.id;
    const p0 = await getJson<PlanDto>(page.request, `/api/plans/${planId}`);
    const edl0 = await getJson<EdlDto>(page.request, `/api/edls/${v0.edl!.id}`);
    c.check("9.0", "исходное состояние: A и B valid", v0.approvals.A.state === "valid" && v0.approvals.B.state === "valid", v0.approvals);
    const before = agentSnapshot(projectId);

    // сцена-жертва: принятая сцена агента в середине ролика
    const accepted = p0.doc.items.filter((x) => x.status === "accepted" && x.origin === "agent").sort((a, b) => a.edited.start_us - b.edited.start_us);
    const target = accepted[Math.floor(accepted.length / 2)]!;
    const others = p0.doc.items.filter((x) => x.status === "accepted" && x.id !== target.id);
    writeEvidence("recheck", "before.json", { plan_revision: p0.current_revision, edl_revision: edl0.current_revision, target, others: others.map((x) => ({ id: x.id, edited: x.edited, source: x.source, frames: x.frames })), agent: before }, EVIDENCE3);

    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Транскрипт", exact: true }).click();
    await page.locator(`.word[data-word-id="${target.start_word_id}"]`).click();
    await page.locator(`.word[data-word-id="${target.end_word_id}"]`).click({ modifiers: ["Shift"] });
    const t0 = Date.now();
    await page.getByRole("button", { name: /Вырезать выделенное/ }).click();
    await expect.poll(async () => (await getJson<EdlDto>(page.request, `/api/edls/${edl0.id}`)).current_revision, { timeout: 30_000 }).toBeGreaterThan(edl0.current_revision);
    const edl1 = await getJson<EdlDto>(page.request, `/api/edls/${edl0.id}`);
    const cutUs = edl0.timeline.duration_us - edl1.timeline.duration_us;
    c.check("9.1", "слова сцены вырезаны: граничные слова removed, ролик стал короче", edl1.word_map[target.start_word_id]?.state === "removed" && edl1.word_map[target.end_word_id]?.state === "removed" && cutUs > 0,
      { target: target.id, words: [target.start_word_id, target.end_word_id], edl_revision: edl1.current_revision, shorter_ms: cutUs / 1e3 });
    const ap1 = await getJson<ProjectApprovalsDto>(page.request, `/api/projects/${projectId}/approvals`);
    c.check("9.2", "A и B стали stale", ap1.A.state === "stale" && ap1.B.state === "stale", ap1);
    await shot(page, "recheck", "01-cut", EVIDENCE3);
    // новая ревизия EDL при наличии плана сама ставит `plan.recheck` (Task 32, edl-ops) — без LLM
    const autoKey = `plan.recheck:${edl0.id}@r${edl1.current_revision}`;
    const findAuto = () => db((d) => d.prepare("SELECT id FROM jobs WHERE project_id = ? AND type = 'plan.recheck' AND idempotency_key = ?").pluck().get(projectId, autoKey)) as string | undefined;
    await expect.poll(findAuto, { timeout: 30_000 }).toBeTruthy();
    const autoId = findAuto()!;
    const autoJob = await waitJob(page.request, autoId, 10 * 60_000);
    writeEvidence("recheck", "auto-recheck-job.json", autoJob, EVIDENCE3);
    c.check("9.2b", "новая ревизия EDL сама запустила перепроверку плана (plan.recheck), она завершена", autoJob.status === "completed", { id: autoId, status: autoJob.status, output: autoJob.output_refs });

    // переутвердить A
    await page.getByRole("tab", { name: "Черновой монтаж", exact: true }).click();
    const approveA = page.getByRole("button", { name: "Утвердить черновой монтаж (A)" });
    await expect(approveA).toBeEnabled();
    await approveA.click();
    await expect(page.getByTestId("approval-A")).toContainText("утверждено");

    // B не утверждается из устаревшего плана: кнопка недоступна, API — отказ
    await page.getByRole("tab", { name: "План", exact: true }).click();
    await expect(page.getByTestId("stale-banner")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Утвердить визуальный план (B)" })).toBeDisabled();
    const forced = await page.request.post(`/api/projects/${projectId}/approvals`, { data: { kind: "B" }, headers: { Origin: ORIGIN, "Idempotency-Key": randomUUID() } });
    c.check("9.3", "B из устаревшего плана утвердить нельзя (кнопка недоступна, POST → 409 plan_outdated / items_unresolved)", forced.status() === 409 && /plan_outdated|items_unresolved/.test(await forced.text()), { status: forced.status(), body: await forced.text() });
    await shot(page, "recheck", "02-stale-banner", EVIDENCE3);

    // «Перепроверить план»
    const [rr] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/plans\/[^/]+\/recheck$/.test(r.url())),
      page.getByTestId("stale-banner").getByRole("button", { name: "Перепроверить план" }).click(),
    ]);
    const rj = await waitJob(page.request, ((await rr.json()) as { job: Job }).job.id, 10 * 60_000);
    timing("plan.recheck", { wall_ms: Date.now() - t0, cost_usd: 0 });
    c.check("9.4", "«Перепроверить план» из UI завершена (после автоматической — без изменений)", rj.status === "completed", { status: rj.status, error: rj.error, output: rj.output_refs });
    const p1 = await getJson<PlanDto>(page.request, `/api/plans/${planId}`);
    writeEvidence("recheck", "recheck-job.json", rj, EVIDENCE3);
    writeEvidence("recheck", `plan-r${p1.current_revision}-rechecked.json`, p1, EVIDENCE3);
    const t1 = p1.doc.items.find((x) => x.id === target.id)!;
    c.check("9.5", "сцена под вырезкой — stale(anchor_cut)", t1.status === "stale" && t1.stale_reason === "anchor_cut", { item: t1.id, status: t1.status, reason: t1.stale_reason, recheck: p1.recheck });
    const tl1 = edl1.timeline;
    const fps = edl1.doc.timeline_fps;
    const rows = others.map((o) => {
      const n = p1.doc.items.find((x) => x.id === o.id)!;
      const after = o.edited.start_us > target.edited.start_us;
      return {
        id: o.id, status: n.status, change: p1.recheck?.changed.find((ch) => ch.item_id === o.id)?.change ?? "unchanged", after_cut: after,
        edited_before: o.edited, edited_after: n.edited, shift_ms: (o.edited.start_us - n.edited.start_us) / 1e3, source_same: n.source.start_us === o.source.start_us && n.source.end_us === o.source.end_us,
        consistent: n.frames.start === usToFrame(n.edited.start_us, fps) && editedToSource(tl1, n.edited.start_us) === n.source.start_us,
      };
    });
    c.check("9.6", "остальные сцены пересчитаны (remapped): source прежний, edited сдвинуты после вырезки, время согласовано",
      rows.every((r) => r.status === "accepted" && r.source_same && r.consistent && (r.after_cut ? r.change === "remapped" && r.shift_ms > 0 : r.shift_ms === 0)), rows);
    const after = agentSnapshot(projectId);
    const recheckAgent = (rj.output_refs as { agent?: unknown } | null)?.agent ?? (autoJob.output_refs as { agent?: unknown } | null)?.agent;
    c.check("9.7", "без вызова LLM: у plan.recheck нет агента, задач с вызовом агента не прибавилось", recheckAgent === undefined && after.agent_calls === before.agent_calls && after.with_agent.length === before.with_agent.length,
      { before: { calls: before.agent_calls, jobs_with_agent: before.with_agent.length }, after: { calls: after.agent_calls, jobs_with_agent: after.with_agent.length }, recheck_output: rj.output_refs });
    c.check("9.7b", "agent_runs проекта не прибавились (справочно: F1 — агенты Phase 2–3 туда не пишутся)", after.agent_runs === before.agent_runs, { before: before.agent_runs, after: after.agent_runs });
    await expect(page.getByTestId("stale-banner")).toContainText(/Монтаж изменился/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Утвердить визуальный план (B)" })).toBeDisabled();
    await expect(page.getByTestId("b-reasons")).toContainText("сцены ждут решения");
    const ap2 = await getJson<ProjectApprovalsDto>(page.request, `/api/projects/${projectId}/approvals`);
    c.check("9.8", "до решения сцены B остаётся stale, утвердить нельзя", ap2.B.state === "stale" && ap2.A.state === "valid", ap2);
    await shot(page, "recheck", "03-rechecked", EVIDENCE3);

    // решить сцену: отклонить → B
    await page.getByTestId(`scene-row-${target.id}`).locator(".scene-row-btn").click();
    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByRole("button", { name: "Принять" })).toBeDisabled();
    const rev = p1.current_revision;
    await inspector.getByRole("button", { name: "Отклонить" }).click();
    await expect.poll(async () => (await getJson<PlanDto>(page.request, `/api/plans/${planId}`)).current_revision, { timeout: 30_000 }).toBeGreaterThan(rev);
    const approveB = page.getByRole("button", { name: "Утвердить визуальный план (B)" });
    await expect(approveB).toBeEnabled({ timeout: 30_000 });
    await approveB.click();
    await expect(page.getByTestId("approval-B")).toContainText("утверждено");
    const p2 = await getJson<PlanDto>(page.request, `/api/plans/${planId}`);
    const appr = db((d) => d.prepare("SELECT * FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId)) as { kind: string; status: string; subject_ref: string }[];
    writeEvidence("recheck", "approvals.json", appr, EVIDENCE3);
    writeEvidence("recheck", "after.json", { plan_revision: p2.current_revision, edl_revision: edl1.current_revision, agent: agentSnapshot(projectId) }, EVIDENCE3);
    c.check("9.9", "сцена отклонена → B снова valid на новой ревизии плана", appr.some((a) => a.kind === "B" && a.status === "valid" && a.subject_ref === `plan:${planId}@r${p2.current_revision}`)
      && p2.doc.items.find((x) => x.id === target.id)?.status === "rejected", { revision: p2.current_revision, approvals: appr.filter((a) => a.kind === "B") });
    await shot(page, "recheck", "04-B-approved-again", EVIDENCE3);
  });
}
