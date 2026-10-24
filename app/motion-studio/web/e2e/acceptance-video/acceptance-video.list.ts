// Порядок приёмки Phase 2–3 (Playwright «test list»): спецификации — функции, вызываются по
// порядку в одном воркере; каждый шаг идёт на проекте предыдущего (id — в state.json).
// MS_ACC_ONLY=<имя> (через запятую) — только эти шаги (продолжение прогона с MS_ACC_REUSE=1).
// `stress` (весь 66-минутный исходник) — только явно: MS_ACC_ONLY=stress, долго.
import { test } from "@playwright/test";
import importAsr, { transcriptEdit } from "./phase2-import-asr.spec.js";
import resilience, { stress } from "./phase2-resilience.spec.js";
import restart from "./phase2-restart.spec.js";
import roughcut from "./phase2-roughcut.spec.js";
import analysis from "./phase3-analysis.spec.js";
import plan from "./phase3-plan.spec.js";
import recheck from "./phase3-recheck.spec.js";

const only = process.env.MS_ACC_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const steps: [string, () => void][] = [["import-asr", importAsr], ["transcript-edit", transcriptEdit], ["roughcut", roughcut], ["restart", restart], ["resilience", resilience], ["stress", stress],
  ["phase3-analysis", analysis], ["phase3-plan", plan], ["phase3-recheck", recheck]];
const byDefault = new Set(["import-asr", "transcript-edit", "roughcut", "restart", "resilience", "phase3-analysis", "phase3-plan", "phase3-recheck"]);

test.describe.configure({ mode: "default" });
for (const [name, register] of steps) if (only ? only.includes(name) : byDefault.has(name)) test.describe(name, register);
