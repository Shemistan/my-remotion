// Task 24: настройки Phase 2–3 — ASR, медиа, черновой монтаж, планирование, роли агентов.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ASR_WORKER_COPY, ASR_WORKER_SHA256, LEGACY_ASR_PYTHON, LEGACY_MODELS_DIR, configFileIssues, loadConfig, SettingsPutSchema } from "../../src/config.js";
import { ROLES } from "../../src/agents/runtime.js";

const root = "/Volumes/Test/MotionStudio";

// S19: зависимости — в проекте (.deps, копия воркера), веса — в папке материалов на SSD.
const none = { exists: () => false };
const WORKER_COPY = /\/app\/motion-studio\/tools\/asr-worker\/asr_worker\.py$/;

it("умолчания ASR (S19): копия воркера в проекте, python из .deps/asr-venv, веса в папке материалов", () => {
  const c = loadConfig({ MS_DATA_DIR: root, HOME: "/Users/u", MS_DEPS_DIR: "/D" }, undefined, none);
  expect(c.asr).toEqual({
    python: "/D/asr-venv/bin/python",
    worker: expect.stringMatching(WORKER_COPY),
    modelsDir: "/Volumes/External SSD/moution-studio-materials/models",
    model: "whisper-large-v3-turbo",
    language: "ru",
    expectedWorkerSha256: "59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073",
    timeoutMs: 14_400_000,
    noOutputTimeoutMs: 1_800_000,
  });
  expect(c.asr.worker).toBe(ASR_WORKER_COPY);
  expect(loadConfig({ MS_DATA_DIR: root }, undefined, none).asr.expectedWorkerSha256).toBe("59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073");
  // MS_MATERIALS_ROOT (тесты) переносит и веса
  expect(loadConfig({ MS_DATA_DIR: root, MS_MATERIALS_ROOT: "/M/mat" }, undefined, none).asr.modelsDir).toBe("/M/mat/models");
});

it("копия воркера совпадает с закреплённым sha256 контракта", () => {
  expect(createHash("sha256").update(readFileSync(ASR_WORKER_COPY)).digest("hex")).toBe(ASR_WORKER_SHA256);
});

it("до ./setup (S19): прежние python mlx-audio и веса local_models — запасной путь, если только они есть", () => {
  const legacyPy = "/Users/u/.local/share/montage/mlx-audio-0.5.8/.venv/bin/python";
  const have = (s: string[]) => ({ exists: (p: string) => s.includes(p) });
  const old = loadConfig({ MS_DATA_DIR: root, HOME: "/Users/u", MS_DEPS_DIR: "/D" }, undefined, have([legacyPy, "/Volumes/External SSD/local_models/asr"]));
  expect(old.asr).toMatchObject({ python: legacyPy, modelsDir: "/Volumes/External SSD/local_models" });
  expect(LEGACY_ASR_PYTHON("/Users/u")).toBe(legacyPy);
  expect(LEGACY_MODELS_DIR).toBe("/Volumes/External SSD/local_models");
  // после ./setup — .deps и папка материалов, даже если прежние на месте
  const both = have([legacyPy, "/D/asr-venv/bin/python", "/Volumes/External SSD/local_models/asr", "/Volumes/External SSD/moution-studio-materials/models/asr"]);
  expect(loadConfig({ MS_DATA_DIR: root, HOME: "/Users/u", MS_DEPS_DIR: "/D" }, undefined, both).asr)
    .toMatchObject({ python: "/D/asr-venv/bin/python", modelsDir: "/Volumes/External SSD/moution-studio-materials/models" });
});

it("env переопределяет пути ASR; AI_PLATFORM_ROOT — воркер из ai-platform (совместимость)", () => {
  const c = loadConfig({ MS_DATA_DIR: root, AIP_MODELS_DIR: "/x", AI_PLATFORM_ROOT: "/aip", AIP_MONTAGE_ASR_PYTHON: "/py" }, undefined, none);
  expect(c.asr).toMatchObject({ modelsDir: "/x", aiPlatformRoot: "/aip", worker: "/aip/app/platform/aiplatform/montage/asr_worker.py", python: "/py" });
});

it("умолчания медиа, чернового монтажа, планирования, анализа", () => {
  const c = loadConfig({ MS_DATA_DIR: root, HOME: "/Users/u" });
  expect(c.media).toEqual({ importRoots: ["/Volumes/External SSD", "/Users/u/Movies"], proxyShortSide: 720, thumbEveryUs: 2_000_000 });
  expect(c.roughcut).toEqual({ pauseMinUs: 800_000, keepAfterWordUs: 100_000, sentenceKeepAfterUs: 300_000, keepBeforeWordUs: 100_000, fillerPadUs: 50_000, loudDbfs: -30, fadeUs: 8_000 });
  expect(c.planning).toEqual({ maxCoverage: 0.4, maxFullscreenCoverage: 0.25, minGapUs: 1_500_000, minSceneUs: 1_500_000, maxSceneUs: 12_000_000, padPreUs: 200_000, padPostUs: 300_000, faceMargin: 0.25, faceOverlapMax: 0.02 });
  expect(c.analysis).toEqual({ maxCostUsd: 3, occupancyWindowUs: 4_000_000 });
});

it("роли Phase 2–3 — sonnet по умолчанию, переопределяются config.json", () => {
  for (const r of ["rough_cut_editor", "footage_analyst", "semantic_director", "visual_planner"] as const) expect(ROLES).toContain(r);
  const c = loadConfig({ MS_DATA_DIR: root });
  expect(c.agents.visual_planner.model).toBe("sonnet");
  expect(c.agents.rough_cut_editor.model).toBe("sonnet");
  expect(c.agents.footage_analyst.model).toBe("sonnet");
  expect(c.agents.semantic_director.model).toBe("sonnet");
  expect(loadConfig({ MS_DATA_DIR: root }, { agents: { visual_planner: { model: "opus" } } }).agents.visual_planner.model).toBe("opus");
});

it("config.json переопределяет разделы Phase 2–3 по ключам; лишние ключи — ошибка", () => {
  const c = loadConfig({ MS_DATA_DIR: root, AIP_MODELS_DIR: "/env" }, {
    asr: { model: "whisper-large-v3-mlx", modelsDir: "/file" }, media: { importRoots: ["/a"] }, planning: { maxCoverage: 0.3 }, analysis: { maxCostUsd: 1, occupancyWindowUs: 2_000_000 },
  });
  expect(c.asr).toMatchObject({ model: "whisper-large-v3-mlx", modelsDir: "/file", language: "ru" });
  expect(c.media.importRoots).toEqual(["/a"]);
  expect(c.planning).toMatchObject({ maxCoverage: 0.3, minGapUs: 1_500_000 });
  expect(c.analysis.maxCostUsd).toBe(1);
  expect(c.analysis.occupancyWindowUs).toBe(2_000_000);
  expect(configFileIssues({ asr: { model: "whisper-tiny" } })).toEqual([expect.objectContaining({ path: "asr.model" })]);
  expect(configFileIssues({ roughcut: { bogus: 1 } })).not.toEqual([]);
});

// Ревью Task 24, M8: пути — абсолютные после раскрытия `~`; согласованность порогов плана.
it("пути ASR и корни импорта: `~` раскрывается, относительный путь — ошибка", () => {
  const c = loadConfig({ MS_DATA_DIR: root, HOME: "/Users/u", AIP_MODELS_DIR: "~/models" }, {
    asr: { python: "~/py/bin/python", aiPlatformRoot: "~" }, media: { importRoots: ["~/Movies", "/Volumes/X"] },
  });
  expect(c.asr).toMatchObject({ python: "/Users/u/py/bin/python", aiPlatformRoot: "/Users/u", worker: "/Users/u/app/platform/aiplatform/montage/asr_worker.py", modelsDir: "/Users/u/models" });
  expect(c.media.importRoots).toEqual(["/Users/u/Movies", "/Volumes/X"]);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { asr: { python: "venv/bin/python" } })).toThrow(/asr\.python.*абсолютн/);
  expect(() => loadConfig({ MS_DATA_DIR: root, AI_PLATFORM_ROOT: "ai-platform" })).toThrow(/asr\.aiPlatformRoot.*абсолютн/);
  expect(() => loadConfig({ MS_DATA_DIR: root, AIP_MODELS_DIR: "./m" })).toThrow(/asr\.modelsDir.*абсолютн/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { media: { importRoots: ["/ok", "Movies"] } })).toThrow(/media\.importRoots.*абсолютн/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { asr: { python: "~other/bin/python" } })).toThrow(/asr\.python/);
});

it("планирование: minSceneUs ≤ maxSceneUs, maxFullscreenCoverage ≤ maxCoverage", () => {
  expect(() => loadConfig({ MS_DATA_DIR: root }, { planning: { minSceneUs: 13_000_000 } })).toThrow(/minSceneUs.*maxSceneUs/);
  expect(() => loadConfig({ MS_DATA_DIR: root }, { planning: { maxCoverage: 0.2 } })).toThrow(/maxFullscreenCoverage.*maxCoverage/);
  expect(loadConfig({ MS_DATA_DIR: root }, { planning: { minSceneUs: 2_000_000, maxSceneUs: 2_000_000, maxCoverage: 0.25 } }).planning)
    .toMatchObject({ minSceneUs: 2_000_000, maxSceneUs: 2_000_000, maxCoverage: 0.25 });
});

it("из браузера (PUT /settings) пути ASR и медиа не меняются", () => {
  expect(SettingsPutSchema.safeParse({ asr: { python: "/tmp/evil" } }).success).toBe(false);
  expect(SettingsPutSchema.safeParse({ media: { importRoots: ["/"] } }).success).toBe(false);
});
