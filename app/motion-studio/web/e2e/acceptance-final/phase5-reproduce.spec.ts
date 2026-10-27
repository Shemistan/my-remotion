// Приёмка Phase 5, шаг 4 (Task 46): воспроизводимость из сохранённого проекта. SIGTERM серверу →
// старт заново (тот же `npm start`) → вкладка «Таймлайн» → у экспорта 1080p «Повторить экспорт»
// (`final.reproduce`: те же входы по манифесту → новый экспорт → `compareExports`) → [A]
// `compare.verdict = reproduced` (входы и ffprobe те же, кадры PSNR ≥ 50 дБ), в UI — «совпал».
import { expect, test } from "@playwright/test";
import { t } from "../../src/i18n/index.js";
import { Checks, alive, clickJob, killServer, openProject, saveState, shot, startServer, state, timing, waitJob, writeEvidence } from "./helpers.js";
import { RENDER_TIMEOUT, fileChecks, finalExports, openTimeline, verifyChecks } from "./phase5-export-variants.spec.js";

const DIR = "reproduce";

export default function reproduce(): void {
  test("шаг 4: SIGTERM → старт → «Повторить экспорт» → reproduced", async ({ page }) => {
    test.setTimeout(RENDER_TIMEOUT + 30 * 60_000);
    const t0 = Date.now();
    const c = new Checks(DIR);
    const base = state().exports?.["1080p"];
    expect(base, "нет экспорта 1080p (шаг export)").toBeTruthy();
    const pid = state().serverPid;
    await killServer("SIGTERM");
    c.check("4.1", "сервер остановлен SIGTERM", !alive(pid), { pid });
    await startServer();
    c.check("4.2", "сервер запущен заново (новый pid)", state().serverPid !== pid && alive(state().serverPid), { old: pid, new: state().serverPid });
    await openProject(page);
    await openTimeline(page);
    const row = page.locator(`[data-testid="final-export"][data-export-id="${base}"]`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    const job = await clickJob(page, row.getByRole("button", { name: t("finalExport.history.reproduce") }), /\/reproduce$/);
    const done = await waitJob(job.id, RENDER_TIMEOUT, 10_000);
    timing("reproduce", { wall_ms: Date.now() - t0 });
    c.check("4.3", "задача final.reproduce завершена", done.status === "completed", { status: done.status, error: done.error });
    const all = await finalExports(page);
    const e = all.find((x) => x.job?.id === job.id)!;
    expect(e, "нет экспорта повтора").toBeTruthy();
    saveState({ exports: { ...state().exports, reproduce: e.id } });
    writeEvidence(DIR, "compare.json", e.compare ?? null);
    c.check("4.4", "compareExports.verdict = reproduced: входы и ffprobe те же, кадры PSNR ≥ 50 дБ", e.compare?.verdict === "reproduced" && e.compare.reproduced_from === base && e.compare.inputs_equal && e.compare.probe_equal,
      { compare: e.compare });
    const src = all.find((x) => x.id === base)!;
    verifyChecks(c, "4.v", e, { width: src.output!.width, height: src.output!.height, fps: src.output!.fps });
    fileChecks(c, "4.f", DIR, e, "final-1080p-reproduced.mp4");
    await page.reload();
    await openTimeline(page);
    const row2 = page.locator(`[data-testid="final-export"][data-export-id="${e.id}"]`);
    await expect(row2.getByTestId("compare")).toHaveAttribute("data-verdict", "reproduced", { timeout: 60_000 });
    await row2.scrollIntoViewIfNeeded();
    await shot(page, DIR, "01-reproduced");
  });
}
