// Управление проектами и восстановление (Task 47): настоящий сервер на tmp-хранилище UI-e2e.
// Новый проект → переименовать на месте → в архив и обратно → удалить с подтверждением названием
// (каталог уходит в workspace/trash, ничего не стёрто) → восстановить из корзины → снова удалить и
// стереть навсегда по второму подтверждению → `kill -9` сервера и старт → баннер восстановления →
// центр восстановления → «Понятно» — баннер исчез. Скриншоты — tmp/e2e-ui/… (MS_WRITE_EVIDENCE=1 —
// docs/evidence/phase-1/ui/, префикс p47-).
import { spawn } from "node:child_process";
import { existsSync, openSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { APP, PORT, STATE_FILE, shot, state } from "./helpers.js";

const snap = (page: Page, name: string) => shot(page, `p47-${name}`);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** `kill -9` сервера (close() не выполняется — маркера чистой остановки нет) и новый старт. */
async function killAndRestart(): Promise<void> {
  const st = state();
  process.kill(st.serverPid, "SIGKILL");
  for (let i = 0; i < 100 && alive(st.serverPid); i++) await new Promise((r) => setTimeout(r, 100));
  const env = { ...process.env, MS_DATA_DIR: st.root, MS_ALLOW_SYSTEM_DISK: "1", MS_LOG_LEVEL: "warn" };
  const fd = openSync(st.serverLog, "a");
  const server = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], { cwd: APP, env, stdio: ["ignore", fd, fd] });
  server.unref();
  writeFileSync(STATE_FILE, JSON.stringify({ ...st, serverPid: server.pid }, null, 2));
  const until = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    if (Date.now() > until) throw new Error("сервер не поднялся после kill -9");
    await new Promise((r) => setTimeout(r, 500));
  }
}

const row = (page: Page, title: string) => page.locator("[data-project-id]").filter({ has: page.getByRole("link", { name: title, exact: true }) });
async function menu(page: Page, title: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `Действия с проектом «${title}»` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
const trashDirs = (root: string) => (existsSync(join(root, "workspace/trash")) ? readdirSync(join(root, "workspace/trash")) : []);

test("проект: переименовать → архив → корзина с подтверждением → восстановить → стереть навсегда", async ({ page }) => {
  test.setTimeout(300_000);
  const { root } = state();
  const title = `Проект p47 ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Название проекта").fill(title);
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/prj_/);
  const id = /\/projects\/([^/?#]+)/.exec(page.url())![1]!;
  await page.goto("/");

  // переименование на месте
  const renamed = `${title} (новое)`;
  await menu(page, title, "Переименовать");
  await page.getByLabel("Новое название проекта").fill(renamed);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible();
  await snap(page, "01-renamed");

  // архив: скрыт из активных, виден в «Архив», возвращается
  await menu(page, renamed, "В архив");
  await expect(page.getByRole("link", { name: renamed, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible();
  await snap(page, "02-archived");
  await menu(page, renamed, "Вернуть из архива");
  await expect(page.getByRole("link", { name: renamed, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Активные" }).click();
  await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible();

  // удаление: сводка, кнопка — только после точного названия; каталог — в корзину
  await menu(page, renamed, "Удалить…");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("delete-summary")).toContainText("Сцены: 0");
  const del = dialog.getByRole("button", { name: "Удалить в корзину" });
  await expect(del).toBeDisabled();
  await dialog.getByLabel(/Для подтверждения введите название проекта/).fill("не то");
  await expect(del).toBeDisabled();
  await dialog.getByLabel(/Для подтверждения введите название проекта/).fill(renamed);
  await snap(page, "03-delete-dialog");
  await del.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: renamed, exact: true })).toHaveCount(0);
  expect(existsSync(join(root, "workspace/projects", id))).toBe(false);
  expect(trashDirs(root).some((d) => d.startsWith(`${id}-`))).toBe(true);
  expect((await page.request.get(`/api/projects/${id}`)).status()).toBe(404);

  // корзина → восстановить
  await page.getByRole("button", { name: "Корзина" }).click();
  const entry = page.locator("[data-trash-id]").filter({ hasText: renamed });
  await expect(entry).toBeVisible();
  await snap(page, "04-trash");
  await entry.getByRole("button", { name: "Восстановить" }).click();
  await expect(entry).toHaveCount(0);
  await page.getByRole("button", { name: "Активные" }).click();
  await expect(row(page, renamed)).toBeVisible();
  expect(existsSync(join(root, "workspace/projects", id))).toBe(true);
  expect(trashDirs(root).some((d) => d.startsWith(`${id}-`))).toBe(false);

  // снова удалить и стереть навсегда: второе подтверждение с флажком
  await menu(page, renamed, "Удалить…");
  await page.getByRole("dialog").getByLabel(/Для подтверждения введите название проекта/).fill(renamed);
  await page.getByRole("dialog").getByRole("button", { name: "Удалить в корзину" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Корзина" }).click();
  const again = page.locator("[data-trash-id]").filter({ hasText: renamed });
  await again.getByRole("button", { name: "Удалить навсегда…" }).click();
  const purge = page.getByRole("dialog");
  await expect(purge).toContainText("Без возможности восстановления будет стёрто: проектов — 1");
  const go = purge.getByRole("button", { name: "Стереть навсегда" });
  await expect(go).toBeDisabled();
  await purge.getByLabel("Понимаю, что это нельзя отменить").check();
  await snap(page, "05-purge-dialog");
  await go.click();
  await expect(again).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => trashDirs(root).some((d) => d.startsWith(`${id}-`)), { timeout: 60_000 }).toBe(false);
});

test("после kill -9 сервера — баннер восстановления, центр восстановления, «Понятно»", async ({ page }) => {
  test.setTimeout(180_000);
  await killAndRestart();
  await page.goto("/");
  const banner = page.getByTestId("recovery-banner");
  await expect(banner).toContainText("Прежний запуск завершился аварийно");
  await snap(page, "06-banner");
  await banner.getByRole("link", { name: "Открыть центр восстановления" }).click();
  await expect(page.getByRole("heading", { name: "Восстановление", level: 1 })).toBeVisible();
  await expect(page.getByTestId("recovery-boot")).toContainText("после аварийного завершения");
  await snap(page, "07-recovery-center");
  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(page.getByTestId("recovery-boot")).toContainText("Просмотрено");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Проекты", level: 1 })).toBeVisible();
  await expect(page.getByTestId("recovery-banner")).toHaveCount(0);
});
