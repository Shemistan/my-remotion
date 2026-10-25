// Приёмка сценарного MVP (S12, `make acceptance-script`): настоящий сервер на 127.0.0.1:8790 с
// `web/dist`, хранилище /Volumes/External SSD/moution-studio-materials/acceptance/store, реальный claude и рендер.
// Шаги — по порядку в одном воркере (`e2e/acceptance-script/script.spec.ts`); пакет генерации —
// часы, поэтому таймауты задают сами шаги.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/acceptance-script",
  testMatch: "script.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../../../tmp/acceptance-script/report.json" }]],
  outputDir: "../../../tmp/acceptance-script/test-results",
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
