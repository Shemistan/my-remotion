// UI сценария: вкладки «Сцены» и «Экспорт» (S9, Step 5) — настоящий сервер на tmp-хранилище,
// реальный рендер и экспорт, без LLM. Засев (`seed-script.ts`): план из трёх сцен, у двух —
// готовые версии из фикстуры kit, у третьей версии нет. «Утвердить и сгенерировать» → готовые
// сцены пропускаются, задача третьей идёт до конечного статуса (claudeBin — заглушка: ошибка
// агента) → «Повторить генерацию»; «Доработать» → Playground со ссылкой «← К сценарию»;
// «Собрать папку 16:9» → карточка пакета: NN_*.mp4 + NN_*_alpha.mov на диске, «Не вошли» со
// сценой без версии, шпаргалка (таблица, CSV, TXT). «Показать в Finder» — запрос перехватывается
// (204): настоящий `open -R` открыл бы окно Finder. Скриншоты — tmp/ui-e2e/script-full/ и 480 px в
// tmp/e2e-ui/script-mvp/ui/{scenes,export}.png (MS_WRITE_EVIDENCE=1 — docs/evidence/…).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ScriptPackageDto } from "@ms/contracts";
import { type Page, expect, test } from "@playwright/test";
import { scriptShot, state } from "./helpers.js";

const JOB_TIMEOUT = 300_000;
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const tiles = (page: Page) => page.getByTestId("scene-tile");

test("сценарий: сцены (готовые, генерация до ошибки, повтор) → папка 16:9 со шпаргалкой", async ({ page, request }) => {
  test.setTimeout(900_000);
  const { script } = state();
  const [i1, i2, i3] = script.itemIds as [string, string, string];
  await page.goto(`/projects/${script.projectId}`);
  await expect(page.getByRole("heading", { name: "Go map: сценарий", level: 1 })).toBeVisible();

  // «Сцены» до генерации: две готовые с плеером и «Доработать», третья не генерировалась
  await tab(page, "Сцены");
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toHaveAttribute("data-item", i1);
  await expect(tiles(page).nth(2)).toHaveAttribute("data-item", i3);
  for (const [k, sceneId] of script.sceneIds.entries()) {
    const tile = tiles(page).nth(k);
    await expect(tile).toHaveAttribute("data-status", "ready");
    await expect(tile.locator("video")).toHaveJSProperty("readyState", 4, { timeout: 60_000 });
    await expect(tile.getByRole("link", { name: "Доработать в Playground" })).toHaveAttribute("href", `/scenes/${sceneId}`);
    await expect(tile.getByRole("button", { name: "Перегенерировать" })).toBeVisible();
  }
  await expect(tiles(page).nth(2)).toHaveAttribute("data-status", "none");
  await expect(tiles(page).nth(2)).toContainText("не генерировалась");

  // «Утвердить и сгенерировать 3 сцены»: готовые пропущены, третья — до конечного статуса
  await tab(page, "План");
  await page.getByRole("button", { name: /^Утвердить и сгенерировать 3 сцены/ }).click();
  await expect(page.getByRole("tab", { name: "Сцены", exact: true })).toHaveAttribute("aria-selected", "true");
  const third = page.locator(`[data-testid="scene-tile"][data-item="${i3}"]`);
  await expect(third).toHaveAttribute("data-status", /pending|running|failed/, { timeout: 30_000 });
  await expect(third).toHaveAttribute("data-status", "failed", { timeout: JOB_TIMEOUT });
  await expect(third.getByRole("button", { name: "Повторить генерацию" })).toBeEnabled();
  await expect(third.locator(".error")).toBeVisible();
  await expect(page.locator(`[data-testid="scene-tile"][data-item="${i1}"]`)).toHaveAttribute("data-status", "ready");
  await expect(page.locator(`[data-testid="scene-tile"][data-item="${i2}"]`)).toHaveAttribute("data-status", "ready");
  await page.mouse.move(0, 0);
  await scriptShot(page, "scenes");

  // «Доработать» → Playground сцены, ссылка «← К сценарию» ведёт обратно
  await tiles(page).nth(0).getByRole("link", { name: "Доработать в Playground" }).click();
  await expect(page).toHaveURL(new RegExp(`/scenes/${script.sceneIds[0]}$`));
  await page.getByRole("link", { name: "← К сценарию" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${script.projectId}$`));

  // «Экспорт»: 2 из 3 готовы → «Собрать папку 16:9» → карточка пакета
  await tab(page, "Экспорт");
  await expect(page.getByTestId("export-ready")).toHaveText("Готово к сборке: 2 из 3 сцен");
  await expect(page.getByText("Не готовые и устаревшие сцены попадут в список «не вошли».")).toBeVisible();
  await page.getByRole("button", { name: "Собрать папку 16:9" }).click();
  const card = page.getByTestId("package-card");
  await expect(card).toHaveCount(1, { timeout: JOB_TIMEOUT });
  await expect(card.getByTestId("package-title")).toHaveText(/^Go map- сценарий_16x9_\d{4}-\d{2}-\d{2}$/);

  const packageId = (await card.getAttribute("data-package"))!;
  const r = await request.get(`/api/script-packages/${packageId}`);
  expect(r.ok()).toBe(true);
  const pkg = (await r.json()) as ScriptPackageDto;

  // файлы: таблица в UI и папка на диске — 2 сцены × (MP4 + ProRes с альфой), шпаргалки, манифест
  const rows = card.getByTestId("package-files").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("td").nth(2)).toHaveText(/^01_[a-z0-9-]+\.mp4$/);
  await expect(rows.nth(0).locator("td").nth(3)).toHaveText(/^01_[a-z0-9-]+_alpha\.mov$/);
  await expect(rows.nth(1).locator("td").nth(2)).toHaveText(/^02_[a-z0-9-]+\.mp4$/);
  await expect(rows.nth(1).locator("td").nth(3)).toHaveText(/^02_[a-z0-9-]+_alpha\.mov$/);
  await expect(card.locator(".package-path")).toHaveText(pkg.abs_path);
  const names = readdirSync(pkg.abs_path).sort();
  const videos = names.filter((n) => /\.(mp4|mov)$/.test(n));
  expect(videos).toEqual([pkg.files[0]!.mp4, pkg.files[0]!.alpha, pkg.files[1]!.mp4, pkg.files[1]!.alpha].sort());
  expect(videos.every((n) => /^0[12]_[a-z0-9-]+(_alpha\.mov|\.mp4)$/.test(n))).toBe(true);
  expect(names.filter((n) => !videos.includes(n))).toEqual(["package-manifest.json", "шпаргалка.csv", "шпаргалка.md", "шпаргалка.txt"]);

  // «не вошли»: сцена 3 без готовой версии
  const missing = card.getByTestId("package-missing");
  await expect(missing.getByRole("heading", { name: "Не вошли (1)" })).toBeVisible();
  await expect(missing.getByRole("listitem")).toHaveCount(1);
  await expect(missing.getByRole("listitem")).toContainText("Сцена 3");
  await expect(missing.getByRole("listitem")).toContainText("— нет готовой версии");
  expect(pkg.missing).toEqual([{ item_id: i3, reason: "нет готовой версии" }]);

  // шпаргалка: таблица по блоку (3 сцены, имена файлов готовых), CSV и TXT скачиваются
  const sheet = card.locator(".cheatsheet");
  await expect(sheet.locator(".cheatsheet-block")).toContainText("Блок 1. Три вопроса");
  const sheetRows = sheet.locator(".cheatsheet-table tbody tr");
  await expect(sheetRows).toHaveCount(3);
  await expect(sheet.locator(".cheatsheet-table")).toContainText(pkg.files[0]!.mp4);
  await expect(sheet.locator(".cheatsheet-table")).toContainText(pkg.files[1]!.alpha!);
  const csvDl = page.waitForEvent("download");
  await sheet.getByRole("link", { name: "Скачать CSV" }).click();
  const csv = readFileSync((await (await csvDl).path())!, "utf8");
  expect(csv.startsWith("﻿№;")).toBe(true);
  expect(csv).toContain(pkg.files[1]!.mp4);
  expect(csv).toBe(readFileSync(join(pkg.abs_path, "шпаргалка.csv"), "utf8"));
  const txtDl = page.waitForEvent("download");
  await sheet.getByRole("link", { name: "Скачать TXT" }).click();
  const txt = readFileSync((await (await txtDl).path())!, "utf8").trimEnd().split("\n");
  expect(txt).toHaveLength(3);
  expect(txt[2]).toContain("нет сцены: нет готовой версии");

  // «Показать в Finder»: запрос reveal с id пакета; сервер не зовётся (окно Finder не открывается)
  const reveals: string[] = [];
  await page.route("**/api/script-packages/*/reveal", async (route) => {
    reveals.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 204, body: "" });
  });
  await card.getByRole("button", { name: "Показать в Finder" }).click();
  await expect.poll(() => reveals).toEqual([`/api/script-packages/${packageId}/reveal`]);
  await expect(card.locator(".error")).toHaveCount(0);

  await page.mouse.move(0, 0);
  await scriptShot(page, "export");
});
