import { defineConfig } from "vitest/config";

// Пакеты workspace с тестами.
const packages = ["contracts", "core", "render", "server"];

// Юнит-тесты — `*.test.ts`; интеграционные (сеть, рендер, реальный SSD) —
// `*.e2e.test.ts`, запускаются только `make e2e` (MS_E2E=1).
const e2e = process.env.MS_E2E === "1";
const E2E = "test/**/*.e2e.test.ts";

export default defineConfig({
  test: {
    projects: packages.map((name) => ({
      test: {
        name,
        root: `./${name}`,
        include: [e2e ? E2E : "test/**/*.test.ts"],
        exclude: e2e ? [] : [E2E],
      },
    })),
  },
});
