// Dashboard: проекты из хранилища, «Новый проект» → в списке; хранилище пропало → API 503 и
// баннер «Хранилище недоступно»; вернулось — баннер исчезает. Настройки приложения
// сохраняются в config.json tmp-хранилища.
import { renameSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { shot, state, waitHealth } from "./helpers.js";

test("проекты в списке; новый проект создаётся и появляется в списке", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Проекты", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Демо UI" })).toBeVisible();
  // служебные bench-проекты сервер скрывает; проект playground из миграции — на месте
  const title = `Проект e2e ${Date.now()}`;
  await page.getByLabel("Название проекта").fill(title);
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("В проекте пока нет сцен.")).toBeVisible();
  await shot(page, "project-new");
  await page.getByRole("link", { name: "Проекты" }).first().click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await shot(page, "dashboard");
});

test("страница проекта: сцены с версиями и форма новой сцены", async ({ page }) => {
  const st = state();
  await page.goto(`/projects/${st.projectId}`);
  await expect(page.getByRole("heading", { name: "Демо UI", level: 1 })).toBeVisible();
  await expect(page.locator(`[data-scene-id="${st.versions.sceneId}"]`)).toContainText("v2");
  await expect(page.locator(`[data-scene-id="${st.failed.sceneId}"]`)).toContainText("не удалась");
  await expect(page.getByRole("button", { name: "Сгенерировать" })).toBeDisabled();
  await shot(page, "project");
});

test("настройки приложения: модели ролей, лимиты, умолчания — сохраняются", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки", level: 1 })).toBeVisible();
  const running = page.getByLabel("Задач одновременно");
  await expect(running).toHaveValue("2");
  await running.fill("3");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено. Действует после перезапуска.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Задач одновременно")).toHaveValue("3");
  await shot(page, "settings");
});

test("хранилище недоступно → баннер; вернулось → баннер исчез", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { root } = state();
  const away = `${root}.away`;
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Демо UI" })).toBeVisible();
  renameSync(root, away);
  try {
    await waitHealth(request, "storage_offline", 90_000);
    expect((await request.get("/api/projects")).status()).toBe(503);
    await page.reload();
    const banner = page.getByRole("alert");
    await expect(banner).toContainText("Хранилище недоступно");
    await shot(page, "storage-offline");
  } finally {
    renameSync(away, root);
  }
  await waitHealth(request, "online", 90_000);
  await page.reload();
  await expect(page.getByRole("link", { name: "Демо UI" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
