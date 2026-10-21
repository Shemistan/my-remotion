import { defineConfig } from "vitest/config";

// Пакеты workspace с тестами.
const packages = ["contracts", "core", "render", "server"];

// Юнит-тесты — `*.test.ts`; интеграционные (сеть, рендер, реальный SSD) —
// `*.e2e.test.ts`, запускаются только `make e2e` (MS_E2E=1).
const e2e = process.env.MS_E2E === "1";
const E2E = "test/**/*.e2e.test.ts";

export default defineConfig({
  test: {
    // e2e — по одному файлу: параллельные рендеры и агенты делят CPU, и тайминговые
    // проверки (hang-scene: логи браузера до kill по таймауту) начинают флаковать.
    fileParallelism: !e2e,
    projects: packages.map((name) => ({
      test: {
        name,
        root: `./${name}`,
        include: [e2e ? E2E : "test/**/*.test.ts"],
        exclude: e2e ? [] : [E2E],
        // юнит-тесты с реальным ядром и конвейером (generate-boot, playground-generate,
        // real-frames) идут 2–3 с без нагрузки, под параллельными рендерами — вдвое-втрое
        // дольше: запас против ложных таймаутов ./check. e2e задают таймауты сами.
        ...(e2e ? {} : { testTimeout: 30_000, hookTimeout: 30_000 }),
      },
    })),
  },
});
