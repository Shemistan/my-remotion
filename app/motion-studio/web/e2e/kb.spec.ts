// Knowledge Browser на реальной KB: «счётчик» → компоненты-счётчики (MIT); «число» →
// remotion-bits/animated-counter (MIT), карточка открывается; restricted скрыты по умолчанию.
import { expect, test } from "@playwright/test";
import { shot } from "./helpers.js";

test("поиск «счётчик» → компоненты-счётчики; «число» → remotion-bits/animated-counter (MIT), карточка", async ({ page }) => {
  await page.goto("/kb");
  await page.getByLabel("Поиск").fill("счётчик");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page.locator(".kb-hits li", { hasText: "animata/counter" })).toContainText("MIT");
  // remotion-bits/animated-counter описан в KB словом «число», не «счётчик» (поиск KB лексический)
  await page.getByLabel("Поиск").fill("число");
  await page.getByRole("button", { name: "Найти" }).click();
  const hit = page.locator(".kb-hits li", { hasText: "remotion-bits/animated-counter" });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("MIT");
  await expect(hit.locator("[data-license]")).toHaveAttribute("data-license", "permissive");
  await expect(page.locator('.kb-hits [data-license="restricted"]')).toHaveCount(0);
  await hit.getByRole("button").click();
  const card = page.getByRole("article", { name: "Карточка компонента" });
  await expect(card).toContainText("remotion-bits/animated-counter");
  await expect(card.locator(".card-md")).not.toBeEmpty();
  await shot(page, "kb");

  // переключатель restricted/unknown добавляет записи с бейджем класса лицензии
  await page.getByLabel("Показывать restricted и unknown").check();
  await expect(page.locator(".kb-hits li").first()).toBeVisible();
});
