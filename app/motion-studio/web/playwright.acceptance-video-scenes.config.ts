// Приёмка Phase 4 (Task 41, `make acceptance-video-scenes`): сцены видеопроекта на реальном ролике
// человека через UI — настоящий сервер на 127.0.0.1:${MS_ACC_PORT:-8791} с `web/dist`, хранилище
// /Volumes/External SSD/moution-studio-materials/acceptance/phase4 (копия приёмки Phase 3), реальные claude,
// рендер и ffmpeg. Шаги — по порядку в одном воркере (`e2e/acceptance-video-scenes/acceptance-video-scenes.list.ts`);
// пакет генерации — часы, таймауты задают сами шаги. Продолжение: MS_ACC_REUSE=1 MS_ACC_ONLY=<шаги>.
import { defineConfig } from "@playwright/test";

const port = Number(process.env.MS_ACC_PORT ?? 8791);

export default defineConfig({
  testDir: "./e2e/acceptance-video-scenes",
  testMatch: "acceptance-video-scenes.list.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 6 * 60 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../../../tmp/acceptance-video-scenes/report.json" }]],
  outputDir: "../../../tmp/acceptance-video-scenes/test-results",
  globalSetup: "./e2e/acceptance-video-scenes/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
