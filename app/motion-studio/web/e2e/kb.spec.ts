// Knowledge Browser на реальной KB: «счётчик» → remotion-bits/animated-counter (MIT), карточка
// открывается; restricted скрыты по умолчанию, переключатель добавляет restricted-записи с
// бейджем (react-bits/counter) и не убирает permissive.
import { expect, test } from "@playwright/test";
import { shot } from "./helpers.js";

test("поиск «счётчик» → remotion-bits/animated-counter (MIT), карточка; переключатель restricted", async ({ page }) => {
  await page.goto("/kb");
  await page.getByLabel("Поиск").fill("счётчик");
  await page.getByRole("button", { name: "Найти" }).click();
  const hit = page.locator(".kb-hits li", { hasText: "remotion-bits/animated-counter" });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("MIT");
  await expect(hit.locator("[data-license]")).toHaveAttribute("data-license", "permissive");
  await expect(page.locator(".kb-hits li", { hasText: "animata/counter" })).toContainText("MIT");
  const before = await page.locator(".kb-hits li").count();
  expect(before).toBeGreaterThan(0);
  await expect(page.locator('.kb-hits [data-license="restricted"]')).toHaveCount(0);
  await expect(page.locator(".kb-hits li", { hasText: "react-bits/counter" })).toHaveCount(0);
  await hit.getByRole("button").click();
  const card = page.getByRole("article", { name: "Карточка компонента" });
  await expect(card).toContainText("remotion-bits/animated-counter");
  await expect(card).toContainText("счётчик");
  await expect(card.locator(".card-md")).not.toBeEmpty();
  await shot(page, "kb");

  // переключатель: появляются restricted-записи с бейджем, permissive остаются
  await page.getByLabel("Показывать restricted и unknown").check();
  const restricted = page.locator(".kb-hits li", { hasText: "react-bits/counter" });
  await expect(restricted).toBeVisible();
  await expect(restricted.locator("[data-license]")).toHaveAttribute("data-license", "restricted");
  await expect(page.locator('.kb-hits [data-license="restricted"]').first()).toBeVisible();
  expect(await page.locator(".kb-hits li").count()).toBeGreaterThan(before);
  await expect(hit).toBeVisible();
  await shot(page, "kb-restricted");
  // выключили — restricted снова скрыты
  await page.getByLabel("Показывать restricted и unknown").uncheck();
  await expect(page.locator('.kb-hits [data-license="restricted"]')).toHaveCount(0);
});
