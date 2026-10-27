// Приёмка Phase 5, шаг 1 (Task 46): сборка таймлайна через UI на проекте Test 4.
// «Собрать таймлайн» → r1: клип на каждую сцену с C (бейдж), якоря → перетаскивание сцены мышью на
// ~10 кадров с прилипанием к началу слова → r2 (op move, длина та же, blocking нет) → «Изменить
// границы — в плане» другой сцены (Р-V6: операцией `modify` API плана, в UI видеоплана правки границ
// нет) → новая ревизия → B кнопкой → сцена `stale` → перегенерация с плитки → C → баннер «Таймлайн
// устарел» → «Пересобрать» → r3: сдвиг первой сцены перенесён (смещение от якоря), длина второй —
// новая плановая → «Собрать превью ревизии» → [A] длительность = duration_frames/fps ± 1 кадр; кадры
// середины сцен ≤ 480 px; Apple Vision: у прозрачных сцен лицо автора видно [H→агент].
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EdlDto, type TimelineDto, type TranscriptDto, type VideoProjectDto, mapWords, usToFrame } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../../src/i18n/index.js";
import {
  APP, Checks, EVIDENCE, ORIGIN, ffprobe, frame480, getJson, jobCost, openProject, post, runFile, saveState, sceneOf, sceneVersions, scenesState, shot, state, tab, tile, timing,
  waitBatches, writeEvidence,
} from "./helpers.js";
import { approveB, approveTile, generate, planDto } from "./test4-talking-head.spec.js";

const DIR = "assemble";
const VISION = join(APP, "tools/vision-detect/bin/vision-detect");
const openTimeline = (page: Page) => page.getByRole("tab", { name: t("video.tab.timeline"), exact: true }).click();
/** «Крупнее», пока не станет ≥ `min` пикселей на кадр (сдвиг на 10 кадров — заметное движение мыши). */
async function zoomTo(page: Page, min: number): Promise<number> {
  const view = page.getByTestId("timeline-view");
  let z = Number(await view.getAttribute("data-zoom"));
  for (let k = 0; k < 12 && z < min; k++) {
    await page.getByRole("button", { name: t("projectTimeline.zoomIn") }).click();
    await expect.poll(async () => Number(await view.getAttribute("data-zoom"))).toBeGreaterThan(z);
    z = Number(await view.getAttribute("data-zoom"));
  }
  return z;
}
export const timelineOf = async (page: Page): Promise<TimelineDto> => getJson<TimelineDto>(page.request, `/api/projects/${state().projectId!}/timeline`);

/** Кадры начала слов на таймлайне — как у UI (`mapWords`, слово не вырезано целиком): цели прилипания. */
async function wordFrames(page: Page): Promise<Set<number>> {
  const v = await getJson<VideoProjectDto>(page.request, `/api/projects/${state().projectId!}/video`);
  const edl = await getJson<EdlDto>(page.request, `/api/edls/${v.edl!.id}`);
  const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${v.transcript!.id}`);
  const map = mapWords(edl.timeline, tr.doc.words);
  const out = new Set<number>();
  for (const w of tr.doc.words) {
    const m = map[w.id];
    if (m && m.state !== "removed") out.add(usToFrame(m.edited_start_us, edl.timeline.fps));
  }
  return out;
}

/**
 * Перетаскивание сцены мышью на ~10 кадров к ближайшему слову: цель — начало слова в 4–14 кадрах
 * от начала сцены (сначала влево), курсор отпускается в 2 кадрах от него — прилипание (≤ 6 кадров)
 * должно поставить сцену ровно на слово. Не вышло без blocking — «Вернуть эту» базовую ревизию и
 * следующий кандидат. `zoom` — пикселей на кадр (`data-zoom`).
 */
export async function dragNearWord(page: Page, clip: TimelineDto["doc"]["scenes"][number], words: Set<number>, zoom: number, baseRevision: number): Promise<{ result?: TimelineDto; tried: unknown[] }> {
  const tried: unknown[] = [];
  const loc = page.getByTestId(`timeline-clip-${clip.item_id}`);
  const targets = [...words].filter((w) => Math.abs(w - clip.start_frame) >= 4 && Math.abs(w - clip.start_frame) <= 14)
    .sort((a, b) => (a < clip.start_frame ? 0 : 1) - (b < clip.start_frame ? 0 : 1) || Math.abs(Math.abs(a - clip.start_frame) - 10) - Math.abs(Math.abs(b - clip.start_frame) - 10));
  for (const w of targets.slice(0, 4)) {
    const raw = w + (w < clip.start_frame ? 2 : -2);
    const before = (await timelineOf(page)).revision;
    // клип шире видимой дорожки: hover в точку у его левого края — Playwright прокрутит её в видимость
    const h = (await loc.boundingBox())!.height;
    await loc.hover({ position: { x: 30, y: h / 2 } });
    const box = (await loc.boundingBox())!;
    const x = box.x + 30;
    const y = box.y + h / 2;
    const dx = (raw - clip.start_frame) * zoom;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 5; k++) await page.mouse.move(x + (k * dx) / 5, y);
    await page.mouse.up();
    await expect.poll(async () => (await timelineOf(page)).revision, { timeout: 30_000 }).toBeGreaterThan(before).catch(() => undefined);
    const cur = await timelineOf(page);
    const moved = cur.doc.scenes.find((s) => s.item_id === clip.item_id)!;
    const blocking = cur.doc.issues.filter((i) => i.severity === "blocking");
    tried.push({ target_word_frame: w, release_frame: raw, dx_px: dx, revision: cur.revision, start: moved.start_frame, blocking: blocking.map((b) => b.code) });
    if (cur.revision > before && blocking.length === 0 && moved.start_frame !== clip.start_frame) return { result: cur, tried };
    if (cur.revision > before) {
      await page.getByTestId("timeline-revisions").locator("li").filter({ hasText: `r${baseRevision}` }).getByRole("button", { name: t("projectTimeline.revisions.restore") }).click();
      await expect.poll(async () => (await timelineOf(page)).revision, { timeout: 30_000 }).toBeGreaterThan(cur.revision);
    }
  }
  return { tried };
}

export default function assemble(): void {
  test("шаг 1: сборка, сдвиг с прилипанием, границы через план, пересборка, превью", async ({ page }) => {
    test.setTimeout(4 * 60 * 60_000);
    const t0 = Date.now();
    const c = new Checks(DIR);
    const projectId = state().projectId!;
    const items = state().items!;
    await openProject(page);
    await openTimeline(page);

    // --- r1 ---
    await page.getByRole("button", { name: t("projectTimeline.build"), exact: true }).click();
    await expect(page.getByTestId("timeline-view")).toBeVisible({ timeout: 300_000 });
    await expect(page.getByTestId("timeline-revision")).toHaveText(t("projectTimeline.revision", { n: 1 }), { timeout: 60_000 });
    const r1 = await timelineOf(page);
    saveState({ timelineId: r1.timeline_id });
    writeEvidence(DIR, "timeline-r1.json", r1.doc);
    for (const id of ["track-video", "track-audio", "track-graphics", "track-anchors"]) await expect(page.getByTestId(id)).toBeVisible();
    for (const id of items) await expect(page.getByTestId(`timeline-clip-${id}`)).toContainText(t("projectTimeline.clip.badgeC"));
    c.check("1.1", "r1: клип на каждую сцену с C, без исключённых, якоря есть, blocking нет", r1.doc.scenes.length === items.length && r1.doc.excluded.length === 0 && r1.doc.scenes.every((s) => s.anchors.length > 0) && r1.doc.issues.every((i) => i.severity !== "blocking"),
      { clips: r1.doc.scenes.map((s) => ({ item: s.item_id, start: s.start_frame, len: s.duration_frames, mode: s.placement.mode, anchors: s.anchors.map((a) => `${a.text}@${a.frame}`) })), excluded: r1.doc.excluded, issues: r1.doc.issues });
    await shot(page, DIR, "01-r1");

    // --- r2: перетаскивание мышью ~10 кадров ---
    const words = await wordFrames(page);
    const first = [...r1.doc.scenes].sort((a, b) => a.start_frame - b.start_frame)[0]!;
    await zoomTo(page, 4);
    const zoom = Number(await page.getByTestId("timeline-view").getAttribute("data-zoom"));
    const { result: r2, tried } = await dragNearWord(page, first, words, zoom, 1);
    expect(r2, `сцену не сдвинуть без blocking: ${JSON.stringify(tried)}`).toBeTruthy();
    const moved = r2!.doc.scenes.find((s) => s.item_id === first.item_id)!;
    const delta = moved.start_frame - first.start_frame;
    writeEvidence(DIR, `timeline-r${r2!.revision}-moved.json`, { tried, zoom, doc: r2!.doc });
    c.check("1.2", "сдвиг мышью ≈ 10 кадров (1 ≤ |Δ| ≤ 20), длина та же, op move", Math.abs(delta) >= 1 && Math.abs(delta) <= 20 && moved.duration_frames === first.duration_frames && (r2!.doc.ops ?? []).some((o) => o.op === "move" && o.clip_id === first.clip_id),
      { from: first.start_frame, to: moved.start_frame, delta, ops: r2!.doc.ops });
    c.check("1.3", "прилипание: начало сцены — на начале слова таймлайна", words.has(moved.start_frame), { start: moved.start_frame, near: [...words].filter((f) => Math.abs(f - moved.start_frame) <= 15).sort((a, b) => a - b) });
    c.check("1.4", "после сдвига якоря внутри сцены, blocking нет", r2!.doc.issues.every((i) => i.severity !== "blocking") && moved.anchors.every((a) => a.frame >= moved.start_frame && a.frame < moved.start_frame + moved.duration_frames), { anchors: moved.anchors, issues: r2!.doc.issues });
    await shot(page, DIR, "02-moved");

    // --- границы другой сцены через план ---
    const other = r2!.doc.scenes.filter((s) => s.item_id !== first.item_id).sort((a, b) => (a.placement.mode === "fullscreen" ? 1 : 0) - (b.placement.mode === "fullscreen" ? 1 : 0))[0]!;
    await page.getByTestId(`timeline-clip-${other.item_id}`).click();
    await page.getByTestId("clip-inspector").getByRole("button", { name: t("projectTimeline.inspector.bounds") }).click();
    await expect(page.getByRole("tab", { name: t("video.tab.plan"), exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`tab=plan&item=${other.item_id}`));
    const planId = state().planId!;
    let plan = await planDto(page, planId);
    const item = plan.doc.items.find((x) => x.id === other.item_id)!;
    const oldLen = item.frames.end - item.frames.start;
    const acc = plan.doc.items.filter((x) => x.status === "accepted");
    const next = acc.filter((x) => x.frames.start >= item.frames.end).sort((a, b) => a.frames.start - b.frames.start)[0];
    const prev = acc.filter((x) => x.frames.end <= item.frames.start).sort((a, b) => b.frames.end - a.frames.end)[0];
    const num = (w: string) => Number(w.replace(/\D/g, ""));
    const wid = (n: number) => `w_${String(n).padStart(6, "0")}`;
    let bounds: { patch: Record<string, string>; revision: number } | undefined;
    const triedB: unknown[] = [];
    const candidates: Record<string, string>[] = [
      ...[6, 5, 4, 3, 2].map((k) => ({ end_word_id: wid(num(item.end_word_id) + k) })),
      ...[4, 3, 2].map((k) => ({ end_word_id: wid(num(item.end_word_id) - k) })),
      ...[3, 2].map((k) => ({ start_word_id: wid(num(item.start_word_id) - k) })),
    ];
    for (const patch of candidates) {
      const r = await post(page.request, `/api/plans/${planId}/revisions`, { base_revision: plan.current_revision, ops: [{ op: "modify", item_id: item.id, patch }] });
      triedB.push({ patch, status: r.status() });
      if (r.status() !== 201) continue;
      const d = (await r.json()) as { doc: typeof plan.doc; current_revision: number };
      const x = d.doc.items.find((y) => y.id === item.id)!;
      const blocking = d.doc.issues.filter((i) => i.severity === "blocking");
      if (blocking.length === 0 && (!next || x.frames.end < next.frames.start) && (!prev || x.frames.start > prev.frames.end) && x.frames.end - x.frames.start !== oldLen) {
        bounds = { patch, revision: d.current_revision };
        break;
      }
      const back = await post(page.request, `/api/plans/${planId}/revisions`, { base_revision: d.current_revision, ops: [{ op: "modify", item_id: item.id, patch: { start_word_id: item.start_word_id, end_word_id: item.end_word_id } }] });
      triedB.push({ revert: back.status(), blocking: blocking.map((b) => b.code) });
      plan = await planDto(page, planId);
    }
    expect(bounds, `границы не изменить без blocking: ${JSON.stringify(triedB)}`).toBeTruthy();
    plan = await planDto(page, planId);
    const newItem = plan.doc.items.find((x) => x.id === item.id)!;
    const newLen = newItem.frames.end - newItem.frames.start;
    await approveB(page);
    const stS = await scenesState();
    c.check("1.5", "границы сцены изменены новой ревизией плана, B на ней, сцена stale, прочие — нет", sceneOf(stS, item.id).stale && items.filter((i) => i !== item.id).every((i) => !sceneOf(stS, i).stale) && stS.approval_b.state === "valid",
      { item: item.id, patch: bounds!.patch, frames: { from: item.frames, to: newItem.frames }, revision: plan.current_revision, tried: triedB, b: stS.approval_b });
    await openProject(page, "Сцены");
    await expect(tile(page, item.id)).toContainText("сцена устарела");
    await shot(page, DIR, "03-scene-stale");
    const t1 = Date.now();
    const bs = await generate(page, tile(page, item.id).getByRole("button", { name: /^(Перегенерировать|Повторить)$/ }).first());
    saveState({ batches: { ...state().batches, bounds: bs.id } });
    const [bsDone] = await waitBatches([bs.id], 2 * 60 * 60_000);
    const regenJobs = bsDone!.items.flatMap((x) => (x.job ? [x.job.id] : []));
    timing("assemble.regenerate", { wall_ms: Date.now() - t1, cost_usd: jobCost(regenJobs) });
    const s2 = sceneOf(await scenesState(), item.id);
    const v2 = sceneVersions(s2.scene_id!).find((v) => v.id === s2.version_id);
    const vFrames = v2 ? (JSON.parse(v2.settings_json) as { duration_frames: number }).duration_frames : -1;
    c.check("1.6", "перегенерация: версия ready с новой плановой длиной, не stale", s2.status === "ready" && !s2.stale && vFrames === newLen, { status: s2.status, stale: s2.stale, version: s2.version_number, frames: vFrames, plan: newLen });
    await page.reload();
    await tab(page, "Сцены");
    await approveTile(page, item.id);

    // --- пересборка ---
    await openTimeline(page);
    const banner = page.getByTestId("timeline-stale");
    await expect(banner).toBeVisible({ timeout: 60_000 });
    const before = await timelineOf(page);
    c.check("1.7", "таймлайн устарел: plan_changed / version_changed, баннер виден", !before.fresh && before.reasons.length > 0, before.reasons);
    await shot(page, DIR, "04-stale-banner");
    await banner.getByRole("button", { name: t("projectTimeline.rebuild") }).click();
    await expect.poll(async () => (await timelineOf(page)).revision, { timeout: 300_000 }).toBeGreaterThan(before.revision);
    const r3 = await timelineOf(page);
    writeEvidence(DIR, `timeline-r${r3.revision}-rebuilt.json`, r3.doc);
    const m3 = r3.doc.scenes.find((s) => s.item_id === first.item_id)!;
    const o3 = r3.doc.scenes.find((s) => s.item_id === item.id)!;
    const off = (cl: typeof m3) => cl.start_frame - (cl.anchors[0]?.frame ?? 0);
    c.check("1.8", "r3: сдвиг первой сцены перенесён (смещение от якоря то же), вторая — новая длина и версия, свежий, blocking нет",
      r3.fresh && off(m3) === off(moved) && o3.duration_frames === newLen && o3.version_id === s2.version_id && r3.doc.issues.every((i) => i.severity !== "blocking"),
      { moved: { r2: moved.start_frame, r3: m3.start_frame, off2: off(moved), off3: off(m3) }, bounds: { len: o3.duration_frames, plan: newLen, version: o3.version_number }, issues: r3.doc.issues });
    await expect(page.getByTestId("timeline-stale")).toHaveCount(0);

    // --- превью ревизии ---
    const t2 = Date.now();
    await page.getByRole("button", { name: t("projectTimeline.preview.build") }).click();
    const preview = page.getByTestId("timeline-preview");
    await expect(preview).toBeVisible({ timeout: 60 * 60_000 });
    timing("assemble.preview", { wall_ms: Date.now() - t2 });
    const src = (await preview.getAttribute("src"))!;
    const local = runFile(`timeline-r${r3.revision}-preview.mp4`);
    const resp = await page.request.get(src, { headers: { Origin: ORIGIN } });
    writeFileSync(local, await resp.body());
    const pp = ffprobe(local);
    const vs = pp.streams.find((s) => s.codec_type === "video")!;
    const fps = r3.doc.fps;
    const frameS = fps.den / fps.num;
    const expS = (r3.doc.duration_frames * fps.den) / fps.num;
    c.check("1.9", "превью: длительность = duration_frames / fps ± 1 кадр, звук есть", Math.abs(Number(vs.duration ?? pp.format.duration) - expS) <= frameS + 1e-6 && pp.streams.some((s) => s.codec_type === "audio"),
      { video_s: vs.duration, expected_s: expS, frames: r3.doc.duration_frames, frame_s: frameS, size: [vs.width, vs.height] });
    const framesDir = join(EVIDENCE, DIR, "frames");
    mkdirSync(framesDir, { recursive: true });
    const vision: unknown[] = [];
    for (const cl of r3.doc.scenes) {
      const mid = cl.start_frame + Math.floor(cl.duration_frames / 2);
      const kw = cl.anchors[0]?.frame ?? mid;
      for (const [tag, f] of [["mid", mid], ["keyword", kw]] as const) {
        const out = join(framesDir, `${cl.item_id}-${cl.placement.mode}-${tag}-f${f}.png`);
        frame480(local, ((f + 0.5) * fps.den) / fps.num, out);
        let faces: unknown;
        try {
          faces = (JSON.parse(execFileSync(VISION, [out], { encoding: "utf8" })) as { faces?: unknown[] }[])[0]?.faces ?? [];
        } catch (e) {
          faces = `vision: ${(e as Error).message.slice(0, 80)}`;
        }
        vision.push({ item: cl.item_id, placement: cl.placement.mode, tag, frame: f, faces });
      }
    }
    writeEvidence(DIR, "frames-vision.json", vision);
    const transp = vision.filter((x) => (x as { placement: string }).placement !== "fullscreen") as { faces: unknown }[];
    c.check("1.10", "[H→агент] Apple Vision: на кадрах прозрачных сцен лицо автора видно (графика лицо не закрывает)", transp.length > 0 && transp.every((x) => Array.isArray(x.faces) && x.faces.length > 0), vision);
    c.note("1.H", "просмотр превью целиком: сцены в нужные моменты, лицо не закрыто — человеку (MP4 в examples)", { preview: src, local_copy: "examples/phase5/46-приёмка/" });
    await shot(page, DIR, "05-preview");
    saveState({ assemble: { first: first.item_id, bounds: item.id, revision: r3.revision, preview: local } });
    timing("assemble", { wall_ms: Date.now() - t0 });
    await page.goto(`/projects/${projectId}`);
  });
}

/**
 * Повтор сдвига с прилипанием (шаг 1, после исправления теста: первый прогон тянул мышь на 10 px при
 * zoom < 1 — сдвиг вышел на 23 кадра, мимо прилипания). На текущей свежей ревизии: перетаскивание
 * первой сцены на ~10 кадров к началу слова → новая ревизия → превью ревизии (экспорты идут с неё).
 */
export function snap(): void {
  test("шаг 1 (повтор сдвига): перетаскивание ~10 кадров с прилипанием → превью ревизии", async ({ page }) => {
    test.setTimeout(90 * 60_000);
    const c = new Checks(DIR);
    await openProject(page);
    await openTimeline(page);
    const base = await timelineOf(page);
    expect(base.fresh, "таймлайн не свежий").toBe(true);
    const words = await wordFrames(page);
    const first = [...base.doc.scenes].sort((a, b) => a.start_frame - b.start_frame)[0]!;
    await zoomTo(page, 4);
    const zoom = Number(await page.getByTestId("timeline-view").getAttribute("data-zoom"));
    const { result, tried } = await dragNearWord(page, first, words, zoom, base.revision);
    expect(result, `сцену не сдвинуть без blocking: ${JSON.stringify(tried)}`).toBeTruthy();
    const moved = result!.doc.scenes.find((s) => s.item_id === first.item_id)!;
    const delta = moved.start_frame - first.start_frame;
    const release = (tried.at(-1) as { release_frame: number }).release_frame;
    writeEvidence(DIR, `timeline-r${result!.revision}-snap.json`, { base: base.revision, tried, zoom, doc: result!.doc });
    c.check("1.2b", `повтор: сдвиг мышью ≈ 10 кадров (4 ≤ |Δ| ≤ 14), длина та же, op move (r${base.revision} → r${result!.revision})`,
      Math.abs(delta) >= 4 && Math.abs(delta) <= 14 && moved.duration_frames === first.duration_frames && (result!.doc.ops ?? []).some((o) => o.op === "move" && o.clip_id === first.clip_id),
      { from: first.start_frame, to: moved.start_frame, delta, tried, ops: result!.doc.ops });
    c.check("1.3b", "повтор: прилипание — отпущено в 2 кадрах от слова, начало сцены ровно на начале слова", words.has(moved.start_frame) && release !== moved.start_frame,
      { start: moved.start_frame, release, near: [...words].filter((f) => Math.abs(f - moved.start_frame) <= 15).sort((a, b) => a - b) });
    c.check("1.4b", "повтор: якоря внутри сцены, blocking нет, таймлайн свежий", result!.fresh && result!.doc.issues.every((i) => i.severity !== "blocking") && moved.anchors.every((a) => a.frame >= moved.start_frame && a.frame < moved.start_frame + moved.duration_frames),
      { anchors: moved.anchors, issues: result!.doc.issues });
    await shot(page, DIR, "06-snap-moved");
    await page.getByRole("button", { name: t("projectTimeline.preview.build") }).click();
    const preview = page.getByTestId("timeline-preview");
    await expect(preview).toHaveAttribute("src", new RegExp(`/revisions/${result!.revision}/preview\\.mp4$`), { timeout: 60 * 60_000 });
    const src = (await preview.getAttribute("src"))!;
    const local = runFile(`timeline-r${result!.revision}-preview.mp4`);
    writeFileSync(local, await (await page.request.get(src, { headers: { Origin: ORIGIN } })).body());
    const pp = ffprobe(local);
    const vs = pp.streams.find((s) => s.codec_type === "video")!;
    const fps = result!.doc.fps;
    const expS = (result!.doc.duration_frames * fps.den) / fps.num;
    c.check("1.9b", `превью r${result!.revision}: длительность = duration_frames / fps ± 1 кадр`, Math.abs(Number(vs.duration ?? pp.format.duration) - expS) <= fps.den / fps.num + 1e-6, { video_s: vs.duration, expected_s: expS });
    frame480(local, ((moved.start_frame + 5 + 0.5) * fps.den) / fps.num, join(EVIDENCE, DIR, "frames", `${moved.item_id}-snap-start-f${moved.start_frame + 5}.png`));
    saveState({ assemble: { ...(state().assemble as object), snap_revision: result!.revision, preview: local } });
    await shot(page, DIR, "07-snap-preview");
  });
}
