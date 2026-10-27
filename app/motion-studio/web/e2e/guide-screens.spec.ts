// Скриншоты руководства только на синтетических фикстурах общего UI-e2e. Никаких файлов
// пользователя этот тест не открывает; состояние приходит из `seed-cli.ts`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../src/i18n/index.js";
import { REPO, state } from "./helpers.js";

const OUT = join(REPO, "docs/guide/img");

async function guideShot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

test("фикстурные экраны руководства", async ({ page }) => {
  const st = state();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: t("dashboard.title"), exact: true })).toBeVisible();
  await guideShot(page, "01-dashboard.png");

  await page.goto(`/scenes/${st.versions.sceneId}`);
  await expect(page.getByRole("heading", { name: /v\d+/ })).toBeVisible();
  await guideShot(page, "02-playground.png");

  await page.goto(`/projects/${st.script.projectId}`);
  await expect(page.getByRole("tab", { name: t("scriptPlan.tab.text"), exact: true })).toBeVisible();
  await guideShot(page, "03-script-text.png");
  await page.getByRole("tab", { name: t("scriptPlan.tab.plan"), exact: true }).click();
  await expect(page.getByTestId("plan-tab")).toBeVisible();
  await guideShot(page, "04-script-plan.png");

  await page.goto(`/projects/${st.videoScenes.projectId}`);
  await expect(page.getByRole("tab", { name: t("video.tab.media"), exact: true })).toBeVisible();
  await guideShot(page, "05-video-project.png");
  await page.getByRole("tab", { name: t("video.tab.scenes"), exact: true }).click();
  await expect(page.getByTestId("video-scene-tile").first()).toBeVisible();
  await guideShot(page, "06-video-scenes.png");
  await page.getByRole("tab", { name: t("video.tab.export"), exact: true }).click();
  await expect(page.locator('[data-tab="export"]')).toBeVisible();
  await guideShot(page, "07-video-export.png");

  await page.goto(`/projects/${st.videoTimeline.projectId}?tab=timeline`);
  await expect(page.locator('[data-tab="timeline"]')).toBeVisible();
  await guideShot(page, "08-video-timeline.png");

  await page.goto("/diagnostics");
  await expect(page.getByRole("heading", { name: t("diagnostics.title") })).toBeVisible();
  await guideShot(page, "09-diagnostics.png");

  const trashTitle = "Проект руководства — корзина";
  await page.goto("/");
  await page.getByLabel(t("dashboard.projectTitle")).fill(trashTitle);
  await page.getByRole("button", { name: t("dashboard.create"), exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/prj_/);
  await page.goto("/");
  await page.getByRole("button", { name: t("projects.actions", { title: trashTitle }) }).click();
  await page.getByRole("menuitem", { name: t("projects.delete") }).click();
  const dialog = page.getByRole("dialog", { name: t("delete.title", { title: trashTitle }) });
  await dialog.getByLabel(t("delete.confirmLabel", { title: trashTitle })).fill(trashTitle);
  await dialog.getByRole("button", { name: t("delete.confirm") }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: t("projects.filter.trash") }).click();
  await expect(page.locator("[data-trash-id]").filter({ hasText: trashTitle })).toBeVisible();
  await guideShot(page, "10-trash.png");
});
