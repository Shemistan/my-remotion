// Playwright UI (Task 21, `make e2e-ui`): настоящий сервер `server/src/main.ts` на 127.0.0.1:8790
// с production-сборкой `web/dist` и tmp-хранилищем (засев — `e2e/seed.ts`, реальный рендер без
// LLM). Сервер поднимает и гасит `e2e/global-setup.ts`. Файлы — по одному, по порядку: тест
// хранилища переименовывает каталог, задачи делят один сервер.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  // приёмки Task 22, Task 34 и S12 — свои конфиги (playwright.acceptance*.config.ts), реальные агенты и SSD
  testIgnore: ["acceptance/**", "acceptance-video/**", "acceptance-script/**"],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "../../../tmp/ui-e2e/test-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:8790",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    locale: "ru-RU",
    acceptDownloads: true,
    trace: "retain-on-failure",
    // клик по заблокированной кнопке не должен висеть до таймаута теста
    actionTimeout: 30_000,
  },
});
