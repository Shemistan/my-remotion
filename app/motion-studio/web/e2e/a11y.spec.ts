// Проверка доступности основных экранов на данных штатного UI-e2e. Ошибки serious/critical
// считаются блокирующими; данные засева синтетические, LLM не вызывается.
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { t } from "../src/i18n/index.js";
import { state } from "./helpers.js";

async function expectAccessible(page: Page, screen: string): Promise<void> {
  await page.locator(".page").waitFor();
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, `${screen}: ${blocking.map((v) => `${v.id}: ${v.help}`).join("; ")}`).toEqual([]);
}

test("Dashboard, Playground, Script Workspace и Diagnostics без серьёзных нарушений", async ({ page }) => {
  const st = state();
  await page.goto("/");
  await expectAccessible(page, "Dashboard");

  await page.goto(`/scenes/${st.versions.sceneId}`);
  await expect(page.getByRole("heading", { name: /v\d+/ })).toBeVisible();
  await expectAccessible(page, "Playground");

  await page.goto(`/projects/${st.script.projectId}`);
  await expect(page.getByRole("tab", { name: t("scriptPlan.tab.text"), exact: true })).toBeVisible();
  await expectAccessible(page, "ScriptWorkspace");

  await page.goto("/diagnostics");
  await expect(page.getByRole("heading", { name: t("diagnostics.title") })).toBeVisible();
  await expectAccessible(page, "Diagnostics");
});

test("Video Workspace: сцены, экспорт и таймлайн без серьёзных нарушений", async ({ page }) => {
  const st = state().videoTimeline;
  await page.goto(`/projects/${st.projectId}`);
  for (const tab of ["scenes", "export", "timeline"] as const) {
    await page.getByRole("tab", { name: t(`video.tab.${tab}`), exact: true }).click();
    await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible();
    await expectAccessible(page, `VideoWorkspace/${tab}`);
  }
});
