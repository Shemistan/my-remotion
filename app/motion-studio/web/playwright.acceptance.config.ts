// Приёмка Phase 1 (Task 22, `make acceptance`): настоящий сервер на 127.0.0.1:8790 с `web/dist`,
// хранилище /Volumes/External SSD/moution-studio-materials/acceptance/store, реальный claude и рендер. Шаги идут
// по порядку в одном воркере (`e2e/acceptance/acceptance.list.ts`); генерация — до 30 мин.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/acceptance",
  testMatch: "acceptance.list.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../../../tmp/acceptance/report.json" }]],
  outputDir: "../../../tmp/acceptance/test-results",
  globalSetup: "./e2e/acceptance/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:8790",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    locale: "ru-RU",
    acceptDownloads: true,
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "off",
  },
});
