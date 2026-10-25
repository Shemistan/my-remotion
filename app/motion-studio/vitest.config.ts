import { defineConfig } from "vitest/config";

// Пакеты workspace с тестами.
const packages = ["contracts", "core", "render", "server"];

// Юнит-тесты — `*.test.ts`; интеграционные (сеть, рендер, реальный SSD) —
// `*.e2e.test.ts`, запускаются только `make e2e` (MS_E2E=1).
const e2e = process.env.MS_E2E === "1";
const E2E = "test/**/*.e2e.test.ts";
// e2e с реальным лицом (Task 30, `MS_TEST_TALKING_HEAD`): только `make e2e-footage`
// (MS_E2E_FACE=1) — личный ролик пользователя требует его согласия (V4 плана), общий
// `make e2e` эти файлы не берёт.
const FACE_E2E = ["test/analysis/vision.e2e.test.ts", "test/analysis/footage.e2e.test.ts"];
const face = process.env.MS_E2E_FACE === "1";

// Юнит-таймаут: зависший тест падает за 10 с, а не за 30.
const UNIT_TIMEOUT = 10_000;
// Тяжёлые юнит-файлы с реальным ядром и конвейером идут 2–3 с без нагрузки, под
// параллельными рендерами — вдвое-втрое дольше: запас против ложных таймаутов ./check.
const HEAVY: Record<string, string[]> = {
  server: ["test/cli/generate-boot.test.ts", "test/pipeline/playground-generate.test.ts", "test/pipeline/best-attempt.test.ts","test/qa/real-frames.test.ts", "test/qa/hold-frames.test.ts", "test/media/import-handler.test.ts", "test/media/asr-handler.test.ts", "test/pipeline/roughcut-preview.test.ts", "test/analysis/ffmpeg-frames.test.ts", "test/analysis/footage-handler.test.ts", "test/pipeline/scene-restore.test.ts", "test/pipeline/playground-edit.test.ts", "test/pipeline/playground-generate-script.test.ts", "test/pipeline/fragment-fit-attempt.test.ts", "test/pipeline/scene-export.test.ts", "test/pipeline/playground-generate-reframe.test.ts"],
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
    projects: [
      ...packages.flatMap((name) => {
        if (e2e && face) return name === "server" ? [project(name, FACE_E2E, [], 0)] : [];
        if (e2e) return [project(name, [E2E], name === "server" ? FACE_E2E : [], 0)];
        const heavy = HEAVY[name] ?? [];
        return [
          project(name, ["test/**/*.test.ts"], [E2E, ...heavy], UNIT_TIMEOUT),
          ...(heavy.length > 0 ? [project(`${name}-heavy`, heavy, [], HEAVY_TIMEOUT)] : []),
        ];
      }),
      // UI (Task 21): jsdom и React; e2e UI — Playwright (`make e2e-ui`), не Vitest
      ...(e2e ? [] : [{
        oxc: { jsx: { runtime: "automatic" as const } },
        test: {
          name: "web",
          root: "./web",
          include: ["test/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          isolate: true,
          testTimeout: UNIT_TIMEOUT,
          hookTimeout: UNIT_TIMEOUT,
        },
      }]),
    ],
  },
});
