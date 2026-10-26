// Порядок приёмки Phase 4 (Playwright «test list»): шаги — функции, вызываются по порядку в одном
// воркере на проекте приёмки (id и пакеты — в state.json). MS_ACC_ONLY=<шаг,…> — только эти шаги
// (продолжение прогона с MS_ACC_REUSE=1).
import { test } from "@playwright/test";
import batch, { prepare } from "./phase4-batch.spec.js";
import edit from "./phase4-edit.spec.js";
import isolation from "./phase4-isolation.spec.js";
import pack from "./phase4-package.spec.js";
import restart from "./phase4-restart.spec.js";

const only = process.env.MS_ACC_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const steps: [string, () => void][] = [["prepare", prepare], ["batch", batch], ["isolation", isolation], ["edit", edit], ["package", pack], ["restart", restart]];

test.describe.configure({ mode: "default" });
for (const [name, register] of steps) if (!only || only.includes(name)) test.describe(name, register);
