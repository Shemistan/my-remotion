// Сцены видеопроекта в UI (Task 40): настоящий сервер на tmp-хранилище, без LLM (claudeBin —
// заглушка). Видеопроект-фикстура (`seed-video-scenes.ts`: импорт ffmpeg, план из трёх сцен, B,
// у двух сцен — версии реальным рендером) → вкладка «Сцены» → плитки по статусам →
// «Сгенерировать все» (в пакет — только сцена без версии; генерация падает → «Повторить») →
// «Утвердить (C)» → «В контексте» → «Собрать» (настоящая задача `scene.preview_context`,
// `renderTimelineRange`) → видео отдаётся по Range → «Доработать» → Playground: «← К видео» и C →
// обратно на вкладку «Сцены». Скриншоты: tmp/e2e-ui/phase-4/ui/ (MS_WRITE_EVIDENCE=1 — docs/evidence/phase-4/ui/).
import { join } from "node:path";
import type { VideoScenesStateDto } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../src/i18n/index.js";
import { evidenceDirs } from "./evidence.js";
import { REPO, shot, state } from "./helpers.js";

const EVIDENCE_PHASE4 = join(evidenceDirs(REPO, process.env.MS_WRITE_EVIDENCE).root, "phase-4/ui");
const CONTEXT_TIMEOUT = 600_000;

const tiles = (page: Page) => page.getByTestId("video-scene-tile");
const openScenes = (page: Page) => page.getByRole("tab", { name: t("video.tab.scenes"), exact: true }).click();

test("сцены видеопроекта: плитки, пакет, C, превью в контексте, Playground и обратно", async ({ page, request }) => {
  test.setTimeout(1_200_000);
  const st = state().videoScenes;
  await page.goto(`/projects/${st.projectId}`);
  await openScenes(page);
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toHaveAttribute("data-status", "ready");
  await expect(tiles(page).nth(1)).toHaveAttribute("data-status", "ready");
  await expect(tiles(page).nth(2)).toHaveAttribute("data-status", "none");
  await expect(tiles(page).nth(0)).toContainText(t("videoScenes.placement", { mode: t("plan.mode.overlay"), zone: t("zone.left_third") }));
  await expect(tiles(page).nth(1)).toContainText(t("videoScenes.placement", { mode: t("plan.mode.fullscreen"), zone: t("zone.full") }));
  // превью версии — плеер с видео версии
  await expect(tiles(page).nth(0).locator("video")).toHaveAttribute("src", /\/api\/versions\/ver_[^/]+\/preview\.mp4$/);

  // «Сгенерировать все»: готовые по плану пропущены, третья — в пакете и падает без агентов
  await page.getByRole("button", { name: t("videoScenes.generateAll") }).click();
  await expect(page.getByTestId("batch-bar")).toBeVisible();
  const reason = t("videoScenes.skipReason.ready_version");
  await expect(page.getByTestId("skipped")).toContainText(t("videoScenes.skippedItem", { n: 1, reason }));
  await expect(tiles(page).nth(2)).toHaveAttribute("data-status", "failed", { timeout: 180_000 });
  // полный пакет: готовые вне пакета — тоже «готово»; «Не вошли» — из состояния, переживает перезагрузку
  await expect(page.getByTestId("batch-bar")).toContainText(t("scriptOutput.batch.progress", { ready: 2, total: 3 }));
  await page.reload();
  await openScenes(page);
  await expect(page.getByTestId("batch-bar")).toContainText(t("scriptOutput.batch.progress", { ready: 2, total: 3 }));
  await expect(page.getByTestId("skipped")).toContainText(t("videoScenes.skippedItem", { n: 2, reason }));
  await expect(tiles(page).nth(2).getByRole("button", { name: t("videoScenes.retry") })).toBeVisible();
  await expect(tiles(page).nth(0).getByRole("button", { name: t("videoScenes.regenerate") })).toBeVisible();

  // Approval C первой сцены
  const first = tiles(page).nth(0);
  await first.getByRole("button", { name: t("videoScenes.c.approve") }).click();
  await expect(first.getByTestId("approval-c-badge")).toHaveText(t("videoScenes.c.valid", { n: 1 }));
  await expect(first.getByRole("button", { name: t("videoScenes.c.approve") })).toHaveCount(0);

  // превью в контексте: «Собрать» → настоящий рендер диапазона → видео
  await first.getByRole("tab", { name: t("videoScenes.view.context") }).click();
  await expect(first.getByText(t("videoScenes.context.none"))).toBeVisible();
  await first.getByRole("button", { name: t("videoScenes.context.build") }).click();
  const video = first.getByTestId("context-video");
  await expect(video).toBeVisible({ timeout: CONTEXT_TIMEOUT });
  const src = (await video.getAttribute("src"))!;
  expect(src).toBe(`/api/scenes/${st.sceneIds[0]}/preview-context.mp4?versionId=${encodeURIComponent((await sceneState(request, st.projectId, 0)).version_id!)}`);
  const part = await request.get(src, { headers: { range: "bytes=0-1023" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-type"]).toContain("video/mp4");
  const cp = (await sceneState(request, st.projectId, 0)).context_preview!;
  expect(cp).toMatchObject({ plan_revision: 1, outdated: false });
  // кадр в середине сцены (после поля до сцены) — для скриншота
  await video.evaluate(async (el: HTMLVideoElement) => {
    if (el.readyState < 1) await new Promise((r) => el.addEventListener("loadedmetadata", r, { once: true }));
    el.currentTime = el.duration / 2;
    await new Promise((r) => el.addEventListener("seeked", r, { once: true }));
  });
  await shot(page, "video-scenes-01-tab-context", EVIDENCE_PHASE4);

  // «Доработать» → Playground второй сцены: «← К видео» и C
  await tiles(page).nth(1).getByRole("link", { name: t("videoScenes.refine") }).click();
  await expect(page).toHaveURL(new RegExp(`/scenes/${st.sceneIds[1]}$`));
  const back = page.getByRole("link", { name: t("videoScenes.backToVideo") });
  await expect(back).toBeVisible();
  await page.getByRole("button", { name: t("videoScenes.c.approveN", { n: 1 }) }).click();
  await expect(page.getByTestId("approval-c-badge")).toHaveText(t("videoScenes.c.valid", { n: 1 }));
  // длительность видеосцены — только через план
  await expect(page.getByLabel(t("settings.duration"))).toHaveAttribute("readonly", "");
  await expect(page.getByText(t("videoScenes.durationLocked"))).toBeVisible();
  await shot(page, "video-scenes-02-playground", EVIDENCE_PHASE4);

  // обратно к видео — сразу на вкладку «Сцены»: C второй сцены видно на плитке
  await back.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${st.projectId}\\?tab=scenes$`));
  await expect(page.getByRole("tab", { name: t("video.tab.scenes"), exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(tiles(page).nth(1).getByTestId("approval-c-badge")).toHaveText(t("videoScenes.c.valid", { n: 1 }));
  await expect(tiles(page).nth(0).getByTestId("approval-c-badge")).toHaveText(t("videoScenes.c.valid", { n: 1 }));
  const all = await page.locator("[data-tab=scenes]").textContent();
  expect(all).not.toMatch(/undefined|NaN|\bnull\b|sp_00|playground\.generate/);
  await shot(page, "video-scenes-03-back", EVIDENCE_PHASE4);
});

async function sceneState(request: import("@playwright/test").APIRequestContext, projectId: string, i: number) {
  const r = await request.get(`/api/projects/${projectId}/video/scenes`);
  expect(r.ok()).toBe(true);
  return ((await r.json()) as VideoScenesStateDto).scenes[i]!;
}
