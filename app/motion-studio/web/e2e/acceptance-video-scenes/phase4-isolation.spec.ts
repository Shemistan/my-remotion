// Приёмка Phase 4, шаг 3 (Task 41): изоляция сцен пакета. Сцены 1 и 3 утверждаются (C) кнопкой
// плитки; снимок «до» — sha256 каталогов всех их версий и состояние C. Повторный пакет
// (`regenerate`, сцены 1–3: в UI «Перегенерировать» есть только у плитки, пакет на три — тем же
// запросом, что шлёт UI) → когда задача сцены 2 дошла до рендера, SIGKILL группы её процесса
// рендера (pgid из job_processes) → [A] сцены 1 и 3 ready, их прежние версии (sha256 каталогов) и C
// не изменились; сцена 2 — новая попытка или failed с причиной; очередь не встала (все задачи
// пакета в конечном статусе, сцены после убитой — тоже).
import type { VideoBatchDto } from "@ms/contracts";
import { expect, test } from "@playwright/test";
import {
  Checks, jobCost, jobEvents, jobRow, liveProcesses, log, openProject, post, saveState, sceneOf, sceneVersions, scenesState, sha256Dir, shot, state, tile,
  timing, versionDir, waitBatches, writeEvidence,
} from "./helpers.js";

const GEN_TIMEOUT = 4 * 60 * 60_000;

/** Снимок версий сцены: id, номер, sha256 каталога. */
export const snapshot = (sceneId: string) => sceneVersions(sceneId).map((v) => ({ id: v.id, number: v.number, status: v.status, sha256: sha256Dir(versionDir(v)) }));

/** «Утвердить (C)» на плитке (с подтверждением, если у версии есть blocking-замечания QA). */
export async function approveTile(page: import("@playwright/test").Page, itemId: string): Promise<void> {
  const t = tile(page, itemId);
  const btn = t.getByRole("button", { name: "Утвердить (C)" });
  // плитка и её C грузятся после вкладки: ждать кнопку или уже утверждённую текущую версию
  await expect(btn.or(t.getByTestId("approval-c-badge").filter({ hasText: /^утверждена v\d+$/ }))).toBeVisible({ timeout: 30_000 });
  if ((await btn.count()) === 0) return;
  await btn.click();
  const confirm = page.getByRole("button", { name: "Утвердить с замечаниями" });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
  await expect(t.getByTestId("approval-c-badge")).toContainText("утверждена", { timeout: 30_000 });
}

export default function isolation(): void {
  test("шаг 3: повторный пакет, SIGKILL рендера сцены 2 — сцены 1 и 3 не задеты, очередь не встала", async ({ page }) => {
    test.setTimeout(GEN_TIMEOUT + 30 * 60_000);
    const t0 = Date.now();
    const c = new Checks("isolation");
    const st0 = await scenesState();
    const ready = state().items!.filter((id) => sceneOf(st0, id).status === "ready");
    expect(ready.length, "для изоляции нужны ≥ 3 готовые сцены после шага 2").toBeGreaterThanOrEqual(3);
    const [s1, s2, s3] = ready as [string, string, string];
    await openProject(page, "Сцены");
    for (const id of [s1, s3]) await approveTile(page, id);
    const stA = await scenesState();
    const before = Object.fromEntries([s1, s3].map((id) => {
      const s = sceneOf(stA, id);
      return [id, { scene_id: s.scene_id, approval: s.approval, versions: snapshot(s.scene_id!) }];
    }));
    writeEvidence("isolation", "before.json", before);
    await shot(page, "isolation", "01-approved-1-3");

    const r = await post(page.request, `/api/projects/${state().projectId}/video/generate`, { revision: stA.plan!.revision, item_ids: [s1, s2, s3], regenerate: true });
    expect([200, 202], await r.text()).toContain(r.status());
    const b0 = (await r.json()) as VideoBatchDto;
    saveState({ batches: { ...state().batches, isolation: b0.id } });
    log(`пакет regenerate ${b0.id}: ${b0.items.map((x) => x.item_id).join(", ")}`);
    const job2 = b0.items.find((x) => x.item_id === s2)!.job!.id;
    let killed: { pid: number; pgid: number; cmd: string; attempt: number; stage: string | null; at: string } | undefined;
    const [b] = await waitBatches([b0.id], GEN_TIMEOUT, async () => {
      if (killed) return;
      const j = jobRow(job2);
      if (j.status !== "running") return;
      // процесс рендера — worker Remotion (путь репозитория содержит «.claude/», поэтому по worker, не по «claude»)
      const proc = liveProcesses(job2).filter((p) => p.attempt === j.attempt && /render\/src\/node\/worker/.test(p.cmd)).at(-1);
      if (!proc) return;
      try {
        process.kill(-proc.pgid, "SIGKILL");
      } catch (e) {
        log(`SIGKILL -${proc.pgid}: ${(e as Error).message}`);
        return;
      }
      killed = { pid: proc.pid, pgid: proc.pgid, cmd: proc.cmd, attempt: j.attempt, stage: j.stage, at: new Date().toISOString() };
      log(`SIGKILL группы ${proc.pgid} (${proc.cmd}) сцены 2 ${s2} на этапе ${j.stage}`);
    }, 3000);
    const st = await scenesState();
    const after = Object.fromEntries([s1, s3].map((id) => {
      const s = sceneOf(st, id);
      return [id, { status: s.status, version: s.version_number, approval: s.approval, versions: snapshot(s.scene_id!) }];
    }));
    const j2 = jobRow(job2);
    const s2dto = sceneOf(st, s2);
    writeEvidence("isolation", "after.json", { batch: b!.id, counts: b!.counts, killed: killed ?? null, scene2: { job: j2, status: s2dto.status, version: s2dto.version_number, events: jobEvents(job2).slice(-30) }, after });
    c.check("3.1", "рендер сцены 2 убит SIGKILL группы процессов", Boolean(killed), killed ?? "этап рендера сцены 2 не пойман");
    for (const id of [s1, s3]) {
      const a = before[id]!;
      const z = after[id]!;
      const same = a.versions.every((v) => z.versions.find((w) => w.id === v.id)?.sha256 === v.sha256);
      c.check(`3.2-${id}`, `сцена ${id}: ready, прежние версии (sha256 каталогов) не изменены`, z.status === "ready" && same, { status: z.status, before: a.versions, after: z.versions });
      c.check(`3.3-${id}`, `сцена ${id}: C не изменено`, z.approval.state === a.approval.state && z.approval.version_id === a.approval.version_id, { before: a.approval, after: z.approval });
    }
    c.check("3.4", "сцена 2: новая попытка или failed с причиной", (j2.attempt > (killed?.attempt ?? 1) || j2.interrupts > 0) || (j2.status === "failed" && Boolean(j2.error_json)) || s2dto.status === "ready",
      { status: j2.status, attempt: j2.attempt, interrupts: j2.interrupts, error: j2.error_json, scene: s2dto.status });
    c.check("3.5", "очередь не встала: все задачи пакета в конечном статусе", b!.items.every((x) => !x.job || ["completed", "failed", "cancelled", "blocked"].includes(x.job.status)), b!.counts);
    const cost = jobCost(b!.items.flatMap((x) => (x.job ? [x.job.id] : [])));
    await openProject(page, "Сцены");
    await shot(page, "isolation", "02-after");
    timing("isolation", { wall_ms: Date.now() - t0, cost_usd: Number(cost.toFixed(3)) });
  });
}
