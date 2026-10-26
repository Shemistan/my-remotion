// Приёмка Phase 4, шаг 6 (Task 41): перезапуск. Пакет (`regenerate` двух коротких сцен, запросом
// UI-клиента) → задача первой сцены в работе (агент или рендер) → SIGKILL сервера (один процесс
// `server/src/main.ts`; дочерние claude/рендер остаются сиротами — их разбирает старт) → старт →
// [A] задачи восстановлены (снова в очереди/работе или blocked(stale_process) с причиной), пакет
// доходит до конца, дублей версий нет (у каждой задачи ≤ 1 опубликованной версии, номера подряд),
// C на месте (valid-решения до = valid после), прежние версии не изменены (sha256 каталогов).
import type { VideoBatchDto } from "@ms/contracts";
import { expect, test } from "@playwright/test";
import { snapshot } from "./phase4-isolation.spec.js";
import {
  Checks, alive, approvalsOf, db, jobCost, jobRow, killServer, liveProcesses, log, openProject, post, saveState, sceneOf, sceneVersions, scenesState, shot,
  sleep, startServer, state, timing, waitBatches, writeEvidence,
} from "./helpers.js";

const GEN_TIMEOUT = 3 * 60 * 60_000;

export default function restart(): void {
  test("шаг 6: SIGKILL сервера посреди пакета → старт → задачи восстановлены, дублей версий нет, C на месте", async ({ page }) => {
    test.setTimeout(GEN_TIMEOUT + 30 * 60_000);
    const t0 = Date.now();
    const c = new Checks("restart");
    const st0 = await scenesState();
    const plan = st0.plan!;
    const lens = st0.scenes.filter((s) => s.status === "ready" && !s.stale).sort((a, b) => (a.frames.end - a.frames.start) - (b.frames.end - b.frames.start));
    const pick = lens.slice(0, 2).map((s) => s.item_id);
    expect(pick.length).toBe(2);
    const validBefore = approvalsOf(state().projectId).filter((a) => a.status === "valid");
    const before = Object.fromEntries(pick.map((id) => [id, snapshot(sceneOf(st0, id).scene_id!)]));
    const r = await post(page.request, `/api/projects/${state().projectId}/video/generate`, { revision: plan.revision, item_ids: pick, regenerate: true });
    expect([200, 202], await r.text()).toContain(r.status());
    const b0 = (await r.json()) as VideoBatchDto;
    saveState({ batches: { ...state().batches, restart: b0.id } });
    const jobs = b0.items.map((x) => x.job!.id);
    // ждать, пока первая задача в работе (агент или рендер), — и убить сервер
    let at: { job: string; stage: string | null; attempt: number; processes: unknown[] } | undefined;
    for (const until = Date.now() + 40 * 60_000; Date.now() < until && !at; await sleep(3000)) {
      for (const id of jobs) {
        const j = jobRow(id);
        if (j.status === "running" && j.stage && j.stage !== "prepare" && liveProcesses(id).length > 0) {
          // cmd агента несёт весь системный промпт — в журнал и evidence только начало
          at = { job: id, stage: j.stage, attempt: j.attempt, processes: liveProcesses(id).map((p) => ({ ...p, cmd: p.cmd.slice(0, 120) })) };
          break;
        }
      }
    }
    expect(at, "задача пакета так и не дошла до работы с процессами").toBeTruthy();
    const serverPid = state().serverPid;
    await killServer("SIGKILL");
    const orphans = (at!.processes as { pid: number; cmd: string }[]).map((p) => ({ pid: p.pid, cmd: p.cmd, alive: alive(p.pid) }));
    log(`SIGKILL сервера ${serverPid} на ${at!.job} (${at!.stage}); сироты: ${JSON.stringify(orphans)}`);
    const jobsKilled = jobs.map((id) => jobRow(id));
    await startServer();
    const tRestart = Date.now();
    await openProject(page, "Сцены");
    await shot(page, "restart", "01-after-restart");
    const [b] = await waitBatches([b0.id], GEN_TIMEOUT);
    const jobsAfter = jobs.map((id) => jobRow(id));
    const st = await scenesState();
    const after = Object.fromEntries(pick.map((id) => [id, snapshot(sceneOf(st, id).scene_id!)]));
    const perJob = jobs.map((id) => ({ job: id, versions: db((d) => d.prepare("SELECT id, number FROM scene_versions WHERE created_by_job_id = ?").all(id)) as { id: string; number: number }[] }));
    const validAfter = approvalsOf(state().projectId).filter((a) => a.status === "valid");
    const orphansAfter = orphans.map((o) => ({ ...o, alive_after_start: alive(o.pid) }));
    writeEvidence("restart", "summary.json", { batch: b0.id, items: pick, killed_at: at, server_pid: serverPid, orphans: orphansAfter, jobs_at_kill: jobsKilled, jobs_after: jobsAfter, counts: b!.counts,
      versions_before: before, versions_after: after, per_job: perJob, approvals_valid_before: validBefore.length, approvals_valid_after: validAfter.length, restart_to_done_ms: Date.now() - tRestart,
      cost_usd: Number(jobCost(jobs).toFixed(3)) });
    c.check("6.1", "задачи пакета восстановлены после старта и дошли до конечного статуса", jobsAfter.every((j) => ["completed", "failed", "cancelled", "blocked"].includes(j.status)) && jobsAfter.some((j) => j.status === "completed"),
      jobsAfter.map((j) => ({ id: j.id, status: j.status, attempt: j.attempt, interrupts: j.interrupts, error: j.error_json })));
    c.check("6.2", "прерванная задача: новая попытка или blocked(stale_process) с причиной", (() => {
      const j = jobsAfter.find((x) => x.id === at!.job)!;
      return j.interrupts > 0 || j.attempt > at!.attempt || (j.status === "blocked" && /stale_process/.test(j.error_json ?? ""));
    })(), jobsAfter.find((x) => x.id === at!.job));
    c.check("6.3", "дублей версий нет: у задачи ≤ 1 версии, номера версий подряд", perJob.every((p) => p.versions.length <= 1) && pick.every((id) => sceneVersions(sceneOf(st, id).scene_id!).every((v, k) => v.number === k + 1)), perJob);
    c.check("6.4", "прежние версии не изменены (sha256 каталогов)", pick.every((id) => before[id]!.every((v) => after[id]!.find((w) => w.id === v.id)?.sha256 === v.sha256)), { before, after });
    c.check("6.5", "C на месте: valid-решения до перезапуска — valid после", validBefore.every((a) => validAfter.some((z) => z.id === a.id)), { before: validBefore.map((a) => a.subject_ref), after: validAfter.map((a) => a.subject_ref) });
    c.check("6.6", "сироты убитого сервера не живут после старта", orphansAfter.every((o) => !o.alive_after_start), orphansAfter);
    await page.reload();
    await shot(page, "restart", "02-done");
    timing("restart", { wall_ms: Date.now() - t0, cost_usd: Number(jobCost(jobs).toFixed(3)) });
  });
}
