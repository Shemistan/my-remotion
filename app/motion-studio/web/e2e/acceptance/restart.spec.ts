// Перезапуск (`09` §1 п. 5): `kill -9` сервера → новый старт → сцена Test 2 открывается в UI,
// все версии на месте, sha256 файлов версий не изменились; повторный экспорт v3 даёт файл той
// же длительности и размеров, что экспорт до перезапуска. Evidence — docs/evidence/phase-1/restart/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { VersionManifest } from "@ms/contracts";
import { Checks, EVIDENCE, collect, db, exportViaUi, killServer, plays, shot, startServer, state, writeEvidence } from "./helpers.js";
import { versionDir } from "./helpers.js";

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** sha256 каждого файла версий сцены (manifest.json + файлы из manifest.files). */
function sceneHashes(sceneId: string): Record<string, string> {
  const ids = db((d) => d.prepare("SELECT id FROM scene_versions WHERE scene_id = ? ORDER BY number").pluck().all(sceneId) as string[]);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const dir = versionDir(id);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as VersionManifest;
    out[`${id}/manifest.json`] = sha(join(dir, "manifest.json"));
    for (const f of m.files) out[`${id}/${f.path}`] = sha(join(dir, f.path));
  }
  return out;
}

export default function restart(): void {
  test("перезапуск: kill -9 → старт → версии на месте, sha256 те же, экспорт v3 повторяется", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    const c = new Checks("restart");
    const st = state();
    expect(st.test2 && st.test3?.exportProbe, "restart идёт после Test 2 и Test 3").toBeTruthy();
    const sceneId = st.test2!.sceneId;
    const before = sceneHashes(sceneId);
    const pidBefore = st.serverPid;

    await killServer("SIGKILL");
    const t0 = Date.now();
    await startServer();
    const restartMs = Date.now() - t0;
    c.check("restart.up", "сервер стартовал после kill -9 (owner-lock снят ядром)", state().serverPid !== pidBefore, { pidBefore, pidAfter: state().serverPid, restartMs });

    await page.goto(`/scenes/${sceneId}`);
    const history = page.getByRole("region", { name: "История версий" });
    await expect(history.getByRole("listitem")).toHaveCount(Object.keys(before).filter((k) => k.endsWith("/manifest.json")).length);
    const t = await plays(page);
    c.check("restart.ui", "сцена открывается, история целиком, текущая версия играет", t > 0.5, `версий ${await history.getByRole("listitem").count()}`);
    await shot(page, "restart", "01-scene-after-restart");
    const after = sceneHashes(sceneId);
    const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
    c.check("restart.sha", "sha256 всех файлов версий не изменились", changed.length === 0, { files: Object.keys(before).length, changed });
    writeEvidence("restart", "hashes.json", { before, after });

    const v3 = st.test3!.v3.versionId!;
    await page.goto(`/scenes/${sceneId}?v=${v3}`);
    await expect(page.getByRole("heading", { name: "v3", level: 1 })).toBeVisible();
    const ex = await exportViaUi(page, "mp4");
    const was = st.test3!.exportProbe!;
    const same = Math.abs(ex.probe.durationS - was.durationS) < 1 / 30 && ex.probe.video.width === was.video.width && ex.probe.video.height === was.video.height;
    c.check("restart.export", "повторный экспорт v3: та же длительность и размеры", same, { before: { d: was.durationS, w: was.video.width, h: was.video.height }, after: { d: ex.probe.durationS, w: ex.probe.video.width, h: ex.probe.video.height } });
    collect(ex.exportId, join(EVIDENCE, "restart/export-v3-again"));
  });
}
