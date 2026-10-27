// Приёмка Phase 5, шаг 5 (Task 46): устойчивость финала.
// (а) SIGKILL сервера во время рендера финала (720p draft) → после старта группа воркера рендера и
//     медиасервер мертвы, частичного файла в final/ нет, задача доведена (новая попытка) или
//     `blocked(stale_process)`.
// (б) `MS_DATA_DIR` переименован во время рендера финала → `storage_offline` (503), исходный путь не
//     создан заново (на системный диск и мимо хранилища ничего не записано) → каталог возвращён →
//     online → задача доведена, проверка pass.
// (в) правка EDL после «Смонтировать и экспортировать», до старта задачи → `failed(timeline_stale)`.
//     Окно «до старта» — очередь: финал ждёт ключ `final` проекта, пока идёт «Повторить экспорт»
//     (`final.reproduce`, его новая заявка финала не отменяет); за это время в UI чернового монтажа
//     восстановлена одна вырезка (новая ревизия EDL) и A утверждено заново.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { EdlDto, Job, VideoProjectDto } from "@ms/contracts";
import { expect, test } from "@playwright/test";
import { t } from "../../src/i18n/index.js";
import {
  ACC_ROOT, Checks, alive, clickJob, db, getJson, jobDto, jobEvents, jobRow, killServer, log, openProject, saveState, shot, sleep, startServer, state, tab, terminal, timing,
  waitHealthy, waitJob, writeEvidence,
} from "./helpers.js";
import { RENDER_TIMEOUT, exportOfJob, finalExports, openTimeline, startFinalViaUi } from "./phase5-export-variants.spec.js";

const DIR = "resilience";

/** Процессы задачи из реестра `job_processes` (все попытки), включая завершённые. */
const processesOf = (jobId: string) =>
  db((d) => d.prepare("SELECT attempt, pid, pgid, cmd, started_at, ended_at, exit_code FROM job_processes WHERE job_id = ? ORDER BY started_at").all(jobId)) as
    { attempt: number; pid: number; pgid: number; cmd: string; started_at: string; ended_at: string | null; exit_code: number | null }[];
const groupAlive = (pgid: number): boolean => {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
};
/** Ждёт, пока задача дойдёт до этапа `render` с живым процессом рендера (или завершится). */
async function waitRender(jobId: string, timeoutMs = 30 * 60_000): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = await jobDto(jobId);
    if (terminal(j.status)) return j;
    const live = db((d) => d.prepare("SELECT COUNT(*) FROM job_processes WHERE job_id = ? AND ended_at IS NULL").pluck().get(jobId)) as number;
    if (j.status === "running" && j.stage === "render" && live > 0) return j;
    if (Date.now() > until) throw new Error(`задача ${jobId} не дошла до рендера за ${timeoutMs} мс (${j.status}/${j.stage})`);
    await sleep(1000);
  }
}
/** Файлы каталогов final/ проекта, не принадлежащие опубликованным экспортам. */
function strayFinalFiles(): string[] {
  const projectId = state().projectId!;
  const finalRoot = join(ACC_ROOT, "workspace/projects", projectId, "final");
  if (!existsSync(finalRoot)) return [];
  const known = new Set((db((d) => d.prepare("SELECT rel_path FROM final_exports WHERE project_id = ?").pluck().all(projectId)) as string[]).map((r) => join(ACC_ROOT, r.endsWith(".mp4") ? join(r, "..") : r)));
  const stray: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name);
      if ([...known].some((k) => p === k || p.startsWith(`${k}/`) || k.startsWith(`${p}/`))) {
        if (n.isDirectory() && ![...known].some((k) => p === k || p.startsWith(`${k}/`))) walk(p);
        continue;
      }
      stray.push(p.slice(ACC_ROOT.length + 1));
    }
  };
  walk(finalRoot);
  return stray;
}
async function storageIs(want: "online" | "storage_offline", timeoutMs = 90_000): Promise<{ storage: string }> {
  const until = Date.now() + timeoutMs;
  let h = await waitHealthy();
  while (h.storage !== want && Date.now() < until) {
    await sleep(1000);
    h = await waitHealthy();
  }
  return h;
}
const DRAFT = { resolution: "720p", quality: "draft" } as const;

export default function resilience(): void {
  test("шаг 5а–б: SIGKILL во время финала; хранилище переименовано во время рендера", async ({ page }) => {
    test.setTimeout(3 * RENDER_TIMEOUT);
    const t0 = Date.now();
    const c = new Checks(DIR);

    // --- (а) SIGKILL ---
    const job = await startFinalViaUi(page, DRAFT);
    const j1 = await waitRender(job.id);
    expect(j1.status, `финал завершился до рендера: ${JSON.stringify(j1)}`).toBe("running");
    await sleep(5000);
    const procs = processesOf(job.id).filter((p) => !p.ended_at);
    const serverPid = state().serverPid;
    log(`SIGKILL сервера ${serverPid}; процессы задачи: ${procs.map((p) => `${p.pid}/${p.pgid} ${p.cmd.slice(0, 60)}`).join("; ")}`);
    await killServer("SIGKILL");
    const afterKill = procs.map((p) => ({ pid: p.pid, pgid: p.pgid, alive: alive(p.pid), group: groupAlive(p.pgid) }));
    await startServer();
    let reaped = procs.map((p) => ({ pid: p.pid, alive: alive(p.pid), group: groupAlive(p.pgid) }));
    for (let k = 0; k < 60 && reaped.some((r) => r.alive || r.group); k++) {
      await sleep(1000);
      reaped = procs.map((p) => ({ pid: p.pid, alive: alive(p.pid), group: groupAlive(p.pgid) }));
    }
    c.check("5.1", "после старта группа воркера рендера и медиасервер мертвы (реестр job_processes)", procs.length > 0 && reaped.every((r) => !r.alive && !r.group),
      { procs: procs.map((p) => ({ pid: p.pid, pgid: p.pgid, cmd: p.cmd.slice(0, 160) })), after_kill: afterKill, after_start: reaped });
    const stray1 = strayFinalFiles();
    c.check("5.2", "частичного файла финала нет (final/ — только опубликованные экспорты)", stray1.length === 0, stray1);
    const boot = db((d) => d.prepare("SELECT * FROM boot_reports ORDER BY created_at DESC LIMIT 1").get());
    writeEvidence(DIR, "sigkill-boot-report.json", boot);

    // --- (б) хранилище переименовано во время рендера (та же задача, новая попытка — или новый финал) ---
    let j2 = await waitRender(job.id, 20 * 60_000);
    let storageJob = job.id;
    if (terminal(j2.status)) {
      const row = jobRow(job.id);
      c.check("5.3", "задача после SIGKILL: доведена новой попыткой или blocked(stale_process)", j2.status === "completed" || (j2.status === "blocked" && /stale_process/.test(row.error_json ?? "")), { status: j2.status, attempt: row.attempt, error: row.error_json });
      const s2 = await startFinalViaUi(page, DRAFT);
      storageJob = s2.id;
      j2 = await waitRender(s2.id);
    }
    expect(j2.status, "финал для проверки хранилища не дошёл до рендера").toBe("running");
    await sleep(3000);
    const moved = `${ACC_ROOT}.renamed-${Date.now()}`;
    renameSync(ACC_ROOT, moved);
    let recreated: string | false = false;
    try {
      const h = await storageIs("storage_offline");
      c.check("5.4", "сервер в режиме storage_offline", h.storage === "storage_offline", h);
      await page.reload();
      await expect(page.getByText("Хранилище недоступно").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, DIR, "01-storage-offline");
      const get = await page.request.get(`/api/projects/${state().projectId!}/final-exports`);
      c.check("5.5", "API: GET → 503", get.status() === 503, { status: get.status() });
      for (let k = 0; k < 15 && !recreated; k++) {
        await sleep(1000);
        if (existsSync(ACC_ROOT)) recreated = execFileSync("ls", ["-laR", ACC_ROOT], { encoding: "utf8" }).slice(0, 2000);
      }
      c.check("5.6", "на исходном пути ничего не создано (запись мимо хранилища не идёт)", !recreated, recreated || "нет");
    } finally {
      // прогон 2026-10-27: на исходном пути появился `run/tmp` (находка D2) — без этого возврат не
      // выполнялся и сервер навсегда оставался offline; заглушку — в сторону (не удалять), хранилище — назад
      if (existsSync(ACC_ROOT)) renameSync(ACC_ROOT, `${ACC_ROOT}-offline-stub-${Date.now()}`);
      renameSync(moved, ACC_ROOT);
    }
    const h2 = await storageIs("online");
    c.check("5.7", "каталог возвращён → online", h2.storage === "online", h2);
    const done = await waitJob(storageJob, RENDER_TIMEOUT, 10_000);
    const row2 = jobRow(storageJob);
    c.check("5.8", "финал доведён после возврата хранилища (completed)", done.status === "completed", { status: done.status, attempt: row2.attempt, interrupts: row2.interrupts, error: row2.error_json });
    const e = await exportOfJob(page, storageJob);
    c.check("5.9", "экспорт после сбоя хранилища — ready, verify pass", e?.status === "ready" && e.verify?.verdict === "pass", { status: e?.status, verdict: e?.verify?.verdict, failures: e?.verify?.failures });
    if (storageJob === job.id) {
      c.check("5.3", "задача после SIGKILL доведена (новая попытка, затем сбой хранилища — тоже доведена)", done.status === "completed" && row2.attempt >= 2, { attempt: row2.attempt });
    }
    c.check("5.10", "частичных файлов финала нет и после сбоя хранилища", strayFinalFiles().length === 0, strayFinalFiles());
    writeEvidence(DIR, "jobs.json", [job.id, storageJob].filter((v, i, a) => a.indexOf(v) === i).map((id) => ({ job: jobRow(id), processes: processesOf(id), events: jobEvents(id) })));
    saveState({ resilience: { sigkill: job.id, storage: storageJob, export: e?.id } });
    timing("resilience.ab", { wall_ms: Date.now() - t0 });
  });

  test("шаг 5в: правка EDL после «Смонтировать и экспортировать» до старта → failed(timeline_stale)", async ({ page }) => {
    test.setTimeout(2 * RENDER_TIMEOUT);
    const t0 = Date.now();
    const c = new Checks(DIR);
    const holdId = state().exports?.[process.env.MS_ACC_HOLD ?? "1080p"];
    expect(holdId, "нет экспорта для «Повторить экспорт»").toBeTruthy();
    await openProject(page);
    await openTimeline(page);
    const row = page.locator(`[data-testid="final-export"][data-export-id="${holdId}"]`);
    const hold = await clickJob(page, row.getByRole("button", { name: t("finalExport.history.reproduce") }), /\/reproduce$/);
    await waitRender(hold.id);
    const fin = await startFinalViaUi(page, DRAFT);
    await sleep(3000);
    const pending = await jobDto(fin.id);
    c.check("5.11", "заявка финала ждёт очереди (ключ final занят повтором экспорта)", pending.status === "pending", { status: pending.status, stage: pending.stage, hold: (await jobDto(hold.id)).status });
    // правка чернового монтажа в UI: восстановить одну принятую вырезку → новая ревизия EDL → A заново
    const v = await getJson<VideoProjectDto>(page.request, `/api/projects/${state().projectId!}/video`);
    let edl = await getJson<EdlDto>(page.request, `/api/edls/${v.edl!.id}`);
    const rev0 = edl.current_revision;
    const cut = edl.doc.decisions.find((d) => d.status === "accepted")!;
    await openProject(page, "Черновой монтаж");
    await page.getByTestId(`cut-${cut.id}`).locator("button[data-action='restore']").click();
    await expect.poll(async () => (edl = await getJson<EdlDto>(page.request, `/api/edls/${v.edl!.id}`)).current_revision, { timeout: 30_000 }).toBeGreaterThan(rev0);
    await page.reload();
    await tab(page, "Черновой монтаж");
    const approveA = page.getByRole("button", { name: "Утвердить черновой монтаж (A)" });
    if (!(await approveA.isEnabled({ timeout: 5000 }).catch(() => false))) {
      const pj = await waitJob((await clickJob(page, page.getByRole("button", { name: "Собрать превью" }), /\/revisions\/\d+\/preview$/)).id, 30 * 60_000, 3000);
      log(`превью r${edl.current_revision}: ${pj.status}`);
    }
    await expect(approveA).toBeEnabled({ timeout: 60_000 });
    await approveA.click();
    await expect(page.getByTestId("approval-A")).toContainText("утверждено");
    const stillPending = await jobDto(fin.id);
    c.check("5.12", "EDL изменён и A утверждено заново, пока заявка финала ещё не стартовала", stillPending.status === "pending", { status: stillPending.status, edl: { from: rev0, to: edl.current_revision, restored: cut.id } });
    const done = await waitJob(fin.id, RENDER_TIMEOUT, 5000);
    const r = jobRow(fin.id);
    c.check("5.13", "финал: failed(timeline_stale), экспорта нет", done.status === "failed" && /timeline_stale/.test(r.error_json ?? "") && !(await exportOfJob(page, fin.id)), { status: done.status, error: r.error_json });
    const h = await waitJob(hold.id, RENDER_TIMEOUT, 10_000);
    const he = (await finalExports(page)).find((x) => x.job?.id === hold.id);
    c.note("5.14", "повтор экспорта, державший очередь (справочно)", { status: h.status, error: jobRow(hold.id).error_json, compare: he?.compare?.verdict }, "info");
    await openProject(page);
    await openTimeline(page);
    await shot(page, DIR, "02-timeline-stale-after-edl");
    writeEvidence(DIR, "stale-job.json", { job: r, events: jobEvents(fin.id), hold: jobRow(hold.id) });
    timing("resilience.c", { wall_ms: Date.now() - t0 });
  });
}
