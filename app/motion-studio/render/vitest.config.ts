import { defineConfig } from "vitest/config";

// Предохранитель (грабли №4): запуск vitest из этого каталога, а не из app/motion-studio, не
// подхватывает корневой vitest.config.ts — без этого файла выполнились бы и `*.e2e.test.ts` с
// реальным рендером. e2e — только `make e2e` (MS_E2E=1) из корня приложения.
const e2e = process.env.MS_E2E === "1";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: e2e ? ["**/node_modules/**"] : ["**/node_modules/**", "test/**/*.e2e.test.ts"],
  },
});
