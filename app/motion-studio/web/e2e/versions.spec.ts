// Версии сцены (реальные превью из засева): v1 и v2 проигрываются, шаг кадра меняет счётчик
// на 1; «Сравнить» — два плеера и diff props; «Восстановить v1» → v3 от v1, v1 и v2 на месте
// (обработчик scene.restore сервера, без LLM).
import { expect, type Page, test } from "@playwright/test";
import { shot, state } from "./helpers.js";

const frameOf = async (page: Page) => Number(/Кадр (\d+)/.exec((await page.getByTestId("frame").textContent()) ?? "")![1]);

async function playsAndSteps(page: Page) {
  const video = page.locator(".player video");
  await expect(video).toHaveJSProperty("readyState", 4, { timeout: 30_000 });
  await page.getByRole("button", { name: "Воспроизвести" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Пауза" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const before = await frameOf(page);
  await page.getByRole("button", { name: "Следующий кадр" }).click();
  await expect.poll(() => frameOf(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await expect.poll(() => frameOf(page)).toBe(before);
}

test("v2 и v1 проигрываются, шаг кадра ±1; сравнение и восстановление", async ({ page }) => {
  const { versions } = state();
  const [v1, v2] = versions.versionIds as [string, string];
  await page.goto(`/scenes/${versions.sceneId}`);
  await expect(page.getByRole("heading", { name: "v2", level: 1 })).toBeVisible();
  await expect(page.getByTestId("player-info")).toContainText("16:9");
  await expect(page.getByTestId("player-info")).toContainText("30 кадр/с");
  await playsAndSteps(page);
  await expect(page.getByTestId("generation")).toContainText("$0,00");
  await shot(page, "playground");

  // v1: «Открыть» в истории
  await page.locator(`[data-version-id="${v1}"] button[data-action="open"]`).click();
  await expect(page).toHaveURL(new RegExp(`v=${v1}`));
  await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
  await expect(page.locator(".player video")).toHaveAttribute("src", `/api/versions/${v1}/preview.mp4`);
  await playsAndSteps(page);
  // компоненты motion-kit из кода версии
  await expect(page.getByRole("region", { name: "Компоненты" })).not.toContainText("Примитивы motion-kit не найдены");

  // сравнение v1 ↔ v2: два плеера, diff props
  await page.locator(`[data-version-id="${v2}"] button[data-action="compare"]`).click();
  await expect(page.getByRole("heading", { name: "Сравнение версий" })).toBeVisible();
  await expect(page.locator(".compare video")).toHaveCount(2);
  const props = page.locator(".diff-block").filter({ has: page.getByRole("heading", { name: "Props" }) });
  await expect(props.locator("tr").nth(1)).toBeVisible();
  await expect(props).toContainText("/timing");
  await page.getByRole("slider", { name: "Позиция" }).fill("60");
  await expect.poll(() => page.locator(".compare video").evaluateAll((vs) => vs.map((v) => Math.floor((v as HTMLVideoElement).currentTime * 30)))).toEqual([60, 60]);
  await shot(page, "compare");

  // восстановление v1 → v3 от v1
  await page.getByRole("link", { name: "← К сцене" }).click();
  await page.locator(`[data-version-id="${v1}"] button[data-action="restore"]`).click();
  const history = page.getByRole("region", { name: "История версий" });
  await expect(history.getByRole("listitem")).toHaveCount(3, { timeout: 120_000 });
  const v3 = history.getByRole("listitem").first();
  await expect(v3).toContainText("v3");
  await expect(v3).toContainText("от v1");
  await expect(history.locator(`[data-version-id="${v1}"]`)).toBeVisible();
  await expect(history.locator(`[data-version-id="${v2}"]`)).toBeVisible();
  await shot(page, "restore");
});
