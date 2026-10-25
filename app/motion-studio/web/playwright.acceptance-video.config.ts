// Приёмка Phase 2–3 на реальном сыром ролике (Task 34, `make acceptance-video`): настоящий сервер
// на 127.0.0.1:8790 с `web/dist`, хранилище /Volumes/External SSD/MotionStudio-acceptance,
// реальные claude, ASR-воркер ai-platform, ffmpeg и Apple Vision. Шаги идут по порядку в одном
// воркере (`e2e/acceptance-video/acceptance-video.list.ts`); импорт и ASR 4K-ролика — до часа.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/acceptance-video",
  testMatch: "acceptance-video.list.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 4 * 60 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../../../tmp/acceptance-video/report.json" }]],
  outputDir: "../../../tmp/acceptance-video/test-results",
  globalSetup: "./e2e/acceptance-video/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:8790",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    locale: "ru-RU",
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    screenshot: "off",
    trace: "off",
  },
});
