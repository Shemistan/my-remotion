// Task 34 Step 5: `SIGKILL` сервера → старт → проект, ревизии транскрипта и EDL, превью и
// Approval A на месте, sha256 артефактов прежние (каталоги ревизий, прокси, копия исходника);
// [A] оригинал IMG_0685.MOV не изменён (sha256 полного файла).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { ProjectApprovalsDto } from "@ms/contracts";
import {
  ACC_ROOT, Checks, ORIGINAL, ORIGINAL_SHA256, db, getJson, killServer, saveState, sha256File, shot, startServer, state, timing, writeEvidence,
} from "./helpers.js";

/** sha256 всех файлов опубликованных артефактов проекта (кроме кэшей) по относительному пути. */
async function artifactHashes(projectId: string): Promise<Record<string, string>> {
  const base = join(ACC_ROOT, "workspace/projects", projectId);
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) await walk(p);
      else out[p.slice(base.length + 1)] = await sha256File(p);
    }
  };
  for (const sub of ["source", "proxy", "transcript", "edits", "preview"]) {
    try {
      await walk(join(base, sub));
    } catch {
      // нет каталога — нет и артефактов
    }
  }
  return out;
}

function dbState(projectId: string) {
  return db((d) => ({
    transcripts: d.prepare("SELECT id, current_revision FROM transcripts WHERE project_id = ?").all(projectId),
    edls: d.prepare("SELECT id, current_revision FROM edls WHERE project_id = ?").all(projectId),
    approvals: d.prepare("SELECT id, kind, subject_ref, subject_hash, status FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId),
    publications: d.prepare("SELECT dest_rel FROM artifact_publications WHERE dest_rel LIKE ? ORDER BY dest_rel").pluck().all(`workspace/projects/${projectId}/%`),
  }));
}

export default function restart(): void {
  test("Step 5: kill -9 и старт — всё на месте, артефакты и оригинал не изменились", async ({ page }) => {
    const c = new Checks("restart");
    const projectId = state().projectId!;
    const hashesBefore = await artifactHashes(projectId);
    const before = dbState(projectId);
    const apprBefore = await getJson<ProjectApprovalsDto>(page.request, `/api/projects/${projectId}/approvals`);
    const t0 = Date.now();
    await killServer("SIGKILL");
    await startServer();
    timing("restart", { wall_ms: Date.now() - t0 });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("approval-A")).toContainText("утверждено", { timeout: 60_000 });
    await page.getByRole("tab", { name: "Транскрипт" }).click();
    await expect(page.locator(".panel h2 .badge")).toHaveText("ревизия r2");
    await page.getByRole("tab", { name: "Черновой монтаж" }).click();
    await expect(page.getByRole("button", { name: /Превью r\d+ готово/ })).toBeVisible();
    await shot(page, "restart", "01-after-kill9");

    const after = dbState(projectId);
    const apprAfter = await getJson<ProjectApprovalsDto>(page.request, `/api/projects/${projectId}/approvals`);
    const hashesAfter = await artifactHashes(projectId);
    c.check("5.1", "ревизии транскрипта и EDL, публикации — как до kill -9", JSON.stringify(before) === JSON.stringify(after), { before, after });
    c.check("5.2", "Approval A на месте и valid", apprAfter.A.state === "valid" && JSON.stringify(apprBefore) === JSON.stringify(apprAfter), apprAfter);
    const diff = Object.keys({ ...hashesBefore, ...hashesAfter }).filter((k) => hashesBefore[k] !== hashesAfter[k]);
    c.check("5.3", "sha256 артефактов (исходник, прокси, ревизии, превью) прежние", diff.length === 0 && Object.keys(hashesBefore).length > 5, { files: Object.keys(hashesBefore).length, diff });
    writeEvidence("restart", "artifacts-sha256.json", { before: hashesBefore, after: hashesAfter });
    const t1 = Date.now();
    const orig = await sha256File(ORIGINAL);
    saveState({ original: { ...state().original, sha256_after: orig } });
    c.check("5.4", "оригинал IMG_0685.MOV не изменён (sha256)", orig === ORIGINAL_SHA256 && orig === state().original.sha256_before, { before: state().original.sha256_before, after: orig, hash_ms: Date.now() - t1 });
    writeEvidence("restart", "original-sha256.json", { path: ORIGINAL, before: state().original.sha256_before, after: orig, at: new Date().toISOString() });
  });
}
