// Test 1 — Data Storytelling (`09` §2) через UI с реальным claude и рендером: Dashboard →
// новый проект «Приёмка» → промпт Test 1 дословно → «Сгенерировать» → completed; плеер,
// компоненты KB, QA в UI; проверки [A] по файлам версии; стабильность повторного рендера;
// «Экспорт» MP4 → ffprobe. Evidence — docs/evidence/phase-1/test1/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { MotionSpec, QAReport, Settings, VersionManifest } from "@ms/contracts";
import { contrastRatio } from "@ms/render";
import { countStarts, inBeat } from "../../../server/src/pipeline/qa-frames.js";
import { loadPng, lumaStats } from "../../../server/src/qa/image.js";
import type { LayoutFrame } from "../../../server/src/qa/layout.js";
import {
  Checks, EVIDENCE, type Generated, REUSE, TEST1, collect, exportViaUi, generateViaUi, jobCost, plays, renderFrames, saveState, shot, state, versionDir, writeEvidence,
} from "./helpers.js";

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const digits = (s: string) => s.replace(/[\s\u00a0\u202f\u2009.,]/g, "");
const ocr = (qa: QAReport, f: number) => (qa.ocr ?? []).find((o) => o.frame === f)?.texts ?? [];

/** Видимые тексты кадра (непрозрачность > 0,5), по убыванию кегля. */
const visible = (f: LayoutFrame | undefined) => (f?.items ?? []).filter((i) => i.opacity > 0.5).sort((a, b) => b.fontPx - a.fontPx);

export default function test1(): void {
  test("Test 1 — Data Storytelling: генерация через UI, проверки 09 §2, экспорт", async ({ page }) => {
    test.setTimeout(75 * 60_000);
    const c = new Checks("test1");

    const prev = state().test1;
    let g: Generated;
    if (REUSE && prev?.versionId) {
      g = prev; // продолжение прогона: генерация уже прошла через UI
    } else {
      // Dashboard → новый проект «Приёмка» → страница проекта
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Проекты", exact: true })).toBeVisible();
      await page.getByLabel("Название проекта").fill("Приёмка");
      await page.getByRole("button", { name: "Создать" }).click();
      await page.waitForURL(/\/projects\/[^/]+$/);
      const projectId = /\/projects\/([^/?#]+)/.exec(page.url())![1]!;
      saveState({ projectId });
      await expect(page.getByRole("heading", { name: "Приёмка", level: 1 })).toBeVisible();
      await shot(page, "test1", "01-project");
      g = await generateViaUi(page, TEST1);
      saveState({ test1: g });
    }
    c.check("job", "задача playground.generate completed, версия есть", g.status === "completed" && g.versionId !== null, g);
    expect(g.versionId, `генерация Test 1: ${JSON.stringify(g)}`).not.toBeNull();
    const vid = g.versionId!;

    // UI: плеер, длительность, компоненты KB, QA
    await page.goto(`/scenes/${g.sceneId}?v=${g.versionId}`);
    await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
    const t = await plays(page);
    c.check("ui.player", "плеер играет (currentTime растёт)", t > 0.5, `currentTime ${t.toFixed(2)} с`);
    const dir = versionDir(vid);
    const settings = readJson<Settings>(join(dir, "settings.json"));
    const info = (await page.getByTestId("player-info").textContent()) ?? "";
    c.check("ui.duration", "длительность в плеере = настройкам", info.includes(`(${settings.duration_frames} кадров)`), info);
    const kb = page.getByRole("region", { name: "Компоненты" }).locator(".kb-refs > li");
    const kbRows = await kb.allTextContents();
    const kbOk = kbRows.length >= 1 && kbRows.every((r) => /[0-9a-f]{7}/.test(r) && /(MIT|Apache|BSD|ISC|license|лиценз)/i.test(r));
    c.check("ui.components", "ComponentsPanel: ≥ 1 запись KB с commit и лицензией", kbOk, kbRows);
    const technical = await page.getByRole("region", { name: "Проверка качества" }).locator(".gates li").first().getAttribute("data-verdict");
    c.check("ui.qa", "QAPanel: технический gate pass", technical === "pass", technical);
    await shot(page, "test1", "02-playground");

    // [A] по файлам версии
    const manifest = readJson<VersionManifest>(join(dir, "manifest.json"));
    const spec = readJson<MotionSpec>(join(dir, "spec.json"));
    const qa = readJson<QAReport>(join(dir, "qa.json"));
    const style = readJson<{ palette: { bg: string; text: string; muted: string } }>(join(dir, "style.json"));
    const frames = manifest.qa_frames;
    const dur = settings.duration_frames;
    const last = Math.max(...frames);

    const chartBeat = spec.beats.some((b) => /chart|graph|line|график/i.test(`${b.action} ${b.description ?? ""}`));
    c.check("t1.chart", "spec содержит бит графика", chartBeat, spec.beats.map((b) => b.action), "A+H");
    const lumas = await Promise.all(frames.map(async (f) => lumaStats(await loadPng(join(dir, "frames", `${f}.png`))).mean));
    c.check("t1.dark", "тёмный фон: средняя яркость QA-кадров < 25 %", mean(lumas) < 0.25, lumas.map((x) => x.toFixed(3)));

    const count = countStarts(spec)[0];
    const firstNumberFrame = count ? frames.find((f) => f >= count.start_frame && inBeat(count, f, spec.duration_frames)) : undefined;
    const first = firstNumberFrame === undefined ? [] : ocr(qa, firstNumberFrame);
    c.check("t1.ocr-from", "OCR «10 000» на кадре начала счёта", first.some((s) => /10\s?000/.test(s) && !/100\s?000/.test(s)), { frame: firstNumberFrame, texts: first });
    c.check("t1.ocr-to", "OCR «1 000 000» на последнем QA-кадре", ocr(qa, last).some((s) => /1\s?000\s?000/.test(s)), { frame: last, texts: ocr(qa, last) });

    // то же по данным: реестр раскладки кадров бита счёта — первое и последнее видимое число
    if (count) {
      const span = [...new Set([...Array.from({ length: 8 }, (_, i) => count.start_frame + i), ...Array.from({ length: 8 }, (_, i) => Math.min(count.end_frame, count.start_frame + 8 + i * 4))])];
      const cr = await renderFrames(vid, span, "t1-count");
      // герой-счётчик — число кеглем дисплея (≥ 6 % высоты кадра); подписи оси мельче
      const nums = cr.layout.map((f) => ({ frame: f.frame, hero: visible(f).find((i) => /\d/.test(i.text) && i.fontPx >= 0.06 * f.height)?.text ?? null }));
      const firstSeen = nums.find((n) => n.hero !== null);
      const is10k = (t: string) => digits(t) === "10000" || /^10\s?тыс/.test(t.trim());
      c.check("t1.count-from", "реестр раскладки: первое видимое значение счётчика — 10 000", !!firstSeen && is10k(firstSeen.hero!), nums);
    }

    const emph = spec.beats.filter((b) => /emphas|accent|payoff|strike|hero|final|акцент|финал/i.test(`${b.id} ${b.action}`) && b.start_frame >= dur * 0.5);
    c.check("t1.emphasis-beat", "spec: отдельный бит акцента во второй половине", emph.length > 0, spec.beats.map((b) => `${b.id}:${b.action}@${b.start_frame}`), "A+H");

    // повторный рендер опубликованной версии в отдельный каталог: те же 3 ключевых кадра
    const key = [...new Set([frames[0]!, frames[Math.floor(frames.length / 2)]!, last])];
    const again = await renderFrames(vid, [...new Set([...key, dur - 1])], "t1-stable");
    const pairs = key.map((f) => ({ frame: f, published: sha(join(dir, "frames", `${f}.png`)), rerender: sha(join(again.out, "frames", `${f}.png`)) }));
    c.check("t1.stable", "повторный рендер: sha256 трёх ключевых PNG совпадают", pairs.every((p) => p.published === p.rerender), pairs);

    const lastLayout = again.layout.find((f) => f.frame === dur - 1);
    const texts = visible(lastLayout);
    const top = texts[0];
    c.check("t1.final-largest", "последний кадр: финальное число — самый крупный текст", !!top && digits(top.text).includes("1000000"), texts.slice(0, 4).map((i) => `${i.text} ${i.fontPx}px`), "A+H");
    const h = lastLayout?.height ?? settings.height;
    c.check("t1.font", "основной текст ≥ 4 % высоты кадра", !!top && top.fontPx >= 0.04 * h, top ? `${top.fontPx}px из ${h}` : "нет реестра");
    const ratio = contrastRatio(style.palette.text, style.palette.bg);
    c.check("t1.contrast", "контраст текста к фону ≥ 4,5:1", ratio >= 4.5, `${style.palette.text} / ${style.palette.bg} = ${ratio.toFixed(2)}`);
    const clip = qa.issues.filter((i) => ["clipping", "safe_area"].includes(i.code) && i.severity === "blocking");
    const sx = settings.safe_area.x * settings.width;
    const sy = settings.safe_area.y * settings.height;
    const out = texts.filter((i) => i.rect.x < sx - 1 || i.rect.y < sy - 1 || i.rect.x + i.rect.w > settings.width - sx + 1 || i.rect.y + i.rect.h > settings.height - sy + 1);
    c.check("t1.safe", "нет обрезки: QA без blocking clipping/safe_area, тексты последнего кадра в safe area", clip.length === 0 && out.length === 0, { clip, out: out.map((i) => i.text) }, "A+H");
    writeEvidence("test1", "layout-last-frame.json", lastLayout ?? null);

    // «Экспорт» MP4 через UI → скачанный файл
    const ex = await exportViaUi(page, "mp4");
    const v = ex.probe.video;
    c.check("t1.export", "экспорт MP4: h264, aac, 1920×1080, 30/1", v.codec_name === "h264" && ex.probe.audio?.codec_name === "aac" && v.width === 1920 && v.height === 1080 && v.r_frame_rate === "30/1", ex.probe);
    await shot(page, "test1", "03-export");
    saveState({ test1: { ...g, exportId: ex.exportId } });

    collect(vid, join(EVIDENCE, "test1/v1"));
    collect(ex.exportId, join(EVIDENCE, "test1/export"));
    writeEvidence("test1", "summary.json", { ...g, exportId: ex.exportId, cost_usd: jobCost(g.jobId), stable_frames: pairs });
  });
}
