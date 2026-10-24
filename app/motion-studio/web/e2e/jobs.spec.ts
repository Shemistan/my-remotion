// Задачи: экспорт ProRes 4444 прозрачной версии kit-gallery отменяется, пока он `running` →
// `cancelled`, файла в exports/ нет, Jobs Monitor показывает отменённую задачу; failed-версия
// hang-scene — ошибка рендера с журналом, превью нет (ТЗ §11.3, M14).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { shot, state } from "./helpers.js";

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

test("ProRes 4444: «Отменить» во время running → cancelled, файла экспорта нет", async ({ page }) => {
  const st = state();
  const exportsDir = join(st.root, "workspace/projects", st.projectId, "exports");
  const media = () => filesUnder(exportsDir).filter((f) => /\.(mov|mp4)$/.test(f)).sort();
  const before = media();
  await page.goto(`/scenes/${st.prores.sceneId}`);
  await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Экспорт версии" });
  const prores = dialog.getByLabel("ProRes 4444 с альфа-каналом");
  await expect(prores).toBeEnabled();
  await prores.check();
  await dialog.getByRole("button", { name: "Экспортировать" }).click();

  const job = page.locator(".export-job [data-job]");
  await expect(job).toContainText("выполняется", { timeout: 60_000 });
  await job.getByRole("button", { name: "Отменить" }).click();
  await expect(job).toContainText("отменена", { timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Скачать" })).toHaveCount(0);
  await shot(page, "export-cancelled");
  // отменённый экспорт не оставил файла: в exports/ то же, что до него, и ни одного .mov
  expect(media()).toEqual(before);
  expect(media().some((f) => f.endsWith(".mov"))).toBe(false);

  // Jobs Monitor: фильтр «отменена»
  await page.getByRole("link", { name: "Задачи" }).click();
  await expect(page.locator("tr", { hasText: "Экспорт" }).first()).toBeVisible();
  await shot(page, "jobs-all");
  await page.getByLabel("Статус").selectOption("cancelled");
  const row = page.locator("tr", { hasText: "Экспорт" }).first();
  await expect(row).toContainText("отменена");
  await row.getByRole("button", { name: "Подробнее" }).click();
  await expect(page.locator(".job-detail")).toContainText("Задача отменена");
  await shot(page, "jobs");
});

test("failed-версия hang-scene: ошибка рендера с журналом, превью нет", async ({ page }) => {
  const { failed } = state();
  await page.goto(`/scenes/${failed.sceneId}`);
  const box = page.getByRole("alert").filter({ hasText: "Версия v1 не удалась" });
  await expect(box).toBeVisible();
  await expect(box).toContainText("Ошибка на этапе «рендер»");
  await expect(box).toContainText("Превью нет");
  const log = page.getByTestId("failure-log");
  await expect(log).toContainText("timeout");
  await expect(log).toContainText("hang-scene");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Экспорт", exact: true })).toBeDisabled();
  await shot(page, "render-failure");
});
