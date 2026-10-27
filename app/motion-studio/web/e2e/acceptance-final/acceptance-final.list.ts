// Порядок приёмки Phase 5 и Test 4 (Playwright «test list»): шаги — функции, вызываются по порядку в
// одном воркере на проекте приёмки (id, экспорты — в state.json). MS_ACC_ONLY=<шаг,…> — только эти
// шаги (продолжение прогона с MS_ACC_REUSE=1).
import { test } from "@playwright/test";
import assemble, { snap } from "./phase5-assemble.spec.js";
import exportVariants from "./phase5-export-variants.spec.js";
import reproduce from "./phase5-reproduce.spec.js";
import resilience from "./phase5-resilience.spec.js";
import test4, { prepare } from "./test4-talking-head.spec.js";

const only = process.env.MS_ACC_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const steps: [string, () => void][] = [
  ["prepare", prepare], ["assemble", assemble], ["assemble-snap", snap],["export", exportVariants], ["reproduce", reproduce], ["resilience", resilience], ["test4", test4],
];

test.describe.configure({ mode: "default" });
for (const [name, register] of steps) if (!only || only.includes(name)) test.describe(name, register);
