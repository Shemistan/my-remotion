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
  // восстановление и «Рендер» — два настоящих рендера сервера
  test.setTimeout(600_000);
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

  // «Рендер» от явно выбранной нетекущей версии: текущая — v3 (копия v1), открываем v2,
  // база по умолчанию — текущая; выбираем «открытой v2», меняем тему → v4 «от v2»
  await page.locator(`[data-version-id="${v2}"] button[data-action="open"]`).click();
  await expect(page.getByRole("heading", { name: "v2", level: 1 })).toBeVisible();
  const base = page.getByRole("radiogroup", { name: "База правки" });
  await expect(base.getByRole("radio", { name: "текущей версии v3" })).toBeChecked();
  await base.getByRole("radio", { name: "открытой версии v2" }).check();
  await expect(page.getByTestId("base-note")).toHaveText("Правка от v2 (не текущей)");
  await expect(page.getByLabel("Тема")).toHaveValue("dark-premium");
  await page.getByLabel("Тема").selectOption("tech-neon");
  await expect(page.getByText("«Рендер» создаст новую версию от v2")).toBeVisible();
  await shot(page, "edit-base");
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/api/scenes/${versions.sceneId}/render`)),
    page.getByRole("button", { name: "Рендер" }).click(),
  ]);
  expect(req.postDataJSON()).toEqual({ settings_patch: { style_preset: "tech-neon" }, base_version_id: v2 });
  await expect(history.getByRole("listitem")).toHaveCount(4, { timeout: 240_000 });
  const v4 = history.getByRole("listitem").first();
  await expect(v4).toContainText("v4");
  await expect(v4).toContainText("от v2");
  // рендер прошёл, но без Visual QA (агенты в UI-e2e отключены) версия не ready — конвейер
  // честно публикует failed с этапом и причиной; это же проверка баннера «последняя правка не
  // удалась» после перезагрузки
  await expect(v4).toContainText("не удалась");
  await page.goto(`/scenes/${versions.sceneId}`);
  const failedBanner = page.getByRole("alert", { name: "Последняя правка v4 не удалась" });
  await expect(failedBanner).toBeVisible();
  await expect(page.getByRole("heading", { name: "v3", level: 1 })).toBeVisible();
  await shot(page, "last-failed");
  await failedBanner.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("heading", { name: "v4", level: 1 })).toBeVisible();
  await expect(page.getByTestId("failure-log")).toContainText("Visual QA");
  await page.getByRole("tab", { name: "Настройки" }).click();
  await expect(page.getByRole("region", { name: "Spec и данные версии" })).toContainText('"style_preset": "tech-neon"');
  await shot(page, "render-v4");
});
