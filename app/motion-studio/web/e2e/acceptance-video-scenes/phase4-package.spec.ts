// Приёмка Phase 4, шаг 5 (Task 41): Approval C всех готовых сцен кнопками плиток → вкладка «Экспорт»
// → «Собрать папку клипов» (задача `video.package`) → [A] как в 5L: на каждую утверждённую сцену MP4
// (h264, размер версии, fps плана, aac), кроме fullscreen — альфа (prores 4444, yuva*, угол прозрачен),
// длительность файлов = шпаргалке ± 1 кадр, шпаргалка md/csv/txt — строк по принятым сценам, таймкоды
// ролика по кадрам плана. Копия папки человеку — examples/phase4/41-приёмка/clips/ [H: клипы ставятся
// в монтажку]. Итог — docs/evidence/phase-4/package/.
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Job, type VideoPackageDto, VideoPackageManifestSchema } from "@ms/contracts";
import { alphaAtCorner, ffprobe } from "@ms/render";
import { expect, test } from "@playwright/test";
import { timecode } from "../../../server/src/video-scenes/cheatsheet.js";
import { accepted, fpsOf, planDto } from "./phase4-batch.spec.js";
import { approveTile } from "./phase4-isolation.spec.js";
import {
  Checks, EXAMPLES, getJson, jobRow, openProject, saveState, sceneOf, sceneVersions, scenesState, shot, state, tab, timing, waitJob, writeEvidence,
} from "./helpers.js";

export default function pack(): void {
  test("шаг 5: C всех сцен → «Собрать папку клипов» → файлы и шпаргалка как в 5L, копия человеку", async ({ page }) => {
    test.setTimeout(120 * 60_000);
    const t0 = Date.now();
    const c = new Checks("package");
    await openProject(page, "Сцены");
    const st0 = await scenesState();
    const ready = st0.scenes.filter((s) => s.status === "ready" && !s.stale);
    for (const s of ready) {
      // C — на текущую версию: прежнее C другой версии сначала снимается кнопкой плитки
      if (s.approval.state === "valid" && s.approval.version_id !== s.version_id) {
        await page.locator(`[data-testid="video-scene-tile"][data-item="${s.item_id}"]`).getByRole("button", { name: "Снять утверждение" }).click();
        await expect.poll(async () => sceneOf(await scenesState(), s.item_id).approval.state).not.toBe("valid");
        await page.reload();
        await tab(page, "Сцены");
      }
      await approveTile(page, s.item_id);
    }
    const st = await scenesState();
    const approved = st.scenes.filter((s) => s.approval.state === "valid").map((s) => s.item_id);
    c.check("5.1", "все готовые сцены утверждены (C) на текущую версию", ready.every((s) => sceneOf(st, s.item_id).approval.state === "valid" && sceneOf(st, s.item_id).approval.version_id === s.version_id),
      st.scenes.map((s) => ({ item: s.item_id, status: s.status, v: s.version_number, c: s.approval })));
    await shot(page, "package", "01-all-approved");

    await tab(page, "Экспорт");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/video\/package$/.test(r.url())),
      page.getByRole("button", { name: "Собрать папку клипов" }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBeLessThan(300);
    const job = ((await resp.json()) as { job: Job }).job;
    const done = await waitJob(job.id, 90 * 60_000, 5000);
    expect(done.status, JSON.stringify(done.error)).toBe("completed");
    const pkgId = (done.output_refs as { package_id: string }).package_id;
    await expect(page.locator(`[data-testid="video-package-card"][data-package="${pkgId}"]`)).toBeVisible({ timeout: 60_000 });
    await shot(page, "package", "02-export-tab");
    const p = await getJson<VideoPackageDto>(page.request, `/api/video-packages/${pkgId}`);
    const m = VideoPackageManifestSchema.parse(JSON.parse(readFileSync(join(p.abs_path, "package-manifest.json"), "utf8")));
    const plan = await planDto(page, state().planId!);
    const acc = accepted(plan.doc);
    const rows = [];
    for (const s of m.scenes) {
      const v = sceneVersions(s.scene_id).find((x) => x.id === s.version_id)!;
      const set = JSON.parse(v.settings_json) as { width: number; height: number };
      const fps = fpsOf(v);
      const frameMs = (1000 * fps.den) / fps.num;
      const item = acc.find((x) => x.id === s.item_id)!;
      const durMs = ((item.frames.end - item.frames.start) * 1000 * fps.den) / fps.num;
      const mp4 = await ffprobe(join(p.abs_path, s.mp4.file));
      const row: Record<string, unknown> = { n: s.n, item: s.item_id, mode: s.mode, version: s.version_number, approved: s.approved, mp4: s.mp4.file, mp4_probe: mp4 };
      const mp4Ok = mp4.codec === "h264" && mp4.audioCodec === "aac" && mp4.width === set.width && mp4.height === set.height && mp4.fps.num === fps.num && mp4.fps.den === fps.den
        && Math.abs(mp4.durationMs - durMs) <= frameMs + 1 && s.frames.start === item.frames.start;
      c.check(`5.2-${s.item_id}`, `сцена ${s.item_id}: MP4 h264/aac, размер и fps версии, длительность = плану ± 1 кадр`, mp4Ok, { probe: mp4, plan_ms: durMs });
      if (s.mode === "fullscreen") {
        c.check(`5.3-${s.item_id}`, `сцена ${s.item_id} (fullscreen): альфы нет`, s.alpha === null, s.alpha);
      } else {
        const mov = s.alpha ? join(p.abs_path, s.alpha.file) : "";
        const ap = s.alpha ? await ffprobe(mov) : null;
        const corner = s.alpha ? await alphaAtCorner(mov, 0) : -1;
        row.alpha = s.alpha?.file ?? null;
        row.alpha_probe = ap;
        row.alpha_corner = corner;
        c.check(`5.3-${s.item_id}`, `сцена ${s.item_id}: альфа ProRes 4444 yuva*, угол прозрачен, длительность = плану ± 1 кадр`,
          Boolean(ap && ap.codec === "prores" && /4444/.test(ap.profile ?? "") && /^yuva/.test(ap.pixFmt ?? "") && corner === 0 && Math.abs(ap.durationMs - durMs) <= frameMs + 1), { probe: ap, corner });
      }
      c.check(`5.4-${s.item_id}`, `сцена ${s.item_id}: таймкод ролика по кадрам плана`, s.frames.start === item.frames.start && s.frames.end === item.frames.end, { manifest: s.frames, plan: item.frames, tc: timecode(item.frames.start, fps) });
      rows.push(row);
    }
    const files = readdirSync(p.abs_path);
    const csv = readFileSync(join(p.abs_path, "шпаргалка.csv"), "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    const txt = readFileSync(join(p.abs_path, "шпаргалка.txt"), "utf8");
    const md = readFileSync(join(p.abs_path, "шпаргалка.md"), "utf8");
    c.check("5.5", "в папке — только утверждённые сцены, прочие принятые — «не вошли»", m.scenes.map((s) => s.item_id).sort().join() === [...approved].sort().join()
      && m.missing.map((x) => x.item_id).sort().join() === acc.map((x) => x.id).filter((id) => !approved.includes(id)).sort().join(), { scenes: m.scenes.map((s) => s.item_id), missing: m.missing });
    c.check("5.6", "шпаргалка md/csv/txt: строк CSV = принятым сценам плана", csv.length - 1 === acc.length && txt.length > 0 && md.includes("Шпаргалка"), { csv_rows: csv.length - 1, accepted: acc.length, files });
    writeEvidence("package", "summary.json", { package_id: pkgId, job: jobRow(done.id), rel_path: p.rel_path, display_name: p.display_name, plan: m.plan, fps: m.fps, rows, missing: m.missing, files });
    writeEvidence("package", "шпаргалка.md", md);
    saveState({ package: { id: pkgId, abs: p.abs_path } });

    // копия папки человеку
    const out = join(EXAMPLES, "clips");
    mkdirSync(out, { recursive: true });
    for (const f of files) copyFileSync(join(p.abs_path, f), join(out, f));
    c.note("5.7", "копия папки клипов для человека: клипы ставятся в монтажку", { dir: "examples/phase4/41-приёмка/clips", files }, "H");
    timing("package", { wall_ms: Date.now() - t0 });
  });
}
