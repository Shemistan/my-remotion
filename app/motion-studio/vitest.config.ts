import { defineConfig } from "vitest/config";

// Пакеты workspace с тестами.
const packages = ["contracts", "core", "render", "server"];

// Юнит-тесты — `*.test.ts`; интеграционные (сеть, рендер, реальный SSD) —
// `*.e2e.test.ts`, запускаются только `make e2e` (MS_E2E=1).
const e2e = process.env.MS_E2E === "1";
const E2E = "test/**/*.e2e.test.ts";

// Юнит-таймаут: зависший тест падает за 10 с, а не за 30.
const UNIT_TIMEOUT = 10_000;
// Тяжёлые юнит-файлы с реальным ядром и конвейером идут 2–3 с без нагрузки, под
// параллельными рендерами — вдвое-втрое дольше: запас против ложных таймаутов ./check.
const HEAVY: Record<string, string[]> = {
  server: ["test/cli/generate-boot.test.ts", "test/pipeline/playground-generate.test.ts", "test/pipeline/best-attempt.test.ts","test/qa/real-frames.test.ts", "test/qa/hold-frames.test.ts"],
};
const HEAVY_TIMEOUT = 30_000;

const project = (name: string, include: string[], exclude: string[], timeout: number) => ({
  test: {
    name,
    root: `./${name.replace(/-heavy$/, "")}`,
    include,
    exclude,
    // Явно (как по умолчанию): иначе Vitest 5 печатает после итога подсказку «Isolate …
    // faster with isolate: false», и `./check | tail` показывает её вместо упавших тестов (H2).
    isolate: true,
    // e2e задают таймауты сами
    ...(e2e ? {} : { testTimeout: timeout, hookTimeout: timeout }),
  },
});

export default defineConfig({
  test: {
    // e2e — по одному файлу: параллельные рендеры и агенты делят CPU, и тайминговые
    // проверки (hang-scene: логи браузера до kill по таймауту) начинают флаковать.
    fileParallelism: !e2e,
    projects: packages.flatMap((name) => {
      if (e2e) return [project(name, [E2E], [], 0)];
      const heavy = HEAVY[name] ?? [];
      return [
        project(name, ["test/**/*.test.ts"], [E2E, ...heavy], UNIT_TIMEOUT),
        ...(heavy.length > 0 ? [project(`${name}-heavy`, heavy, [], HEAVY_TIMEOUT)] : []),
      ];
    }),
  },
});
